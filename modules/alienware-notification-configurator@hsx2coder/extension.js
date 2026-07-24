import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { migrateRegexSchema } from "./migrations/regex.js";
import { NotificationsManager } from "./shell/notifications.js";
import { SettingsManager } from "./utils/settings.js";
import { ThemesManager } from "./utils/themes.js";
export default class NotificationConfiguratorExtension extends Extension {
    settingsManager;
    notificationsManager;
    themesManager;
    enable() {
        const settings = this.getSettings();
        migrateRegexSchema(settings);
        this.settingsManager = new SettingsManager(settings);
        this.notificationsManager = new NotificationsManager(this.settingsManager);
        this.themesManager = new ThemesManager(this.settingsManager);
        // === JP borrowed keys handler ===
        this._jpHandler = new _NcJpHandler(settings);
        this._jpHandler.start();
    }
    disable() {
        this._jpHandler?.stop();
        this._jpHandler = undefined;
        this.settingsManager?.dispose();
        this.notificationsManager?.dispose();
        this.themesManager?.dispose();
        this.settingsManager = undefined;
        this.notificationsManager = undefined;
        this.themesManager = undefined;
    }
}

/**
 * JP borrowed keys handler — reads jp-notif-banner-position.
 */
class _NcJpHandler {
    #s = null;
    #api = null;
    constructor(s) { this.#s = s; }
    start() {
        try {
            const gcm = Extension.lookupByUUID('alienware-gnome-customizer-manager@hsx2coder');
            if (gcm?._api) {
                this.#api = gcm._api;
                console.log('[NC-JP] API found, connecting JP notification key');
                this.#s.connectObject(
                    'changed::jp-notif-banner-position', () => this.#applyBannerPos(false),
                    this
                );
                this.#applyBannerPos(false);
            }
        } catch (e) {
            logError(e, '[NC-JP] init failed');
        }
    }
    stop() {
        try { this.#s.disconnectObject(this); } catch(e) {}
        this.#api = null;
    }
    #a() { return this.#api; }
    #applyBannerPos(f) {
        const a = this.#a(); if (!a) return;
        const pos = this.#s.get_int('jp-notif-banner-position');
        if (f)
            a.notificationBannerPositionSetDefault();
        else
            a.notificationBannerPositionSet(pos);
    }
}
