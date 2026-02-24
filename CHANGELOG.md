# Changelog

## [1.2] - 2026-02-22

### Added
* Locations feature to track places instead of just people. (These are treated as NPC technically, but there is a specific tick box to change their functionality to remove things like affiliation.)
  * "Treat as Location" checkbox in the GM Architect Builder.
* Party Notes have been changed to a more chat-box or forum style. Now, instead of being an open text box, people make posts that are highlighted with their name, chosen user color, and timestamps. These are posted in reverse order, so newest on top)

### Fixed
* Corrected several UI issues.

## [1.3] - 2026-02-23

### Added
* Added functionality for a faction to have Hidden/hidden/HIDDEN entered. If the GM places an NPC or Location into the hidden faction, they won't display for players, and connections from other NPCs or Loctions won't display to them until they are removed from the hidden faction.
* Gm's can now change the color of the displayed faction names to help with organization.
* Client Side setting to enable or disable (Enabled by default) a subtle color gradiant animation to the Dossier Hub background.

## [1.4] - 2026-02-23

 ### Added
* Functionality for multiple Campaigns. Gm's can assign NPCs to a specific campaign, and then toggle between them using a dropdown box.
* Added a keybind function to the controls options. It defaults to ALT+D

## [1.5.1] - 2026-02-23
* ###  Added
* **Merchant Support (`loot` actors):** The NPC Architect now fully supports Merchant actors. You can now inject Merchants into the Campaign Hub, track their locations, assign them to factions, and map out their connections exactly like standard NPCs.
* **Secret Connections:** Added a dedicated "Secret" toggle to the Relationship Tracker. GMs can now explicitly flag sensitive NPC connections to hide them completely from player views while keeping public connections visible.

###  Improvements & Bug Fixes
* **Revealed Names for Mystified Connections:** Overhauled how players view connections to unrevealed NPCs. Instead of seeing "Unknown Entity", players will now see the true name of the connected NPC, but their portrait will be safely obscured by a mystery silhouette until the GM grants them Observer permissions. 
* **Dynamic Campaign Filter Cleanup:** Fixed an issue where NPCs with blank campaign fields were generating ghost categories (like "Main" or "Global") in the Dossier dropdown. The dropdown now strictly populates using explicitly named Campaign Arcs.
* **UI Focus Fix on Save:** Fixed an annoyance where hitting "Save" in the Architect window would forcefully pull the Campaign Dossier to the front of the screen. The Dossier now updates its HTML quietly in the background without stealing your window focus.
