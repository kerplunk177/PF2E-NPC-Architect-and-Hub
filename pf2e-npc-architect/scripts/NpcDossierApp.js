export class NpcDossierApp extends Application {
    constructor(options) {
        super(options);
        this.currentSort = "name"; 
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "npc-dossier-hub",
            title: "Campaign Dossier",
            template: "modules/pf2e-npc-architect/templates/dossier-grid.hbs",
            width: 900,
            height: 700,
            classes: ["pf2e-npc-architect"],
            resizable: true
        });
    }

    getData() {
        const trackedActors = game.actors.filter(a => a.getFlag("pf2e-npc-architect", "data")?.tracked);

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

            return {
                id: actor.id,
                name: actor.name, 
                img: isMystified ? "icons/svg/mystery-man.svg" : actor.img,
                role: flags.role || "Unknown",
                isLocation: isLocation, 
                faction: isLocation ? "Locations" : (flags.faction || "Unaligned"), 
                affiliation: affLabel,
                affClass: affClass, 
                blurb: flags.bioPublic ? flags.bioPublic.substring(0, 100) + (flags.bioPublic.length > 100 ? "..." : "") : (isLocation ? "No location details." : "No public details.")
            };
        });

        const groups = cards.reduce((acc, card) => {
            const key = card.faction.trim() === "" ? "Unaligned" : card.faction;
            if (!acc[key]) acc[key] = [];
            acc[key].push(card);
            return acc;
        }, {});

        const affWeights = { "Allied": 5, "Friendly": 4, "Neutral": 3, "???": 2, "Dislike": 1, "Enemy": 0 };

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
            return { name: key, cards: groups[key] };
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
            factionList, 
            isGM: game.user.isGM,
            currentSort: this.currentSort 
        };
    }

    activateListeners(html) {
        super.activateListeners(html);


    html.find('.card-image').click(ev => {
        ev.stopPropagation(); 
        const actorId = ev.currentTarget.closest('.dossier-card').dataset.id;
        const actor = game.actors.get(actorId);
        if (actor) {
            import("./NpcPublicSheetApp.js").then(module => {
                new module.NpcPublicSheetApp(actor).render(true);
            });
        }
    });
    html.find('.dossier-card').each((i, el) => {
        el.addEventListener('dragstart', ev => {
            const actorId = ev.currentTarget.dataset.id;
            const actor = game.actors.get(actorId);
            if (actor) {
                const dragData = {
                    type: "Actor",
                    uuid: actor.uuid
                };
                ev.dataTransfer.setData("text/plain", JSON.stringify(dragData));
            }
        });
    });
    html.find('.card-content').click(ev => {
        const actorId = ev.currentTarget.closest('.dossier-card').dataset.id;
        const actor = game.actors.get(actorId);
        if (actor) {
            if (actor.testUserPermission(game.user, "LIMITED")) {
                actor.sheet.render(true);
            } else {
                ui.notifications.warn(`You observe ${actor.name}, but do not know them well enough to see their stats.`);
            }
        }
    });


        html.find('.dossier-card').contextmenu(ev => {
            if (!game.user.isGM) return;
            const actorId = ev.currentTarget.dataset.id;
            const actor = game.actors.get(actorId);
            import("./NpcArchitectApp.js").then(module => {
                new module.NpcArchitectApp(actor).render(true);
            });
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


        html.find('.manage-factions-btn').click(async () => {
            const actors = game.actors.filter(a => a.getFlag("pf2e-npc-architect", "data")?.tracked);
            const currentFactions = [...new Set(actors.map(a => {
                const f = a.getFlag("pf2e-npc-architect", "data")?.faction;
                return (f && f.trim() !== "") ? f : "Unaligned";
            }))];
            
            const sortable = currentFactions.filter(f => f !== "Unaligned");
            let savedOrder = game.settings.get("pf2e-npc-architect", "factionOrder") || [];
            
            let finalOrder = savedOrder.filter(f => sortable.includes(f)); 
            sortable.forEach(f => { if (!finalOrder.includes(f)) finalOrder.push(f); });
            
            let listHtml = finalOrder.map(f => `
                <li data-faction="${f}" style="padding:8px; border:1px solid #5a5954; margin-bottom:4px; background:rgba(0,0,0,0.3); color:#e0e0e0; border-radius:3px; display:flex; justify-content:space-between; align-items:center;">
                    <strong>${f}</strong>
                    <div>
                        <a class="move-up" style="cursor:pointer; padding:5px; color:#aaa;"><i class="fas fa-arrow-up"></i></a>
                        <a class="move-down" style="cursor:pointer; padding:5px; margin-left:5px; color:#aaa;"><i class="fas fa-arrow-down"></i></a>
                    </div>
                </li>
            `).join("");

            let content = `<p style="color:#e0e0e0;">Use the arrows to reorder how factions display in the dossier.</p>
                           <ul id="faction-sort-list" style="list-style:none; padding:0; margin-bottom:15px;">${listHtml}</ul>`;

            new Dialog({
                title: "Manage Factions",
                content: content,
                buttons: {
                    save: {
                        icon: '<i class="fas fa-save"></i>',
                        label: "Save Order",
                        callback: async (dHtml) => {
                            let newOrder = [];
                            dHtml.find('#faction-sort-list li').each((i, el) => {
                                newOrder.push($(el).data('faction'));
                            });
                            await game.settings.set("pf2e-npc-architect", "factionOrder", newOrder);
                            this.render(); 
                        }
                    }
                },
                render: (dHtml) => {
                    dHtml.find('.move-up').click(ev => {
                        let li = $(ev.currentTarget).closest('li');
                        li.insertBefore(li.prev());
                    });
                    dHtml.find('.move-down').click(ev => {
                        let li = $(ev.currentTarget).closest('li');
                        li.insertAfter(li.next());
                    });
                }
            }, {
                classes: ["dialog", "dossier-dark-dialog"] 
            }).render(true);
        });
    }
}