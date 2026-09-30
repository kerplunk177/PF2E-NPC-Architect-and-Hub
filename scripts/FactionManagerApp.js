const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FactionManagerApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        const savedPos = game.user?.getFlag("pf2e-npc-architect", "factionManagerBounds");
        if (savedPos) {
            options.position = foundry.utils.mergeObject(options.position || {}, savedPos);
        }
        super(options);
        this.factions = foundry.utils.deepClone(game.settings.get("pf2e-npc-architect", "factionData") || []);
        this.activeFactionId = this.factions.length ? this.factions[0].id : null;
    }

    static DEFAULT_OPTIONS = {
        id: "faction-manager-hub",
        tag: "div",
        window: { title: "Faction Command Center", resizable: true },
        position: { width: 950, height: 600 },
        classes: ["pf2e-npc-architect"]
    };

    static PARTS = {
        main: { template: "modules/pf2e-npc-architect/templates/faction-manager.hbs" }
    }

    _onClose(options) {
        game.user.setFlag("pf2e-npc-architect", "factionManagerBounds", {
            width: this.position.width, height: this.position.height, left: this.position.left, top: this.position.top
        });
    }

    async _prepareContext(options) {
        this.factions.forEach(f => {
            if (!f.connections) f.connections = [];
            if (!f.locationGroups) f.locationGroups = [];
            if (f.mystified === undefined) f.mystified = false;
            if (!f.mystifyOptions) f.mystifyOptions = { revealName: false, revealImg: false, revealBlurb: false, revealAff: false, revealConn: false, revealRanks: false };
            
            if (f.ranks && f.ranks.length) {
                f.ranks = f.ranks.map(r => typeof r === "string" ? { name: r, color: f.customColor || "#e0e0e0" } : r);
            }
            if (f.locationGroups && f.locationGroups.length) {
                f.locationGroups = f.locationGroups.map(lg => typeof lg === "string" ? { name: lg, color: f.customColor || "#e0e0e0" } : lg);
            }
        });

        const sortedFactions = [...this.factions].sort((a, b) => a.name.localeCompare(b.name));
        const activeFaction = this.factions.find(f => f.id === this.activeFactionId);
        
        const otherFactions = this.factions.filter(f => f.id !== this.activeFactionId);
        const parentOptions = otherFactions.map(f => {
            return { id: f.id, name: f.name, isSelected: activeFaction?.parentFactionId === f.id };
        });

        const connectionChoices = {};
        otherFactions.forEach(f => connectionChoices[f.id] = f.name);

        return {
            factions: sortedFactions, activeFaction: activeFaction,
            parentOptions: parentOptions, connectionChoices: connectionChoices,
            hasFactions: this.factions.length > 0
        };
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = $(this.element);

        html.find('.file-picker').click(ev => {
            ev.preventDefault();
            const button = ev.currentTarget;
            const target = button.dataset.target;
            new FilePicker({
                type: button.dataset.type, current: html.find(`#${target}`).val(),
                callback: path => { html.find(`#${target}`).val(path); }
            }).render(true);
        });

        html.find('.faction-list-item').click(ev => {
            this.activeFactionId = $(ev.currentTarget).data('id');
            this.render(true);
        });

        html.find('.add-faction-btn').click(ev => {
            const newId = foundry.utils.randomID();
            this.factions.push({
                id: newId, name: "New Faction", img: "", displayAsTree: false,
                mystified: false, mystifyOptions: { revealName: false, revealImg: false, revealBlurb: false, revealAff: false, revealConn: false, revealRanks: false },
                blurb: "", gmNotes: "", affiliation: "Neutral", parentFactionId: null, customColor: "#e0e0e0",
                ranks: [], locationGroups: [], connections: []
            });
            this.activeFactionId = newId;
            this.render(true);
        });

        html.find('.save-faction-btn').click(async ev => {
            if (!this.activeFactionId) return;
            const active = this.factions.find(f => f.id === this.activeFactionId);
            
            active.name = html.find('#fac-name').val().trim();
            active.customColor = html.find('#fac-color').val();
            active.img = html.find('#fac-img').val().trim();
            active.parentFactionId = html.find('#fac-parent').val() || null;
            active.affiliation = html.find('#fac-affiliation').val();
            active.blurb = html.find('#fac-blurb').val() || "";
            active.gmNotes = html.find('#fac-gm-notes').val() || "";

            const newRanks = [];
            html.find('.rank-row').each((i, el) => {
                const val = $(el).find('.rank-name-input').val().trim();
                const col = $(el).find('.rank-color-input').val();
                if (val) newRanks.push({ name: val, color: col });
            });
            active.ranks = newRanks;

            const newLocs = [];
            html.find('.loc-row').each((i, el) => {
                const val = $(el).find('.loc-name-input').val().trim();
                const col = $(el).find('.loc-color-input').val();
                if (val) newLocs.push({ name: val, color: col });
            });
            active.locationGroups = newLocs;

            const newConns = [];
            html.find('.fac-connection-row').each((i, el) => {
                const id = $(el).find('.conn-id').val();
                const label = $(el).find('.conn-label').val().trim();
                const isSecret = $(el).find('.conn-secret').is(':checked');
                if (id && label) newConns.push({ id, label, secret: isSecret });
            });
            active.displayAsTree = html.find('#fac-display-tree').is(':checked');
            active.connections = newConns;

            await game.settings.set("pf2e-npc-architect", "factionData", this.factions);
            ui.notifications.info(`NPC Architect: Saved ${active.name}`);
            
            const dossier = Array.from(foundry.applications.instances.values()).find(w => w.id === "npc-dossier-hub");
            if (dossier) dossier.render(true);
            
            this.render(true);
        });

        html.find('.delete-faction-btn').click(async ev => {
            if (!this.activeFactionId) return;
            new Dialog({
                title: "Delete Faction", content: `<p style="color:#e0e0e0;">Are you sure you want to delete this faction?</p>`,
                buttons: {
                    yes: { label: "Delete", icon: '<i class="fas fa-trash"></i>', callback: async () => {
                            this.factions = this.factions.filter(f => f.id !== this.activeFactionId);
                            this.activeFactionId = this.factions.length ? this.factions[0].id : null;
                            await game.settings.set("pf2e-npc-architect", "factionData", this.factions);
                            this.render(true);
                        }
                    },
                    no: { label: "Cancel", icon: '<i class="fas fa-times"></i>' }
                }, default: "no", render: (dHtml) => dHtml.closest('.window-content').addClass('dossier-dark-dialog')
            }, { classes: ["pf2e-npc-architect", "dialog", "dossier-dark-dialog"] }).render(true);
        });

        // Ranks
        html.find('.add-rank-btn').click(ev => {
            if (!this.activeFactionId) return;
            const active = this.factions.find(f => f.id === this.activeFactionId);
            if (!active.ranks) active.ranks = [];
            active.ranks.push({ name: "New Rank", color: active.customColor || "#e0e0e0" });
            this.render(true);
        });
        html.find('.delete-rank-btn').click(ev => {
            const idx = $(ev.currentTarget).data('index');
            const active = this.factions.find(f => f.id === this.activeFactionId);
            active.ranks.splice(idx, 1);
            this.render(true);
        });

        // Location Groups
        html.find('.add-loc-btn').click(ev => {
            if (!this.activeFactionId) return;
            const active = this.factions.find(f => f.id === this.activeFactionId);
            if (!active.locationGroups) active.locationGroups = [];
            active.locationGroups.push({ name: "New Facility Type", color: active.customColor || "#e0e0e0" });
            this.render(true);
        });
        html.find('.delete-loc-btn').click(ev => {
            const idx = $(ev.currentTarget).data('index');
            const active = this.factions.find(f => f.id === this.activeFactionId);
            active.locationGroups.splice(idx, 1);
            this.render(true);
        });

        // Connections
        html.find('.add-connection-btn').click(ev => {
            if (!this.activeFactionId) return;
            const active = this.factions.find(f => f.id === this.activeFactionId);
            if (!active.connections) active.connections = [];
            active.connections.push({ id: "", label: "", secret: false });
            this.render(true);
        });
        html.find('.delete-connection-btn').click(ev => {
            const idx = $(ev.currentTarget).data('index');
            const active = this.factions.find(f => f.id === this.activeFactionId);
            active.connections.splice(idx, 1);
            this.render(true);
        });
    }
}