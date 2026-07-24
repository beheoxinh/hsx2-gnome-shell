import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TopbarPanelControlsPreferences extends ExtensionPreferences {
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
            {title: 'Panel',      iconName: 'preferences-system-symbolic',    groups: [s.panelG]},
            {title: 'Activities', iconName: 'go-previous-symbolic',           groups: [s.activitiesG]},
            {title: 'Clock Menu', iconName: 'preferences-system-time-symbolic', groups: [s.clockG]},
            {title: 'Indicators', iconName: 'emblem-system-symbolic',          groups: [s.indicatorsG]},
            {title: 'Search',     iconName: 'edit-find-symbolic',              groups: [s.searchG]},
        ];
    }

    constructor(schema) {
        this.schema = schema;

        // ── Panel ──
        this.panel = new Adw.SwitchRow({
            title: 'Show Panel',
            subtitle: 'Show the top panel.',
        });
        this.panelInOverview = new Adw.SwitchRow({
            title: 'Panel in Overview',
            subtitle: 'Keep the panel visible in the overview.',
        });
        this.panelSize = new Adw.SpinRow({
            title: 'Panel Size',
            subtitle: 'Panel thickness in pixels (0=default).',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 64, step_increment: 1}),
        });
        this.topPanelPosition = new Adw.SwitchRow({
            title: 'Top Panel Position',
            subtitle: 'Move the panel to a different position (0=top, 1=bottom).',
        });
        this.panelCornerSize = new Adw.SpinRow({
            title: 'Panel Corner Size',
            subtitle: 'Rounded corners on the panel (0=default).',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 61, step_increment: 1}),
        });
        this.panelButtonPadding = new Adw.SpinRow({
            title: 'Panel Button Padding',
            subtitle: 'Padding around panel buttons (0=default).',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 61, step_increment: 1}),
        });
        this.panelIndicatorPadding = new Adw.SpinRow({
            title: 'Panel Indicator Padding',
            subtitle: 'Padding around panel indicators (0=default).',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 61, step_increment: 1}),
        });
        this.panelIconSize = new Adw.SpinRow({
            title: 'Panel Icon Size',
            subtitle: 'Override panel icon size (0=default).',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 60, step_increment: 1}),
        });
        this.panelG = new Adw.PreferencesGroup({title: 'Panel', description: 'Visibility, size, spacing, and corner radius settings.'});

        // ── Activities ──
        this.activitiesButton = new Adw.SwitchRow({
            title: 'Activities Button',
            subtitle: 'Show the Activities button in the panel.',
        });
        this.backgroundMenu = new Adw.SwitchRow({
            title: 'Background Menu',
            subtitle: 'Show the desktop background right-click menu.',
        });
        this.showAppsButton = new Adw.SwitchRow({
            title: 'Show Apps Button',
            subtitle: 'Show the app grid button in the dock/panel.',
        });
        this.activitiesG = new Adw.PreferencesGroup({title: 'Activities', description: 'Activities button, background menu, and apps button visibility.'});

        // ── Clock Menu ──
        this.clockMenu = new Adw.SwitchRow({
            title: 'Clock Menu',
            subtitle: 'Show the clock menu in the panel.',
        });
        this.clockMenuPosition = new Adw.SpinRow({
            title: 'Clock Menu Position',
            subtitle: 'Position of the clock in the panel (0=left, 1=center, 2=right).',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 2, step_increment: 1}),
        });
        this.clockMenuOffset = new Adw.SpinRow({
            title: 'Clock Menu Offset',
            subtitle: 'Offset of the clock menu from its default position (pixels).',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 20, step_increment: 1}),
        });
        this.worldClock = new Adw.SwitchRow({
            title: 'World Clock',
            subtitle: 'Show world clock in the clock menu.',
        });
        this.weather = new Adw.SwitchRow({
            title: 'Weather',
            subtitle: 'Show weather information in the clock menu.',
        });
        this.eventsButton = new Adw.SwitchRow({
            title: 'Events Button',
            subtitle: 'Show upcoming events in the clock menu.',
        });
        this.calendar = new Adw.SwitchRow({
            title: 'Calendar',
            subtitle: 'Show the calendar in the clock menu.',
        });
        this.clockG = new Adw.PreferencesGroup({title: 'Clock Menu', description: 'Clock, calendar, world clock, weather, and events in the clock menu.'});

        // ── Indicators ──
        this.notificationIcon = new Adw.SwitchRow({
            title: 'Notification Icon',
            subtitle: 'Show the notification bell icon in the panel.',
        });
        this.keyboardLayout = new Adw.SwitchRow({
            title: 'Keyboard Layout',
            subtitle: 'Show the keyboard layout indicator in the panel.',
        });
        this.accessibilityMenu = new Adw.SwitchRow({
            title: 'Accessibility Menu',
            subtitle: 'Show the accessibility menu in the panel.',
        });
        this.powerIcon = new Adw.SwitchRow({
            title: 'Power Icon',
            subtitle: 'Show the power/battery icon in the panel.',
        });
        this.screenSharing = new Adw.SwitchRow({
            title: 'Screen Sharing Indicator',
            subtitle: 'Show the screen sharing indicator.',
        });
        this.screenRecording = new Adw.SwitchRow({
            title: 'Screen Recording Indicator',
            subtitle: 'Show the screen recording indicator.',
        });
        this.indicatorsG = new Adw.PreferencesGroup({title: 'Indicators', description: 'Notification, keyboard, accessibility, power, and screen-sharing indicators.'});

        // ── Search ──
        this.search = new Adw.SwitchRow({
            title: 'Search Box',
            subtitle: 'Show the search box in the overview.',
        });
        this.typeToSearch = new Adw.SwitchRow({
            title: 'Type to Search',
            subtitle: 'Start searching by typing in the overview.',
        });
        this.searchG = new Adw.PreferencesGroup({title: 'Search', description: 'Search visibility and type-to-search behaviour.'});

        // ── Assemble ──
        for (const w of [
            this.panel, this.panelInOverview, this.panelSize,
            this.topPanelPosition, this.panelCornerSize,
            this.panelButtonPadding, this.panelIndicatorPadding, this.panelIconSize,
        ]) this.panelG.add(w);

        for (const w of [
            this.activitiesButton, this.backgroundMenu, this.showAppsButton,
        ]) this.activitiesG.add(w);

        for (const w of [
            this.clockMenu, this.clockMenuPosition, this.clockMenuOffset,
            this.worldClock, this.weather, this.eventsButton, this.calendar,
        ]) this.clockG.add(w);

        for (const w of [
            this.notificationIcon, this.keyboardLayout, this.accessibilityMenu,
            this.powerIcon, this.screenSharing, this.screenRecording,
        ]) this.indicatorsG.add(w);

        for (const w of [this.search, this.typeToSearch]) this.searchG.add(w);

        // ── Bind ──
        this.schema.bind('panel', this.panel, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('panel-in-overview', this.panelInOverview, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('panel-size', this.panelSize, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('top-panel-position', this.topPanelPosition, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('panel-corner-size', this.panelCornerSize, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('panel-button-padding-size', this.panelButtonPadding, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('panel-indicator-padding-size', this.panelIndicatorPadding, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('panel-icon-size', this.panelIconSize, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('activities-button', this.activitiesButton, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('background-menu', this.backgroundMenu, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('show-apps-button', this.showAppsButton, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('clock-menu', this.clockMenu, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('clock-menu-position', this.clockMenuPosition, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('clock-menu-position-offset', this.clockMenuOffset, 'value', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('world-clock', this.worldClock, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('weather', this.weather, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('events-button', this.eventsButton, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('calendar', this.calendar, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('panel-notification-icon', this.notificationIcon, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('keyboard-layout', this.keyboardLayout, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('accessibility-menu', this.accessibilityMenu, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('power-icon', this.powerIcon, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('screen-sharing-indicator', this.screenSharing, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('screen-recording-indicator', this.screenRecording, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('search', this.search, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('type-to-search', this.typeToSearch, 'active', Gio.SettingsBindFlags.DEFAULT);
    }
}
