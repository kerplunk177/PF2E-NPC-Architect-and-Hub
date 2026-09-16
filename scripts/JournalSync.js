export async function syncDossier(actor) {
    const journalName = actor.name;
    const folderName = "NPC Dossiers";

    let folder = game.folders.find(f => f.name === folderName && f.type === "JournalEntry");
    if (!folder) {
        folder = await Folder.create({ name: folderName, type: "JournalEntry", color: "#FF0000" });
    }

    let journal = game.journal.find(j => j.name === journalName && j.folder?.id === folder.id);
    
    const bio = actor.system.details.biography.value || "No biography.";
    const affiliation = actor.getFlag("pf2e-npc-architect", "affiliation") || 0;
    
    // CSS Scoping Fix: Added 'pf2e-npc-architect' to the wrapper to prevent global leakage
    const content = `
        <div class="pf2e-npc-architect npc-dossier">
            <img src="${actor.img}" width="150" style="float:right; margin-left:10px; border: 2px solid #4b4a44; border-radius: 5px;">
            <h2 style="border-bottom: 2px solid #5a5954;">${actor.name}</h2>
            <p><strong>Affiliation:</strong> ${affiliation}/100</p>
            <hr style="border: 0; height: 2px; background: #5a5954; margin: 15px 0;">
            ${bio}
        </div>
    `;

    if (!journal) {
        await JournalEntry.create({
            name: journalName,
            folder: folder.id,
            pages: [{
                name: "Public Profile",
                type: "text",
                text: { content: content }
            }]
        });
        ui.notifications.info(`Created Dossier for ${actor.name}`);
    } else {
        const page = journal.pages.contents[0];
        await page.update({ "text.content": content });
        ui.notifications.info(`Updated Dossier for ${actor.name}`);
    }
}