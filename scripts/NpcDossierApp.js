const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// ======================================================================
// 1. PERSON OF INTEREST (EPHEMERAL) PUBLIC SHEET
// ======================================================================
export class PoiPublicSheetApp extends HandlebarsApplicationMixin(ApplicationV2) {
    
    constructor(poi, options = {}) {
        options.id = `public-sheet-poi-${poi.id}-${game.user.id}`;
        super(options);
        this.poi = poi;
    }

    static DEFAULT_OPTIONS = {
        tag: "div",
        window: { title: "NPC File", resizable: true },
        position: { width: 700, height: 650 },
        classes: ["pf2e-npc-architect", "npc-architect", "public-sheet"]
    };

    static PARTS = {
        main: { template: "modules/pf2e-npc-architect/templates/public-sheet.hbs" }
    };

    async _prepareContext(options) {
        let rawAff = String(this.poi.affiliation || "").trim();
        let affLabel = "Neutral";
        let affClass = "neutral";
        const validAffs = ["Allied", "Friendly", "Neutral", "Dislike", "Enemy", "Unknown"];
        
        if (validAffs.includes(rawAff)) {
            affLabel = rawAff === "Unknown" ? "???" : rawAff;
            affClass = rawAff.toLowerCase();
        }

        const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
        let rawNotes = notesJournal ? (notesJournal.getFlag("pf2e-npc-architect", `notes_${this.poi.id}`) || []) : [];
        
        let notesArray = [];
        if (typeof rawNotes === "string" && rawNotes.trim() !== "") {
            notesArray.push({ id: "legacy-note", userId: "legacy", text: rawNotes, time: Date.now() });
        } else if (Array.isArray(rawNotes)) {
            notesArray = rawNotes;
        }

        const formattedNotes = notesArray.map(n => {
            let authorName = "Archived Note";
            let cssColor = "#777777";
            
            if (n.userId !== "legacy") {
                const author = game.users.get(n.userId);
                if (author) {
                    authorName = author.name;
                    cssColor = author.color?.css || author.color || "#777777"; 
                }
            }
            
            const date = new Date(n.time);
            return {
                id: n.id || n.time, 
                text: n.text,
                authorName: authorName,
                color: cssColor,
                timestamp: `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`,
                canEdit: (n.userId === game.user.id) || game.user.isGM || (n.userId === "legacy")
            };
        });

        return {
            actor: { name: this.poi.name, id: this.poi.id },
            isGM: game.user.isGM,
            isMystified: false,
            displayImage: this.poi.img || "icons/svg/mystery-man.svg",
            faction: this.poi.faction || "Unaligned",
            affiliation: affLabel,
            affClass: affClass,
            bioPublic: this.poi.bioPublic || "",
            partyNotesList: formattedNotes.reverse(), 
            connections: [],
            isLocation: this.poi.isLocation || false,
        };
    }
    
    _onRender(context, options) {
        super._onRender(context, options);
        const html = $(this.element);
// Launch Faction Sheet from NPC Profile
html.on('click', '.npc-faction-link', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    
    const factionName = $(ev.currentTarget).data('name');
    
    // Don't try to open sheets for system defaults
    if (!factionName || factionName === "Unaligned" || factionName === "Locations" || factionName === "Unknown") return;
    
    const factionDB = game.settings.get("pf2e-npc-architect", "factionData") || [];
    const faction = factionDB.find(f => f.name === factionName);
    
    if (faction) {
        const module = await import("./FactionSheetApp.js");
        new module.FactionSheetApp(faction.id).render(true);
    } else {
        ui.notifications.warn(`NPC Architect: No detailed records exist for "${factionName}".`);
    }
});
        html.find('input, textarea').on('contextmenu', ev => ev.stopPropagation());
        html.find('.mystify-toggle').hide();

        html.find('.profile-img').click(ev => {
            const src = $(ev.currentTarget).attr('src');
            new ImagePopout(src, { title: this.poi.name }).render(true);
        });

        const getNotesData = () => {
            const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
            if (!notesJournal) return null;
            let rawNotes = notesJournal.getFlag("pf2e-npc-architect", `notes_${this.poi.id}`) || [];
            if (typeof rawNotes === "string") {
                let notesArray = [];
                if (rawNotes.trim() !== "") {
                    notesArray.push({ id: "legacy-note", userId: "legacy", text: rawNotes, time: Date.now() });
                }
                rawNotes = notesArray;
            }
            return { journal: notesJournal, notes: rawNotes };
        };

        const postNote = async () => {
            const inputField = html.find('.new-note-input');
            const text = inputField.val().trim();
            if (!text) return;

            const data = getNotesData();
            if (!data) return ui.notifications.warn("NPC Architect: Shared journal missing.");

            data.notes.push({
                id: foundry.utils.randomID(),
                userId: game.user.id,
                text: text,
                time: Date.now()
            });

            await data.journal.setFlag("pf2e-npc-architect", `notes_${this.poi.id}`, data.notes);
            this.render({ force: true });
        };

        html.find('.post-note-btn').click(ev => { ev.preventDefault(); postNote(); });
        html.find('.new-note-input').keydown(ev => {
            if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                postNote();
            }
        });

        html.find('.delete-note-btn').click(async ev => {
            const noteId = String($(ev.currentTarget).data('id'));
            const data = getNotesData();
            if (!data) return;

            const newNotes = data.notes.filter(n => String(n.id || n.time) !== noteId);
            await data.journal.setFlag("pf2e-npc-architect", `notes_${this.poi.id}`, newNotes);
            this.render({ force: true });
        });

        html.find('.edit-note-btn').click(async ev => {
            const noteId = String($(ev.currentTarget).data('id'));
            const data = getNotesData();
            if (!data) return;

            const noteIndex = data.notes.findIndex(n => String(n.id || n.time) === noteId);
            if (noteIndex === -1) return;

            new Dialog({
                title: "Edit Note",
                content: `<textarea id="edit-note-text" style="width:100%; height: 150px; resize: none; background: rgba(255,255,255,0.9); color: #111; padding: 10px; font-family: inherit;">${data.notes[noteIndex].text}</textarea>`,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: "Save Changes",
                        callback: async (dHtml) => {
                            const newText = dHtml.find('#edit-note-text').val().trim();
                            if (newText) {
                                data.notes[noteIndex].text = newText;
                                await data.journal.setFlag("pf2e-npc-architect", `notes_${this.poi.id}`, data.notes);
                                this.render({ force: true });
                            }
                        }
                    },
                    cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
                },
                default: "save",
                render: (dHtml) => {
                    const win = dHtml.closest('.window-content');
                    win.css({ background: '#1c1b1a', color: '#e0e0e0', border: '1px solid #4b4a44' });
                    win.find('.dialog-buttons').css({ margin: '0', padding: '10px 0 0 0', borderTop: '1px solid #444' });
                    win.find('.dialog-button').css({ background: 'rgba(255,255,255,0.1)', border: '1px solid #5a5954', color: '#e0e0e0', margin: '0 5px' });
                    dHtml.find('input, textarea').on('contextmenu', e => e.stopPropagation());
                }
            }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"] }).render(true);
        });
    }
}

// ======================================================================
// 2. MAIN DOSSIER CAMPAIGN GRID
// ======================================================================
export class NpcDossierApp extends HandlebarsApplicationMixin(ApplicationV2) {
    
    constructor(options = {}) {
        const savedPos = game.user?.getFlag("pf2e-npc-architect", "dossierBounds");
        if (savedPos) {
            options.position = foundry.utils.mergeObject(options.position || {}, savedPos);
        }
        super(options);
        this.currentSort = "affiliation";
        this.previewAsPlayer = false; 
    }

    static DEFAULT_OPTIONS = {
        id: "npc-dossier-hub",
        tag: "div", 
        classes: ["pf2e-npc-architect"], 
        window: {
            title: "Campaign Dossier",
            resizable: true,
            contentClasses: ["dossier-container"]
        },
        position: { width: 900, height: 700 },
        actions: {
            manageFactions: async () => {
                const module = await import("./FactionManagerApp.js");
                new module.FactionManagerApp().render(true);
            },
            assignPersonnel: async () => {
                const module = await import("./FactionAssignmentApp.js");
                new module.FactionAssignmentApp().render(true);
            },
            createPoi: NpcDossierApp.#createPoiDialog
        }
    };

    static PARTS = {
        main: { template: "modules/pf2e-npc-architect/templates/dossier-grid.hbs" }
    };

    _onFirstRender(context, options) {
        super._onFirstRender(context, options);

        this._liveHooks = {
            actor: Hooks.on("updateActor", (actor, changes) => {
                const isTracked = actor.getFlag("pf2e-npc-architect", "data")?.tracked;
                const changedFlags = foundry.utils.hasProperty(changes, "flags.pf2e-npc-architect");
                if (isTracked || changedFlags) this.render({ force: true });
            }),
            journal: Hooks.on("updateJournalEntry", (journal, changes) => {
                if (journal.name === "NPC Dossier Shared Notes") {
                    this.render({ force: true });
                }
            })
        };
    }

    _onClose(options) {
        if (this._liveHooks) {
            Hooks.off("updateActor", this._liveHooks.actor);
            Hooks.off("updateJournalEntry", this._liveHooks.journal);
        }

        game.user.setFlag("pf2e-npc-architect", "dossierBounds", {
            width: this.position.width,
            height: this.position.height,
            left: this.position.left,
            top: this.position.top
        });
    }

    static async #manageFactionsDialog(event, target) {
        const actors = game.actors.filter(a => a.getFlag("pf2e-npc-architect", "data")?.tracked);
        const currentFactions = [...new Set(actors.map(a => {
            const f = a.getFlag("pf2e-npc-architect", "data")?.faction;
            return (f && f.trim() !== "") ? f : "Unaligned";
        }))];
        
        const sortable = currentFactions.filter(f => f !== "Unaligned");
        let savedOrder = game.settings.get("pf2e-npc-architect", "factionOrder") || [];
        let savedColors = game.settings.get("pf2e-npc-architect", "factionColors") || {};
        
        let finalOrder = savedOrder.filter(f => sortable.includes(f)); 
        sortable.forEach(f => { if (!finalOrder.includes(f)) finalOrder.push(f); });
        
        let listHtml = finalOrder.map(f => {
            let fColor = savedColors[f] || "#e0e0e0";
            return `
            <li data-faction="${f}" style="padding:8px; border:1px solid #5a5954; margin-bottom:4px; background:rgba(0,0,0,0.3); color:#e0e0e0; border-radius:3px; display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:${fColor}; text-shadow: 1px 1px 2px black;">${f}</strong>
                <div style="display:flex; align-items:center; gap: 10px;">
                    <input type="color" class="faction-color-picker" value="${fColor}" title="Faction Color" style="width: 24px; height: 24px; padding: 0; border: none; cursor: pointer; background: transparent;">
                    <a class="move-up" style="cursor:pointer; padding:5px; color:#aaa;"><i class="fas fa-arrow-up"></i></a>
                    <a class="move-down" style="cursor:pointer; padding:5px; margin-left:5px; color:#aaa;"><i class="fas fa-arrow-down"></i></a>
                </div>
            </li>
        `}).join("");

        let content = `<p style="color:#e0e0e0;">Reorder factions and pick their display colors.</p>
                       <ul id="faction-sort-list" style="list-style:none; padding:0; margin-bottom:15px;">${listHtml}</ul>`;

        new Dialog({
            title: "Manage Factions",
            content: content,
            buttons: {
                save: {
                    icon: '<i class="fas fa-save"></i>',
                    label: "Save Changes",
                    callback: async (dHtml) => {
                        let newOrder = [];
                        let newColors = {};
                        dHtml.find('#faction-sort-list li').each((i, el) => {
                            let fac = $(el).data('faction');
                            newOrder.push(fac);
                            newColors[fac] = $(el).find('.faction-color-picker').val();
                        });
                        await game.settings.set("pf2e-npc-architect", "factionOrder", newOrder);
                        await game.settings.set("pf2e-npc-architect", "factionColors", newColors);
                        
                        const dossier = Array.from(foundry.applications.instances.values()).find(w => w.id === "npc-dossier-hub");
                        if (dossier) dossier.render(false);
                    }
                }
            },
            render: (dHtml) => {
                const win = dHtml.closest('.window-content');
                win.css({ background: '#1c1b1a', color: '#e0e0e0', border: '1px solid #4b4a44' });
                win.find('.dialog-buttons').css({ margin: '0', padding: '10px 0 0 0', borderTop: '1px solid #444' });
                win.find('.dialog-button').css({ background: 'rgba(255,255,255,0.1)', border: '1px solid #5a5954', color: '#e0e0e0', margin: '0 5px' });

                dHtml.find('input, textarea').on('contextmenu', ev => ev.stopPropagation());
                dHtml.find('.move-up').click(ev => {
                    let li = $(ev.currentTarget).closest('li');
                    li.insertBefore(li.prev());
                });
                dHtml.find('.move-down').click(ev => {
                    let li = $(ev.currentTarget).closest('li');
                    li.insertAfter(li.next());
                });
                dHtml.find('.faction-color-picker').on('input', ev => {
                    $(ev.currentTarget).closest('li').find('strong').css('color', ev.target.value);
                });
            }
        }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"] }).render(true);
    }

    static async #createPoiDialog(event, target) {
        const factionDB = game.settings.get("pf2e-npc-architect", "factionData") || [];
        const factions = factionDB.map(f => f.name).sort();
        if (!factions.includes("Unaligned")) factions.unshift("Unaligned");
        
        const facOptions = factions.map(f => `<option value="${f}">${f}</option>`).join("");

        const content = `
            <form autocomplete="off">
                <p style="color:#e0e0e0;">Create a narrative entry without generating a full Actor sheet.</p>
                <div class="form-group"><label style="color:#e0e0e0;">Name</label><input type="text" id="poi-name" style="background: rgba(255,255,255,0.9); color: #111;" autofocus></div>
                <div class="form-group">
                    <label style="color:#e0e0e0;">Is this a Location?</label>
                    <input type="checkbox" id="poi-is-location">
                </div>
                <div class="form-group" style="display: flex; gap: 10px;">
                    <div style="flex: 1;">
                        <label style="color:#e0e0e0;">Faction</label>
                        <select id="poi-faction" style="width: 100%; background: rgba(255,255,255,0.9); color: #111; padding: 4px; border-radius: 3px;">
                            ${facOptions}
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <label id="poi-rank-label" style="color:#e0e0e0;">Rank / Title</label>
                        <select id="poi-rank" style="width: 100%; background: rgba(255,255,255,0.9); color: #111; padding: 4px; border-radius: 3px;">
                            <option value="">-- No Rank --</option>
                        </select>
                    </div>
                </div>
                <div class="form-group"><label style="color:#e0e0e0;">Affiliation</label>
                    <select id="poi-affiliation" style="width: 100%; background: rgba(255,255,255,0.9); color: #111; padding: 4px; border-radius: 3px;">
                        <option value="Neutral">Neutral</option><option value="Allied">Allied</option><option value="Friendly">Friendly</option><option value="Dislike">Dislike</option><option value="Enemy">Enemy</option>
                    </select>
                </div>
            </form>
        `;

        new Dialog({
            title: "Add Person of Interest",
            content: content,
            buttons: {
                create: {
                    label: "Create File",
                    icon: '<i class="fas fa-feather-alt"></i>',
                    callback: async (html) => {
                        const isLoc = html.find('#poi-is-location').is(':checked');
                        const newPoi = {
                            id: foundry.utils.randomID(),
                            ownerId: game.user.id,
                            name: html.find('#poi-name').val() || "Unknown",
                            img: isLoc ? "icons/svg/tower.svg" : "icons/svg/mystery-man.svg",
                            faction: html.find('#poi-faction').val(),
                            factionRank: html.find('#poi-rank').val(),
                            affiliation: html.find('#poi-affiliation').val(),
                            bioPublic: "",
                            campaign: game.settings.get("pf2e-npc-architect", "activeCampaign") || "Global",
                            isLocation: isLoc
                        };
                        const journal = game.journal.getName("NPC Dossier Shared Notes");
                        if (journal) {
                            const ephemerals = journal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || [];
                            ephemerals.push(newPoi);
                            await journal.setFlag("pf2e-npc-architect", "ephemeralNPCs", ephemerals);
                            
                            const dossier = Array.from(foundry.applications.instances.values()).find(w => w.id === "npc-dossier-hub");
                            if (dossier) dossier.render(false);
                        }
                    }
                }
            },
            render: (dHtml) => {
                const win = dHtml.closest('.window-content');
                win.css({ background: '#1c1b1a', color: '#e0e0e0', border: '1px solid #4b4a44' });
                win.find('.dialog-buttons').css({ margin: '0', padding: '10px 0 0 0', borderTop: '1px solid #444' });
                win.find('.dialog-button').css({ background: 'rgba(255,255,255,0.1)', border: '1px solid #5a5954', color: '#e0e0e0', margin: '0 5px' });

                dHtml.find('input, textarea').on('contextmenu', ev => ev.stopPropagation());
                
                const updateRanks = () => {
                    const facName = dHtml.find('#poi-faction').val();
                    const isLoc = dHtml.find('#poi-is-location').is(':checked');
                    const facObj = factionDB.find(f => f.name === facName);
                    const rankSelect = dHtml.find('#poi-rank');
                    const rankLabel = dHtml.find('#poi-rank-label');
                    
                    rankSelect.empty();
                    if (isLoc) {
                        rankLabel.text("Facility Type");
                        rankSelect.append('<option value="">-- No Category --</option>');
                        const locs = facObj?.locationGroups || [];
                        locs.forEach(lg => {
                            const lgName = typeof lg === "string" ? lg : lg.name;
                            rankSelect.append(`<option value="${lgName}">${lgName}</option>`);
                        });
                    } else {
                        rankLabel.text("Rank / Title");
                        rankSelect.append('<option value="">-- No Rank --</option>');
                        const ranks = facObj?.ranks || [];
                        ranks.forEach(r => {
                            const rName = typeof r === "string" ? r : r.name;
                            rankSelect.append(`<option value="${rName}">${rName}</option>`);
                        });
                    }
                };
                dHtml.find('#poi-faction, #poi-is-location').change(updateRanks);
                updateRanks(); 
            }
        }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"], width: 450 }).render(true);
    }

    static async #editPoiDialog(poiId) {
        const journal = game.journal.getName("NPC Dossier Shared Notes");
        if (!journal) return;
        
        const ephemerals = journal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || [];
        const poiIndex = ephemerals.findIndex(e => e.id === poiId);
        if (poiIndex === -1) return;
        const poi = ephemerals[poiIndex];

        const factionDB = game.settings.get("pf2e-npc-architect", "factionData") || [];
        const factions = factionDB.map(f => f.name).sort();
        if (!factions.includes("Unaligned")) factions.unshift("Unaligned");
        
        const facOptions = factions.map(f => `<option value="${f}" ${poi.faction === f ? 'selected' : ''}>${f}</option>`).join("");

        const content = `
            <form autocomplete="off">
                <div class="form-group">
                    <label style="color:#e0e0e0;">Name</label>
                    <input type="text" id="edit-poi-name" value="${poi.name}" style="background: rgba(255,255,255,0.9); color: #111;">
                </div>
                <div class="form-group">
                    <label style="color:#e0e0e0;">Is this a Location?</label>
                    <input type="checkbox" id="edit-poi-is-location" ${poi.isLocation ? "checked" : ""}>
                </div>
                <div class="form-group">
                    <label style="color:#e0e0e0;">Portrait Image</label>
                    <div style="display: flex; gap: 5px;">
                        <input type="text" id="edit-poi-img" value="${poi.img}" style="background: rgba(255,255,255,0.9); color: #111; flex: 1;">
                        <button type="button" class="file-picker" data-type="imagevideo" data-target="edit-poi-img" style="flex: 0 0 32px; background: rgba(255,255,255,0.9); color: #111; border: 1px solid #4b4a44;"><i class="fas fa-file-import fa-fw"></i></button>
                    </div>
                </div>
                <div class="form-group" style="display: flex; gap: 10px;">
                    <div style="flex: 1;">
                        <label style="color:#e0e0e0;">Faction</label>
                        <select id="edit-poi-faction" style="width: 100%; background: rgba(255,255,255,0.9); color: #111; padding: 4px; border-radius: 3px;">
                            ${facOptions}
                        </select>
                    </div>
                    <div style="flex: 1;">
                        <label id="edit-poi-rank-label" style="color:#e0e0e0;">Rank / Title</label>
                        <select id="edit-poi-rank" style="width: 100%; background: rgba(255,255,255,0.9); color: #111; padding: 4px; border-radius: 3px;">
                            <option value="">-- No Rank --</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label style="color:#e0e0e0;">Affiliation</label>
                    <select id="edit-poi-affiliation" style="background: rgba(255,255,255,0.9); color: #111; padding: 4px; border-radius: 3px; width: 100%;">
                        <option value="Neutral" ${poi.affiliation === 'Neutral' ? 'selected' : ''}>Neutral</option>
                        <option value="Allied" ${poi.affiliation === 'Allied' ? 'selected' : ''}>Allied</option>
                        <option value="Friendly" ${poi.affiliation === 'Friendly' ? 'selected' : ''}>Friendly</option>
                        <option value="Dislike" ${poi.affiliation === 'Dislike' ? 'selected' : ''}>Dislike</option>
                        <option value="Enemy" ${poi.affiliation === 'Enemy' ? 'selected' : ''}>Enemy</option>
                    </select>
                </div>
                <div class="form-group">
                    <label style="color:#e0e0e0;">Public Bio / Details</label>
                    <textarea id="edit-poi-bio" rows="5" style="background: rgba(255,255,255,0.9); color: #111; width: 100%; font-family: inherit;">${poi.bioPublic || ""}</textarea>
                </div>
            </form>
        `;

        new Dialog({
            title: "Edit Person of Interest",
            content: content,
            buttons: {
                save: {
                    label: "Save Changes",
                    icon: '<i class="fas fa-save"></i>',
                    callback: async (html) => {
                        ephemerals[poiIndex] = {
                            ...poi,
                            name: html.find('#edit-poi-name').val() || "Unknown",
                            isLocation: html.find('#edit-poi-is-location').is(':checked'),
                            img: html.find('#edit-poi-img').val() || "icons/svg/mystery-man.svg",
                            faction: html.find('#edit-poi-faction').val(),
                            factionRank: html.find('#edit-poi-rank').val(),
                            affiliation: html.find('#edit-poi-affiliation').val(),
                            bioPublic: html.find('#edit-poi-bio').val()
                        };
                        await journal.setFlag("pf2e-npc-architect", "ephemeralNPCs", ephemerals);
                        const dossier = Array.from(foundry.applications.instances.values()).find(w => w.id === "npc-dossier-hub");
                        if (dossier) dossier.render(false);
                    }
                },
                delete: {
                    label: "Delete File",
                    icon: '<i class="fas fa-trash"></i>',
                    callback: async () => {
                        ephemerals.splice(poiIndex, 1);
                        await journal.setFlag("pf2e-npc-architect", "ephemeralNPCs", ephemerals);
                        await journal.unsetFlag("pf2e-npc-architect", `notes_${poiId}`); 
                        const dossier = Array.from(foundry.applications.instances.values()).find(w => w.id === "npc-dossier-hub");
                        if (dossier) dossier.render(false);
                    }
                }
            },
            render: (dHtml) => {
                const win = dHtml.closest('.window-content');
                win.css({ background: '#1c1b1a', color: '#e0e0e0', border: '1px solid #4b4a44' });
                win.find('.dialog-buttons').css({ margin: '0', padding: '10px 0 0 0', borderTop: '1px solid #444' });
                win.find('.dialog-button').css({ background: 'rgba(255,255,255,0.1)', border: '1px solid #5a5954', color: '#e0e0e0', margin: '0 5px' });

                dHtml.find('.file-picker').click(ev => {
                    ev.preventDefault();
                    const button = ev.currentTarget;
                    const target = button.dataset.target;
                    new FilePicker({
                        type: button.dataset.type,
                        current: dHtml.find(`#${target}`).val(),
                        callback: path => { dHtml.find(`#${target}`).val(path); }
                    }).render(true);
                });
                dHtml.find('input, textarea').on('contextmenu', ev => ev.stopPropagation());
                
                const updateRanks = () => {
                    const facName = dHtml.find('#edit-poi-faction').val();
                    const isLoc = dHtml.find('#edit-poi-is-location').is(':checked');
                    const facObj = factionDB.find(f => f.name === facName);
                    const rankSelect = dHtml.find('#edit-poi-rank');
                    const rankLabel = dHtml.find('#edit-poi-rank-label');
                    
                    rankSelect.empty();
                    if (isLoc) {
                        rankLabel.text("Facility Type");
                        rankSelect.append('<option value="">-- No Category --</option>');
                        const locs = facObj?.locationGroups || [];
                        locs.forEach(lg => {
                            const lgName = typeof lg === "string" ? lg : lg.name;
                            const isSelected = poi.factionRank === lgName ? 'selected' : '';
                            rankSelect.append(`<option value="${lgName}" ${isSelected}>${lgName}</option>`);
                        });
                    } else {
                        rankLabel.text("Rank / Title");
                        rankSelect.append('<option value="">-- No Rank --</option>');
                        const ranks = facObj?.ranks || [];
                        ranks.forEach(r => {
                            const rName = typeof r === "string" ? r : r.name;
                            const isSelected = poi.factionRank === rName ? 'selected' : '';
                            rankSelect.append(`<option value="${rName}" ${isSelected}>${rName}</option>`);
                        });
                    }
                };
                dHtml.find('#edit-poi-faction, #edit-poi-is-location').change(updateRanks);
                updateRanks(); 
            }
        }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"], width: 450 }).render(true);
    }

    static async #viewPoiPublicDialog(poiId) {
        const journal = game.journal.getName("NPC Dossier Shared Notes");
        if (!journal) return;

        const ephemerals = journal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || [];
        const poi = ephemerals.find(e => e.id === poiId);
        
        if (poi) new PoiPublicSheetApp(poi).render(true);
    }

    async _prepareContext(options) {
        const allTracked = game.actors.filter(a => a.getFlag("pf2e-npc-architect", "data")?.tracked);

        const campaigns = ["All", ...new Set(allTracked.map(a => {
            const c = a.getFlag("pf2e-npc-architect", "data")?.campaign;
            return c ? c.trim() : "";
        }).filter(c => c !== ""))].sort();

        const currentCampaign = game.settings.get("pf2e-npc-architect", "activeCampaign") || "All";

        const campaignOptions = campaigns.map(c => {
            return { name: c, isSelected: c === currentCampaign };
        });

        const trackedActors = allTracked.filter(a => {
            if (currentCampaign === "All") return true;
            const c = a.getFlag("pf2e-npc-architect", "data")?.campaign?.trim() || "";
            return c === currentCampaign;
        });

        const isAnimated = game.settings.get("pf2e-npc-architect", "enableAnimations");

        const cards = trackedActors.map(actor => {
            const flags = actor.getFlag("pf2e-npc-architect", "data") || {};
            const isMystified = actor.getFlag("pf2e-npc-architect", "mystified") || false;
            const opts = actor.getFlag("pf2e-npc-architect", "mystifyOptions") || {};
    
            let mystifyBannerText = null;
            let mystifyBannerClass = "";
            if (game.user.isGM && isMystified) {
                const anyRevealed = (opts.revealName === true) || (opts.revealPic === true) || (opts.revealFaction === true) || (opts.revealAff === true) || (opts.revealBio === true) || (opts.revealConn === true);
                mystifyBannerText = anyRevealed ? "Partially Hidden" : "Fully Hidden";
                mystifyBannerClass = anyRevealed ? "banner-partial" : "banner-full";
            }
            const isLocation = flags.isLocation || false;
            
            const enforceMystify = isMystified && (!game.user.isGM || this.previewAsPlayer);
            
            const hideName = enforceMystify && !opts.revealName;
            const hidePic = enforceMystify && !opts.revealPic;
            const hideFaction = enforceMystify && !opts.revealFaction;
            const hideAff = enforceMystify && !opts.revealAff;
            const hideBio = enforceMystify && !opts.revealBio;

            let rawAff = flags.affiliation;
            if (Array.isArray(rawAff)) rawAff = rawAff[0];
            rawAff = String(rawAff || "").trim();
            
            let affLabel = "Neutral";
            let affClass = "neutral";
            const validAffs = ["Allied", "Friendly", "Neutral", "Dislike", "Enemy", "Unknown"];
            
            if (validAffs.includes(rawAff)) {
                affLabel = rawAff === "Unknown" ? "???" : rawAff;
                affClass = rawAff.toLowerCase();
            } else {
                const num = parseInt(rawAff) || 0;
                if (num >= 80) { affLabel = "Allied"; affClass = "allied"; }
                else if (num >= 30) { affLabel = "Friendly"; affClass = "friendly"; }
                else if (num <= -80) { affLabel = "Enemy"; affClass = "enemy"; }
                else if (num <= -30) { affLabel = "Dislike"; affClass = "dislike"; }
            }

            if (hideAff) {
                affLabel = "???";
                affClass = "unknown";
            }

            const rawConnections = flags.connections || [];
            let processedConnections = [];
            if (!(enforceMystify && !opts.revealConn)) {
                processedConnections = rawConnections.map(c => {
                    if (c.secret && (!game.user.isGM || this.previewAsPlayer)) return null;
                    const connActor = game.actors.get(c.id);
                    if (!connActor) return null;
                    const connMystified = connActor.getFlag("pf2e-npc-architect", "mystified") || false;
                    const connOpts = connActor.getFlag("pf2e-npc-architect", "mystifyOptions") || {};
                    
                    const enforceConnMystify = connMystified && (!game.user.isGM || this.previewAsPlayer);
                    
                    const realName = (enforceConnMystify && !connOpts.revealName) ? "Unknown Entity" : connActor.name;
                    let displayImg = (enforceConnMystify && !connOpts.revealPic) ? "icons/svg/mystery-man.svg" : connActor.img;
                    
                    return { id: c.id, label: c.label, name: realName, img: displayImg, isSecret: c.secret };
                }).filter(c => c !== null);
            }

            const status = flags.status || "Alive";
            let displayName = hideName ? "Unknown Entity" : actor.name;
            let statusClass = ""; 

            if (status === "Deceased") {
                displayName += " (Deceased)";
                statusClass = "status-deceased";
            } else if (status === "Missing") {
                displayName += " (Missing)";
                statusClass = "status-missing";
            }

            let finalFaction = flags.faction || "Unaligned";
            if (hideFaction) finalFaction = "Unknown";
            else if (isLocation && (finalFaction === "Unaligned" || finalFaction === "")) finalFaction = "Locations";

            return {
                id: actor.id,
                name: displayName,
                img: hidePic ? "icons/svg/mystery-man.svg" : actor.img,
                status: status, 
                statusClass: statusClass,
                role: flags.role || "Unknown",
                campaignOptions: campaignOptions,
                activeCampaign: currentCampaign,
                isLocation: isLocation, 
                faction: finalFaction, 
                factionRank: flags.factionRank || "",
                affiliation: affLabel,
                affClass: affClass, 
                blurb: hideBio ? "Records redacted." : (flags.bioPublic ? flags.bioPublic.substring(0, 100) + (flags.bioPublic.length > 100 ? "..." : "") : (isLocation ? "No location details." : "No public details.")),
                connections: processedConnections,
                mystifyBannerText: mystifyBannerText,
                mystifyBannerClass: mystifyBannerClass
            };
        });

        const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
        const ephemerals = notesJournal ? (notesJournal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || []) : [];

        const ephemeralCards = ephemerals.map(poi => {
            let affLabel = "Neutral";
            let affClass = "neutral";
            const validAffs = ["Allied", "Friendly", "Neutral", "Dislike", "Enemy", "Unknown"];
            let rawAff = String(poi.affiliation || "").trim();
            const isLoc = poi.isLocation || false;
            if (validAffs.includes(rawAff)) {
                affLabel = rawAff === "Unknown" ? "???" : rawAff;
                affClass = rawAff.toLowerCase();
            }

            let safeFaction = poi.faction || "Unaligned";
            if (isLoc && (safeFaction === "Unaligned" || safeFaction === "")) safeFaction = "Locations";

            return {
                id: poi.id,
                name: poi.name,
                img: poi.img || (isLoc ? "icons/svg/tower.svg" : "icons/svg/mystery-man.svg"),
                status: "Alive",
                statusClass: "",
                role: isLoc ? "Location" : "Person of Interest",
                campaignOptions: campaignOptions,
                activeCampaign: poi.campaign || "Global",
                isLocation: isLoc,
                faction: safeFaction,
                factionRank: poi.factionRank || "",
                affiliation: affLabel,
                affClass: affClass,
                blurb: poi.bioPublic || (isLoc ? "No location details." : "No public details."),
                connections: [],
                isEphemeral: true
            };
        });

        cards.push(...ephemeralCards);

        const groups = cards.reduce((acc, card) => {
            let safeFaction = "Unaligned";
            if (typeof card.faction === "string") {
                safeFaction = card.faction.trim();
            } else if (Array.isArray(card.faction)) {
                safeFaction = String(card.faction[0] || "").trim();
            }
            if (safeFaction === "") safeFaction = "Unaligned";

            const isHidden = safeFaction.toLowerCase() === "hidden";
            if (isHidden && (!game.user.isGM || this.previewAsPlayer)) return acc;

            const key = isHidden ? "Hidden" : safeFaction;
            if (!acc[key]) acc[key] = [];
            acc[key].push(card);
            return acc;
        }, {});

        const factionDB = game.settings.get("pf2e-npc-architect", "factionData") || [];
        const savedColors = game.settings.get("pf2e-npc-architect", "factionColors") || {};
        const affWeights = { "Allied": 5, "Friendly": 4, "Neutral": 3, "???": 2, "Dislike": 1, "Enemy": 0 };
        const savedOrder = game.settings.get("pf2e-npc-architect", "factionOrder") || [];
        
        let factionList = [];

        Object.keys(groups).forEach(key => {
            groups[key].sort((a, b) => {
                if (this.currentSort === "affiliation") {
                    const weightA = affWeights[a.affiliation] ?? 2;
                    const weightB = affWeights[b.affiliation] ?? 2;
                    if (weightA !== weightB) return weightB - weightA; 
                    return a.name.localeCompare(b.name); 
                } else {
                    return a.name.localeCompare(b.name); 
                }
            });
        });

        const topLevelFactions = factionDB.filter(f => !f.parentFactionId || !factionDB.find(p => p.id === f.parentFactionId));
        topLevelFactions.sort((a, b) => {
            let indexA = savedOrder.indexOf(a.name);
            let indexB = savedOrder.indexOf(b.name);
            if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        const processFaction = (facObj, isSub) => {
            const facCards = groups[facObj.name] || [];
            
            const personnelCards = facCards.filter(c => !c.isLocation);
            const locationCards = facCards.filter(c => c.isLocation);
            
            const enforceMystify = facObj.mystified && (!game.user.isGM || this.previewAsPlayer);
            const opts = facObj.mystifyOptions || {};

            const displayName = (enforceMystify && !opts.revealName) ? "Unknown Faction" : facObj.name;
            const displayImg = (enforceMystify && !opts.revealImg) ? null : (facObj.img || null);
            const showTree = facObj.displayAsTree && !(enforceMystify && !opts.revealRanks);

            let hierarchy = [];
            let locHierarchy = [];
            
            if (showTree) {
                // Parse Personnel Ranks
                const ranks = (facObj.ranks || []).map(r => ({
                    rank: typeof r === "string" ? r : r.name,
                    color: typeof r === "string" ? (facObj.customColor || savedColors[facObj.name] || "#e0e0e0") : (r.color || facObj.customColor || savedColors[facObj.name] || "#e0e0e0"),
                    actors: []
                }));
                const unranked = { rank: "Unranked / Operatives", color: "#888888", actors: [] };
                
                personnelCards.forEach(c => {
                    const tier = ranks.find(t => t.rank === c.factionRank);
                    if (tier) tier.actors.push(c);
                    else unranked.actors.push(c);
                });
                hierarchy = ranks.filter(t => t.actors.length > 0);
                if (unranked.actors.length > 0) hierarchy.push(unranked);

                // Parse Facility Types
                const locGroups = (facObj.locationGroups || []).map(lg => ({
                    rank: typeof lg === "string" ? lg : lg.name,
                    color: typeof lg === "string" ? (facObj.customColor || savedColors[facObj.name] || "#e0e0e0") : (lg.color || facObj.customColor || savedColors[facObj.name] || "#e0e0e0"),
                    actors: []
                }));
                const ungroupedLocs = { rank: "Uncategorized Locations", color: "#888888", actors: [] };
                
                locationCards.forEach(c => {
                    const tier = locGroups.find(t => t.rank === c.factionRank);
                    if (tier) tier.actors.push(c);
                    else ungroupedLocs.actors.push(c);
                });
                locHierarchy = locGroups.filter(t => t.actors.length > 0);
                if (ungroupedLocs.actors.length > 0) locHierarchy.push(ungroupedLocs);
            }

            if (facCards.length > 0 || showTree) {
                factionList.push({ 
                    id: facObj.id, 
                    name: displayName, 
                    color: facObj.customColor || savedColors[facObj.name] || "#e0e0e0",
                    img: displayImg,
                    personnelCards: personnelCards,
                    locationCards: locationCards,
                    isSubFaction: isSub,
                    displayAsTree: showTree,
                    hierarchy: hierarchy,
                    locHierarchy: locHierarchy
                });
            }
            delete groups[facObj.name];

            const children = factionDB.filter(f => f.parentFactionId === facObj.id).sort((a, b) => a.name.localeCompare(b.name));
            children.forEach(child => processFaction(child, true));
        };

        topLevelFactions.forEach(f => processFaction(f, false));

        // Legacy Groups Fallback
        Object.keys(groups).sort((a, b) => {
            if (a === "Unaligned") return 1;
            if (b === "Unaligned") return -1;
            return a.localeCompare(b);
        }).forEach(facName => {
            if (groups[facName].length > 0) {
                const facDbEntry = factionDB.find(f => f.name === facName);
                factionList.push({
                    id: facDbEntry ? facDbEntry.id : facName, 
                    name: facName,
                    color: savedColors[facName] || "#e0e0e0",
                    img: facDbEntry ? facDbEntry.img : null, 
                    personnelCards: groups[facName].filter(c => !c.isLocation),
                    locationCards: groups[facName].filter(c => c.isLocation),
                    isSubFaction: false, displayAsTree: false, hierarchy: [], locHierarchy: []
                });
            }
        });

        return { 
            factionList: factionList, 
            campaignOptions: campaignOptions,
            activeCampaign: currentCampaign,
            isGM: game.user.isGM,
            previewAsPlayer: this.previewAsPlayer, 
            currentSort: this.currentSort,
            isAnimated: isAnimated 
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        
        const deceased = this.element.querySelectorAll('.status-deceased');
        for (let img of deceased) {
            img.style.filter = 'grayscale(100%) contrast(1.1)';
            img.style.opacity = '0.6';
        }

        const missing = this.element.querySelectorAll('.status-missing');
        for (let img of missing) {
            img.style.filter = 'sepia(60%) hue-rotate(180deg)';
            img.style.opacity = '0.8';
        }

        const html = $(this.element);

        html.find('.preview-toggle').click(ev => {
            ev.preventDefault();
            this.previewAsPlayer = !this.previewAsPlayer;
            this.render({ force: true });
        });

        html.find('input, textarea').on('contextmenu', ev => ev.stopPropagation());

        html.find('.card-image').click(ev => {
            ev.stopPropagation(); 
            const card = ev.currentTarget.closest('.dossier-card');
            
            if (card.classList.contains('ephemeral')) {
                NpcDossierApp.#viewPoiPublicDialog(card.dataset.id);
                return;
            }

            const actorId = card.dataset.id;
            const actor = game.actors.get(actorId);
            if (actor) {
                import("./NpcPublicSheetApp.js").then(module => {
                    new module.NpcPublicSheetApp(actor).render(true);
                });
            }
        });
        
        html.find('.dossier-card.ephemeral').contextmenu(ev => {
            ev.preventDefault();
            ev.stopPropagation();
            NpcDossierApp.#editPoiDialog(ev.currentTarget.dataset.id);
        });
        
        html.find('.dossier-card:not(.ephemeral)').contextmenu(ev => {
            if (!game.user.isGM) return;
            const actorId = ev.currentTarget.dataset.id;
            const actor = game.actors.get(actorId);
            import("./NpcArchitectApp.js").then(module => {
                new module.NpcArchitectApp(actor).render(true);
            });
        });

        html.find('.card-content').click(ev => {
            const card = ev.currentTarget.closest('.dossier-card');
            if (card.classList.contains('ephemeral')) {
                NpcDossierApp.#viewPoiPublicDialog(card.dataset.id);
                return;
            }

            const actorId = card.dataset.id;
            const actor = game.actors.get(actorId);
            if (actor) {
                if (actor.testUserPermission(game.user, "LIMITED")) {
                    actor.sheet.render(true);
                } else {
                    ui.notifications.warn(`You observe ${actor.name}, but do not know them well enough to see their stats.`);
                }
            }
        });

        html.find('.dossier-card:not(.ephemeral)').each((i, el) => {
            el.addEventListener('dragstart', ev => {
                const actorId = ev.currentTarget.dataset.id;
                const actor = game.actors.get(actorId);
                if (actor) {
                    const dragData = { type: "Actor", uuid: actor.uuid };
                    ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
                }
            });
        });

        html.find('.dossier-card.ephemeral').on('dragstart', ev => ev.preventDefault());
        html.find('.dossier-card.ephemeral').on('dragover', ev => ev.preventDefault());
        
        html.find('.dossier-card.ephemeral').on('drop', async ev => {
            ev.preventDefault();
            if (!game.user.isGM) return; 

            let data;
            try { data = JSON.parse(ev.originalEvent.dataTransfer.getData('text/plain')); } catch (err) { return; }
            if (data.type !== "Actor") return;

            const targetActor = await fromUuid(data.uuid);
            if (!targetActor) return;
            const poiId = ev.currentTarget.dataset.id;

            new Dialog({
                title: "Bind Person of Interest",
                content: `<p style="color:#e0e0e0;">Bind this Person of Interest to <strong>${targetActor.name}</strong>?</p>
                          <p style="color:#e0e0e0;"><label><input type="checkbox" id="overwrite-identity" checked> Overwrite Actor name and token art with POI identity?</label></p>`,
                buttons: {
                    bind: {
                        label: "Bind to Actor",
                        icon: '<i class="fas fa-link"></i>',
                        callback: async (dHtml) => {
                            const overwrite = dHtml.find('#overwrite-identity').is(':checked');
                            const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
                            const ephemerals = notesJournal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || [];
                            const poi = ephemerals.find(e => e.id === poiId);
                            if (!poi) return;

                            await targetActor.setFlag("pf2e-npc-architect", "data", {
                                campaign: poi.campaign || "Global",
                                faction: poi.faction || "Unaligned",
                                affiliation: poi.affiliation || "Neutral",
                                bioPublic: poi.bioPublic || "",
                                status: "Alive",
                                tracked: true
                            });

                            if (overwrite) {
                                const updates = { name: poi.name };
                                if (poi.img && poi.img !== "icons/svg/mystery-man.svg") {
                                    updates.img = poi.img;
                                    updates["prototypeToken.texture.src"] = poi.img;
                                }
                                await targetActor.update(updates);
                            }

                            const poiNotes = notesJournal.getFlag("pf2e-npc-architect", `notes_${poi.id}`) || [];
                            const existingNotes = notesJournal.getFlag("pf2e-npc-architect", `notes_${targetActor.id}`) || [];
                            const mergedNotes = [...existingNotes, ...poiNotes].sort((a, b) => a.time - b.time);
                            
                            await notesJournal.setFlag("pf2e-npc-architect", `notes_${targetActor.id}`, mergedNotes);
                            await notesJournal.unsetFlag("pf2e-npc-architect", `notes_${poi.id}`);

                            const updatedEphemerals = ephemerals.filter(e => e.id !== poiId);
                            await notesJournal.setFlag("pf2e-npc-architect", "ephemeralNPCs", updatedEphemerals);

                            this.render({ force: true });
                            ui.notifications.info(`Successfully bound ${poi.name} to ${targetActor.name}`);
                        }
                    },
                    cancel: { label: "Cancel", icon: '<i class="fas fa-times"></i>' }
                },
                default: "bind",
                render: (dHtml) => {
                    const win = dHtml.closest('.window-content');
                    win.css({ background: '#1c1b1a', color: '#e0e0e0', border: '1px solid #4b4a44' });
                    win.find('.dialog-buttons').css({ margin: '0', padding: '10px 0 0 0', borderTop: '1px solid #444' });
                    win.find('.dialog-button').css({ background: 'rgba(255,255,255,0.1)', border: '1px solid #5a5954', color: '#e0e0e0', margin: '0 5px' });
                }
            }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"] }).render(true);
        });

        html.find('.dossier-search').on('input', (ev) => {
            const term = ev.currentTarget.value.toLowerCase();
            html.find('.faction-group').each((i, group) => {
                let hasVisibleCard = false;
                $(group).find('.dossier-card, .org-node').each((j, card) => {
                    const name = $(card).find('.card-title, .org-node-name').text().toLowerCase();
                    const blurb = $(card).find('.card-blurb').text().toLowerCase();
                    if (name.includes(term) || blurb.includes(term)) {
                        $(card).removeClass('hidden-by-search');
                        hasVisibleCard = true;
                    } else {
                        $(card).addClass('hidden-by-search');
                    }
                });
                if (hasVisibleCard) {
                    $(group).removeClass('hidden-by-search');
                } else {
                    $(group).addClass('hidden-by-search');
                }
            });
        });

        html.find('.dossier-sort').change((ev) => {
            this.currentSort = ev.currentTarget.value;
            this.render(); 
        });

        html.find('.campaign-filter').change(async ev => {
            if (game.user.isGM) {
                await game.settings.set("pf2e-npc-architect", "activeCampaign", ev.target.value);
            }
        });

        html.on('click', '.faction-name-link', async (ev) => {
            ev.stopPropagation();
            const factionId = String($(ev.currentTarget).data('id')); 
            const factionDB = game.settings.get("pf2e-npc-architect", "factionData") || [];
            const faction = factionDB.find(f => f.id === factionId || f.name === factionId); 
            
            if (faction) {
                const module = await import("./FactionSheetApp.js");
                new module.FactionSheetApp(faction.id).render(true);
            } else {
                ui.notifications.warn("No detailed records exist for this group yet.");
            }
        });

        html.on('contextmenu', '.faction-name-link', async (ev) => {
            if (!game.user.isGM) return;
            ev.preventDefault();
            ev.stopPropagation();
            
            const factionId = String($(ev.currentTarget).data('id')); 
            let factionDB = game.settings.get("pf2e-npc-architect", "factionData") || [];
            let faction = factionDB.find(f => f.id === factionId || f.name === factionId);
            
            if (!faction) {
                const newId = foundry.utils.randomID();
                faction = {
                    id: newId, name: factionId, img: "", displayAsTree: false,
                    mystified: false, mystifyOptions: { revealName: false, revealImg: false, revealBlurb: false, revealAff: false, revealConn: false, revealRanks: false },
                    blurb: "", gmNotes: "", affiliation: "Neutral", parentFactionId: null, customColor: "#e0e0e0", ranks: [], locationGroups: [], connections: []
                };
                factionDB.push(faction);
                await game.settings.set("pf2e-npc-architect", "factionData", factionDB);
                ui.notifications.info(`NPC Architect: Initialized new faction database for "${factionId}".`);
            }
            
            const module = await import("./FactionManagerApp.js");
            const app = new module.FactionManagerApp();
            app.activeFactionId = faction.id; 
            app.render(true);
        });

        html.find('.faction-toggle-icon').click(ev => {
            ev.stopPropagation();
            const icon = $(ev.currentTarget);
            icon.toggleClass('fa-chevron-down fa-chevron-right');
            const header = $(ev.currentTarget);
            const grid = header.closest('.faction-group').find('.dossier-grid');
            grid.slideToggle(200, () => {
                if (grid.is(':visible')) {
                    icon.removeClass('fa-chevron-right').addClass('fa-chevron-down');
                } else {
                    icon.removeClass('fa-chevron-down').addClass('fa-chevron-right');
                }
            });
        });

        html.on('click', '.org-node', async ev => {
            const card = ev.currentTarget;
            const actorId = card.dataset.id;
            const isEphemeral = card.dataset.ephemeral === "true";

            if (isEphemeral) {
                NpcDossierApp.#viewPoiPublicDialog(actorId);
            } else {
                const actor = game.actors.get(actorId);
                if (!actor) return;
                import("./NpcPublicSheetApp.js").then(module => {
                    new module.NpcPublicSheetApp(actor).render(true);
                });
            }
        });

        html.on('contextmenu', '.org-node', ev => {
            if (!game.user.isGM) return;
            ev.preventDefault();
            ev.stopPropagation();
            
            const card = ev.currentTarget;
            const actorId = card.dataset.id;
            const isEphemeral = card.dataset.ephemeral === "true";

            if (isEphemeral) {
                NpcDossierApp.#editPoiDialog(actorId);
            } else {
                const actor = game.actors.get(actorId);
                if (actor) {
                    import("./NpcArchitectApp.js").then(m => new m.NpcArchitectApp(actor).render(true));
                }
            }
        });
    }
}