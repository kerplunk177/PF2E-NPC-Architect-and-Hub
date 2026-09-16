const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ArchetypeBuilderApp extends HandlebarsApplicationMixin(ApplicationV2) {
    
    constructor(archetypeId = null, options = {}) {
        super(options);
        this.archetypeId = archetypeId;
        const savedArchetypes = game.settings.get("pf2e-npc-architect", "customArchetypes") || {};
        
        this.data = this.archetypeId ? savedArchetypes[this.archetypeId] : {
            name: "New Archetype",
            levels: Array.from({length: 20}, (_, i) => ({
                level: i + 1,
                hp: "mod", 
                ac: "mod", 
                items: []  
            }))
        };
    }

    static DEFAULT_OPTIONS = {
        id: "archetype-builder",
        tag: "div", 
        classes: ["pf2e-npc-architect"], // This master class enables our scoped CSS
        window: {
            title: "Archetype Builder",
            resizable: true,
        },
        position: {
            width: 800,
            height: 700
        }
    };

    static PARTS = {
        main: { template: "modules/pf2e-npc-architect/templates/builder-shell.hbs" }
    };

    async _prepareContext(options) {
        return {
            archetype: this.data,
            mathOptions: { "high": "High", "mod": "Moderate", "low": "Low" }
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = $(this.element);

        // 1. The Copy/Paste Fix
        // This stops Foundry from swallowing the right-click menu on your inputs
        html.find('input, textarea').on('contextmenu', ev => ev.stopPropagation());

        // 2. HTML5 Drag and Drop logic ported to V2
        html.find('.level-row').on('dragover', ev => ev.preventDefault());
        html.find('.level-row').on('drop', async ev => {
            ev.preventDefault();
            const data = TextEditor.getDragEventData(ev.originalEvent);
            if (data.type !== "Item") return;

            const row = ev.currentTarget;
            const levelIndex = row.dataset.level - 1;

            const item = await fromUuid(data.uuid);
            
            this.data.levels[levelIndex].items.push({
                name: item.name,
                img: item.img,
                uuid: data.uuid
            });

            // Re-render the specific part to show the newly dropped item
            this.render(true);
        });

        // 3. Porting your legacy _updateObject form submission
        html.find('form.archetype-builder').on('submit', ev => {
            ev.preventDefault();
            
            // FormDataExtended natively parses the form inputs into a clean object
            const formData = new FormDataExtended(ev.currentTarget).object;
            console.log("Saving Archetype...", formData);
        });
    }
}