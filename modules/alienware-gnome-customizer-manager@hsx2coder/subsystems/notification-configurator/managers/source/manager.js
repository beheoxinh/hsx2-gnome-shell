import { InjectionManager } from "resource:///org/gnome/shell/extensions/extension.js";
import { NotificationDestroyedReason, Source, } from "resource:///org/gnome/shell/ui/messageTray.js";
import { NOTIFICATIONS_PER_SOURCE_DEFAULT, } from "../../utils/settings.js";
export class SourceManager {
    // One InjectionManager per manager (source, message-tray, notification-daemon,
    // window-attention) is intentional, not duplication: each manager restores only
    // its own prototype patches via injectionManager.clear() in disable(), so a
    // shared instance would let one manager's disable() undo another's live patches.
    settingsManager;
    injectionManager = new InjectionManager();
    addNotificationHooks = [];
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
    }
    registerAddNotificationHook(hook) {

        try {
        this.addNotificationHooks.push(hook);
            } catch (e) {
            logError(e, 'NC-SOURCE');
        }
    }
    enable() {

        try {
        this.patchAddNotification();
            } catch (e) {
            logError(e, 'NC-SOURCE');
        }
    }
    disable() {

        try {
        this.injectionManager.clear();
            } catch (e) {
            logError(e, 'NC-SOURCE');
        }
    }
    patchAddNotification() {

        try {
        const hooks = this.addNotificationHooks;
        const manager = this;
        this.injectionManager.overrideMethod(Source.prototype, "addNotification", () => function (notification) {
            let handled = false;
            let blocked = false;
            const addNotification = (notificationToAdd) => {
                handled = true;
                manager.addNotification(this, notificationToAdd, manager.getMaximumPerSource(this, notificationToAdd));
            };
            for (const hook of hooks) {
                hook(addNotification, notification, {
                    source: this,
                    block: () => {
                        blocked = true;
                    },
                });
                if (blocked) {
                    return;
                }
            }
            if (!handled && !blocked) {
                addNotification(notification);
            }
        });
            } catch (e) {
            logError(e, 'NC-SOURCE');
        }
    }
    getMaximumPerSource(source, notification) {

        try {
        const configuration = this.settingsManager.getConfigurationFor(notification.source?.title ?? source.title, notification.title, notification.body);
        const maximumPerSource = configuration.enabled
            ? configuration.notificationCenter.maximumPerSource
            : NOTIFICATIONS_PER_SOURCE_DEFAULT;
        return maximumPerSource > 0
            ? Math.trunc(maximumPerSource)
            : NOTIFICATIONS_PER_SOURCE_DEFAULT;
            } catch (e) {
            logError(e, 'NC-SOURCE');
        }
    }
    addNotification(source, notification, maximumPerSource) {

        try {
        // Adapted from GNOME Shell js/ui/messageTray.js Source.addNotification().
        if (source.notifications.includes(notification)) {
            return;
        }
        while (source.notifications.length >= maximumPerSource) {
            const [oldestNotification] = source.notifications;
            oldestNotification.destroy(NotificationDestroyedReason.EXPIRED);
        }
        notification.connect("destroy", source._onNotificationDestroy.bind(source));
        notification.connect("notify::acknowledged", () => {
            source.countUpdated();
            if (!notification.acknowledged) {
                source.emit("notification-request-banner", notification);
            }
        });
        source.notifications.push(notification);
        source.emit("notification-added", notification);
        source.emit("notification-request-banner", notification);
        source.countUpdated();
            } catch (e) {
            logError(e, 'NC-SOURCE');
        }
    }
    dispose() {

        try {
        this.disable();
        this.addNotificationHooks = [];
            } catch (e) {
            logError(e, 'NC-SOURCE');
        }
    }
}
