import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {SplitPreferencesView} from '../../lib/ui/splitPrefsView.js';
import * as NautilusSync from './nautilusSync.js';

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

        // Bundled icons (tabs + Nautilus Context rows) live in ./icons/hicolor.
        const display = Gdk.Display.get_default();
        if (display) {
            const iconTheme = Gtk.IconTheme.get_for_display(display);
            const iconsPath = this.metadata.dir.get_child('icons').get_path();
            if (!iconTheme.get_search_path().includes(iconsPath))
                iconTheme.add_search_path(iconsPath);
        }

        const settings = new Gio.Settings({settings_schema: schemaObj});
        const s = new Settings(settings, this.metadata.dir);
        win._settingsRef = s;
        // Drop our GSettings handlers with the window: a later change of the
        // key (another prefs window, gsettings CLI) must not touch dead rows.
        win.connect('close-request', () => {
            s.destroy();
            return false;
        });

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
            {title: 'Context Menu', iconName: 'ding-context-menu-symbolic',  groups: [s.behaviour]},
            {title: 'Transfers',    iconName: 'ding-transfers-symbolic',     groups: [s.transfers]},
            {title: 'Nautilus Context', iconName: 'ding-nautilus-context-symbolic', groups: [s.nautilusGroup, s.entriesGroup]},
        ];
    }

    constructor(schema, moduleDir) {
        this.schema = schema;
        this.moduleDir = moduleDir;
        this._handlerIds = [];

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
        this.behaviour = new Adw.PreferencesGroup({title: 'Behaviour', description: 'Icon arrangement, file manager and terminal. File entries shared with Nautilus are in Nautilus Context.'});

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

        for (const w of [this.startCorner, this.keepArranged, this.arrangeOrder, this.keepStacked, this.sortSpecialFolders, this.useNemo, this.useNativeProgress, this.checkX11Wayland, this.terminalCommand])
            this.behaviour.add(w);

        for (const w of [this.transferPosition, this.transferMargin, this.transferCardWidth, this.transferHideDelay, this.transferShowDetail, this.transferShowRate, this.transferShowElapsed, this.transferAnimation])
            this.transfers.add(w);

        // ── Nautilus Context ──
        this.#buildNautilusContext();

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
        this.schema.bind('use-native-progress', this.useNativeProgress, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('check-x11wayland', this.checkX11Wayland, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('terminal-command', this.terminalCommand, 'text', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('transfer-show-detail', this.transferShowDetail, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('transfer-show-rate', this.transferShowRate, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('transfer-show-elapsed', this.transferShowElapsed, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('transfer-animation', this.transferAnimation, 'active', Gio.SettingsBindFlags.DEFAULT);

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

    #watch(key, fn) {
        this._handlerIds.push(this.schema.connect(`changed::${key}`, fn));
    }

    destroy() {
        for (const id of this._handlerIds)
            this.schema.disconnect(id);
        this._handlerIds = [];
    }

    // ── Nautilus Context tab ──
    // Every entry switch is ONE GSettings key read live by both the desktop
    // menu (app/fileItemMenu.js) and the Nautilus plugin (nautilus/*.py), so
    // on/off always matches in both places. "Install into Nautilus" only
    // copies/removes the plugin files (nautilusSync.js).
    #buildNautilusContext() {
        this.nautilusGroup = new Adw.PreferencesGroup({
            title: 'Nautilus',
            description: 'Install the bundled nautilus-python plugins so Nautilus shows the same entries as the desktop menu.',
        });

        // Missing nautilus-python: warn, explain how to install it.
        const libPath = NautilusSync.findNautilusPython();
        if (!libPath) {
            const cmd = Settings.#nautilusPythonInstallCommand();
            const warn = new Adw.ActionRow({
                title: 'nautilus-python is not installed',
                subtitle: `Nautilus cannot load these entries without it. Install it, then restart Nautilus:\n${cmd}`,
                subtitle_selectable: true,
                css_classes: ['error'],
            });
            warn.add_prefix(new Gtk.Image({icon_name: 'dialog-warning-symbolic'}));
            const copyBtn = new Gtk.Button({
                icon_name: 'edit-copy-symbolic',
                tooltip_text: 'Copy install command',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            copyBtn.connect('clicked', () => copyBtn.get_clipboard().set(cmd));
            warn.add_suffix(copyBtn);
            this.nautilusGroup.add(warn);
        }

        this.nautilusInstall = new Adw.SwitchRow({
            title: 'Install into Nautilus',
            subtitle: `Sync the plugins into ${NautilusSync.targetDir().get_path()}. Off removes them again.`,
        });
        this.nautilusInstall.add_prefix(new Gtk.Image({icon_name: 'org.gnome.Nautilus-symbolic'}));
        this.nautilusGroup.add(this.nautilusInstall);

        this.nautilusStatus = new Adw.ActionRow({title: 'Status', subtitle_selectable: true});
        this.nautilusStatus.add_prefix(new Gtk.Image({icon_name: 'view-refresh-symbolic'}));
        this.syncButton = new Gtk.Button({
            label: 'Sync',
            tooltip_text: 'Write the bundled snapshot again',
            valign: Gtk.Align.CENTER,
        });
        this.restartButton = new Gtk.Button({
            label: 'Restart Nautilus',
            tooltip_text: 'Nautilus loads plugins only at startup',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
            visible: false,
        });
        this.nautilusStatus.add_suffix(this.syncButton);
        this.nautilusStatus.add_suffix(this.restartButton);
        this.nautilusGroup.add(this.nautilusStatus);

        // ── Entries: shared by the desktop menu and Nautilus ──
        this.entriesGroup = new Adw.PreferencesGroup({
            title: 'Context Menu Entries',
            description: 'Each switch turns the entry on or off in the desktop menu and in Nautilus at the same time.',
        });
        const entry = (key, title, subtitle, icon) => {
            const row = new Adw.SwitchRow({title, subtitle});
            row.add_prefix(new Gtk.Image({icon_name: icon}));
            this.schema.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            this.entriesGroup.add(row);
            return row;
        };
        this.copyContentRow = entry('context-copy-content', 'Copy File Content',
            'Copy the content of one file to the clipboard (up to 50 MB).', 'text-x-generic-symbolic');
        this.copyPathRow = entry('context-copy-path', 'Copy File / Folder Path',
            'Copy the absolute path of one item.', 'edit-copy-symbolic');
        this.duplicateRow = entry('context-duplicate', 'Duplicate',
            'Copy the selection next to itself as "name (Duplicate).ext".', 'ding-duplicate-symbolic');

        this.openWithRow = new Adw.ExpanderRow({
            title: 'Open With Custom Command',
            subtitle: 'Open the selection with your editor or IDE.',
            show_enable_switch: true,
        });
        this.openWithRow.add_prefix(new Gtk.Image({icon_name: 'ding-open-with-symbolic'}));
        this.customMenuLabel = this.#entry('Menu Entry Label', 'Shown as "Open with <label>".');
        this.customMenuCommand = this.#entry('Menu Entry Command', 'Command plus arguments; the file path is appended.');
        this.openWithRow.add_row(this.customMenuLabel);
        this.openWithRow.add_row(this.customMenuCommand);
        this.schema.bind('open-with-enabled', this.openWithRow, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('open-with-label', this.customMenuLabel, 'text', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('open-with-command', this.customMenuCommand, 'text', Gio.SettingsBindFlags.DEFAULT);
        this.entriesGroup.add(this.openWithRow);

        this.gitEmblemsRow = entry('context-git-emblems', 'Git Status Emblems',
            'Nautilus only: mark files clean, modified, staged, untracked or in conflict.', 'ding-git-symbolic');

        // ── Wiring ──
        this.schema.bind(NautilusSync.INTEGRATION_KEY, this.nautilusInstall, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.#watch(NautilusSync.INTEGRATION_KEY, () => this.#applyNautilusSync());
        this.syncButton.connect('clicked', () => this.#applyNautilusSync());
        this.restartButton.connect('clicked', () => {
            if (NautilusSync.restartNautilus()) {
                this.restartButton.visible = false;
                this._syncNote = 'Nautilus closed; it loads the plugins next time it opens.';
            } else {
                this._syncNote = 'Could not run "nautilus -q".';
            }
            this.#refreshNautilusStatus();
        });

        this._syncNote = '';
        this.#refreshNautilusStatus();
    }

    #applyNautilusSync() {
        let note;
        try {
            const res = NautilusSync.reconcile(this.moduleDir, this.schema);
            const parts = [];
            if (res.written?.length)
                parts.push(`Installed ${res.written.length} plugin(s).`);
            if (res.removed?.length)
                parts.push(`Removed ${res.removed.length} plugin(s).`);
            if (res.backedUp?.length)
                parts.push(`Moved your previous plugin(s) to ${NautilusSync.backupDir().get_path()}.`);
            if (res.errors.length)
                parts.push(`Errors: ${res.errors.join('; ')}`);
            note = parts.join(' ');
            if (res.changed)
                this.restartButton.visible = NautilusSync.isNautilusInstalled();
        } catch (e) {
            note = `Sync failed: ${e.message}`;
        }
        this._syncNote = note;
        this.#refreshNautilusStatus();
    }

    #refreshNautilusStatus() {
        const on = this.schema.get_boolean(NautilusSync.INTEGRATION_KEY);
        let states;
        try {
            states = NautilusSync.inspect(this.moduleDir);
        } catch (e) {
            this.nautilusStatus.subtitle = `Cannot read the snapshot: ${e.message}`;
            return;
        }
        const count = st => states.filter(x => x.state === st).length;
        const total = states.length;
        const current = count(NautilusSync.State.CURRENT);
        const outdated = count(NautilusSync.State.OUTDATED);
        const foreign = states.filter(x => x.state === NautilusSync.State.FOREIGN).map(x => x.plugin.file);
        const legacy = NautilusSync.legacyFiles();

        let text;
        if (on) {
            if (current === total)
                text = `All ${total} plugins installed and up to date.`;
            else
                text = `${current} of ${total} plugins up to date${outdated ? `, ${outdated} outdated` : ''}. Press Sync.`;
        } else {
            text = current + outdated > 0
                ? `Not enabled, but ${current + outdated} plugin(s) are still installed. Press Sync to remove them.`
                : 'Not installed in Nautilus. The switches below still apply to the desktop menu.';
        }
        const others = [...foreign, ...legacy];
        if (others.length)
            text += `\nYour own plugin(s) ${others.join(', ')} will be moved to ${NautilusSync.backupDir().get_path()} on install.`;
        if (this._syncNote)
            text += `\n${this._syncNote}`;
        this.nautilusStatus.subtitle = GLib.markup_escape_text(text, -1);
        this.syncButton.sensitive = on ? current < total : current + outdated > 0;
    }

    static #nautilusPythonInstallCommand() {
        let ids = '';
        try {
            const [, bytes] = GLib.file_get_contents('/etc/os-release');
            const text = new TextDecoder().decode(bytes);
            ids = (text.match(/^(ID|ID_LIKE)=.*$/gm) ?? []).join(' ').toLowerCase();
        } catch {}
        if (/debian|ubuntu/.test(ids))
            return 'sudo apt install python3-nautilus';
        if (/arch/.test(ids))
            return 'sudo pacman -S python-nautilus';
        if (/suse/.test(ids))
            return 'sudo zypper install python3-nautilus';
        return 'sudo dnf install nautilus-python';
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
        this.#watch(key, () => {
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
        this.#watch(key, sync);
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
