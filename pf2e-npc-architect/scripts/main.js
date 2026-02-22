import { NpcArchitectApp } from "./NpcArchitectApp.js";
import { NpcDossierApp } from "./NpcDossierApp.js";

Hooks.once('init', async () => {
    console.log("NPC Architect | Initializing");

    game.settings.register("npc-architect", "customArchetypes", {
        name: "Custom Archetypes",
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    game.settings.register("npc-architect", "factionOrder", {
        name: "Faction Sort Order",
        scope: "world",
        config: false,
        type: Array,
        default: []
    });

    loadTemplates([
        "modules/npc-architect/templates/hub-shell.hbs",
        "modules/npc-architect/templates/dossier-grid.hbs",
        "modules/npc-architect/templates/public-sheet.hbs" 
    ]);
});


Hooks.once("ready", async () => {
    if (game.user.isGM) {
        let notesJournal = game.journal.getName("NPC Dossier Shared Notes");
        if (!notesJournal) {
            console.log("NPC Architect | Creating Shared Notes Journal...");
            await JournalEntry.create({
                name: "NPC Dossier Shared Notes",
                ownership: { default: 3 } 
            });
        }
    }
});

Hooks.on('getActorSheetHeaderButtons', (sheet, buttons) => {
    if (!game.user.isGM) return;
    if (sheet.actor.type !== "npc") return;

    buttons.unshift({
        label: "", 
        class: "npc-architect-btn",
        icon: "fas fa-chess-pawn",
        onclick: () => {
            import("./NpcArchitectApp.js").then(m => new m.NpcArchitectApp(sheet.actor).render(true));
        }
    });
});

Hooks.on("getSceneControlButtons", (controls) => {
    const dossierTool = {
        name: "npc-dossier",
        title: "Campaign Dossier",
        icon: "fas fa-users",
        visible: true,
        onClick: () => { new NpcDossierApp().render(true); },
        button: true
    };

    let tokenControls;
    if (Array.isArray(controls)) {
        tokenControls = controls.find(c => c.name === "token");
        if (tokenControls && Array.isArray(tokenControls.tools)) {
            tokenControls.tools.push(dossierTool);
        }
    } 
    else if (controls.tokens || controls.token) {
        tokenControls = controls.tokens || controls.token;
        if (Array.isArray(tokenControls.tools)) {
            tokenControls.tools.push(dossierTool);
        } else {
            tokenControls.tools["npc-dossier"] = dossierTool;
        }
    }
});