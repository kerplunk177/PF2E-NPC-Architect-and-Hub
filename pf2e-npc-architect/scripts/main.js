import { NpcArchitectApp } from "./NpcArchitectApp.js";
import { NpcDossierApp } from "./NpcDossierApp.js";

Hooks.once('init', async () => {
    console.log("NPC Architect | Initializing");

    game.settings.register("pf2e-npc-architect", "customArchetypes", {
        name: "Custom Archetypes",
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });
    // Register the Dossier Keybinding
    game.keybindings.register("pf2e-npc-architect", "openDossier", {
        name: "Open Campaign Dossier",
        hint: "Quickly toggle the NPC Campaign Dossier open or closed.",
        editable: [
            { key: "KeyD", modifiers: [KeyboardManager.MODIFIER_KEYS.ALT] }
        ],
        onDown: () => {
            // Look for an open dossier
            const existingApp = Object.values(ui.windows).find(w => w.id === "npc-dossier-hub");
            
            if (existingApp) {
                existingApp.close(); // If it is open, close it
            } else {
                new NpcDossierApp().render(true); // If it is closed, open it
            }
            return true; 
        },
        restricted: false, // Allows both GMs and players to use the keybind
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
    });

    game.settings.register("pf2e-npc-architect", "factionOrder", {
        name: "Faction Sort Order",
        scope: "world",
        config: false,
        type: Array,
        default: []
    });
    game.settings.register("pf2e-npc-architect", "factionColors", {
        name: "Faction Colors",
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });
    game.settings.register("pf2e-npc-architect", "enableAnimations", {
        name: "Enable Background Animations",
        hint: "Toggles the breathing shadow animation on the Campaign Dossier background. Turn off for better performance.",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });

    loadTemplates([
        "modules/pf2e-npc-architect/templates/hub-shell.hbs",
        "modules/pf2e-npc-architect/templates/dossier-grid.hbs",
        "modules/pf2e-npc-architect/templates/public-sheet.hbs" 
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
    game.socket.on("module.pf2e-npc-architect", (data) => {
        if (data.action === "forceRefresh") {
            Object.values(ui.windows).forEach(w => {
                if (w.id === "npc-dossier-hub" || w.id.startsWith("public-sheet-")) {
                    w.render(true);
                }
            });
        }
    });
});

Hooks.on('getActorSheetHeaderButtons', (sheet, buttons) => {
    if (!game.user.isGM) return;
    if (sheet.actor.type !== "npc") return;

    buttons.unshift({
        label: "", 
        class: "pf2e-npc-architect-btn",
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

