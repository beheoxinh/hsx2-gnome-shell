// Imported first on purpose: lib/guard.js patches GObject.registerClass as a
// side effect of being evaluated, and ESM evaluates imports in source order, so
// this guarantees every GObject class in the tree is registered through the
// patched function.
import {guardClass} from './lib/guard.js';

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

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
        this._deferredEnableId = 0;
        this._sessionWaitShieldId = 0;
        this._sessionWaitModeId = 0;
        this._sessionWaitPollId = 0;
        this._togglesWatched = false;
        this._validEnableKeys = null;
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
        this._validEnableKeys = new Set(validKeys);

        // The shell enables an extension as soon as its session mode matches.
        // During a lock/unlock the mode can flip back and forth, so building
        // every module (topbar clones, desktop icons, dash) inside that window
        // puts actors on a stage Mutter is rebuilding -- the teardown of those
        // actors then deadlocks the shell main loop. Defer until 'user' is the
        // settled mode instead of trusting the enable() timing.
        if (!this._isSessionSettled()) {
            log('[alienware-suite] session not settled, deferring module enable');
            this._waitForSettledSession();
            return;
        }

        this._enableModules();
    }

    /**
     * On unlock the shell enables extensions as soon as 'unlock-dialog' is
     * popped, but ScreenShield only clears `locked` once its slide-out
     * animation completes. That animation needs painted frames, so with the
     * outputs in DPMS-off or an RDP session without a client it can take
     * arbitrarily long. A fixed retry budget gave up and left the session
     * with no panel/dock/desktop until the next lock, so wait on the actual
     * signals instead, with a cheap periodic check as a safety net.
     */
    _waitForSettledSession() {
        this._stopWaitingForSession();

        const tryEnable = () => {
            if (!this._suiteSettings || !this._isSessionSettled())
                return false;
            this._stopWaitingForSession();
            // Let the shell finish the emission that settled the session
            // before actors are added to the stage.
            this._deferredEnableId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._deferredEnableId = 0;
                if (this._suiteSettings && this._isSessionSettled())
                    this._enableModules();
                else if (this._suiteSettings)
                    this._waitForSettledSession();
                return GLib.SOURCE_REMOVE;
            });
            return true;
        };

        if (Main.screenShield) {
            this._sessionWaitShieldId = Main.screenShield.connect(
                'locked-changed', () => tryEnable());
        }
        this._sessionWaitModeId = Main.sessionMode.connect(
            'updated', () => tryEnable());
        this._sessionWaitPollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            if (!this._suiteSettings || !this._isSessionSettled())
                return GLib.SOURCE_CONTINUE;
            // returning REMOVE below drops this source; don't remove it twice
            this._sessionWaitPollId = 0;
            tryEnable();
            return GLib.SOURCE_REMOVE;
        });
    }

    _stopWaitingForSession() {
        if (this._sessionWaitShieldId) {
            Main.screenShield?.disconnect(this._sessionWaitShieldId);
            this._sessionWaitShieldId = 0;
        }
        if (this._sessionWaitModeId) {
            Main.sessionMode.disconnect(this._sessionWaitModeId);
            this._sessionWaitModeId = 0;
        }
        if (this._sessionWaitPollId) {
            GLib.source_remove(this._sessionWaitPollId);
            this._sessionWaitPollId = 0;
        }
    }

    /** True when the shell is in the settled interactive session. */
    _isSessionSettled() {
        const mode = Main.sessionMode?.currentMode;
        if (mode && mode !== 'user')
            return false;
        if (Main.sessionMode?.isLocked)
            return false;
        if (Main.screenShield?.locked)
            return false;
        return true;
    }

    _enableModules() {
        const validKeys = this._validEnableKeys ?? new Set();
        for (const def of MODULES) {
            if (!validKeys.has(def.enableKey))
                continue;

            if (this._loaded.has(def.uuid))
                continue;

            if (this._suiteSettings.get_boolean(def.enableKey))
                this._enableModule(def);
        }

        // Watch toggles once, regardless of which path enabled the modules.
        if (!this._togglesWatched) {
            this._togglesWatched = true;
            for (const def of MODULES) {
                if (!validKeys.has(def.enableKey))
                    continue;
                const handlerId = this._suiteSettings.connect(
                    `changed::${def.enableKey}`,
                    () => this._reactToToggle(def),
                );
                this._signalIds.push(handlerId);
            }
        }
    }

    disable() {
        this._stopWaitingForSession();
        if (this._deferredEnableId) {
            GLib.source_remove(this._deferredEnableId);
            this._deferredEnableId = 0;
        }
        this._togglesWatched = false;
        this._validEnableKeys = null;
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

            if (def.uuid === 'alienware-desktop-enable-gnome@hsx2coder') {
                Object.defineProperty(this, 'DesktopIconsUsableArea', {
                    get: () => instance.DesktopIconsUsableArea,
                    configurable: true,
                    enumerable: true,
                });
            }

            const suiteExt = this;
            instance.openPreferences = function () {
                suiteExt.openPreferences();
            };

            const pending = instance.enable();
            // dash-to-panel's enable() is async; a rejection after its first
            // await never reaches the catch below, so clean up from here.
            if (pending && typeof pending.then === 'function') {
                pending.catch(e => {
                    logError(e, `[alienware-suite] async enable of ${def.uuid} failed`);
                    if (this._loaded.get(def.uuid) !== instance)
                        return;
                    try {
                        instance.disable();
                    } catch (cleanupError) {
                        logError(cleanupError,
                            `[alienware-suite] cleanup of ${def.uuid} also failed`);
                    }
                    this._loaded.delete(def.uuid);
                });
            }

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
        if (def.uuid === 'alienware-desktop-enable-gnome@hsx2coder') {
            delete this.DesktopIconsUsableArea;
        }
        this._loaded.delete(def.uuid);
        log(`[alienware-suite] disabled module ${def.uuid}`);
    }
}

// Wrap the suite itself and every module entry point. Extension subclasses are
// plain classes, so they do not pass through GObject.registerClass; without
// this their enable()/disable() bodies would escape the guard layer.
// enable()/disable() of the modules stay unwrapped on purpose: the suite's
// _enableModule()/_disableModule() already catch, and only an exception that
// reaches them triggers the partial-enable cleanup. Swallowing it inside the
// module left half-enabled modules with actors nobody removed.
for (const [uuid, Klass] of Object.entries(CLASS_REGISTRY))
    guardClass(Klass, uuid, {skip: ['enable', 'disable']});
guardClass(AlienwareSuiteExtension, 'alienware-suite');
