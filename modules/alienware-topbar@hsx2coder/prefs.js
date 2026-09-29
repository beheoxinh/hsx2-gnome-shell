/**
 * Preferences for alienware-topbar.
 *
 * The panel keys are declared once in PAGES below and bound with the correct
 * Adw widget per GSettings type, so a key can never be bound to an incompatible
 * property again (that is how top-panel-position ended up warning on every
 * open).
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import ClipboardIndicatorPreferences from './subsystems/widgets/clipboard/prefs.js';
import CommandMenuExtensionPreferences from './subsystems/widgets/command-menu/prefs.js';

const FLAGS = Gio.SettingsBindFlags.DEFAULT;

/** [key, title, subtitle, kind] where kind is 'b' | 'i' | 'i-nonzero' | enum */
const PAGES = [
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

export default class TopbarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(760, 720);

        const settings = this.getSettings();

        for (const page of PAGES) {
            const adwPage = new Adw.PreferencesPage({title: page.title, icon_name: ICONS[page.title]});
            for (const group of page.groups) {
                const adwGroup = new Adw.PreferencesGroup({
                    title: group.title,
                    description: group.description ?? undefined,
                });
                for (const [key, title, subtitle, kind] of group.rows) {
                    const [row, prop] = makeRow(key, title, subtitle, kind);
                    adwGroup.add(row);
                    if (kind.startsWith('enum:')) {
                        bindEnum(settings, key, row, prop, kind.slice(5).split(','));
                    } else {
                        settings.bind(key, row, prop, FLAGS);
                    }
                }
                adwPage.add(adwGroup);
            }
            window.add(adwPage);
        }

        // the two widget subsystems keep their own pages and schemas
        const baseMeta = {
            ...this.metadata,
            uuid: this.uuid,
            dir: this.dir,
            path: this.path,
        };
        new ClipboardIndicatorPreferences({
            ...baseMeta,
            'settings-schema': 'org.gnome.shell.extensions.clipboard-indicator',
        }).fillPreferencesWindow(window);
        new CommandMenuExtensionPreferences({
            ...baseMeta,
            'settings-schema': 'org.gnome.shell.extensions.commandmenu2',
        }).fillPreferencesWindow(window);
    }
}

const ICONS = {
    'Panel': 'video-display-symbolic',
    'Panel items': 'preferences-system-symbolic',
    'Clock': 'preferences-system-time-symbolic',
    'Quick Settings': 'preferences-system-network-symbolic',
    'Multi-monitor': 'video-multi-monitor-symbolic',
};

/** enum <-> ComboRow index, kept in sync in both directions */
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
