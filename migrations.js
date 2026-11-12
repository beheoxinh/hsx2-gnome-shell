/**
 * One-shot GSettings migrations.
 *
 * GNOME 45 dropped the per-extension migration mechanism, and this suite moved
 * about forty keys between schema ids while consolidating by function. Every
 * step is idempotent, guarded by a `migration-<step>` key in the suite schema,
 * and skips keys the user never changed so a fresh install stays at defaults.
 *
 * Steps run in `STEPS` order on every suite enable. To add one: write a
 * KEY_MOVES_Vn table, freeze the source keys under migrations/schemas-vN,
 * append to STEPS, and add the guard key to the suite schema.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {SUITE_SCHEMA} from './modules.js';

/** [from schema id, from key, to schema id, to key, enum?] */
const KEY_MOVES = [
    // topbar-panel-controls -> alienware-topbar
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel', 'org.gnome.shell.extensions.alienware-topbar', 'panel-visible'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-in-overview', 'org.gnome.shell.extensions.alienware-topbar', 'panel-in-overview'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-size', 'org.gnome.shell.extensions.alienware-topbar', 'panel-height'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'top-panel-position', 'org.gnome.shell.extensions.alienware-topbar', 'panel-position', true],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-corner-size', 'org.gnome.shell.extensions.alienware-topbar', 'panel-corner-size'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-button-padding-size', 'org.gnome.shell.extensions.alienware-topbar', 'panel-button-padding'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-indicator-padding-size', 'org.gnome.shell.extensions.alienware-topbar', 'panel-indicator-padding'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-icon-size', 'org.gnome.shell.extensions.alienware-topbar', 'panel-icon-size'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'activities-button', 'org.gnome.shell.extensions.alienware-topbar', 'activities-button'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'background-menu', 'org.gnome.shell.extensions.alienware-topbar', 'background-menu'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'show-apps-button', 'org.gnome.shell.extensions.alienware-topbar', 'show-apps-button'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'clock-menu', 'org.gnome.shell.extensions.gnome-customizer-manager', 'clock-visible'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'clock-menu-position', 'org.gnome.shell.extensions.gnome-customizer-manager', 'clock-position', true],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'clock-menu-position-offset', 'org.gnome.shell.extensions.gnome-customizer-manager', 'clock-position-offset'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'world-clock', 'org.gnome.shell.extensions.gnome-customizer-manager', 'world-clock'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'weather', 'org.gnome.shell.extensions.gnome-customizer-manager', 'weather'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'events-button', 'org.gnome.shell.extensions.gnome-customizer-manager', 'events-button'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'calendar', 'org.gnome.shell.extensions.gnome-customizer-manager', 'calendar'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-notification-icon', 'org.gnome.shell.extensions.alienware-topbar', 'notification-icon'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'keyboard-layout', 'org.gnome.shell.extensions.alienware-topbar', 'keyboard-layout-indicator'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'accessibility-menu', 'org.gnome.shell.extensions.alienware-topbar', 'accessibility-menu'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'power-icon', 'org.gnome.shell.extensions.alienware-topbar', 'power-icon'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'screen-sharing-indicator', 'org.gnome.shell.extensions.alienware-topbar', 'screen-sharing-indicator'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'screen-recording-indicator', 'org.gnome.shell.extensions.alienware-topbar', 'screen-recording-indicator'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'search', 'org.gnome.shell.extensions.alienware-topbar', 'search-entry'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'type-to-search', 'org.gnome.shell.extensions.alienware-topbar', 'start-search'],

    // gnome-customizer-manager -> alienware-topbar (quick settings and the
    // calendar order went back to gnome-customizer-manager in v2, so those
    // rows are now same-key no-ops that only keep the legacy table complete)
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-dark-mode', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-dark-mode'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-night-light', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-night-light'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-do-not-disturb', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-do-not-disturb'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-backlight', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-backlight'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-airplane-mode', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-airplane-mode'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'accent-color-icon', 'org.gnome.shell.extensions.alienware-topbar', 'accent-color-icon'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'max-displayed-search-results', 'org.gnome.shell.extensions.alienware-topbar', 'max-search-results'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'invert-calendar-column-items', 'org.gnome.shell.extensions.gnome-customizer-manager', 'invert-calendar-column-items'],

    // topbar-widgets / panel-clone -> alienware-topbar
    ['org.gnome.shell.extensions.panel-clone', 'enable-topbar-clone', 'org.gnome.shell.extensions.alienware-topbar', 'clone-topbar'],
    ['org.gnome.shell.extensions.panel-clone', 'topbar-clone-show-clock', 'org.gnome.shell.extensions.alienware-topbar', 'clone-show-clock'],

    // window preview caption/close -> advanced-alt-tab
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'window-preview-caption', 'org.gnome.shell.extensions.advanced-alt-tab-window-switcher', 'window-preview-caption'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'window-preview-close-button', 'org.gnome.shell.extensions.advanced-alt-tab-window-switcher', 'window-preview-close-button'],
];

/**
 * v2: Quick Settings and Clock & Calendar customize GNOME's own menus, so they
 * moved from the Topbar module to Gnome Customizer Manager. Same key names,
 * read through the frozen copy in migrations/schemas-v2.
 */
const KEY_MOVES_V2 = [
    ['org.gnome.shell.extensions.alienware-topbar', 'clock-visible', 'org.gnome.shell.extensions.gnome-customizer-manager', 'clock-visible'],
    ['org.gnome.shell.extensions.alienware-topbar', 'clock-position', 'org.gnome.shell.extensions.gnome-customizer-manager', 'clock-position', true],
    ['org.gnome.shell.extensions.alienware-topbar', 'clock-position-offset', 'org.gnome.shell.extensions.gnome-customizer-manager', 'clock-position-offset'],
    ['org.gnome.shell.extensions.alienware-topbar', 'world-clock', 'org.gnome.shell.extensions.gnome-customizer-manager', 'world-clock'],
    ['org.gnome.shell.extensions.alienware-topbar', 'weather', 'org.gnome.shell.extensions.gnome-customizer-manager', 'weather'],
    ['org.gnome.shell.extensions.alienware-topbar', 'events-button', 'org.gnome.shell.extensions.gnome-customizer-manager', 'events-button'],
    ['org.gnome.shell.extensions.alienware-topbar', 'calendar', 'org.gnome.shell.extensions.gnome-customizer-manager', 'calendar'],
    ['org.gnome.shell.extensions.alienware-topbar', 'invert-calendar-column-items', 'org.gnome.shell.extensions.gnome-customizer-manager', 'invert-calendar-column-items'],
    ['org.gnome.shell.extensions.alienware-topbar', 'quick-settings', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings'],
    ['org.gnome.shell.extensions.alienware-topbar', 'quick-settings-dark-mode', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-dark-mode'],
    ['org.gnome.shell.extensions.alienware-topbar', 'quick-settings-night-light', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-night-light'],
    ['org.gnome.shell.extensions.alienware-topbar', 'quick-settings-do-not-disturb', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-do-not-disturb'],
    ['org.gnome.shell.extensions.alienware-topbar', 'quick-settings-backlight', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-backlight'],
    ['org.gnome.shell.extensions.alienware-topbar', 'quick-settings-airplane-mode', 'org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-airplane-mode'],
];

/**
 * enum nicks, so an int from an old schema lands on a valid enum value; the
 * index is the OLD int. Just Perfection numbered the clock 0 center, 1 right,
 * 2 left (left/center/right sent every clock one box over).
 */
const ENUM_NICKS = {
    'panel-position': ['top', 'bottom'],
    'clock-position': ['center', 'right', 'left'],
};

// live schemas the keys moved into
const TARGET_DIRS = [
    'modules/alienware-topbar@hsx2coder/schemas',
    'modules/alienware-advanced-alt-tab@hsx2coder/schemas',
    'modules/alienware-gnome-customizer-manager@hsx2coder/schemas',
];

/**
 * Steps run in order on every suite enable until their flag is set.
 * `legacyDir` holds frozen copies of the schemas the keys moved OUT of; it is
 * looked up on its own, never chained with the live dirs, so a frozen schema
 * can share an id with a live one (dconf stores values by path).
 * `resetSource` clears the old value once it has been copied.
 * `resetTarget` resets a target key the old schema never set: v1 copied the
 * quick-settings / invert-calendar keys OUT of this same GCM path without
 * clearing them, so a value still sitting there predates v1 and is stale.
 * `ignore(value, live)` drops a value that was never the user's choice.
 */
const STEPS = [
    {flag: 'migration-consolidation-v1', legacyDir: 'migrations/schemas', moves: KEY_MOVES, resetSource: false},
    {
        flag: 'migration-gcm-panel-menus-v2', legacyDir: 'migrations/schemas-v2', moves: KEY_MOVES_V2,
        resetSource: true, resetTarget: true,
        ignore: {
            // the old Topbar wrote clock-visible = !enable-system-monitor on
            // its own; with System Monitor on, false only meant "occupied",
            // which lib/dateMenuVisibility.js now tracks separately
            'clock-visible': (value, live) => !value.get_boolean() &&
                live('org.gnome.shell.extensions.alienware-topbar', 'enable-system-monitor') === true,
        },
    },
];

function chainedSource(baseDir, dirs) {
    let source = Gio.SettingsSchemaSource.get_default();
    for (const rel of dirs) {
        const path = `${baseDir}/${rel}`;
        if (!GLib.file_test(`${path}/gschemas.compiled`, GLib.FileTest.EXISTS))
            continue;
        source = Gio.SettingsSchemaSource.new_from_directory(path, source, false);
    }
    return source;
}

function settingsLookup(source, recursive) {
    const cache = new Map();
    return id => {
        if (!cache.has(id)) {
            const schema = source?.lookup(id, recursive) ?? null;
            cache.set(id, schema ? new Gio.Settings({settings_schema: schema}) : null);
        }
        return cache.get(id);
    };
}

function runStep(baseDir, step, log, earlierTargets) {
    const legacyPath = `${baseDir}/${step.legacyDir}`;
    // no frozen schema = nothing readable: report it so the flag stays unset
    // and the values are not given up for good
    if (!GLib.file_test(`${legacyPath}/gschemas.compiled`, GLib.FileTest.EXISTS))
        return null;
    const legacySource = Gio.SettingsSchemaSource.new_from_directory(legacyPath, null, false);
    const fromFor = settingsLookup(legacySource, false);
    const toFor = settingsLookup(chainedSource(baseDir, TARGET_DIRS), true);
    const live = (id, key) => {
        const settings = toFor(id);
        return settings?.settings_schema.has_key(key) ? settings.get_boolean(key) : undefined;
    };

    let moved = 0;
    let skipped = 0;
    for (const [fromId, fromKey, toId, toKey, asEnum] of step.moves) {
        const from = fromFor(fromId);
        const to = toFor(toId);
        // a key missing from either schema would abort the shell inside
        // GSettings (g_error, not an exception), so check before touching it
        if (!from || !to ||
            !from.settings_schema.has_key(fromKey) ||
            !to.settings_schema.has_key(toKey)) {
            skipped++;
            continue;
        }

        let value = from.get_user_value(fromKey);
        if (value && step.ignore?.[fromKey]?.(value, live)) {
            from.reset(fromKey);
            value = null;
        }
        if (!value) {
            // never set by the user: the new default applies. A target an
            // earlier step filled (v1 wrote GCM clock-position from
            // topbar-panel-controls) is not stale, so it is kept
            if (step.resetTarget && !earlierTargets.has(`${toId}\u0000${toKey}`))
                to.reset(toKey);
            skipped++;
            continue;
        }

        try {
            if (asEnum && value.get_type_string() !== 's') {
                const nicks = ENUM_NICKS[toKey] ?? [];
                const idx = Number(value.unpack());
                to.set_string(toKey, nicks[idx] ?? nicks[0] ?? '');
            } else {
                to.set_value(toKey, value);
            }
            if (step.resetSource)
                from.reset(fromKey);
            moved++;
        } catch (e) {
            log(`migration: ${fromId} ${fromKey} -> ${toId} ${toKey} failed: ${e.message}`);
            skipped++;
        }
    }
    return {moved, skipped};
}

export function runMigrations(extension, log = () => {}) {
    const suite = extension.getSettings(SUITE_SCHEMA);
    const results = [];
    // every target an earlier step writes, whether or not it ran this time
    const earlierTargets = new Set();
    for (const step of STEPS) {
        const targets = step.moves ?? [];
        const flagPending = suite.settings_schema.has_key(step.flag) && !suite.get_boolean(step.flag);
        if (!flagPending) {
            for (const [, , toId, toKey] of targets)
                earlierTargets.add(`${toId}\u0000${toKey}`);
            continue;
        }
        const result = runStep(extension.path, step, log, earlierTargets);
        for (const [, , toId, toKey] of targets)
            earlierTargets.add(`${toId}\u0000${toKey}`);
        if (!result) {
            log(`[alienware-suite] ${step.flag}: legacy schemas missing, will retry`);
            continue;
        }
        const {moved, skipped} = result;
        if (step.resetSource || moved)
            Gio.Settings.sync();
        suite.set_boolean(step.flag, true);
        log(`[alienware-suite] ${step.flag}: ${moved} value(s) moved, ${skipped} skipped`);
        results.push({flag: step.flag, moved, skipped});
    }
    return {ran: results.length > 0, steps: results};
}
