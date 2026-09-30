const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FactionAssignmentApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        const savedPos = game.user?.getFlag("pf2e-npc-architect", "factionAssignerBounds");
        if (savedPos) {
            options.position = foundry.utils.mergeObject(options.position || {}, savedPos);
        }
        super(options);
    }

    static DEFAULT_OPTIONS = {
        id: "faction-assigner-app", tag: "div",
        window: { title: "Personnel & Facility Assigner", resizable: true },
        position: { width: 1050, height: 750 },
        classes: ["pf2e-npc-architect", "dossier-dark-dialog"]
    };

    static PARTS = { main: { template: "modules/pf2e-npc-architect/templates/faction-assigner.hbs" } };

    _onClose(options) {
        game.user.setFlag("pf2e-npc-architect", "factionAssignerBounds", {
            width: this.position.width, height: this.position.height, left: this.position.left, top: this.position.top
        });
    }

    async _prepareContext(options) {
        const allTracked = game.actors.filter(a => a.getFlag("pf2e-npc-architect", "data")?.tracked);
        let roster = allTracked.map(a => {
            const d = a.getFlag("pf2e-npc-architect", "data") || {};
            return {
                id: a.id, name: a.name, img: a.img || "icons/svg/mystery-man.svg",
                faction: d.faction || "Unaligned", rank: d.factionRank || "",
                isLocation: d.isLocation || false,
                isEphemeral: false
            };
        });

        const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
        if (notesJournal) {
            const ephemerals = notesJournal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || [];
            ephemerals.forEach(e => {
                roster.push({
                    id: e.id, name: e.name, img: e.img || (e.isLocation ? "icons/svg/tower.svg" : "icons/svg/mystery-man.svg"),
                    faction: e.faction || "Unaligned", rank: e.factionRank || "",
                    isLocation: e.isLocation || false,
                    isEphemeral: true
                });
            });
        }

        roster.sort((a, b) => a.name.localeCompare(b.name));
        
        const masterChars = roster.filter(p => !p.isLocation);
        const masterLocs = roster.filter(p => p.isLocation);
        
        const factions = game.settings.get("pf2e-npc-architect", "factionData") || [];
        
        const mappedFactions = factions.map(f => {
            const ranks = (f.ranks || []).map(r => {
                const rName = typeof r === "string" ? r : r.name;
                return {
                    name: rName, color: typeof r === "string" ? f.customColor : (r.color || f.customColor),
                    personnel: masterChars.filter(p => p.faction === f.name && p.rank === rName)
                };
            });
            const locGroups = (f.locationGroups || []).map(lg => {
                const lgName = typeof lg === "string" ? lg : lg.name;
                return {
                    name: lgName, color: typeof lg === "string" ? f.customColor : (lg.color || f.customColor),
                    locations: masterLocs.filter(p => p.faction === f.name && p.rank === lgName)
                };
            });

            return {
                name: f.name, color: f.customColor || "#e0e0e0",
                unrankedChars: masterChars.filter(p => p.faction === f.name && !ranks.some(r => r.name === p.rank)),
                ranks: ranks,
                ungroupedLocs: masterLocs.filter(p => p.faction === f.name && !locGroups.some(lg => lg.name === p.rank)),
                locGroups: locGroups
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

        return { 
            masterChars: masterChars, masterLocs: masterLocs, 
            orgs: mappedFactions, 
            unalignedChars: masterChars.filter(p => p.faction === "Unaligned" || p.faction === "" || !factions.some(f => f.name === p.faction)),
            unalignedLocs: masterLocs.filter(p => p.faction === "Unaligned" || p.faction === "" || !factions.some(f => f.name === p.faction))
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = $(this.element);

        html.find('.personnel-chip').on('dragstart', ev => {
            const data = {
                type: "ArchitectAssignment",
                id: ev.currentTarget.dataset.id,
                isEphemeral: ev.currentTarget.dataset.ephemeral === "true"
            };
            ev.originalEvent.dataTransfer.setData("text/plain", JSON.stringify(data));
            ev.originalEvent.dataTransfer.effectAllowed = "move";
        });

        html.find('.drop-zone').on('dragover', ev => {
            ev.preventDefault();
            ev.originalEvent.dataTransfer.dropEffect = "move";
            $(ev.currentTarget).addClass('drag-hover');
        });
        html.find('.drop-zone').on('dragleave', ev => {
            $(ev.currentTarget).removeClass('drag-hover');
        });

        html.find('.drop-zone').on('drop', async ev => {
            ev.preventDefault();
            $(ev.currentTarget).removeClass('drag-hover');
            
            let data;
            try { data = JSON.parse(ev.originalEvent.dataTransfer.getData('text/plain')); } catch (err) { return; }
            if (data.type !== "ArchitectAssignment") return;

            const zone = $(ev.currentTarget).closest('.drop-zone');
            const targetFaction = zone.data('faction') || "Unaligned";
            const targetRank = zone.data('rank') || "";

            if (data.isEphemeral) {
                const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
                if (!notesJournal) return;
                const ephemerals = notesJournal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || [];
                const poiIndex = ephemerals.findIndex(e => e.id === data.id);
                if (poiIndex !== -1) {
                    ephemerals[poiIndex].faction = targetFaction;
                    ephemerals[poiIndex].factionRank = targetRank; // Uses identical string bucket
                    await notesJournal.setFlag("pf2e-npc-architect", "ephemeralNPCs", ephemerals);
                    
                    const dossier = Array.from(foundry.applications.instances.values()).find(w => w.id === "npc-dossier-hub");
                    if (dossier) dossier.render(false);
                    this.render(true);
                }
            } else {
                const actor = game.actors.get(data.id);
                if (actor) {
                    const existingData = actor.getFlag("pf2e-npc-architect", "data") || {};
                    await actor.setFlag("pf2e-npc-architect", "data", {
                        ...existingData, faction: targetFaction, factionRank: targetRank
                    });
                    this.render(true);
                }
            }
        });

        html.find('.roster-search').on('input', ev => {
            const term = ev.currentTarget.value.toLowerCase();
            html.find('.master-roster-list .personnel-chip').each((i, el) => {
                const text = $(el).find('.chip-name').text().toLowerCase();
                if (text.includes(term)) $(el).show();
                else $(el).hide();
            });
        });
        // Quick Add Categories from Assigner UI
        html.find('.inline-add-rank').click(async ev => {
            const facName = $(ev.currentTarget).data('faction');
            const type = $(ev.currentTarget).data('type');
            
            new Dialog({
                title: type === 'rank' ? "Add New Rank" : "Add Facility Type",
                content: `<div style="margin-bottom:10px;"><label style="color:#e0e0e0; display:block; margin-bottom:5px;">Name</label><input type="text" id="new-cat-name" style="width:100%; background:rgba(255,255,255,0.9); color:#111; padding:5px; border-radius:3px; border:1px solid #4b4a44;" autofocus></div>`,
                buttons: {
                    add: {
                        label: "Add Category", icon: '<i class="fas fa-plus"></i>',
                        callback: async (dHtml) => {
                            const name = dHtml.find('#new-cat-name').val().trim();
                            if (!name) return;
                            
                            const factionDB = game.settings.get("pf2e-npc-architect", "factionData") || [];
                            const facIndex = factionDB.findIndex(f => f.name === facName);
                            if (facIndex !== -1) {
                                if (type === 'rank') {
                                    if (!factionDB[facIndex].ranks) factionDB[facIndex].ranks = [];
                                    factionDB[facIndex].ranks.push({ name: name, color: factionDB[facIndex].customColor || "#e0e0e0" });
                                } else {
                                    if (!factionDB[facIndex].locationGroups) factionDB[facIndex].locationGroups = [];
                                    factionDB[facIndex].locationGroups.push({ name: name, color: factionDB[facIndex].customColor || "#e0e0e0" });
                                }
                                await game.settings.set("pf2e-npc-architect", "factionData", factionDB);
                                this.render(true);
                                
                                const dossier = Array.from(foundry.applications.instances.values()).find(w => w.id === "npc-dossier-hub");
                                if (dossier) dossier.render(false);
                            }
                        }
                    }
                }, default: "add",
                render: (dHtml) => {
                    const win = dHtml.closest('.window-content');
                    win.css({ background: '#1c1b1a', color: '#e0e0e0', border: '1px solid #4b4a44' });
                    win.find('.dialog-buttons').css({ margin: '0', padding: '10px 0 0 0', borderTop: '1px solid #444' });
                    win.find('.dialog-button').css({ background: 'rgba(255,255,255,0.1)', border: '1px solid #5a5954', color: '#e0e0e0', margin: '0 5px' });
                }
            }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"], width: 300 }).render(true);
        });
    }
}