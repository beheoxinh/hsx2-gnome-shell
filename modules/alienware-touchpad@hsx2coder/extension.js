import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { TouchpadToggle } from './toggle.js';
import { panel } from 'resource:///org/gnome/shell/ui/main.js';
import { IconIndicator } from './icon.js';
import { SEND_EVENTS_DISABLED, SEND_EVENTS_DISABLED_ON_EXTERNAL_MOUSE, SEND_EVENTS_ENABLED, SETTINGS_SCHEMA_ID, TouchpadState, } from './types.js';

const IndicatorNotification = GObject.registerClass(
    class IndicatorNotification extends St.BoxLayout {
        _init() {
            super._init({
                style_class: 'osd-window touchpad-notification',
                vertical: false,
                opacity: 0,
                visible: false
            });

            this._icon = new St.Icon({
                icon_name: 'input-touchpad-symbolic',
                icon_size: 24,
                style_class: 'touchpad-notification-icon'
            });

            this._label = new St.Label({
                text: '',
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'touchpad-notification-label'
            });

            this.add_child(this._icon);
            this.add_child(this._label);

            Main.uiGroup.add_child(this);

            this._timeoutId = 0;
        }

        showNotification(iconName, text) {
            this._icon.icon_name = iconName;
            this._label.text = text;

            if (this._timeoutId) {
                GLib.source_remove(this._timeoutId);
                this._timeoutId = 0;
            }
            this.remove_all_transitions();

            this.opacity = 0;
            this.show();

            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                let primaryMonitor = Main.layoutManager.primaryMonitor;
                let x = primaryMonitor.x + primaryMonitor.width - this.width - 20;
                let y = primaryMonitor.y + Main.panel.height + 20;

                this.set_position(x, y);

                this.ease({
                    opacity: 255,
                    duration: 200,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => {
                        if (this._timeoutId) {
                            GLib.source_remove(this._timeoutId);
                            this._timeoutId = 0;
                        }
                        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1500, () => {
                            this._timeoutId = 0;
                            this.ease({
                                opacity: 0,
                                duration: 300,
                                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                                onComplete: () => this.hide()
                            });
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                });
                return GLib.SOURCE_REMOVE;
            });
        }

        destroy() {
            if (this._timeoutId) {
                GLib.source_remove(this._timeoutId);
                this._timeoutId = 0;
            }
            this.remove_all_transitions();
            super.destroy();
        }
    });

/**
 * QuickTouchpadToggleExtension class
 * Main extension class that handles enabling and disabling the touchpad toggle in the quick settings menu.
 */
export default class QuickTouchpadToggleExtension extends Extension {
    extensionSettings; // GNOME settings for the extension
    touchpadSettings; // GNOME touchpad settings
    toggleIndicator; // Indicator for the touchpad toggle in quick settings
    iconIndicator; // Indicator for the icon in the status area
    listenerShowIndicator;
    listenerTouchpadState;
    listenerTouchpadToggle;
    _customNotification;
    /**
     * Enables the extension.
     * Initializes GNOME settings, creates the touchpad toggle, and adds it to the quick settings menu.
     */
    enable() {
        this.extensionSettings = this.getSettings();
        this.touchpadSettings = new Gio.Settings({ schema_id: SETTINGS_SCHEMA_ID });

        Main.wm.addKeybinding(
            'toggle-shortcut',
            this.extensionSettings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => { this.toggleTouchpadState(); }
        );

        // Enable the quick settings touchpad toggle indicator.
        this.enableToggleIndicator();
        // Check the initial state for the icon indicator and enable it if necessary.
        if (this.extensionSettings.get_boolean('show-indicator')) {
            this.enableIconIndicator();
        }
        // Listen to the 'org.gnome.desktop.peripherals.touchpad'.
        this.listenerTouchpadState = this.touchpadSettings.connect('changed::send-events', () => this.onTouchpadStateChange());
        // Connect to changes in 'show-indicator' setting.
        this.listenerShowIndicator = this.extensionSettings.connect('changed::show-indicator', () => this.onIndicatorStateChange());
    }
    /**
     * Disables the extension.
     * Destroys the quick settings touchpad toggle and cleans up the indicators.
     */
    disable() {
        Main.wm.removeKeybinding('toggle-shortcut');

        if (this._customNotification) {
            this._customNotification.destroy();
            this._customNotification = null;
        }

        // Clean up and disable the toggle and icon indicators.
        this.disableToggleIndicator();
        this.disableIconIndicator();
        // Stop listening to the show-indicator setting.
        if (this.listenerShowIndicator) {
            this.extensionSettings.disconnect(this.listenerShowIndicator);
            this.listenerShowIndicator = null;
        }
        // Stop listening to the GNOME touchpad state.
        if (this.listenerTouchpadState) {
            this.touchpadSettings.disconnect(this.listenerTouchpadState);
            this.listenerTouchpadState = null;
        }
        this.touchpadSettings = null;
        this.extensionSettings = null;
    }
    /**
     * Retrieves the current touchpad state based on the GNOME settings.
     * Maps the "send-events" setting to a corresponding TouchpadState value.
     * @returns {TouchpadState} - The current touchpad state.
     */
    getTouchpadState() {
        const sendEvents = this.touchpadSettings.get_string('send-events');
        let state;
        switch (sendEvents) {
            case SEND_EVENTS_DISABLED:
                state = TouchpadState.Disabled;
                break;
            case SEND_EVENTS_DISABLED_ON_EXTERNAL_MOUSE:
                state = TouchpadState.MouseOnly;
                break;
            default:
                state = TouchpadState.Enabled;
        }
        return state;
    }
    /**
     * Handles changes to the 'show-indicator' setting.
     * Enables or disables the icon indicator based on the updated setting value.
     */
    onIndicatorStateChange() {
        const state = this.extensionSettings.get_boolean('show-indicator');
        state ? this.enableIconIndicator() : this.disableIconIndicator();
    }
    /**
     * Handles changes to the touchpad state setting ('send-events').
     * Updates both the toggle and icon indicators with the new state.
     */
    onTouchpadStateChange() {
        let state = this.getTouchpadState();
        if (this.iconIndicator) {
            this.iconIndicator.updateState(state);
        }
        this.toggleIndicator.quickSettingsItems[0].updateState(state);

        let showNotifications = this.extensionSettings.get_boolean('show-notifications');
        if (showNotifications) {
            if (!this._customNotification) {
                this._customNotification = new IndicatorNotification();
            }
            let isEnabled = state === TouchpadState.Enabled;
            let iconName = isEnabled ? 'input-touchpad-symbolic' : 'touchpad-disabled-symbolic';
            this._customNotification.showNotification(iconName, 'Touchpad ' + (isEnabled ? 'ON' : 'OFF'));
        }
    }

    toggleTouchpadState() {
        let state = this.getTouchpadState();
        if (state === TouchpadState.Enabled) {
            this.updateSendEventsSetting(TouchpadState.Disabled);
        } else {
            this.updateSendEventsSetting(TouchpadState.Enabled);
        }
    }
    /**
     * Updates the 'send-events' setting in the GNOME touchpad settings.
     * Maps the given TouchpadState to the corresponding string value
     * and sets it in the touchpad settings.
     *
     * @param {TouchpadState} state - The desired touchpad state to be applied.
     */
    updateSendEventsSetting(state) {
        let value;
        switch (state) {
            case TouchpadState.Disabled:
                value = SEND_EVENTS_DISABLED;
                break;
            case TouchpadState.MouseOnly:
                value = SEND_EVENTS_DISABLED_ON_EXTERNAL_MOUSE;
                break;
            default:
                value = SEND_EVENTS_ENABLED;
        }
        this.touchpadSettings.set_string('send-events', value);
    }
    /**
     * Enables the touchpad toggle indicator in the quick settings.
     * Creates a new SystemIndicator and adds the TouchpadToggle item.
     */
    enableToggleIndicator() {
        if (!this.toggleIndicator) {
            let toggle = new TouchpadToggle();
            toggle.updateState(this.getTouchpadState());
            // Touchpad switcher listener.
            this.listenerTouchpadToggle = toggle.connect('state-updated', (_, state) => {
                this.updateSendEventsSetting(state);
            });
            this.toggleIndicator = new SystemIndicator();
            this.toggleIndicator.quickSettingsItems.push(toggle);
            panel.statusArea.quickSettings.addExternalIndicator(this.toggleIndicator);
        }
    }
    /**
     * Disables the touchpad toggle indicator in the quick settings.
     * Destroys the associated quick settings items and the indicator itself.
     */
    disableToggleIndicator() {
        if (this.toggleIndicator) {
            // Stop listening to the touchpad switcher.
            this.toggleIndicator.quickSettingsItems[0].disconnect(this.listenerTouchpadToggle);
            this.listenerTouchpadToggle = null;
            this.toggleIndicator.quickSettingsItems.forEach((item) => item.destroy());
            this.toggleIndicator.destroy();
            this.toggleIndicator = null;
        }
    }
    /**
     * Enables the icon indicator in the status area.
     * Creates a new IconIndicator and adds it to the status area.
     */
    enableIconIndicator() {
        if (!this.iconIndicator) {
            this.iconIndicator = new IconIndicator();
            panel.statusArea.quickSettings.addExternalIndicator(this.iconIndicator);
            this.iconIndicator.updateState(this.getTouchpadState());
        }
    }
    /**
     * Disables the icon indicator in the status area.
     * Destroys the associated quick settings items and the indicator itself.
     */
    disableIconIndicator() {
        if (this.iconIndicator) {
            this.iconIndicator.quickSettingsItems.forEach((item) => item.destroy());
            this.iconIndicator.destroy();
            this.iconIndicator = null;
        }
    }
}
