export class TimeoutAdapter {
    settingsManager;
    listenerId;
    constructor(settingsManager) {
        this.settingsManager = settingsManager;
    }
    createHook() {

        try {
        const settingsManager = this.settingsManager;
        return (_original, timeout) => {
            if (timeout !== null && timeout > 0) {
                return settingsManager.notificationTimeout > 0
                    ? settingsManager.notificationTimeout
                    : null;
            }
            return timeout;
        };
            } catch (e) {
            logError(e, 'NC-TIMEOUT');
        }
    }
    register(manager) {

        try {
        this.listenerId = this.settingsManager.events.on("notificationTimeoutChanged", () => { });
        manager.registerUpdateNotificationTimeoutHook(this.createHook());
            } catch (e) {
            logError(e, 'NC-TIMEOUT');
        }
    }
    dispose() {

        try {
        if (this.listenerId !== undefined) {
            this.settingsManager.events.off(this.listenerId);
            this.listenerId = undefined;
        }
            } catch (e) {
            logError(e, 'NC-TIMEOUT');
        }
    }
}
