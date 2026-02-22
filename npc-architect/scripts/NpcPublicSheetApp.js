export class NpcPublicSheetApp extends FormApplication {
    constructor(actor) {
        super();
        this.actor = actor;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            title: "NPC File",
            template: "modules/npc-architect/templates/public-sheet.hbs",
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
        const flags = this.actor.getFlag("npc-architect", "data") || {};
        
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
        const partyNotes = notesJournal ? (notesJournal.getFlag("npc-architect", `notes_${this.actor.id}`) || "") : "";

        const connectionsRaw = flags.connections || [];
        const resolvedConnections = [];
        for (let conn of connectionsRaw) {
            const linkedActor = game.actors.get(conn.id);
            if (linkedActor) {
                resolvedConnections.push({
                    id: linkedActor.id,
                    name: linkedActor.name,
                    img: linkedActor.img,
                    label: conn.label
                });
            }
        }

        return {
            actor: this.actor,
            faction: flags.faction || "Unaligned",
            affiliation: affLabel,
            affClass: affClass,
            bioPublic: flags.bioPublic || "",
            partyNotes: partyNotes,
            connections: resolvedConnections
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.profile-img').click(ev => {
            const src = $(ev.currentTarget).attr('src');
            new ImagePopout(src, {
                title: this.actor.name,
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
            await notesJournal.setFlag("npc-architect", `notes_${this.actor.id}`, formData.partyNotes);
        } else {
            ui.notifications.warn("NPC Architect: Could not save notes. The shared journal is missing.");
        }
    }
}