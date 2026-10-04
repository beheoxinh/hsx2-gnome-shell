import { migrateRegexSchema } from "./migrations/regex.js";
import { NotificationsManager } from "./shell/notifications.js";
import { SettingsManager } from "./utils/settings.js";
import { ThemesManager } from "./utils/themes.js";

export class NotificationConfiguratorSubsystem {
    settings;
    settingsManager;
    notificationsManager;
    themesManager;

    constructor(settings) {
        this.settings = settings;
    }

    start() {

        try {
        if (!this.settings)
            return;
        migrateRegexSchema(this.settings);
        this.settingsManager = new SettingsManager(this.settings);
        this.notificationsManager = new NotificationsManager(this.settingsManager);
        this.themesManager = new ThemesManager(this.settingsManager);
            } catch (e) {
            logError(e, 'NC-SUB');
        }
    }

    stop() {

        try {
        this.settingsManager?.dispose();
        this.notificationsManager?.dispose();
        this.themesManager?.dispose();
        this.settingsManager = undefined;
        this.notificationsManager = undefined;
        this.themesManager = undefined;
            } catch (e) {
            logError(e, 'NC-SUB');
        }
    }
}
