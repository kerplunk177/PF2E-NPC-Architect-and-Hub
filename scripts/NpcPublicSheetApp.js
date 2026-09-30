const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class NpcPublicSheetApp extends HandlebarsApplicationMixin(ApplicationV2) {
    
    constructor(actor, options = {}) {
        options.id = `public-sheet-${actor.id}-${game.user.id}`;
        
        const savedPos = game.user?.getFlag("pf2e-npc-architect", "publicSheetBounds");
        if (savedPos) {
            options.position = foundry.utils.mergeObject(options.position || {}, savedPos);
        }
        
        super(options);
        this.actor = actor; 
        this.previewAsPlayer = false; 
    }

    static DEFAULT_OPTIONS = {
        tag: "div",
        window: {
            title: "NPC File",
            resizable: true,
        },
        position: {
            width: 700,
            height: 650
        },
        // CSS Namespace locked in here
        classes: ["pf2e-npc-architect", "npc-architect", "public-sheet"]
    };

    static PARTS = {
        main: { template: "modules/pf2e-npc-architect/templates/public-sheet.hbs" }
    };

    _onClose(options) {
        game.user.setFlag("pf2e-npc-architect", "publicSheetBounds", {
            width: this.position.width,
            height: this.position.height,
            left: this.position.left,
            top: this.position.top
        });
    }

    async _prepareContext(options) {
        const flags = this.actor.getFlag("pf2e-npc-architect", "data") || {};
        const isMystified = this.actor.getFlag("pf2e-npc-architect", "mystified") || false;
        const opts = this.actor.getFlag("pf2e-npc-architect", "mystifyOptions") || {};
        
        // GM immunity logic
        const isGM = game.user.isGM;
        const enforceMystify = isMystified && (!isGM || this.previewAsPlayer);

        const hideName = enforceMystify && !opts.revealName;
        const hidePic = enforceMystify && !opts.revealPic;
        const hideFaction = enforceMystify && !opts.revealFaction;
        const hideAff = enforceMystify && !opts.revealAff;
        const hideBio = enforceMystify && !opts.revealBio;
        const hideConn = enforceMystify && !opts.revealConn;

        let rawAff = String(flags.affiliation || "").trim();
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

        const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
        let rawNotes = notesJournal ? (notesJournal.getFlag("pf2e-npc-architect", `notes_${this.actor.id}`) || []) : [];
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
                canEdit: n.userId === game.user.id || isGM || n.userId === "legacy" 
            };
        });

        const connectionsRaw = flags.connections || [];
        const resolvedConnections = [];
        
        if (!hideConn) {
            for (let conn of connectionsRaw) {
                if (conn.secret && !isGM) continue;
                const linkedActor = game.actors.get(conn.id);
                if (linkedActor) {
                    const linkedFlags = linkedActor.getFlag("pf2e-npc-architect", "data") || {};
                    const linkedFaction = String(linkedFlags.faction || "").trim().toLowerCase();
                    if (linkedFaction === "hidden" && !isGM) continue;

                    const connMystified = linkedActor.getFlag("pf2e-npc-architect", "mystified") || false;
                    const connOpts = linkedActor.getFlag("pf2e-npc-architect", "mystifyOptions") || {};
                    
                    const enforceConnMystify = connMystified && (!isGM || this.previewAsPlayer);
                    let displayImg = (enforceConnMystify && !connOpts.revealPic) ? "icons/svg/mystery-man.svg" : linkedActor.img;
                    let displayName = (enforceConnMystify && !connOpts.revealName) ? "Unknown Entity" : linkedActor.name;
                    
                    resolvedConnections.push({
                        id: linkedActor.id, name: displayName, img: displayImg, label: conn.label, isSecret: conn.secret
                    });
                }
            }
        }

        return {
            actor: { name: hideName ? "Unknown Entity" : this.actor.name, id: this.actor.id },
            isGM: isGM,
            previewAsPlayer: this.previewAsPlayer,
            displayImage: hidePic ? "icons/svg/mystery-man.svg" : this.actor.img,
            faction: hideFaction ? "Unknown" : (flags.faction || "Unaligned"),
            affiliation: affLabel,
            affClass: affClass,
            bioPublic: hideBio ? "Records redacted." : (flags.bioPublic || ""),
            partyNotesList: formattedNotes.reverse(), 
            connections: resolvedConnections,
            isLocation: flags.isLocation || false,
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = $(this.element);

        // 1. Copy/Paste Fix for the main window textareas
        html.find('input, textarea').on('contextmenu', ev => ev.stopPropagation());

        html.on('click', '.npc-faction-link', async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            
            const factionName = $(ev.currentTarget).data('name');
            
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
        html.find('.preview-toggle').click(ev => {
            ev.preventDefault();
            this.previewAsPlayer = !this.previewAsPlayer;
            this.render({ force: true });
        });

        // The Cleaned-Up Settings Menu
        html.find('.mystify-toggle').click(async (ev) => {
            ev.preventDefault();
            const isMystified = this.actor.getFlag("pf2e-npc-architect", "mystified") || false;
            const opts = this.actor.getFlag("pf2e-npc-architect", "mystifyOptions") || {};

            const makeToggle = (id, label, isChecked) => `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding: 8px 12px; margin-bottom: 6px; border: 1px solid #4b4a44; border-radius: 4px;">
                    <div style="color:#e0e0e0; font-size: 1.05em;">${label}</div>
                    <label style="display:flex; align-items:center; cursor:pointer; gap: 10px;">
                        <span class="toggle-status" style="font-weight: bold; font-size: 0.85em; text-transform: uppercase; color: ${isChecked ? '#44aa44' : '#aa4444'};">
                            ${isChecked ? 'Revealed' : 'Hidden'}
                        </span>
                        <input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''} style="width: 18px; height: 18px; margin: 0; cursor: pointer;">
                    </label>
                </div>
            `;

            const content = `
                <form autocomplete="off">
                    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.4); padding: 10px; margin-bottom: 15px; border: 1px solid #5a5954; border-radius: 4px;">
                        <div style="color:#e0e0e0; font-weight:bold;">Enable Mystification</div>
                        <input type="checkbox" id="master-mystify" ${isMystified ? 'checked' : ''} style="width: 18px; height: 18px; margin: 0; cursor: pointer;">
                    </div>
                    <p style="color:#aaa; font-style: italic; margin-bottom: 15px; text-align: center;">Select which details are visible to players.</p>
                    ${makeToggle('rev-name', 'Subject Name', opts.revealName)}
                    ${makeToggle('rev-pic', 'Subject Portrait', opts.revealPic)}
                    ${makeToggle('rev-faction', 'Faction', opts.revealFaction)}
                    ${makeToggle('rev-aff', 'Party Affiliation', opts.revealAff)}
                    ${makeToggle('rev-bio', 'Public Records', opts.revealBio)}
                    ${makeToggle('rev-conn', 'Known Connections', opts.revealConn)}
                </form>
            `;

            new Dialog({
                title: "Mystification Settings",
                content: content,
                buttons: {
                    save: {
                        label: "Save Settings",
                        icon: '<i class="fas fa-save"></i>',
                        callback: async (dHtml) => {
                            const newOpts = {
                                revealName: dHtml.find('#rev-name').is(':checked'),
                                revealPic: dHtml.find('#rev-pic').is(':checked'),
                                revealFaction: dHtml.find('#rev-faction').is(':checked'),
                                revealAff: dHtml.find('#rev-aff').is(':checked'),
                                revealBio: dHtml.find('#rev-bio').is(':checked'),
                                revealConn: dHtml.find('#rev-conn').is(':checked')
                            };
                            const masterSwitch = dHtml.find('#master-mystify').is(':checked');
                            
                            await this.actor.update({
                                "flags.pf2e-npc-architect.mystifyOptions": newOpts,
                                "flags.pf2e-npc-architect.mystified": masterSwitch
                            });
                            this.render({ force: true });
                            
                            const dossier = Array.from(foundry.applications.instances.values()).find(w => w.id === "npc-dossier-hub");
                            if (dossier) dossier.render(true);
                        }
                    }
                },
                default: "save",
                render: (dHtml) => {
                    dHtml.find('input[type="checkbox"]').not('#master-mystify').on('change', ev => {
                        const box = $(ev.currentTarget);
                        const statusSpan = box.siblings('.toggle-status');
                        if (box.is(':checked')) {
                            statusSpan.text('Revealed').css('color', '#44aa44');
                        } else {
                            statusSpan.text('Hidden').css('color', '#aa4444');
                        }
                    });
                    dHtml.find('input').on('contextmenu', e => e.stopPropagation());
                }
            }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"], width: 420 }).render(true);
        });

        html.find('.profile-img').click(ev => {
            const src = $(ev.currentTarget).attr('src');
            const isMystified = this.actor.getFlag("pf2e-npc-architect", "mystified") || false;
            const opts = this.actor.getFlag("pf2e-npc-architect", "mystifyOptions") || {};
            const enforceMystify = isMystified && (!game.user.isGM || this.previewAsPlayer);
            
            new ImagePopout(src, {
                title: (enforceMystify && !opts.revealName) ? "Unknown Entity" : this.actor.name,
                uuid: this.actor.uuid
            }).render(true);
        });

        html.find('.connection-item').click(ev => {
            const targetId = ev.currentTarget.dataset.id;
            const targetActor = game.actors.get(targetId);
            if (targetActor) {
                new this.constructor(targetActor).render(true);
            }
        });

        const getNotesData = () => {
            const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
            if (!notesJournal) return null;
            let rawNotes = notesJournal.getFlag("pf2e-npc-architect", `notes_${this.actor.id}`) || [];

            // Fixed the legacy string-parsing bug
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

            await data.journal.setFlag("pf2e-npc-architect", `notes_${this.actor.id}`, data.notes);
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
            await data.journal.setFlag("pf2e-npc-architect", `notes_${this.actor.id}`, newNotes);
            this.render({ force: true });
        });

        html.find('.edit-note-btn').click(async ev => {
            const noteId = String($(ev.currentTarget).data('id'));
            const data = getNotesData();
            if (!data) return;

            const noteIndex = data.notes.findIndex(n => String(n.id || n.time) === noteId);
            if (noteIndex === -1) return;

            const currentText = data.notes[noteIndex].text;

            new Dialog({
                title: "Edit Note",
                content: `<textarea id="edit-note-text" style="width:100%; height: 150px; resize: none; background: rgba(255,255,255,0.9); color: #111; padding: 10px; font-family: inherit;">${currentText}</textarea>`,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: "Save Changes",
                        callback: async (dHtml) => {
                            const newText = dHtml.find('#edit-note-text').val().trim();
                            if (newText) {
                                data.notes[noteIndex].text = newText;
                                await data.journal.setFlag("pf2e-npc-architect", `notes_${this.actor.id}`, data.notes);
                                this.render({ force: true });
                            }
                        }
                    },
                    cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
                },
                default: "save",
                render: (dHtml) => {
                    // 2. Copy/Paste Fix for the Dialog
                    dHtml.find('input, textarea').on('contextmenu', e => e.stopPropagation());
                }
            }, {
                // Scoped dialog class
                classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"]
            }).render(true);
        });
    }
}