import Gio from 'gi://Gio';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import TopbarExtension from './modules/alienware-topbar@hsx2coder/extension.js';
import DashToPanelExtension from './modules/alienware-dash-to-panel@hsx2coder/extension.js';
import DingExtension from './modules/alienware-desktop-enable-gnome@hsx2coder/extension.js';
import AdvancedAltTabExtension from './modules/alienware-advanced-alt-tab@hsx2coder/extension.js';
import GnomeCustomizerManagerExtension from './modules/alienware-gnome-customizer-manager@hsx2coder/extension.js';

import {MODULES, buildSubMetadata} from './modules.js';
import {runMigrations} from './migrations.js';

const CLASS_REGISTRY = {
    'alienware-topbar@hsx2coder': TopbarExtension,
    'alienware-dash-to-panel@hsx2coder': DashToPanelExtension,
    'alienware-desktop-enable-gnome@hsx2coder': DingExtension,
    'alienware-advanced-alt-tab@hsx2coder': AdvancedAltTabExtension,
    'alienware-gnome-customizer-manager@hsx2coder': GnomeCustomizerManagerExtension,
};

export default class AlienwareSuiteExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._suiteSettings = null;
        this._loaded = new Map();
        this._signalIds = [];
    }

    enable() {
        this.initTranslations();
        try {
            this._loadStylesheets();
        } catch (e) {
            logError(e, '[alienware-suite] stylesheets skipped');
        }
        this._suiteSettings = this.getSettings();

        // before any module reads its schema, so a returning user keeps the
        // values they set under the old schema ids
        try {
            runMigrations(this, msg => log(msg));
        } catch (e) {
            logError(e, '[alienware-suite] migration failed, continuing with defaults');
        }

        const validKeys = this._suiteSettings.settings_schema.list_keys();
        for (const def of MODULES) {
            if (!validKeys.includes(def.enableKey))
                continue;

            if (this._suiteSettings.get_boolean(def.enableKey))
                this._enableModule(def);

            const handlerId = this._suiteSettings.connect(
                `changed::${def.enableKey}`,
                () => this._reactToToggle(def),
            );
            this._signalIds.push(handlerId);
        }
    }

    disable() {
        for (const id of this._signalIds)
            this._suiteSettings?.disconnect(id);
        this._signalIds = [];

        for (const def of [...MODULES].reverse()) {
            if (this._loaded.has(def.uuid))
                this._disableModule(def);
        }

        if (this._loadedStylesheets) {
            const theme = St.ThemeContext.get_for_stage(global.stage)?.get_theme();
            if (theme) {
                for (const uri of this._loadedStylesheets) {
                    try {
                        theme.unload_stylesheet(Gio.File.new_for_uri(uri));
                    } catch (e) {
                        // A hash lookup miss in st_theme_unload_stylesheet() is a
                        // silent no-op, so a stale entry is harmless here.
                        logError(e, `[alienware-suite] could not unload ${uri}`);
                    }
                }
            }
            this._loadedStylesheets = null;
        }

        this._suiteSettings = null;
    }

    /**
     * Register every stylesheet in the tree, discovered instead of declared:
     * the old `hasStylesheet` flag was never read, so the clipboard indicator,
     * the media controller and the dash were all running unstyled.
     */
    _loadStylesheets() {
        const files = [];
        const own = this.dir.get_child('stylesheet.css');
        if (own.query_exists(null))
            files.push(own);

        const modulesDir = this.dir.get_child('modules');
        const names = modulesDir.enumerate_children('standard::name', Gio.DIRECTORY_QUERY_FLAGS_NONE, null);
        let info;
        while ((info = names.next_file(null)) !== null) {
            const child = modulesDir.get_child(info.get_name());
            if (!child.query_file_type(Gio.FileQueryInfoFlags.NONE, null))
                continue;
            const css = child.get_child('stylesheet.css');
            if (css.query_exists(null))
                files.push(css);
        }

        let loaded = 0;
        this._loadedStylesheets = [];
        try {
            const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
            for (const file of files) {
                // Guard the trust boundary: only existing, readable regular files
                // reach the shell, so a missing stylesheet in any module can never
                // corrupt the theme's custom stylesheet list.
                let info;
                try {
                    info = file.query_info('standard::type,standard::size',
                        Gio.FileQueryInfoFlags.NONE, null);
                } catch (e) {
                    logError(e, `[alienware-suite] could not stat ${file.get_path()}`);
                    continue;
                }
                if (info.get_file_type() !== Gio.FileType.REGULAR ||
                    info.get_size() === 0) {
                    log(`[alienware-suite] skipped ${file.get_path()}`);
                    continue;
                }
                try {
                    theme.load_stylesheet(file);
                    // Store the URI, never the GFile: a GFile captured from one
                    // theme instance must not be reused after a theme reload, and
                    // a URI is resolved against whatever theme is current.
                    this._loadedStylesheets.push(file.get_uri());
                    loaded++;
                } catch (e) {
                    logError(e, `[alienware-suite] could not load ${file.get_path()}`);
                }
            }
        } catch (err) {
            logError(err, '[alienware-suite] failed to access shell theme context');
        }
        log(`[alienware-suite] ${loaded}/${files.length} stylesheet(s) registered`);
    }

    _reactToToggle(def) {
        const wantOn = this._suiteSettings.get_boolean(def.enableKey);
        const isOn = this._loaded.has(def.uuid);
        if (wantOn && !isOn)
            this._enableModule(def);
        else if (!wantOn && isOn)
            this._disableModule(def);
    }

    _enableModule(def) {
        try {
            const Klass = CLASS_REGISTRY[def.uuid];
            if (typeof Klass !== 'function')
                throw new Error(`No class registered for ${def.uuid}`);

            const subMetadata = buildSubMetadata(this, def);
            const instance = new Klass(subMetadata);
            this._loaded.set(def.uuid, instance);

            const suiteExt = this;
            instance.openPreferences = function () {
                suiteExt.openPreferences();
            };

            instance.enable();

            log(`[alienware-suite] enabled module ${def.uuid}`);
        } catch (e) {
            logError(e, `[alienware-suite] failed to enable ${def.uuid}`);
            // a module that threw halfway through may already have put actors
            // in the panel; without this they stay there forever
            const partial = this._loaded.get(def.uuid);
            if (partial) {
                try {
                    partial.disable();
                } catch (cleanupError) {
                    logError(cleanupError,
                        `[alienware-suite] cleanup of ${def.uuid} also failed`);
                }
                this._loaded.delete(def.uuid);
            }
        }
    }

    _disableModule(def) {
        const instance = this._loaded.get(def.uuid);
        if (!instance)
            return;
        try {
            instance.disable();
        } catch (e) {
            logError(e, `[alienware-suite] failed to disable ${def.uuid}`);
        }
        this._loaded.delete(def.uuid);
        log(`[alienware-suite] disabled module ${def.uuid}`);
    }
}
