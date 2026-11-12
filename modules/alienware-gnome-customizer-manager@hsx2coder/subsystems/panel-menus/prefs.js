/**
 * Preferences pages for the GNOME panel menus customized by this module:
 * Clock & Calendar (date menu) and Quick Settings. Moved from the
 * alienware-topbar preferences together with their keys.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

const FLAGS = Gio.SettingsBindFlags.DEFAULT;

const TOPBAR_SCHEMA = 'org.gnome.shell.extensions.alienware-topbar';

const CLOCK_PAGE = {
    title: 'Clock & Calendar',
    groups: [
        {
            title: 'Clock in the top bar',
            rows: [
                ['clock-visible', 'Show the clock', null, 'b'],
                ['clock-position', 'Position', 'Top bar section that holds the date menu', 'enum:left,center,right'],
                ['clock-position-offset', 'Offset', 'Index of the clock inside that section (0 = first)', 'i'],
            ],
        },
        {
            title: 'Calendar popup',
            rows: [
                ['world-clock', 'World clocks', null, 'b'],
                ['weather', 'Weather', null, 'b'],
                ['events-button', 'Events button', null, 'b'],
                ['calendar', 'Calendar', null, 'b'],
                ['invert-calendar-column-items', 'Invert calendar items', 'Show weather, clocks and events above the calendar', 'b'],
            ],
        },
    ],
};

const QUICK_SETTINGS_PAGE = {
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
                ['quick-settings-do-not-disturb', 'Do not disturb', 'GNOME 49 and later', 'b'],
                ['quick-settings-backlight', 'Backlight slider', 'Laptops with a panel backlight only', 'b'],
                ['quick-settings-airplane-mode', 'Airplane mode', null, 'b'],
            ],
        },
    ],
};

function makeRow(key, title, subtitle, kind) {
    if (kind === 'b')
        return [new Adw.SwitchRow({title, subtitle: subtitle ?? ''}), 'active'];
    if (kind === 'i') {
        const row = new Adw.SpinRow({
            title,
            subtitle: subtitle ?? '',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 64, step_increment: 1}),
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
    const id = settings.connect(`changed::${key}`, apply);
    row.connect(`notify::${prop}`, store);
    row.connect('destroy', () => {
        try {
            settings.disconnect(id);
        } catch (_) {}
    });
}

function buildPage(settings, pageDef, onRow = () => {}) {
    const page = new Adw.PreferencesPage({title: pageDef.title});
    for (const groupDef of pageDef.groups) {
        const group = new Adw.PreferencesGroup({title: groupDef.title});
        for (const [key, title, subtitle, kind] of groupDef.rows) {
            const [row, prop] = makeRow(key, title, subtitle, kind);
            group.add(row);
            if (kind.startsWith('enum:'))
                bindEnum(settings, key, row, prop, kind.slice(5).split(','));
            else
                settings.bind(key, row, prop, FLAGS);
            onRow(key, row, subtitle);
        }
        page.add(group);
    }
    return page;
}

/**
 * Read-only view of the topbar module's settings, for the System Monitor note.
 * Loaded from the sibling module's schema dir; null when it is not shipped.
 *
 * @param {Gio.File} moduleDir this module's directory
 */
function topbarSettings(moduleDir) {
    try {
        const dir = moduleDir.get_parent()
            .get_child('alienware-topbar@hsx2coder')
            .get_child('schemas');
        const source = Gio.SettingsSchemaSource.new_from_directory(
            dir.get_path(), Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup(TOPBAR_SCHEMA, false);
        return schema ? new Gio.Settings({settings_schema: schema}) : null;
    } catch (_) {
        return null;
    }
}

/**
 * @param {Gio.Settings} settings gnome-customizer-manager settings
 * @param {Gio.File} moduleDir this module's directory
 */
export function buildClockPage(settings, moduleDir) {
    const topbar = topbarSettings(moduleDir);
    return buildPage(settings, CLOCK_PAGE, (key, row, subtitle) => {
        if (key !== 'clock-visible' || !topbar?.settings_schema.has_key('enable-system-monitor'))
            return;

        // System Monitor (Topbar module) takes the centre box: the clock is
        // hidden while it runs, but the user's choice here is kept
        const update = () => {
            const replaced = topbar.get_boolean('enable-system-monitor');
            row.set_subtitle(replaced
                ? '<span foreground="#e5a50a" weight="bold">' +
                  'Hidden while System Monitor (Topbar module) is active' +
                  '</span>'
                : subtitle ?? '');
        };
        const id = topbar.connect('changed::enable-system-monitor', update);
        row.connect('destroy', () => {
            try {
                topbar.disconnect(id);
            } catch (_) {}
        });
        update();
    });
}

/** @param {Gio.Settings} settings gnome-customizer-manager settings */
export function buildQuickSettingsPage(settings) {
    return buildPage(settings, QUICK_SETTINGS_PAGE);
}
