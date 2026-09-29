/**
 * One-shot GSettings migrations.
 *
 * GNOME 45 dropped the per-extension migration mechanism, and this suite moved
 * about forty keys between schema ids while consolidating by function. Every
 * step is idempotent, guarded by a `migration-<step>` key in the suite schema,
 * and skips keys the user never changed so a fresh install stays at defaults.
 *
 * Steps run in `STEPS` order on every suite enable. To add one: append to
 * STEPS, bump nothing, and add the guard key to the suite schema.
 */

import Gio from 'gi://Gio';

import {SUITE_SCHEMA} from './modules.js';

const MIGRATION_FLAG = 'migration-consolidation-v1';

/** [from schema id, from key, to schema id, to key] */
const KEY_MOVES = [
    // topbar-panel-controls -> alienware-topbar
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel', 'org.gnome.shell.extensions.alienware-topbar', 'panel-visible'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-in-overview', 'org.gnome.shell.extensions.alienware-topbar', 'panel-in-overview'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-size', 'org.gnome.shell.extensions.alienware-topbar', 'panel-height'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'top-panel-position', 'org.gnome.shell.extensions.alienware-topbar', 'panel-position-int'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-corner-size', 'org.gnome.shell.extensions.alienware-topbar', 'panel-corner-size'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-button-padding-size', 'org.gnome.shell.extensions.alienware-topbar', 'panel-button-padding'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-indicator-padding-size', 'org.gnome.shell.extensions.alienware-topbar', 'panel-indicator-padding'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-icon-size', 'org.gnome.shell.extensions.alienware-topbar', 'panel-icon-size'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'activities-button', 'org.gnome.shell.extensions.alienware-topbar', 'activities-button'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'background-menu', 'org.gnome.shell.extensions.alienware-topbar', 'background-menu'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'show-apps-button', 'org.gnome.shell.extensions.alienware-topbar', 'show-apps-button'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'clock-menu', 'org.gnome.shell.extensions.alienware-topbar', 'clock-visible'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'clock-menu-position', 'org.gnome.shell.extensions.alienware-topbar', 'clock-position-int'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'clock-menu-position-offset', 'org.gnome.shell.extensions.alienware-topbar', 'clock-position-offset'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'world-clock', 'org.gnome.shell.extensions.alienware-topbar', 'world-clock'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'weather', 'org.gnome.shell.extensions.alienware-topbar', 'weather'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'events-button', 'org.gnome.shell.extensions.alienware-topbar', 'events-button'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'calendar', 'org.gnome.shell.extensions.alienware-topbar', 'calendar'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'panel-notification-icon', 'org.gnome.shell.extensions.alienware-topbar', 'notification-icon'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'keyboard-layout', 'org.gnome.shell.extensions.alienware-topbar', 'keyboard-layout-indicator'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'accessibility-menu', 'org.gnome.shell.extensions.alienware-topbar', 'accessibility-menu'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'power-icon', 'org.gnome.shell.extensions.alienware-topbar', 'power-icon'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'screen-sharing-indicator', 'org.gnome.shell.extensions.alienware-topbar', 'screen-sharing-indicator'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'screen-recording-indicator', 'org.gnome.shell.extensions.alienware-topbar', 'screen-recording-indicator'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'search', 'org.gnome.shell.extensions.alienware-topbar', 'search-entry'],
    ['org.gnome.shell.extensions.topbar-panel-controls', 'type-to-search', 'org.gnome.shell.extensions.alienware-topbar', 'start-search'],

    // gnome-customizer-manager -> alienware-topbar
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings', 'org.gnome.shell.extensions.alienware-topbar', 'quick-settings'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-dark-mode', 'org.gnome.shell.extensions.alienware-topbar', 'quick-settings-dark-mode'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-night-light', 'org.gnome.shell.extensions.alienware-topbar', 'quick-settings-night-light'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-do-not-disturb', 'org.gnome.shell.extensions.alienware-topbar', 'quick-settings-do-not-disturb'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-backlight', 'org.gnome.shell.extensions.alienware-topbar', 'quick-settings-backlight'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'quick-settings-airplane-mode', 'org.gnome.shell.extensions.alienware-topbar', 'quick-settings-airplane-mode'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'accent-color-icon', 'org.gnome.shell.extensions.alienware-topbar', 'accent-color-icon'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'max-displayed-search-results', 'org.gnome.shell.extensions.alienware-topbar', 'max-search-results'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'invert-calendar-column-items', 'org.gnome.shell.extensions.alienware-topbar', 'invert-calendar-column-items'],

    // topbar-widgets / panel-clone -> alienware-topbar
    ['org.gnome.shell.extensions.panel-clone', 'enable-topbar-clone', 'org.gnome.shell.extensions.alienware-topbar', 'clone-topbar'],
    ['org.gnome.shell.extensions.panel-clone', 'topbar-clone-show-clock', 'org.gnome.shell.extensions.alienware-topbar', 'clone-show-clock'],

    // window preview caption/close -> advanced-alt-tab
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'window-preview-caption', 'org.gnome.shell.extensions.advanced-alt-tab-window-switcher', 'window-preview-caption'],
    ['org.gnome.shell.extensions.gnome-customizer-manager', 'window-preview-close-button', 'org.gnome.shell.extensions.advanced-alt-tab-window-switcher', 'window-preview-close-button'],
];

/** enum nicks, so an int from an old schema lands on a valid enum value */
const ENUM_NICKS = {
    'panel-position-int': ['top', 'bottom'],
    'clock-position-int': ['left', 'center', 'right'],
};

const SCHEMA_DIRS = [
    '',
    'modules/alienware-topbar@hsx2coder/schemas',
    'modules/alienware-advanced-alt-tab@hsx2coder/schemas',
    'modules/alienware-gnome-customizer-manager@hsx2coder/schemas',
];

function buildSchemaSource(baseDir) {
    let source = Gio.SettingsSchemaSource.get_default();
    for (const rel of SCHEMA_DIRS) {
        const path = rel ? `${baseDir}/${rel}` : baseDir;
        source = Gio.SettingsSchemaSource.new_from_directory(path, source, false);
    }
    return source;
}

export function runMigrations(extension, log = () => {}) {
    const suite = extension.getSettings(SUITE_SCHEMA);
    if (suite.get_boolean(MIGRATION_FLAG))
        return {ran: false, moved: 0, skipped: 0};

    const source = buildSchemaSource(extension.path);
    const cache = new Map();
    const settingsFor = id => {
        if (!cache.has(id)) {
            const schema = source.lookup(id, false);
            if (!schema) {
                cache.set(id, null);
            } else {
                cache.set(id, new Gio.Settings({settings_schema: schema}));
            }
        }
        return cache.get(id);
    };

    let moved = 0;
    let skipped = 0;
    for (const [fromId, fromKey, toId, toKey] of KEY_MOVES) {
        const from = settingsFor(fromId);
        const to = settingsFor(toId);
        if (!from || !to) {
            skipped++;
            continue;
        }
        let value;
        try {
            value = from.get_user_value(fromKey);
        } catch (e) {
            skipped++;
            continue;
        }
        if (!value) {
            // never set by the user: leave the new default alone
            skipped++;
            continue;
        }

        let packed = value;
        const nicks = ENUM_NICKS[toKey];
        if (nicks) {
            const idx = Number(value.unpack());
            const nick = nicks[idx] ?? nicks[0];
            const schema = to.settings_schema;
            if (!schema.has_key(toKey))
                continue;
            to.set_string(toKey, nick);
            moved++;
            continue;
        }

        try {
            to.set_value(toKey, packed);
            moved++;
        } catch (e) {
            log(`migration: ${fromId} ${fromKey} -> ${toId} ${toKey} failed: ${e.message}`);
            skipped++;
        }
    }

    suite.set_boolean(MIGRATION_FLAG, true);
    log(`[alienware-suite] migration v1: ${moved} value(s) moved, ${skipped} skipped`);
    return {ran: true, moved, skipped};
}
