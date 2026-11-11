import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { getThemeDirs, getModeThemeDirs } from './util.js';

const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.user-theme';
const SETTINGS_KEY = 'name';

export class UserShellThemeSubsystem {
    _settings = null;
    _changedId = 0;

    constructor() {}

    start() {
        try {
            const schemaSource = Gio.SettingsSchemaSource.get_default();
            const schema = schemaSource.lookup(SETTINGS_SCHEMA, true);
            if (!schema)
                return;
            this._settings = new Gio.Settings({ settings_schema: schema });
            this._changedId = this._settings.connect(
                `changed::${SETTINGS_KEY}`,
                () => this._changeTheme()
            );
            this._changeTheme();
        } catch (e) {
            logError(e, '[UserShellTheme] start failed');
        }
    }

    stop() {
        try {
            if (this._settings && this._changedId) {
                this._settings.disconnect(this._changedId);
                this._changedId = 0;
            }
            this._settings = null;
        } catch (e) {
            logError(e, '[UserShellTheme] stop failed');
        }
    }

    getThemeName() {
        try {
            return this._settings?.get_string(SETTINGS_KEY) ?? '';
        } catch (e) {
            logError(e, '[UserShellTheme] getThemeName failed');
            return '';
        }
    }

    setThemeName(name) {
        try {
            this._settings?.set_string(SETTINGS_KEY, name ?? '');
        } catch (e) {
            logError(e, '[UserShellTheme] setThemeName failed');
        }
    }

    _changeTheme() {
        // Theme reload mutates every shell actor. Never do that while Mutter is
        // entering unlock-dialog or rebuilding the stage after lock; DisplayConfig
        // is synchronous there and a reload can block the shell main loop.
        if (Main.sessionMode?.isLocked ||
            Main.sessionMode?.currentMode === 'unlock-dialog')
            return;

        let stylesheet = null;
        const themeName = this._settings.get_string(SETTINGS_KEY);
        try {
            if (!themeName) {
                // '' means "Default". Returning early here left the previous
                // custom stylesheet active, so choosing Default did nothing.
                // Reload only if a custom theme is actually applied: on a
                // plain lock/unlock with Default selected this stays a no-op.
                if (this._appliedStylesheet || globalThis.__alienwareAppliedShellTheme) {
                    Main.setThemeStylesheet(null);
                    Main.loadTheme();
                    this._appliedStylesheet = null;
                    globalThis.__alienwareAppliedShellTheme = null;
                }
                return;
            }

            const stylesheetPaths = getThemeDirs()
                .map(dir => `${dir}/${themeName}/gnome-shell/gnome-shell.css`);
            stylesheetPaths.push(...getModeThemeDirs()
                .map(dir => `${dir}/${themeName}.css`));

            const found = stylesheetPaths.find(path => {
                try {
                    const file = Gio.File.new_for_path(path);
                    return file.query_exists(null);
                } catch {
                    return false;
                }
            });
            stylesheet = found;

            if (!stylesheet) {
                log('loading default theme (stylesheet not resolved yet, skip loadTheme)');
                return;
            }

            // Re-applying an identical stylesheet costs a full shell theme
            // reload (every actor re-styled). The module is re-enabled on every
            // lock/unlock cycle, so without this check the theme reload runs on
            // each transition -- exactly when mutter is rebuilding stage views.
            if (this._appliedStylesheet === stylesheet ||
                globalThis.__alienwareAppliedShellTheme === stylesheet)
                return;

            log(`[UserShellTheme] loading user theme: ${stylesheet}`);
            Main.setThemeStylesheet(stylesheet);
            try {
                Main.loadTheme();
                this._appliedStylesheet = stylesheet;
                globalThis.__alienwareAppliedShellTheme = stylesheet;
            } catch (e) {
                log(`[UserShellTheme] loadTheme failed, will retry on next change: ${e.message}`);
            }
        } catch (e) {
            log(`[UserShellTheme] _changeTheme failed: ${e.message}`);
        }
    }
}
