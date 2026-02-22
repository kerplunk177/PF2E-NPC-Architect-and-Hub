export class NpcPublicSheetApp extends FormApplication {
    constructor(actor) {
        super();
        this.actor = actor;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: "NPC File",
            template: "modules/pf2e-npc-architect/templates/public-sheet.hbs",
            width: 700,
            height: 650,
            classes: ["npc-architect", "public-sheet"],
            submitOnChange: true,
            closeOnSubmit: false
        });
    }

    get id() {
        return `public-sheet-${this.actor.id}-${game.user.id}`;
    }

    getData() {
        const flags = this.actor.getFlag("pf2e-npc-architect", "data") || {};
        const isMystified = this.actor.getFlag("pf2e-npc-architect", "mystified") || false;
        
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

        const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
        const partyNotes = notesJournal ? (notesJournal.getFlag("pf2e-npc-architect", `notes_${this.actor.id}`) || "") : "";

        const connectionsRaw = flags.connections || [];
        const resolvedConnections = [];
        for (let conn of connectionsRaw) {
            const linkedActor = game.actors.get(conn.id);
            if (linkedActor) {
                // If the connected actor is mystified, hide their identity here too
                const connMystified = linkedActor.getFlag("pf2e-npc-architect", "mystified") || false;
                resolvedConnections.push({
                    id: linkedActor.id,
                    name: connMystified ? "Unknown Entity" : linkedActor.name,
                    img: connMystified ? "icons/svg/mystery-man.svg" : linkedActor.img,
                    label: conn.label
                });
            }
        }

        return {
            actor: this.actor,
            isGM: game.user.isGM,
            isMystified: isMystified,
            displayImage: isMystified ? "icons/svg/mystery-man.svg" : this.actor.img,
            faction: flags.faction || "Unaligned",
            affiliation: affLabel,
            affClass: affClass,
            bioPublic: flags.bioPublic || "",
            partyNotes: partyNotes,
            connections: resolvedConnections,
            isLocation: flags.isLocation || false,
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // GM Toggle for Mystify Status
        html.find('.mystify-toggle').click(async (ev) => {
            ev.preventDefault();
            const currentStatus = this.actor.getFlag("pf2e-npc-architect", "mystified") || false;
            await this.actor.setFlag("pf2e-npc-architect", "mystified", !currentStatus);
            this.render(false);
            
            // Also force the main Dossier grid to re-render if it's open
            const dossier = Object.values(ui.windows).find(w => w.id === "npc-dossier-hub");
            if (dossier) dossier.render(false);
        });

        html.find('.profile-img').click(ev => {
            const src = $(ev.currentTarget).attr('src');
            const isMystified = this.actor.getFlag("pf2e-npc-architect", "mystified") || false;
            new ImagePopout(src, {
                title: isMystified ? "Unknown Entity" : this.actor.name,
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

        html.find('.save-notes-btn').click(ev => {
            ev.preventDefault();
            this.element.submit(); 
            ui.notifications.info("Party notes saved.");
        });
    }

    async _updateObject(event, formData) {
        const notesJournal = game.journal.getName("NPC Dossier Shared Notes");
        if (notesJournal) {
            await notesJournal.setFlag("pf2e-npc-architect", `notes_${this.actor.id}`, formData.partyNotes);
        } else {
            ui.notifications.warn("NPC Architect: Could not save notes. The shared journal is missing.");
        }
    }
}