# NPC Architect for Foundry VTT

**NPC Architect** is a dynamic Foundry VTT module designed to automate the creation and scaling of NPCs for Pathfinder 2e and Starfinder 2e. 

It features a robust math engine that instantly recalculates an NPC's core statistics, saves, skills, strikes, and spell DCs to match any target level and combat role. Beyond raw stat scaling, the module introduces a custom Archetype Builder, allowing GMs to map out 1 to 20 class progressions using a drag-and-drop interface. When applied, the Architect automatically injects leveled features, overwrites obsolete abilities, and sorts heightened spells into newly generated, fully scaled spellcasting entries. Complete with an on-the-fly weapon Forge, compendium spell scraping, and an interactive public dossier for tracking player notes and faction connections, NPC Architect handles the heavy lifting of custom encounter design.

## Core Features

* **Dynamic Level Scaling:** Instantly scale any NPC up or down. The math engine automatically adjusts HP, AC, Saves, Skills, Strike Attack/Damage, and Spell DCs based on high, moderate, or low target benchmarks for their new level.
* **Archetype Builder:** Create custom class templates (e.g., Pyromancer, Cosmic Dragon) with a 1 to 20 grid. Drag and drop items, abilities, and spells directly from your compendiums into specific level slots.
* **Smart Item Injection:** When applying a custom Archetype, the module reads the progression backward. It intelligently injects new features while automatically deleting outdated, lower-level versions of the same ability.
* **Automated Spellcasting Entries:** Designate an Archetype as a spellcaster (Arcane, Divine, Occult, Primal). The module automatically generates the appropriate spellcasting folder, scales the spell slots, and routes injected spells directly into the correct ranks.
* **Spell Heightening Support:** Assign specific ranks to spells within the Archetype Builder. The injection engine stamps the spell with custom hidden flags to ensure it lands in the exact rank you designated, without duplicating lower-level versions.
* **The Quick Forge:** A built-in dialog for forging brand new, math-accurate strikes and magical attacks on the fly. 
* **Dossier & Connections:** A dedicated interface on the NPC sheet for tracking lore, public/private notes, and faction relationships.

## Installation

1. Open Foundry VTT and navigate to the **Add-on Modules** tab.
2. Click **Install Module**.
3. Paste the following link into the **Manifest URL** field at the bottom:
   `[Insert your GitHub raw module.json link here]`
4. Click **Install**.
5. Open your World, navigate to **Manage Modules**, and enable **NPC Architect**.

## Usage Guide

### Scaling an NPC
Open any NPC sheet and navigate to the new **Scaling** tab (or the module's main interface). Select a base combat role and input your target level. The module will recalculate the underlying Pathfinder/Starfinder math and update the sheet in a single database payload to prevent race conditions.

### Building an Archetype
1. Navigate to the **Builder** tab.
2. Select **+ Create New Class** and give it a name.
3. If it is a spellcasting class, check **Is Spellcaster?** and select a tradition.
4. Drag and drop features, weapons, and spells from your items directory or compendiums directly into the level rows.
5. *For Spells:* Once dropped, a small input box will appear next to the spell name. Enter a number (1 through 10) to dictate which rank the spell should be heightened to when injected.
6. Click **Save**. 

When scaling an NPC, you can now select your custom Archetype from the dropdown menu. The module will automatically inject all features up to the NPC's new target level.

### The Quick Forge Macro
If you need to quickly add an attack to an existing NPC without running a full recalculation, you can trigger the Quick Forge via a hotbar macro. Create a new **Script** macro in Foundry and paste the following code:

```javascript
if (!token) {
    ui.notifications.warn("Please select an NPC token first!");
} else {
    // Dynamically import the module's math script and fire the Quick Forge
    const NpcMath = await import("/modules/npc-architect/scripts/NpcDataModel.js");
    NpcMath.quickForge(token.actor);
}
