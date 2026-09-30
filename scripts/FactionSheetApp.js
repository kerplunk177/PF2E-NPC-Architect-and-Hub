const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FactionSheetApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(factionId, options = {}) {
        const savedPos = game.user?.getFlag("pf2e-npc-architect", "factionSheetBounds");
        if (savedPos) {
            options.position = foundry.utils.mergeObject(options.position || {}, savedPos);
        }
        super(options);
        this.factionId = factionId;
        this.previewAsPlayer = false;
    }

    static DEFAULT_OPTIONS = {
        id: "faction-sheet-app",
        tag: "div",
        window: { title: "Faction File", resizable: true },
        position: { width: 600, height: 850 },
        classes: ["pf2e-npc-architect", "dossier-dark-dialog"]
    };

    static PARTS = {
        main: { template: "modules/pf2e-npc-architect/templates/faction-sheet.hbs" }
    };

    get title() {
        const factions = game.settings.get("pf2e-npc-architect", "factionData") || [];
        const faction = factions.find(f => f.id === this.factionId);
        return faction ? `Faction File: ${faction.name}` : "Faction File";
    }

    _onClose(options) {
        game.user.setFlag("pf2e-npc-architect", "factionSheetBounds", {
            width: this.position.width, height: this.position.height, left: this.position.left, top: this.position.top
        });
    }

    async _prepareContext(options) {
        const factions = game.settings.get("pf2e-npc-architect", "factionData") || [];
        const rawFaction = factions.find(f => f.id === this.factionId);
        if (!rawFaction) return { error: "Faction records not found." };
        
        // Deep clone so our redactions don't overwrite the real database
        const faction = foundry.utils.deepClone(rawFaction);

        const enforceFacMystify = faction.mystified && (!game.user.isGM || this.previewAsPlayer);
        const facOpts = faction.mystifyOptions || {};

        let mystifyBannerText = null;
        let mystifyBannerClass = "";
        if (game.user.isGM && faction.mystified) {
            const anyRevealed = (facOpts.revealName === true) || (facOpts.revealImg === true) || (facOpts.revealAff === true) || (facOpts.revealBlurb === true) || (facOpts.revealConn === true) || (facOpts.revealRanks === true);
            mystifyBannerText = anyRevealed ? "Partially Hidden" : "Fully Hidden";
            mystifyBannerClass = anyRevealed ? "banner-partial" : "banner-full";
        }

        // Apply visual redactions
        faction.name = (enforceFacMystify && !facOpts.revealName) ? "Unknown Faction" : faction.name;
        faction.img = (enforceFacMystify && !facOpts.revealImg) ? null : faction.img;
        faction.blurb = (enforceFacMystify && !facOpts.revealBlurb) ? "Records redacted." : faction.blurb;
        faction.affiliation = (enforceFacMystify && !facOpts.revealAff) ? "???" : faction.affiliation;

        const parent = factions.find(f => f.id === faction.parentFactionId);
        const children = factions.filter(f => f.parentFactionId === faction.id);

        // Map Connections & Enforce Target Privacy
        const processedConnections = (faction.connections || []).map(c => {
            if (enforceFacMystify && !facOpts.revealConn) return null; // This faction's connections are hidden
            if (c.secret && (!game.user.isGM || this.previewAsPlayer)) return null; // GM secret connection
            
            const targetFac = factions.find(f => f.id === c.id);
            if (!targetFac) return null;
            
            const targetEnforceMystify = targetFac.mystified && (!game.user.isGM || this.previewAsPlayer);
            const targetOpts = targetFac.mystifyOptions || {};
            
            // "Players won't see Known Connections for Factions that are hidden from them."
            if (targetEnforceMystify && !targetOpts.revealName) return null; 

            return { id: targetFac.id, name: targetFac.name, color: targetFac.customColor || "#e0e0e0", label: c.label, secret: c.secret };
        }).filter(c => c !== null);

        // Hierarchy & Location Parsing
        let activeHierarchy = [];
        let activeLocHierarchy = [];
        
        if (!enforceFacMystify || facOpts.revealRanks) {
            const ranks = (faction.ranks || []).map(r => ({ rank: typeof r === "string" ? r : r.name, color: typeof r === "string" ? faction.customColor : (r.color || faction.customColor), actors: [] }));
            const unranked = { rank: "Unranked / Operatives", color: "#888888", actors: [] };
            
            const locGroups = (faction.locationGroups || []).map(lg => ({ rank: typeof lg === "string" ? lg : lg.name, color: typeof lg === "string" ? faction.customColor : (lg.color || faction.customColor), actors: [] }));
            const ungroupedLocs = { rank: "Uncategorized Locations", color: "#888888", actors: [] };

            const allTracked = game.actors.filter(a => a.getFlag("pf2e-npc-architect", "data")?.tracked);
            allTracked.forEach(a => {
                const data = a.getFlag("pf2e-npc-architect", "data") || {};
                if (data.faction !== rawFaction.name) return;
                
                const isMystified = a.getFlag("pf2e-npc-architect", "mystified") || false;
                const opts = a.getFlag("pf2e-npc-architect", "mystifyOptions") || {};
                const enforceMystify = isMystified && (!game.user.isGM || this.previewAsPlayer);
                
                const actorData = {
                    id: a.id, name: (enforceMystify && !opts.revealName) ? "Unknown Entity" : a.name,
                    img: (enforceMystify && !opts.revealPic) ? "icons/svg/mystery-man.svg" : a.img,
                    rank: data.factionRank || "", isEphemeral: false
                };
                
                if (data.isLocation) {
                    const tier = locGroups.find(t => t.rank === actorData.rank);
                    if (tier) tier.actors.push(actorData); else ungroupedLocs.actors.push(actorData);
                } else {
                    const tier = ranks.find(t => t.rank === actorData.rank);
                    if (tier) tier.actors.push(actorData); else unranked.actors.push(actorData);
                }
            });

            const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
            const ephemerals = notesJournal ? (notesJournal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || []) : [];
            ephemerals.forEach(e => {
                if (e.faction !== rawFaction.name) return;
                const isLoc = e.isLocation || false;
                const actorData = {
                    id: e.id, name: e.name, img: e.img || (isLoc ? "icons/svg/tower.svg" : "icons/svg/mystery-man.svg"),
                    rank: e.factionRank || "", isEphemeral: true
                };
                
                if (isLoc) {
                    const tier = locGroups.find(t => t.rank === actorData.rank);
                    if (tier) tier.actors.push(actorData); else ungroupedLocs.actors.push(actorData);
                } else {
                    const tier = ranks.find(t => t.rank === actorData.rank);
                    if (tier) tier.actors.push(actorData); else unranked.actors.push(actorData);
                }
            });

            activeHierarchy = ranks.filter(t => t.actors.length > 0);
            if (unranked.actors.length > 0) activeHierarchy.push(unranked);
            
            activeLocHierarchy = locGroups.filter(t => t.actors.length > 0);
            if (ungroupedLocs.actors.length > 0) activeLocHierarchy.push(ungroupedLocs);
        }

        const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
        const partyNotes = notesJournal ? (notesJournal.getFlag("pf2e-npc-architect", `notes_${faction.id}`) || []) : [];

        return {
            faction: faction, parent: parent, children: children, partyNotes: partyNotes,
            connections: processedConnections, hasConnections: processedConnections.length > 0,
            hasRelationships: !!parent || children.length > 0,
            hierarchy: activeHierarchy, hasHierarchy: activeHierarchy.length > 0,
            locHierarchy: activeLocHierarchy, hasLocHierarchy: activeLocHierarchy.length > 0,
            isGM: game.user.isGM, previewAsPlayer: this.previewAsPlayer,
            mystifyBannerText: mystifyBannerText, mystifyBannerClass: mystifyBannerClass
        };
    }
    
    _onRender(context, options) {
        super._onRender(context, options);
        const html = $(this.element);
        
        html.on('contextmenu', ev => {
            if (!$(ev.target).closest('.org-node, .delete-note-btn').length) ev.stopPropagation();
        });

        html.find('.preview-toggle').click(ev => {
            this.previewAsPlayer = !this.previewAsPlayer;
            this.render(true);
        });

        html.find('.mystify-toggle').click(ev => {
            if (!game.user.isGM) return;
            const factionDB = game.settings.get("pf2e-npc-architect", "factionData") || [];
            const factionIndex = factionDB.findIndex(f => f.id === this.factionId);
            if (factionIndex === -1) return;
            const fac = factionDB[factionIndex];
            const isMystified = fac.mystified || false;
            const opts = fac.mystifyOptions || {};

            const content = `
                <form>
                    <p style="color:#e0e0e0; margin-bottom:15px;">Configure what players can see when this Faction is mystified.</p>
                    <div style="margin-bottom: 15px;">
                        <label style="color:#e0e0e0; font-weight:bold; display:flex; align-items:center; gap:8px; cursor:pointer;">
                            <input type="checkbox" id="mystify-master" ${isMystified ? "checked" : ""}> 
                            <span style="color:#ff8888;">Enable Mystification (Hide Faction)</span>
                        </label>
                    </div>
                    <hr style="border-color:#4b4a44; margin-bottom:15px;">
                    <p style="color:#aaa; font-size:0.9em; margin-bottom:10px;">Select which elements remain <strong>REVEALED</strong> to players:</p>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <label style="color:#e0e0e0; cursor:pointer;"><input type="checkbox" id="rev-name" ${opts.revealName ? "checked" : ""}> Reveal Faction Name</label>
                        <label style="color:#e0e0e0; cursor:pointer;"><input type="checkbox" id="rev-img" ${opts.revealImg ? "checked" : ""}> Reveal Flag / Logo</label>
                        <label style="color:#e0e0e0; cursor:pointer;"><input type="checkbox" id="rev-aff" ${opts.revealAff ? "checked" : ""}> Reveal Affiliation</label>
                        <label style="color:#e0e0e0; cursor:pointer;"><input type="checkbox" id="rev-blurb" ${opts.revealBlurb ? "checked" : ""}> Reveal Public Blurb</label>
                        <label style="color:#e0e0e0; cursor:pointer;"><input type="checkbox" id="rev-conn" ${opts.revealConn ? "checked" : ""}> Reveal Known Connections</label>
                        <label style="color:#e0e0e0; cursor:pointer;"><input type="checkbox" id="rev-ranks" ${opts.revealRanks ? "checked" : ""}> Reveal Chain of Command (Hierarchy Tree)</label>
                    </div>
                </form>
            `;

            new Dialog({
                title: "Faction Mystification", content: content,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>', label: "Save Settings",
                        callback: async (dHtml) => {
                            fac.mystified = dHtml.find('#mystify-master').is(':checked');
                            fac.mystifyOptions = {
                                revealName: dHtml.find('#rev-name').is(':checked'),
                                revealImg: dHtml.find('#rev-img').is(':checked'),
                                revealAff: dHtml.find('#rev-aff').is(':checked'),
                                revealBlurb: dHtml.find('#rev-blurb').is(':checked'),
                                revealConn: dHtml.find('#rev-conn').is(':checked'),
                                revealRanks: dHtml.find('#rev-ranks').is(':checked')
                            };
                            factionDB[factionIndex] = fac;
                            await game.settings.set("pf2e-npc-architect", "factionData", factionDB);
                            this.render(true);
                            const dossier = Array.from(foundry.applications.instances.values()).find(w => w.id === "npc-dossier-hub");
                            if (dossier) dossier.render(false);
                        }
                    }
                }, default: "save"
            }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"], width: 400 }).render(true);
        });

        // The rest of the standard clicks (Org Nodes, Links, Notes)
        html.on('click', '.org-node', async ev => {
            const actorId = $(ev.currentTarget).data('id');
            const isEphemeral = $(ev.currentTarget).data('ephemeral');
            if (isEphemeral) {
                const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
                const ephemerals = notesJournal ? (notesJournal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || []) : [];
                const poi = ephemerals.find(e => e.id === actorId);
                if (poi) { const { PoiPublicSheetApp } = await import("./NpcDossierApp.js"); new PoiPublicSheetApp(poi).render(true); }
            } else {
                const actor = game.actors.get(actorId);
                if (!actor) return;
                import("./NpcPublicSheetApp.js").then(module => { new module.NpcPublicSheetApp(actor).render(true); });
            }
        });

        html.on('contextmenu', '.org-node', ev => {
            if (!game.user.isGM) return;
            ev.preventDefault(); ev.stopPropagation();
            const actorId = $(ev.currentTarget).data('id');
            const isEphemeral = $(ev.currentTarget).data('ephemeral');
            if (isEphemeral) { ui.notifications.info("Edit Ephemerals from the main Campaign Dossier grid."); } 
            else { const actor = game.actors.get(actorId); if (actor) { import("./NpcArchitectApp.js").then(m => new m.NpcArchitectApp(actor).render(true)); } }
        });

        html.on('click', '.faction-link', ev => {
            const targetId = $(ev.currentTarget).data('id');
            if (targetId) { new FactionSheetApp(targetId).render(true); this.close(); }
        });

        html.on('click', '.add-note-btn', async ev => {
            const input = html.find('.note-input');
            const text = input.val().trim();
            if (!text) return;
            const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
            if (!notesJournal) return;
            const notes = notesJournal.getFlag("pf2e-npc-architect", `notes_${this.factionId}`) || [];
            notes.push({ author: game.user.name, text: text, timestamp: Date.now() });
            await notesJournal.setFlag("pf2e-npc-architect", `notes_${this.factionId}`, notes);
            this.render(true);
        });

        html.on('click', '.delete-note-btn', async ev => {
            const idx = $(ev.currentTarget).data('index');
            const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
            if (!notesJournal) return;
            const notes = notesJournal.getFlag("pf2e-npc-architect", `notes_${this.factionId}`) || [];
            notes.splice(idx, 1);
            await notesJournal.setFlag("pf2e-npc-architect", `notes_${this.factionId}`, notes);
            this.render(true);
        });
    }
}