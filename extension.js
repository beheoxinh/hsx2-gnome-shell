import Gio from 'gi://Gio';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import AdvancedMediaControllerExtension from './modules/alienware-advanced-media-controller@hsx2coder/extension.js';
import TopbarExtension from './modules/alienware-topbar@hsx2coder/extension.js';
import DashToPanelExtension from './modules/alienware-dash-to-panel@hsx2coder/extension.js';
import SystemMonitorExtension from './modules/alienware-monitor@hsx2coder/extension.js';
import IndicatorsExtension from './modules/alienware-indicators@hsx2coder/extension.js';
import DingExtension from './modules/alienware-desktop-enable-gnome@hsx2coder/extension.js';
import AdvancedAltTabExtension from './modules/alienware-advanced-alt-tab@hsx2coder/extension.js';
import NotificationConfiguratorExtension from './modules/alienware-notification-configurator@hsx2coder/extension.js';
import GnomeCustomizerManagerExtension from './modules/alienware-gnome-customizer-manager@hsx2coder/extension.js';

import {MODULES, buildSubMetadata} from './modules.js';
import {runMigrations} from './migrations.js';

const CLASS_REGISTRY = {
    'alienware-advanced-media-controller@hsx2coder': AdvancedMediaControllerExtension,
    'alienware-topbar@hsx2coder': TopbarExtension,
    'alienware-dash-to-panel@hsx2coder': DashToPanelExtension,
    'alienware-monitor@hsx2coder': SystemMonitorExtension,
    'alienware-indicators@hsx2coder': IndicatorsExtension,
    'alienware-desktop-enable-gnome@hsx2coder': DingExtension,
    'alienware-advanced-alt-tab@hsx2coder': AdvancedAltTabExtension,
    'alienware-notification-configurator@hsx2coder': NotificationConfiguratorExtension,
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
        this._loadStylesheets();
        this._suiteSettings = this.getSettings();

        // before any module reads its schema, so a returning user keeps the
        // values they set under the old schema ids
        try {
            runMigrations(this, msg => log(msg));
        } catch (e) {
            logError(e, '[alienware-suite] migration failed, continuing with defaults');
        }

        for (const def of MODULES) {
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

        for (const file of files) {
            const provider = new St.CssProvider();
            provider.load_from_path(file.get_path());
            St.ThemeContext.get_for_stage(global.stage).add_provider(provider);
        }
        log(`[alienware-suite] ${files.length} stylesheet(s) registered`);
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

            console.log(`[alienware-suite] enabled module ${def.uuid}`);
        } catch (e) {
            this._loaded.delete(def.uuid);
            logError(e, `[alienware-suite] failed to enable ${def.uuid}`);
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
        console.log(`[alienware-suite] disabled module ${def.uuid}`);
    }
}
