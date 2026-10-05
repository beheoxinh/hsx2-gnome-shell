import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {SplitPreferencesView} from '../../lib/ui/splitPrefsView.js';

// Desktop Icons NG preferences — standalone class, does NOT extend ExtensionPreferences.
// Suite constructs us with subMetadata; schema ID ding ≠ UUID, so we build settings manually.
export default class DingPrefs {
    constructor(metadata) {
        this.metadata = metadata;
    }

    openPreferences(parent) {
        log('[DING] openPreferences called');

        const win = new Adw.Window({
            title: 'Desktop, Context Menu',
            transient_for: parent,
            modal: true,
            default_width: 1000,
            default_height: 750,
        });
        win.set_size_request(600, 400);

        const schemaDir = this.metadata.dir.get_child('schemas');
        log(`[DING] schemaDir exists=${schemaDir.query_exists(null)} path=${schemaDir.get_path()}`);

        const source = Gio.SettingsSchemaSource.new_from_directory(
            schemaDir.get_path(),
            Gio.SettingsSchemaSource.get_default(),
            false,
        );
        const schemaObj = source.lookup('org.gnome.shell.extensions.ding', true);
        log(`[DING] schema found=${schemaObj !== null}`);

        if (!schemaObj) {
            logError(`[DING] schema not found at ${schemaDir.get_path()}`);
            return;
        }

        const settings = new Gio.Settings({settings_schema: schemaObj});
        const s = new Settings(settings);
        win._settingsRef = s;

        const sections = Settings.getTabDefs(s).map((tab, idx) => {
            const page = new Adw.PreferencesPage({title: tab.title, icon_name: tab.iconName});
            tab.groups.forEach(g => page.add(g));
            return {
                id: `tab_${idx}`,
                title: tab.title,
                iconName: tab.iconName,
                page,
            };
        });

        const split = new SplitPreferencesView({
            title: 'Desktop, Context Menu',
            sections,
        });
        split.attachToWindow(win);

        win.present();
    }
}

class Settings {
    static getTabDefs(s) {
        return [
            {title: 'General',      iconName: 'preferences-system-symbolic', groups: [s.general]},
            {title: 'Appearance',   iconName: 'applications-graphics-symbolic', groups: [s.appearance]},
            {title: 'Context Menu', iconName: 'application-menu-symbolic',   groups: [s.behaviour]},
            {title: 'Transfers',      iconName: 'transfer-progress-symbolic', groups: [s.transfers]},
        ];
    }

    constructor(schema) {
        this.schema = schema;

        // ── General ──
        this.showHome = this.#sw('Show Home Folder', 'Show the personal folder icon on the desktop.');
        this.showTrash = this.#sw('Show Trash', 'Show the trash icon on the desktop.');
        this.showVolumes = this.#sw('Show External Drives', 'Show mounted USB and external drives on the desktop.');
        this.showNetworkVolumes = this.#sw('Show Network Drives', 'Show mounted network volumes on the desktop.');
        this.addVolumesOpposite = this.#sw('Add Drives to Opposite Side', 'New drives appear on the opposite side of the screen.');
        this.showDropPlace = this.#sw('Show Drop Rectangle', 'Highlight the drop position during drag-and-drop.');
        this.general = new Adw.PreferencesGroup({title: 'General', description: 'Desktop icons visibility for Home, Trash, and drives.'});

        // ── Appearance ──
        this.iconSize = this.#combo('Icon Size', 'Size of desktop icons.', ['Tiny', 'Small', 'Standard', 'Large']);
        this.darkText = this.#sw('Use Black Label Text', 'Paint icon labels in black instead of white — useful with light wallpapers.');
        this.showLinkEmblem = this.#sw('Link Emblem', 'Show an arrow emblem on symbolic links.');
        this.appearance = new Adw.PreferencesGroup({title: 'Appearance', description: 'Icon size, label color, and link emblems.'});

        // ── Behaviour ──
        this.startCorner = this.#combo('New Icons Start Corner', 'Which corner new desktop icons are placed from.', ['Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right']);
        this.keepArranged = this.#sw('Keep Arranged', 'Always re-arrange icons by the selected sort order.');
        this.arrangeOrder = this.#combo('Arrange Order', 'How to sort desktop icons.', ['Name', 'Name (Descending)', 'Modified Time', 'Kind', 'Size']);
        this.keepStacked = this.#sw('Keep Stacked', 'Group similar file types together.');
        this.sortSpecialFolders = this.#sw('Sort Special Folders', 'Include Home, Trash, and drives when sorting icons.');
        this.useNemo = this.#sw('Use Nemo File Manager', 'Open folders with Nemo instead of Nautilus.');
        this.useNativeProgress = this.#sw('Native Progress Dialogs', 'Show Nautilus-style file operation dialogs instead of the desktop popup.');
        this.checkX11Wayland = this.#sw('X11/Wayland Popup Warning', 'Show a warning if running under X11 or Wayland.');
        this.terminalCommand = this.#entry('Custom Terminal', 'Terminal command for "Open in Console" (leave empty for system default).');
        this.customMenuEnabled = this.#sw('Custom Context Menu Entry', 'Show a custom entry in the desktop right-click menu.');
        this.customMenuLabel = this.#entry('Menu Entry Label', 'Text label for the custom context menu entry.');
        this.customMenuCommand = this.#entry('Menu Entry Command', 'Command to run when the custom menu entry is clicked.');
        this.behaviour = new Adw.PreferencesGroup({title: 'Behaviour', description: 'Icon arrangement, file manager, terminal, and context menu settings.'});

        // ── Transfers ──
        this.transferPosition = this.#combo('Card Position', 'Corner of the desktop where transfer cards appear.', ['Bottom-Left', 'Bottom-Right', 'Top-Left', 'Top-Right']);
        this.transferMargin = this.#spin('Edge Margin', 'Distance in pixels between cards and screen edges.', 0, 64, 1);
        this.transferCardWidth = this.#spin('Card Width', 'Width of each transfer card in pixels.', 240, 520, 10);
        this.transferHideDelay = this.#spin('Auto-Hide Delay', 'Milliseconds a finished card stays visible (0 keeps cards until dismissed).', 0, 15000, 100);
        this.transferShowDetail = this.#sw('Show Details', 'Show bytes, time left and rate on each transfer card.');
        this.transferShowRate = this.#sw('Show Rate', 'Include the transfer rate in the detail line.');
        this.transferShowElapsed = this.#sw('Show Elapsed in Tooltip', 'Hovering a card shows elapsed and remaining time.');
        this.transferAnimation = this.#sw('Animate Cards', 'Slide transfer cards in. Off shows them instantly.');
        this.transfers = new Adw.PreferencesGroup({title: 'Transfers', description: 'File transfer cards: position, size, details and auto-hide.'});

        // ── Assemble ──
        for (const w of [this.showHome, this.showTrash, this.showVolumes, this.showNetworkVolumes, this.addVolumesOpposite, this.showDropPlace])
            this.general.add(w);

        for (const w of [this.iconSize, this.darkText, this.showLinkEmblem])
            this.appearance.add(w);

        for (const w of [this.startCorner, this.keepArranged, this.arrangeOrder, this.keepStacked, this.sortSpecialFolders, this.useNemo, this.useNativeProgress, this.checkX11Wayland, this.terminalCommand, this.customMenuEnabled, this.customMenuLabel, this.customMenuCommand])
            this.behaviour.add(w);

        for (const w of [this.transferPosition, this.transferMargin, this.transferCardWidth, this.transferHideDelay, this.transferShowDetail, this.transferShowRate, this.transferShowElapsed, this.transferAnimation])
            this.transfers.add(w);

        // ── Bind (bools + strings) ──
        this.schema.bind('show-home', this.showHome, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('show-trash', this.showTrash, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('show-volumes', this.showVolumes, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('show-network-volumes', this.showNetworkVolumes, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('add-volumes-opposite', this.addVolumesOpposite, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('show-drop-place', this.showDropPlace, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('sort-special-folders', this.sortSpecialFolders, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('keep-arranged', this.keepArranged, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('keep-stacked', this.keepStacked, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('use-nemo', this.useNemo, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('show-link-emblem', this.showLinkEmblem, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('dark-text-in-labels', this.darkText, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('open-with-enabled', this.customMenuEnabled, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('use-native-progress', this.useNativeProgress, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('check-x11wayland', this.checkX11Wayland, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('terminal-command', this.terminalCommand, 'text', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('transfer-show-detail', this.transferShowDetail, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('transfer-show-rate', this.transferShowRate, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('transfer-show-elapsed', this.transferShowElapsed, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('transfer-animation', this.transferAnimation, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('open-with-label', this.customMenuLabel, 'text', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('open-with-command', this.customMenuCommand, 'text', Gio.SettingsBindFlags.DEFAULT);

        // ── Enum keys (manual mapping via notify::selected) ──
        // icon-size: nick->value = {tiny->3, small->0, standard->1, large->2}
        this.#connectEnum(this.iconSize, 'icon-size', [3, 0, 1, 2]);

        // start-corner: top-left(0), top-right(1), bottom-left(2), bottom-right(3)
        this.#connectEnum(this.startCorner, 'start-corner', [0, 1, 2, 3]);

        // arrangeorder: NAME(1), DESCENDINGNAME(2), MODIFIEDTIME(3), KIND(4), SIZE(5)
        this.#connectEnum(this.arrangeOrder, 'arrangeorder', [1, 2, 3, 4, 5]);
        this.#connectInt(this.transferMargin, 'transfer-margin', 0, 64);
        this.#connectInt(this.transferCardWidth, 'transfer-card-width', 240, 520);
        this.#connectInt(this.transferHideDelay, 'transfer-hide-delay', 0, 15000);
        this.#connectPosition(this.transferPosition, 'transfer-position');
    }

    #sw(title, subtitle) {
        return new Adw.SwitchRow({title, subtitle});
    }

    #combo(title, subtitle, items) {
        const store = new Gtk.StringList();
        items.forEach(i => store.append(i));
        return new Adw.ComboRow({title, subtitle, model: store});
    }

    #entry(title, subtitle) {
        const row = new Adw.EntryRow({title});
        if (subtitle)
            row.set_tooltip_text(subtitle);
        return row;
    }

    #spin(title, subtitle, min, max, step) {
        const adj = new Gtk.Adjustment({lower: min, upper: max, step_increment: step, page_increment: step * 10});
        return new Adw.SpinRow({title, subtitle, adjustment: adj, climb_rate: step, digits: 0});
    }

    #connectInt(row, key, min, max) {
        let syncing = false;
        const clamp = v => Math.max(min, Math.min(max, Math.round(v)));
        row.set_value(clamp(this.schema.get_int(key)));
        row.connect('notify::value', () => {
            if (syncing)
                return;
            this.schema.set_int(key, clamp(row.get_value()));
        });
        this.schema.connect(`changed::${key}`, () => {
            syncing = true;
            row.set_value(clamp(this.schema.get_int(key)));
            syncing = false;
        });
    }

    #connectPosition(row, key) {
        const ids = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];
        let syncing = false;
        const sync = () => {
            const idx = ids.indexOf(this.schema.get_string(key));
            if (idx >= 0 && row.get_selected() !== idx) {
                syncing = true;
                row.set_selected(idx);
                syncing = false;
            }
        };
        sync();
        row.connect('notify::selected', () => {
            if (syncing)
                return;
            this.schema.set_string(key, ids[row.get_selected()] ?? 'bottom-left');
        });
        this.schema.connect(`changed::${key}`, sync);
    }

    #connectEnum(row, key, indexMap) {
        const val = this.schema.get_enum(key);
        const idx = indexMap.indexOf(val);
        if (idx >= 0)
            row.set_selected(idx);

        row.connect('notify::selected', () => {
            const selected = row.get_selected();
            if (selected >= 0 && selected < indexMap.length)
                this.schema.set_enum(key, indexMap[selected]);
        });
    }
}
