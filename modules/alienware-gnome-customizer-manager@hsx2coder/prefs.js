import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class GnomeCustomizerManagerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const s = new Settings(this.getSettings());
        window._settingsRef = s;
        for (const {title, iconName, groups} of Settings.getTabDefs(s)) {
            const page = new Adw.PreferencesPage({title, icon_name: iconName});
            groups.forEach(g => page.add(g));
            window.add(page);
        }
    }
}

class Settings {
    static getTabDefs(s) {
        return [
            {title: 'Animation',   iconName: 'preferences-system-symbolic',              groups: [s.animation]},
            {title: 'Windows',     iconName: 'window-duplicate-symbolic',                groups: [s.windows]},
            {title: 'OSD',         iconName: 'video-display-symbolic',                    groups: [s.osd]},
            {title: 'Quick Settings', iconName: 'emblem-system-symbolic',                groups: [s.quickSettings]},
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
        this.quickSettingsMenu = new Adw.SwitchRow({
            title: 'Quick Settings Menu',
            subtitle: 'Show the quick settings menu in the panel.',
        });
        this.quickSettingsDarkMode = new Adw.SwitchRow({
            title: 'Dark Mode Toggle',
            subtitle: 'Show the dark mode toggle in quick settings.',
        });
        this.quickSettingsNightLight = new Adw.SwitchRow({
            title: 'Night Light Toggle',
            subtitle: 'Show the night light toggle in quick settings.',
        });
        this.quickSettingsDnd = new Adw.SwitchRow({
            title: 'Do Not Disturb Toggle',
            subtitle: 'Show the do not disturb toggle in quick settings.',
        });
        this.quickSettingsBacklight = new Adw.SwitchRow({
            title: 'Backlight Toggle',
            subtitle: 'Show the keyboard backlight toggle in quick settings.',
        });
        this.quickSettingsAirplane = new Adw.SwitchRow({
            title: 'Airplane Mode Toggle',
            subtitle: 'Show the airplane mode toggle in quick settings.',
        });
        this.quickSettings = new Adw.PreferencesGroup({title: 'Quick Settings', description: 'Show or hide individual toggles in the quick settings panel.'});

        // ── Advanced ──
        this.theme = new Adw.SwitchRow({
            title: 'Theme',
            subtitle: 'Apply custom theme adjustments. Disable to use the system theme as-is.',
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
        this.accentColorIcon = new Adw.SwitchRow({
            title: 'Accent Color for Icons',
            subtitle: 'Apply the accent colour to panel and UI icons.',
        });
        this.maxSearchResults = new Adw.SpinRow({
            title: 'Max Search Results',
            subtitle: 'Maximum number of items shown in the overview search results (0=unlimited).',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 40, step_increment: 1}),
        });
        this.removePreselectedBox = new Adw.SwitchRow({
            title: 'Remove Screenshot Preselected Box',
            subtitle: 'Remove the pre-selected region box when taking a screenshot area.',
        });
        this.screenshotOnRelease = new Adw.SwitchRow({
            title: 'Screenshot on Mouse Release',
            subtitle: 'Take the screenshot when the mouse button is released, not when pressed.',
        });
        this.invertCalendar = new Adw.SwitchRow({
            title: 'Invert Calendar Columns',
            subtitle: 'Swap the event list and calendar grid columns in the clock menu.',
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
            this.quickSettingsMenu, this.quickSettingsDarkMode,
            this.quickSettingsNightLight, this.quickSettingsDnd,
            this.quickSettingsBacklight, this.quickSettingsAirplane,
        ]) this.quickSettings.add(w);

        for (const w of [
            this.theme, this.lookingGlassWidth, this.lookingGlassHeight,
            this.accentColorIcon, this.maxSearchResults,
            this.removePreselectedBox, this.screenshotOnRelease, this.invertCalendar,
        ]) this.advanced.add(w);

        // ── Bind ──
        this.schema.bind('animation', this.animationSpeed, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-demands-attention-focus', this.windowDemandsAttention, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-maximized-on-create', this.windowMaximizedOnCreate, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-preview-caption', this.windowPreviewCaption, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-preview-close-button', this.windowPreviewCloseBtn, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-picker-icon', this.windowPickerIcon, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-menu', this.windowMenu, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('window-menu-take-screenshot-button', this.windowMenuScreenshot, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('osd', this.osdVisible, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('osd-position', this.osdPosition, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('quick-settings', this.quickSettingsMenu, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('quick-settings-dark-mode', this.quickSettingsDarkMode, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('quick-settings-night-light', this.quickSettingsNightLight, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('quick-settings-do-not-disturb', this.quickSettingsDnd, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('quick-settings-backlight', this.quickSettingsBacklight, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('quick-settings-airplane-mode', this.quickSettingsAirplane, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('theme', this.theme, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('looking-glass-width', this.lookingGlassWidth, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('looking-glass-height', this.lookingGlassHeight, 'selected', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('accent-color-icon', this.accentColorIcon, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('max-displayed-search-results', this.maxSearchResults, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('remove-preselected-box', this.removePreselectedBox, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('screenshot-on-release', this.screenshotOnRelease, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('invert-calendar-column-items', this.invertCalendar, 'active', Gio.SettingsBindFlags.DEFAULT);
    }

    #strList(arr) {
        const store = new Gtk.StringList();
        arr.forEach(a => store.append(a));
        return store;
    }
}
