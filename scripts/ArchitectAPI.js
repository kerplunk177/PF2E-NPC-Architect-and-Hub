export class ArchitectAPI {
    
    /**
     * Formats an Architect Actor, POI, or Faction into the SyncPayload DTO.
     * Fires it off to the terminal-lexicon module.
     */
    async pushToCodex(architectId) {
        const payload = {
            architectId: architectId,
            codexId: null, 
            entityType: "unknown",
            name: "Unknown Entity",
            shortPitch: "",
            thumbnail: "",
            metadata: {
                parentFaction: "Unaligned",
                affiliation: "Neutral",
                rank: "",
                status: "Alive",
                tags: []
            }
        };

        // Attempt 1: Is it a standard Actor?
        const actor = game.actors.get(architectId);
        if (actor) {
            const d = actor.getFlag("pf2e-npc-architect", "data") || {};
            payload.entityType = d.isLocation ? "location" : "npc";
            payload.name = actor.name;
            payload.thumbnail = actor.img;
            payload.shortPitch = d.bioPublic || "";
            payload.metadata.parentFaction = d.faction || "Unaligned";
            payload.metadata.affiliation = d.affiliation || "Neutral";
            payload.metadata.rank = d.factionRank || "";
            payload.metadata.status = d.status || "Alive";
            payload.metadata.tags = [d.campaign, d.factionRank, d.status].filter(Boolean);
        } else {
            // Attempt 2: Is it a Faction?
            const factionDB = game.settings.get("pf2e-npc-architect", "factionData") || [];
            const faction = factionDB.find(f => f.id === architectId);
            
            if (faction) {
                payload.entityType = "faction";
                payload.name = faction.name;
                payload.thumbnail = faction.img || "";
                payload.shortPitch = faction.blurb || "";
                payload.metadata.affiliation = faction.affiliation || "Neutral";
                
                if (faction.parentFactionId) {
                    const parent = factionDB.find(f => f.id === faction.parentFactionId);
                    if (parent) payload.metadata.parentFaction = parent.name;
                }
            } else {
                // Attempt 3: Is it an Ephemeral POI?
                const journal = game.journal.getName("NPC Dossier Shared Notes");
                const ephemerals = journal ? (journal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || []) : [];
                const poi = ephemerals.find(e => e.id === architectId);
                
                if (poi) {
                    payload.entityType = poi.isLocation ? "location" : "npc";
                    payload.name = poi.name;
                    payload.thumbnail = poi.img || "";
                    payload.shortPitch = poi.bioPublic || "";
                    payload.metadata.parentFaction = poi.faction || "Unaligned";
                    payload.metadata.affiliation = poi.affiliation || "Neutral";
                    payload.metadata.rank = poi.factionRank || "";
                    payload.metadata.tags = [poi.campaign, poi.factionRank, "POI"].filter(Boolean);
                } else {
                    ui.notifications.error(`ArchitectAPI: Could not locate entity with ID ${architectId}.`);
                    return null;
                }
            }
        }

        const codexApi = game.modules.get("terminal-lexicon")?.api;
        if (!codexApi || typeof codexApi.establishLoreLink !== "function") {
            ui.notifications.warn("ArchitectAPI: Campaign Codex (terminal-lexicon) API is not loaded or missing establishLoreLink.");
            return payload; 
        }

        ui.notifications.info(`NPC Architect: Pushing "${payload.name}" to the Campaign Codex.`);
        return await codexApi.establishLoreLink(payload);
    }

    /**
     * Reverse Bridge: Allows terminal-lexicon (or macros) to open the appropriate
     * Public Sheet or Faction Sheet using only the architectId.
     */
    async openFromCodex(architectId) {
        const actor = game.actors.get(architectId);
        if (actor) {
            const { NpcPublicSheetApp } = await import("./NpcPublicSheetApp.js");
            return new NpcPublicSheetApp(actor).render({ force: true });
        }

        const factionDB = game.settings.get("pf2e-npc-architect", "factionData") || [];
        const faction = factionDB.find(f => f.id === architectId || f.name === architectId);
        if (faction) {
            const { FactionSheetApp } = await import("./FactionSheetApp.js");
            return new FactionSheetApp(faction.id).render({ force: true });
        }

        const journal = game.journal.getName("NPC Dossier Shared Notes");
        const ephemerals = journal ? (journal.getFlag("pf2e-npc-architect", "ephemeralNPCs") || []) : [];
        const poi = ephemerals.find(e => e.id === architectId);
        if (poi) {
            const { PoiPublicSheetApp } = await import("./NpcDossierApp.js");
            return new PoiPublicSheetApp(poi).render({ force: true });
        }

        ui.notifications.warn(`ArchitectAPI: No Dossier record found for ID "${architectId}".`);
        return null;
    }
}