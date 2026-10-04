/**
 * Preferences for alienware-topbar.
 *
 * Uses SplitPreferencesView (Master-Detail layout) to manage:
 *   1. Panel & Geometry
 *   2. Panel Items & Status Area
 *   3. Clock & Calendar
 *   4. Quick Settings
 *   5. Multi-monitor Clone
 *   6. System Monitor (CPU, GPU, RAM, Disk, Net, Sensor graphs & settings)
 *   7. AppIndicator / Tray Icons
 *   8. Caps/Num Lock & Touchpad
 *   9. Clipboard History Widget
 *   10. Command Menu Widget
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {SplitPreferencesView} from '../../lib/ui/splitPrefsView.js';

import ClipboardIndicatorPreferences from './subsystems/widgets/clipboard/prefs.js';
import CommandMenuExtensionPreferences from './subsystems/widgets/command-menu/prefs.js';
import SystemMonitorExtensionPreferences from './subsystems/system-monitor/prefs.js';
import AppIndicatorPreferences from './subsystems/appindicator/prefs.js';
import CapsNumTouchpadPreferences from './subsystems/capsnum-touchpad/prefs.js';

const FLAGS = Gio.SettingsBindFlags.DEFAULT;

const TOPBAR_SECTIONS = [
    {
        title: 'Panel',
        groups: [
            {
                title: 'Layout',
                rows: [
                    ['panel-visible', 'Show the top bar', 'Master switch for the bar on every monitor', 'b'],
                    ['panel-in-overview', 'Show in Activities', 'Keep the bar visible while the overview is open', 'b'],
                    ['panel-position', 'Position', 'Which screen edge the bar is attached to', 'enum:top,bottom'],
                    ['panel-height', 'Height', '0 restores the GNOME Shell default', 'i-nonzero'],
                    ['panel-corner-size', 'Corner radius', '0 restores the default', 'i-nonzero'],
                ],
            },
            {
                title: 'Spacing and icons',
                rows: [
                    ['panel-button-padding', 'Button padding', '0 restores the default', 'i-nonzero'],
                    ['panel-indicator-padding', 'Indicator padding', '0 restores the default', 'i-nonzero'],
                    ['panel-icon-size', 'Icon size', '0 restores the default', 'i-nonzero'],
                    ['accent-color-icon', 'Accent colour icons', 'Use the accent colour instead of white', 'b'],
                ],
            },
        ],
    },
    {
        title: 'Panel items',
        groups: [
            {
                title: 'Buttons',
                rows: [
                    ['activities-button', 'Activities button', null, 'b'],
                    ['show-apps-button', 'Applications button', null, 'b'],
                    ['background-menu', 'Background menu button', null, 'b'],
                    ['search-entry', 'Search entry', null, 'b'],
                    ['start-search', 'Type to search', 'Show the search entry when the user starts typing', 'b'],
                    ['max-search-results', 'Max search results', '0 restores the default', 'i-nonzero'],
                ],
            },
            {
                title: 'Status area',
                rows: [
                    ['notification-icon', 'Notification icon', null, 'b'],
                    ['keyboard-layout-indicator', 'Keyboard layout', null, 'b'],
                    ['accessibility-menu', 'Accessibility menu', null, 'b'],
                    ['power-icon', 'Power status icon', null, 'b'],
                    ['screen-sharing-indicator', 'Screen sharing indicator', null, 'b'],
                    ['screen-recording-indicator', 'Screen recording indicator', null, 'b'],
                ],
            },
        ],
    },
    {
        title: 'Clock',
        groups: [
            {
                title: 'Date and time',
                rows: [
                    ['clock-visible', 'Show the clock', null, 'b'],
                    ['clock-position', 'Position', 'The only place the date menu is reparented', 'enum:left,center,right'],
                    ['clock-position-offset', 'Offset', 'Extra pixels in front of the clock', 'i'],
                    ['world-clock', 'World clocks', 'Inside the calendar popup', 'b'],
                    ['weather', 'Weather', 'Inside the calendar popup', 'b'],
                    ['events-button', 'Events button', 'Inside the calendar popup', 'b'],
                    ['calendar', 'Calendar', 'Inside the calendar popup', 'b'],
                    ['invert-calendar-column-items', 'Invert calendar items', null, 'b'],
                ],
            },
        ],
    },
    {
        title: 'Quick Settings',
        groups: [
            {
                title: 'Menu',
                rows: [
                    ['quick-settings', 'Show the quick settings menu', null, 'b'],
                ],
            },
            {
                title: 'Toggles inside the menu',
                rows: [
                    ['quick-settings-dark-mode', 'Dark mode', null, 'b'],
                    ['quick-settings-night-light', 'Night light', null, 'b'],
                    ['quick-settings-do-not-disturb', 'Do not disturb', null, 'b'],
                    ['quick-settings-backlight', 'Backlight slider', null, 'b'],
                    ['quick-settings-airplane-mode', 'Airplane mode', null, 'b'],
                ],
            },
        ],
    },
    {
        title: 'Multi-monitor',
        groups: [
            {
                title: 'Cloned top bar',
                description: 'Render a copy of the bar on every monitor except the primary one.',
                rows: [
                    ['clone-topbar', 'Clone the top bar', 'Turn this off to remove every cloned bar', 'b'],
                    ['clone-show-clock', 'Clock on cloned bars', null, 'b'],
                    ['clone-show-tray', 'Status area on cloned bars', null, 'b'],
                ],
            },
        ],
    },
];

function makeRow(key, title, subtitle, kind) {
    if (kind === 'b') {
        const row = new Adw.SwitchRow({title, subtitle: subtitle ?? ''});
        return [row, 'active'];
    }
    if (kind === 'i' || kind === 'i-nonzero') {
        const row = new Adw.SpinRow({
            title,
            subtitle: subtitle ?? '',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: kind === 'i' ? 64 : 96,
                step_increment: 1,
            }),
        });
        return [row, 'value'];
    }
    if (kind.startsWith('enum:')) {
        const nicks = kind.slice(5).split(',');
        const row = new Adw.ComboRow({
            title,
            subtitle: subtitle ?? '',
            model: Gtk.StringList.new(nicks.map(n => n[0].toUpperCase() + n.slice(1))),
        });
        return [row, 'selected'];
    }
    throw new Error(`unknown row kind ${kind} for ${key}`);
}

function bindEnum(settings, key, row, prop, nicks) {
    const apply = () => {
        const i = nicks.indexOf(settings.get_string(key));
        row[prop] = i < 0 ? 0 : i;
    };
    const store = () => {
        const nick = nicks[row[prop]] ?? nicks[0];
        if (settings.get_string(key) !== nick)
            settings.set_string(key, nick);
    };
    apply();
    const ids = [
        settings.connect(`changed::${key}`, apply),
        row.connect(`notify::${prop}`, store),
    ];
    row.connect('destroy', () => {
        for (const id of ids) {
            try {
                settings.disconnect(id);
            } catch (_) {
                /* already gone */
            }
        }
    });
}

function buildAdwRows(settings, pageDef, context = {}) {
    const page = new Adw.PreferencesPage({
        title: pageDef.title,
    });

    const isClockPage = pageDef.title === 'Clock';
    const isPanelPage = pageDef.title === 'Panel';
    const smSettings = context.smSettings;
    const dtpSettings = context.dtpSettings;

    for (const groupDef of pageDef.groups) {
        const groupParams = {title: groupDef.title};
        if (groupDef.description)
            groupParams.description = groupDef.description;
        const group = new Adw.PreferencesGroup(groupParams);

        for (const [key, title, subtitle, kind] of groupDef.rows) {
            const [row, prop] = makeRow(key, title, subtitle, kind);

            // Cross-module interaction: System Monitor replaces Clock in the center box
            if (isClockPage && key === 'clock-visible') {
                const updateConflictWarning = () => {
                    const smEnabled = settings.get_boolean('enable-system-monitor');
                    if (smEnabled) {
                        row.set_sensitive(false);
                        row.set_subtitle(
                            '<span foreground="#e01b24" weight="bold">' +
                            'Replaced by System Monitor: Clock is disabled while System Monitor is active' +
                            '</span>'
                        );
                        if (row.active)
                            settings.set_boolean('clock-visible', false);
                    } else {
                        row.set_sensitive(true);
                        row.set_subtitle(subtitle ?? '');
                        if (!row.active)
                            settings.set_boolean('clock-visible', true);
                    }
                };

                settings.connect('changed::enable-system-monitor', updateConflictWarning);
                updateConflictWarning();
            }

            // Cross-module interaction: Dash to Panel takes over topbar panel position and visibility
            if (isPanelPage && (key === 'panel-visible' || key === 'panel-position') && dtpSettings) {
                const updateDtpConflict = () => {
                    const dtpPos = dtpSettings.get_string('panel-position');
                    row.set_subtitle(
                        (subtitle ?? '') +
                        '\n<span foreground="#3584e4" size="smaller">' +
                        `Managed by Dash to Panel (currently dock position: ${dtpPos})` +
                        '</span>'
                    );
                };
                dtpSettings.connect('changed::panel-position', updateDtpConflict);
                updateDtpConflict();
            }

            group.add(row);
            if (kind.startsWith('enum:')) {
                bindEnum(settings, key, row, prop, kind.slice(5).split(','));
            } else {
                settings.bind(key, row, prop, FLAGS);
            }
        }
        page.add(group);
    }
    return page;
}

export default class TopbarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const baseMeta = {
            ...this.metadata,
            uuid: this.uuid,
            dir: this.dir,
            path: this.path,
            url: `file://${this.path}/`,
        };

        let smSettings = null;
        let dtpSettings = null;
        try {
            const GioSSS = Gio.SettingsSchemaSource;
            const schemaDir = this.dir.get_child('schemas');
            const schemaSource = GioSSS.new_from_directory(schemaDir.get_path(), GioSSS.get_default(), false);
            const schemaObj = schemaSource.lookup('org.gnome.shell.extensions.system-monitor-next-applet', true);
            if (schemaObj)
                smSettings = new Gio.Settings({settings_schema: schemaObj});

            const dtpDir = this.dir.get_parent().get_child('alienware-dash-to-panel@hsx2coder').get_child('schemas');
            const dtpSource = GioSSS.new_from_directory(dtpDir.get_path(), GioSSS.get_default(), false);
            const dtpSchemaObj = dtpSource.lookup('org.gnome.shell.extensions.dash-to-panel', true);
            if (dtpSchemaObj)
                dtpSettings = new Gio.Settings({settings_schema: dtpSchemaObj});
        } catch (_) {}

        const sections = [
            {
                id: 'panel-layout',
                title: 'Panel & Geometry',
                iconName: 'video-display-symbolic',
                buildContent: () => buildAdwRows(settings, TOPBAR_SECTIONS[0], {dtpSettings}),
            },
            {
                id: 'panel-items',
                title: 'Panel Items',
                iconName: 'window-duplicate-symbolic',
                buildContent: () => buildAdwRows(settings, TOPBAR_SECTIONS[1]),
            },
            {
                id: 'panel-clock',
                title: 'Clock & Calendar',
                iconName: 'preferences-system-time-symbolic',
                buildContent: () => buildAdwRows(settings, TOPBAR_SECTIONS[2], {smSettings}),
            },
            {
                id: 'quick-settings',
                title: 'Quick Settings',
                iconName: 'preferences-system-network-symbolic',
                buildContent: () => buildAdwRows(settings, TOPBAR_SECTIONS[3]),
            },
            {
                id: 'multi-monitor',
                title: 'Multi-Monitor Clone',
                iconName: 'display-projector-symbolic',
                buildContent: () => buildAdwRows(settings, TOPBAR_SECTIONS[4]),
            },
            {
                id: 'system-monitor',
                title: 'System Monitor',
                iconName: 'utilities-system-monitor-symbolic',
                buildContent: () => {
                    const smMeta = {
                        ...baseMeta,
                        'settings-schema': 'org.gnome.shell.extensions.system-monitor-next-applet',
                    };
                    const smPrefs = new SystemMonitorExtensionPreferences(smMeta);
                    const pages = [];
                    const dummyWin = {
                        add(p) { pages.push(p); },
                        set_title() {},
                        set_default_size() {},
                        set_visible_page() {},
                        search_enabled: false,
                        connect() {},
                        destroy() {},
                    };
                    smPrefs.fillPreferencesWindow(dummyWin);

                    if (pages.length === 0)
                        return new Adw.PreferencesPage({title: 'System Monitor'});

                    // Add a Master Switch at the top of System Monitor
                    const masterGroup = new Adw.PreferencesGroup({
                        title: 'System Monitor Integration',
                        description: 'Display CPU, GPU, Memory, Disk and Network monitors on the GNOME panel.',
                    });
                    const enableSwitch = new Adw.SwitchRow({
                        title: 'Enable System Monitor Applet',
                        subtitle: 'Show graphs and metrics in topbar center box (replaces standard clock).',
                    });
                    settings.bind('enable-system-monitor', enableSwitch, 'active', FLAGS);
                    masterGroup.add(enableSwitch);
                    pages[0].add(masterGroup);

                    if (pages.length === 1)
                        return pages[0];

                    const stack = new Adw.ViewStack();
                    pages.forEach((p, idx) => {
                        const title = p.title || `Tab ${idx + 1}`;
                        const icon = p.icon_name || 'utilities-system-monitor-symbolic';
                        stack.add_titled_with_icon(p, `page-${idx}`, title, icon);
                    });
                    const switcher = new Adw.ViewSwitcher({
                        stack,
                        policy: Adw.ViewSwitcherPolicy.WIDE,
                    });
                    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 12});
                    box.append(switcher);
                    box.append(stack);
                    return box;
                },
            },
            {
                id: 'appindicator',
                title: 'Tray Icons',
                iconName: 'application-x-addon-symbolic',
                buildContent: () => {
                    const appMeta = {
                        ...baseMeta,
                        'settings-schema': 'org.gnome.shell.extensions.indicators-appindicator',
                    };
                    const appPrefs = new AppIndicatorPreferences(appMeta);
                    const pages = [];
                    const dummyWin = {
                        add(p) { pages.push(p); },
                        set_title() {},
                        set_default_size() {},
                        set_visible_page() {},
                        search_enabled: false,
                        connect() {},
                        destroy() {},
                    };
                    appPrefs.fillPreferencesWindow(dummyWin);

                    if (pages.length === 0)
                        return new Adw.PreferencesPage({title: 'Tray Icons'});

                    // Add a Master Switch at the top of Tray Icons
                    const masterGroup = new Adw.PreferencesGroup({
                        title: 'Tray Icons Integration',
                        description: 'Display AppIndicator and StatusNotifierItem icons in the top bar.',
                    });
                    const enableSwitch = new Adw.SwitchRow({
                        title: 'Enable Tray Icons Applet',
                        subtitle: 'Capture and display system tray icons from background apps.',
                    });
                    settings.bind('enable-indicators', enableSwitch, 'active', FLAGS);
                    masterGroup.add(enableSwitch);
                    pages[0].add(masterGroup);

                    if (pages.length === 1)
                        return pages[0];
                    if (pages.length > 1) {
                        const stack = new Adw.ViewStack();
                        pages.forEach((p, idx) => {
                            const title = p.title || `Tab ${idx + 1}`;
                            const icon = p.icon_name || 'application-x-addon-symbolic';
                            stack.add_titled_with_icon(p, `page-${idx}`, title, icon);
                        });
                        const switcher = new Adw.ViewSwitcher({
                            stack,
                            policy: Adw.ViewSwitcherPolicy.WIDE,
                        });
                        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 12});
                        box.append(switcher);
                        box.append(stack);
                        return box;
                    }
                    return new Adw.PreferencesPage({title: 'Tray Icons'});
                },
            },
            {
                id: 'capsnum-touchpad',
                title: 'Caps/Num & Touchpad',
                iconName: 'input-keyboard-symbolic',
                buildContent: () => {
                    const capsMeta = {
                        ...baseMeta,
                        'settings-schema': 'org.gnome.shell.extensions.capsnum-touchpad',
                    };
                    const capsPrefs = new CapsNumTouchpadPreferences(capsMeta);
                    const pages = [];
                    const dummyWin = {
                        add(p) { pages.push(p); },
                        set_title() {},
                        set_default_size() {},
                        set_visible_page() {},
                        search_enabled: false,
                        connect() {},
                        destroy() {},
                    };
                    capsPrefs.fillPreferencesWindow(dummyWin);
                    return pages[0] || new Adw.PreferencesPage({title: 'Caps/Num & Touchpad'});
                },
            },
            {
                id: 'clipboard',
                title: 'Clipboard Indicator',
                iconName: 'edit-paste-symbolic',
                buildContent: () => {
                    const clipMeta = {
                        ...baseMeta,
                        'settings-schema': 'org.gnome.shell.extensions.clipboard-indicator',
                    };
                    const clipPrefs = new ClipboardIndicatorPreferences(clipMeta);
                    const pages = [];
                    const dummyWin = {
                        add(p) { pages.push(p); },
                        set_title() {},
                        set_default_size() {},
                        set_visible_page() {},
                        search_enabled: false,
                        connect() {},
                        destroy() {},
                    };
                    clipPrefs.fillPreferencesWindow(dummyWin);
                    return pages[0] || new Adw.PreferencesPage({title: 'Clipboard Indicator'});
                },
            },
            {
                id: 'command-menu',
                title: 'Command Menu',
                iconName: 'utilities-terminal-symbolic',
                buildContent: () => {
                    const cmdMeta = {
                        ...baseMeta,
                        'settings-schema': 'org.gnome.shell.extensions.commandmenu2',
                    };
                    const cmdPrefs = new CommandMenuExtensionPreferences(cmdMeta);
                    const pages = [];
                    const dummyWin = {
                        add(p) { pages.push(p); },
                        set_title() {},
                        set_default_size() {},
                        set_visible_page() {},
                        search_enabled: false,
                        connect() {},
                        destroy() {},
                    };
                    cmdPrefs.fillPreferencesWindow(dummyWin);
                    return pages[0] || new Adw.PreferencesPage({title: 'Command Menu'});
                },
            },
        ];

        const splitView = new SplitPreferencesView({
            title: 'Topbar & Indicators',
            sections,
        });

        splitView.attachToWindow(window);
        window.set_default_size(1000, 750);
    }
}
