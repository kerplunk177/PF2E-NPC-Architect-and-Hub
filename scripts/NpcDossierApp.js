const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
class PoiPublicSheetApp extends HandlebarsApplicationMixin(ApplicationV2) {
    
    constructor(poi, options = {}) {
        options.id = `public-sheet-poi-${poi.id}-${game.user.id}`;
        super(options);
        this.poi = poi;
    }

    // Match your real sheet's classes exactly so the CSS binds perfectly
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

        // The perfect spoof payload
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
            connections: [], // Ephemerals don't have actor links yet
            isLocation: false,
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = $(this.element);

        html.find('input, textarea').on('contextmenu', ev => ev.stopPropagation());

        // Hide Mystify button since POIs don't have real actor permissions
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
                render: (dHtml) => dHtml.find('input, textarea').on('contextmenu', e => e.stopPropagation())
            }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"] }).render(true);
        });
    }
}

export class NpcDossierApp extends HandlebarsApplicationMixin(ApplicationV2) {
    
    constructor(options = {}) {
        const savedPos = game.user?.getFlag("pf2e-npc-architect", "dossierBounds");
        if (savedPos) {
            options.position = foundry.utils.mergeObject(options.position || {}, savedPos);
        }
        super(options);
        this.currentSort = "affiliation";
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
        position: {
            width: 900,
            height: 700,
        },
        actions: {
            manageFactions: NpcDossierApp.#manageFactionsDialog,
            createPoi: NpcDossierApp.#createPoiDialog
        }
    };

    static PARTS = {
        main: { template: "modules/pf2e-npc-architect/templates/dossier-grid.hbs" }
    };

    _onClose(options) {
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
        const content = `
            <form autocomplete="off">
                <p style="color:#e0e0e0;">Create a narrative Person of Interest without generating a full Actor sheet.</p>
                <div class="form-group"><label style="color:#e0e0e0;">Name</label><input type="text" id="poi-name" style="background: rgba(255,255,255,0.9); color: #111;" autofocus></div>
                <div class="form-group"><label style="color:#e0e0e0;">Faction</label><input type="text" id="poi-faction" value="Unaligned" style="background: rgba(255,255,255,0.9); color: #111;"></div>
                <div class="form-group"><label style="color:#e0e0e0;">Affiliation</label>
                    <select id="poi-affiliation" style="background: rgba(255,255,255,0.9); color: #111;">
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
                        const newPoi = {
                            id: foundry.utils.randomID(),
                            name: html.find('#poi-name').val() || "Unknown",
                            img: "icons/svg/mystery-man.svg",
                            faction: html.find('#poi-faction').val(),
                            affiliation: html.find('#poi-affiliation').val(),
                            bioPublic: "",
                            campaign: game.settings.get("pf2e-npc-architect", "activeCampaign") || "Global"
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
                dHtml.find('input, textarea').on('contextmenu', ev => ev.stopPropagation());
            }
        }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"] }).render(true);
    }
    static async #editPoiDialog(poiId) {
        const journal = game.journal.getName("NPC Dossier Shared Notes");
        if (!journal) return;
        
        const ephemerals = journal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || [];
        const poiIndex = ephemerals.findIndex(e => e.id === poiId);
        if (poiIndex === -1) return;
        const poi = ephemerals[poiIndex];

        const content = `
            <form autocomplete="off">
                <div class="form-group">
                    <label style="color:#e0e0e0;">Name</label>
                    <input type="text" id="edit-poi-name" value="${poi.name}" style="background: rgba(255,255,255,0.9); color: #111;">
                </div>
                <div class="form-group">
                    <label style="color:#e0e0e0;">Portrait Image</label>
                    <div style="display: flex; gap: 5px;">
                        <input type="text" id="edit-poi-img" value="${poi.img}" style="background: rgba(255,255,255,0.9); color: #111; flex: 1;">
                        <button type="button" class="file-picker" data-type="imagevideo" data-target="edit-poi-img" style="flex: 0 0 32px; background: rgba(255,255,255,0.9); color: #111; border: 1px solid #4b4a44;"><i class="fas fa-file-import fa-fw"></i></button>
                    </div>
                </div>
                <div class="form-group">
                    <label style="color:#e0e0e0;">Faction</label>
                    <input type="text" id="edit-poi-faction" value="${poi.faction}" style="background: rgba(255,255,255,0.9); color: #111;">
                </div>
                <div class="form-group">
                    <label style="color:#e0e0e0;">Affiliation</label>
                    <select id="edit-poi-affiliation" style="background: rgba(255,255,255,0.9); color: #111;">
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
                            img: html.find('#edit-poi-img').val() || "icons/svg/mystery-man.svg",
                            faction: html.find('#edit-poi-faction').val(),
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
                        await journal.unsetFlag("pf2e-npc-architect", `notes_${poiId}`); // Cleanup notes if they had any
                        const dossier = Array.from(foundry.applications.instances.values()).find(w => w.id === "npc-dossier-hub");
                        if (dossier) dossier.render(false);
                    }
                }
            },
            render: (html) => {
                // Hook up the image FilePicker
                html.find('.file-picker').click(ev => {
                    ev.preventDefault();
                    const button = ev.currentTarget;
                    const target = button.dataset.target;
                    new FilePicker({
                        type: button.dataset.type,
                        current: html.find(`#${target}`).val(),
                        callback: path => { html.find(`#${target}`).val(path); }
                    }).render(true);
                });
                html.find('input, textarea').on('contextmenu', ev => ev.stopPropagation());
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
            const isLocation = flags.isLocation || false;
            
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

            const rawConnections = flags.connections || [];
            const processedConnections = rawConnections.map(c => {
                if (c.secret && !game.user.isGM) return null;
                const connActor = game.actors.get(c.id);
                if (!connActor) return null;
                const connMystified = connActor.getFlag("pf2e-npc-architect", "mystified") || false;
                const realName = connActor.name;
                let displayImg = connActor.img;
                if (!game.user.isGM && connMystified) {
                    displayImg = "icons/svg/mystery-man.svg";
                }
                return {
                    id: c.id, label: c.label, name: realName, img: displayImg, isSecret: c.secret
                };
            }).filter(c => c !== null);

            const status = flags.status || "Alive";
            let displayName = actor.name;
            let statusClass = ""; 

            if (status === "Deceased") {
                displayName += " (Deceased)";
                statusClass = "status-deceased";
            } else if (status === "Missing") {
                displayName += " (Missing)";
                statusClass = "status-missing";
            }

            return {
                id: actor.id,
                name: displayName,
                img: isMystified ? "icons/svg/mystery-man.svg" : actor.img,
                status: status, 
                statusClass: statusClass,
                role: flags.role || "Unknown",
                campaignOptions: campaignOptions,
                activeCampaign: currentCampaign,
                isLocation: isLocation, 
                faction: isLocation ? "Locations" : (flags.faction || "Unaligned"), 
                affiliation: affLabel,
                affClass: affClass, 
                blurb: flags.bioPublic ? flags.bioPublic.substring(0, 100) + (flags.bioPublic.length > 100 ? "..." : "") : (isLocation ? "No location details." : "No public details."),
                connections: processedConnections 
            };
        });

        // ----------------------------------------------------
        // INJECT EPHEMERAL POIs HERE
        // ----------------------------------------------------
        const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
        const ephemerals = notesJournal ? (notesJournal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || []) : [];

        const ephemeralCards = ephemerals.map(poi => {
            let affLabel = "Neutral";
            let affClass = "neutral";
            const validAffs = ["Allied", "Friendly", "Neutral", "Dislike", "Enemy", "Unknown"];
            let rawAff = String(poi.affiliation || "").trim();
            
            if (validAffs.includes(rawAff)) {
                affLabel = rawAff === "Unknown" ? "???" : rawAff;
                affClass = rawAff.toLowerCase();
            }

            return {
                id: poi.id,
                name: poi.name,
                img: poi.img || "icons/svg/mystery-man.svg",
                status: "Alive",
                statusClass: "",
                role: "Person of Interest",
                campaignOptions: campaignOptions,
                activeCampaign: poi.campaign || "Global",
                isLocation: false,
                faction: poi.faction || "Unaligned",
                affiliation: affLabel,
                affClass: affClass,
                blurb: poi.bioPublic || "No public details.",
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
            if (isHidden && !game.user.isGM) return acc;

            const key = isHidden ? "Hidden" : safeFaction;
            if (!acc[key]) acc[key] = [];
            acc[key].push(card);
            return acc;
        }, {});

        const affWeights = { "Allied": 5, "Friendly": 4, "Neutral": 3, "???": 2, "Dislike": 1, "Enemy": 0 };
        const savedColors = game.settings.get("pf2e-npc-architect", "factionColors") || {};

        let factionList = Object.keys(groups).map(key => {
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
            return { name: key, color: savedColors[key] || "#e0e0e0", cards: groups[key] };
        });

        let savedOrder = game.settings.get("pf2e-npc-architect", "factionOrder") || [];
        
        factionList.sort((a, b) => {
            if (a.name === "Unaligned") return 1;
            if (b.name === "Unaligned") return -1;
            
            let indexA = savedOrder.indexOf(a.name);
            let indexB = savedOrder.indexOf(b.name);
            
            if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            
            return indexA - indexB;
        });

        return { 
            factionList: factionList, 
            campaignOptions: campaignOptions,
            activeCampaign: currentCampaign,
            isGM: game.user.isGM,
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

        // ----------------------------------------------------
        // EPHEMERAL DRAG BLOCKING & "BIND TO ACTOR" DROPZONE
        // ----------------------------------------------------
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
                default: "bind"
            }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"] }).render(true);
        });

        html.find('.dossier-search').on('input', (ev) => {
            const term = ev.currentTarget.value.toLowerCase();
            html.find('.faction-group').each((i, group) => {
                let hasVisibleCard = false;
                $(group).find('.dossier-card').each((j, card) => {
                    const name = $(card).find('.card-title').text().toLowerCase();
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

        html.find('.faction-toggle').click((ev) => {
            const header = $(ev.currentTarget);
            const icon = header.find('i');
            const grid = header.closest('.faction-group').find('.dossier-grid');
            grid.slideToggle(200, () => {
                if (grid.is(':visible')) {
                    icon.removeClass('fa-chevron-right').addClass('fa-chevron-down');
                } else {
                    icon.removeClass('fa-chevron-down').addClass('fa-chevron-right');
                }
            });
        });
    }
}