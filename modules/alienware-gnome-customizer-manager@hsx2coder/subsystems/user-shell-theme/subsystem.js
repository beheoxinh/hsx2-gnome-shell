import Gio from 'gi://Gio';

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
        try {
            let stylesheet = null;
            const themeName = this._settings?.get_string(SETTINGS_KEY);
            if (!themeName)
                return;

            const stylesheetPaths = getThemeDirs()
                .map(dir => `${dir}/${themeName}/gnome-shell/gnome-shell.css`);
            stylesheetPaths.push(...getModeThemeDirs()
                .map(dir => `${dir}/${themeName}.css`));

            const found = stylesheetPaths.find(path => {
                try {
                    const file = Gio.file_new_for_path(path);
                    return file.query_exists(null);
                } catch {
                    return false;
                }
            });
            stylesheet = found ?? null;

            if (!stylesheet) {
                log('[UserShellTheme] stylesheet not resolved yet, skip loadTheme');
                return;
            }

            log(`[UserShellTheme] loading user theme: ${stylesheet}`);
            Main.setThemeStylesheet(stylesheet);
            try {
                Main.loadTheme();
            } catch (e) {
                log(`[UserShellTheme] loadTheme failed, will retry on next change: ${e.message}`);
            }
        } catch (e) {
            logError(e, '[UserShellTheme] _changeTheme failed');
        }
    }
}
