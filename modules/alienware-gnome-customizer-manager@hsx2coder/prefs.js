import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {SplitPreferencesView} from '../../lib/ui/splitPrefsView.js';

import {addWorkspaceControlPages} from './subsystems/workspace-prefs.js';
import NotificationConfiguratorPreferences from './subsystems/notification-configurator/prefs.js';

export default class GnomeCustomizerManagerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        // Set up subpage push/pop shim so subpages (e.g. Pattern Details) open in a modal dialog
        let currentSubWindow = null;
        window.push_subpage = (navPage) => {
            const rootWin = (window && typeof window.get_root === 'function') ? window.get_root() : (window instanceof Gtk.Window ? window : null);
            currentSubWindow = new Adw.PreferencesWindow({
                transient_for: rootWin,
                modal: true,
                title: navPage.title || 'Details',
                default_width: 700,
                default_height: 650,
            });
            const child = navPage.get_child();
            navPage.set_child(null);
            if (child instanceof Adw.ToolbarView) {
                const page = child.get_content();
                child.set_content(null);
                if (page instanceof Adw.PreferencesPage) {
                    currentSubWindow.add(page);
                } else {
                    currentSubWindow.set_content(child);
                }
            } else {
                currentSubWindow.set_content(child);
            }
            currentSubWindow.connect('close-request', () => {
                try {
                    navPage.emit('hidden');
                } catch (_) {}
                return false;
            });
            currentSubWindow.present();
        };
        window.pop_subpage = () => {
            if (currentSubWindow) {
                currentSubWindow.close();
                currentSubWindow = null;
            }
        };

        const pages = [];
        const dummyWin = {
            add(page) {
                pages.push(page);
            },
            set_default_size() {},
            set_title() {},
            set_search_enabled() {},
            connect() {},
        };

        const s = new Settings(this.getSettings());
        window._settingsRef = s;
        for (const {title, iconName, groups} of Settings.getTabDefs(s)) {
            const page = new Adw.PreferencesPage({title, icon_name: iconName});
            groups.forEach(g => page.add(g));
            dummyWin.add(page);
        }

        addWorkspaceControlPages(dummyWin, this.getSettings());

        const sections = pages.map((page, idx) => ({
            id: `gcm_${idx}`,
            title: page.title || `Section ${idx + 1}`,
            iconName: page.icon_name || 'preferences-system-symbolic',
            page,
        }));

        // Add Notification section to left sidebar with 2 sub-tabs (Global and Patterns)
        sections.push({
            id: 'notifications',
            title: 'Notifications',
            iconName: 'preferences-system-notifications-symbolic',
            buildContent: () => {
                const notifMeta = {
                    uuid: this.uuid,
                    dir: this.dir,
                    path: this.path,
                    metadata: this.metadata,
                    'settings-schema': 'org.gnome.shell.extensions.notification-configurator',
                };
                const notifPrefs = new NotificationConfiguratorPreferences(notifMeta);
                if (!notifPrefs.gettext) {
                    notifPrefs.gettext = str => this.gettext ? this.gettext(str) : str;
                    notifPrefs.ngettext = (str, p, n) => this.ngettext ? this.ngettext(str, p, n) : (n === 1 ? str : p);
                }

                notifPrefs.settings = this.getSettings('org.gnome.shell.extensions.notification-configurator');
                notifPrefs.loadData();

                const globalPage = new Adw.PreferencesPage({
                    title: 'Global',
                    icon_name: 'preferences-system-symbolic',
                });
                notifPrefs.buildGlobalPage(globalPage);

                const patternsPage = new Adw.PreferencesPage({
                    title: 'Patterns',
                    icon_name: 'view-list-symbolic',
                });
                notifPrefs.buildPatternsPage(window, patternsPage);

                const stack = new Adw.ViewStack();
                stack.add_titled_with_icon(globalPage, 'notif_global', 'Global', 'preferences-system-symbolic');
                stack.add_titled_with_icon(patternsPage, 'notif_patterns', 'Patterns', 'view-list-symbolic');

                const switcher = new Adw.ViewSwitcher({
                    stack,
                    policy: Adw.ViewSwitcherPolicy.WIDE,
                });

                const box = new Gtk.Box({
                    orientation: Gtk.Orientation.VERTICAL,
                    spacing: 12,
                });
                box.append(switcher);
                box.append(stack);
                return box;
            },
        });

        const split = new SplitPreferencesView({
            title: 'Gnome Customizer Manager',
            sections,
        });
        split.attachToWindow(window);
        window.set_default_size(1000, 750);
    }
}


class Settings {
    static getTabDefs(s) {
        return [
            {title: 'Animation',   iconName: 'preferences-system-symbolic',              groups: [s.animation]},
            {title: 'Windows',     iconName: 'window-duplicate-symbolic',                groups: [s.windows]},
            {title: 'OSD',         iconName: 'video-display-symbolic',                    groups: [s.osd]},
            {title: 'Advanced',    iconName: 'applications-engineering-symbolic',        groups: [s.advanced]},
        ];
    }
    constructor(schema) {
        this.schema = schema;

        // ── Animation ──
        this.animationSpeed = new Adw.SpinRow({
            title: 'Animation Speed',
            subtitle: '0=disabled, 1=default, 2-8=faster. Higher values mean faster animations.',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 8, step_increment: 1}),
        });
        this.animation = new Adw.PreferencesGroup({title: 'Animation'});

        // ── Windows ──
        this.windowDemandsAttention = new Adw.SwitchRow({
            title: 'Focus Window on Demand Attention',
            subtitle: 'Auto-focus a window that demands attention (e.g. chat notifications).',
        });
        this.windowMaximizedOnCreate = new Adw.SwitchRow({
            title: 'Maximize on Create',
            subtitle: 'New windows open maximized by default.',
        });
        this.windowPreviewCaption = new Adw.SwitchRow({
            title: 'Window Preview Caption',
            subtitle: 'Show window title text in the Alt+Tab thumbnail.',
        });
        this.windowPreviewCloseBtn = new Adw.SwitchRow({
            title: 'Close Button in Preview',
            subtitle: 'Show a close button on window thumbnails in Alt+Tab.',
        });
        this.windowPickerIcon = new Adw.SwitchRow({
            title: 'Window Icon in Picker',
            subtitle: 'Show app icon alongside window thumbnails.',
        });
        this.windowMenu = new Adw.SwitchRow({
            title: 'Window Menu',
            subtitle: 'Enable the right-click window menu (Alt+Space).',
        });
        this.windowMenuScreenshot = new Adw.SwitchRow({
            title: 'Screenshot Button in Window Menu',
            subtitle: 'Add a screenshot entry to the window menu.',
        });
        this.windows = new Adw.PreferencesGroup({title: 'Windows', description: 'Window behaviour, previews, and window menu options.'});

        // ── OSD ──
        this.osdVisible = new Adw.SwitchRow({
            title: 'OSD Visibility',
            subtitle: 'Show on-screen display for volume, brightness, and media keys.',
        });
        this.osdPosition = new Adw.ComboRow({
            title: 'OSD Position',
            subtitle: 'Where the OSD popup appears on screen.',
            model: this.#strList(['Center', 'Top-Left', 'Top-Right', 'Bottom-Left', 'Bottom-Right', 'Top-Center', 'Bottom-Center', 'Left', 'Right', 'Floating']),
        });
        this.osd = new Adw.PreferencesGroup({title: 'On-Screen Display (OSD)', description: 'Control the OSD popup visibility and position.'});

        // ── Quick Settings ──
        this.theme = new Adw.SwitchRow({
            title: 'Custom Shell Theme',
            subtitle: 'Apply user theme styling to GNOME Shell.',
        });

        this.lookingGlassWidth = new Adw.ComboRow({
            title: 'Looking Glass Width',
            subtitle: 'Width of the Looking Glass debug console (0=default).',
            model: this.#strList(['Default', '1', '2', '3', '4', '5', '6', '7', '8', '9']),
        });
        this.lookingGlassHeight = new Adw.ComboRow({
            title: 'Looking Glass Height',
            subtitle: 'Height of the Looking Glass debug console (0=default).',
            model: this.#strList(['Default', '1', '2', '3', '4', '5', '6', '7', '8', '9']),
        });
        this.removePreselectedBox = new Adw.SwitchRow({
            title: 'Remove Screenshot Preselected Box',
            subtitle: 'Remove the pre-selected region box when taking a screenshot area.',
        });
        this.screenshotOnRelease = new Adw.SwitchRow({
            title: 'Screenshot on Mouse Release',
            subtitle: 'Take the screenshot when the mouse button is released, not when pressed.',
        });
        this.advanced = new Adw.PreferencesGroup({title: 'Advanced', description: 'Looking Glass, theme, search, and screenshot settings.'});

        // ── Assemble ──
        this.animation.add(this.animationSpeed);

        for (const w of [
            this.windowDemandsAttention, this.windowMaximizedOnCreate,
            this.windowPreviewCaption, this.windowPreviewCloseBtn,
            this.windowPickerIcon, this.windowMenu, this.windowMenuScreenshot,
        ]) this.windows.add(w);

        this.osd.add(this.osdVisible);
        this.osd.add(this.osdPosition);

        for (const w of [
            this.theme, this.lookingGlassWidth, this.lookingGlassHeight,
            this.removePreselectedBox, this.screenshotOnRelease,
        ]) this.advanced.add(w);

        // ── Bind ──
        this.schema.bind('animation', this.animationSpeed, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-demands-attention-focus', this.windowDemandsAttention, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-maximized-on-create', this.windowMaximizedOnCreate, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-picker-icon', this.windowPickerIcon, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-menu', this.windowMenu, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-menu-take-screenshot-button', this.windowMenuScreenshot, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('osd', this.osdVisible, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('osd-position', this.osdPosition, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('theme', this.theme, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('looking-glass-width', this.lookingGlassWidth, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('looking-glass-height', this.lookingGlassHeight, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('remove-preselected-box', this.removePreselectedBox, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('screenshot-on-release', this.screenshotOnRelease, 'active', Gio.SettingsBindFlags.DEFAULT);
    }

    #strList(arr) {
        const store = new Gtk.StringList();
        arr.forEach(a => store.append(a));
        return store;
    }
}
