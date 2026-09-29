import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { SystemIndicator, QuickMenuToggle } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { Ornament, PopupImageMenuItem } from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { PanelHost } from '../../../../alienware-topbar@hsx2coder/subsystems/panel/host.js';

// ── Touchpad types ──
const TOUCHPAD_SCHEMA = 'org.gnome.desktop.peripherals.touchpad';
const SEND_EVENTS_DISABLED = 'disabled';
const SEND_EVENTS_DISABLED_ON_EXTERNAL_MOUSE = 'disabled-on-external-mouse';
const SEND_EVENTS_ENABLED = 'enabled';

const TouchpadState = Object.freeze({
    Disabled: 0,
    MouseOnly: 1,
    Enabled: 2,
});

// ── Combined Notification ──
const NotificationWidget = GObject.registerClass(
    class NotificationWidget extends St.BoxLayout {
        _init() {
            super._init({
                style_class: 'osd-window capsnum-notification',
                vertical: false,
                opacity: 0,
                visible: false,
            });

            this._icon = new St.Icon({
                icon_name: 'changes-prevent-symbolic',
                icon_size: 24,
                style_class: 'capsnum-notification-icon',
            });

            this._label = new St.Label({
                text: '',
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'capsnum-notification-label',
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
                const mon = Main.layoutManager.primaryMonitor;
                const x = mon.x + mon.width - this.width - 20;
                const y = mon.y + Main.panel.height + 20;
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
                                onComplete: () => this.hide(),
                            });
                            return GLib.SOURCE_REMOVE;
                        });
                    },
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

// ── Caps/Num Lock Indicator ──
const CapsNumIndicator = GObject.registerClass(
    class CapsNumIndicator extends PanelMenu.Button {
        _init(settings) {
            super._init(0.0, 'Caps/Num Lock Indicator');

            this._settings = settings;
            this._box = new St.BoxLayout({ style_class: 'panel-status-indicators-box' });
            this._capsWidget = null;
            this._numWidget = null;
            this._setupWidgets();
            this.add_child(this._box);

            const seat = Clutter.get_default_backend().get_default_seat();
            this._keymap = seat.get_keymap();
            this.reactive = false;

            this._keymapStateChangedId = this._keymap.connect('state-changed', this._syncState.bind(this));
            this._settingsChangedId = this._settings.connect('changed', this._onSettingsChanged.bind(this));
            this._syncState();
        }

        _setupWidgets() {
            if (this._capsWidget) this._capsWidget.destroy();
            if (this._numWidget) this._numWidget.destroy();

            this._capsWidget = new St.Icon({
                icon_name: 'caps-lock-symbolic',
                style_class: 'system-status-icon capsnum-indicator',
            });
            this._numWidget = new St.Icon({
                icon_name: 'num-lock-symbolic',
                style_class: 'system-status-icon capsnum-indicator',
            });

            this._box.add_child(this._capsWidget);
            this._box.add_child(this._numWidget);
        }

        _onSettingsChanged() {
            this._setupWidgets();
            this._syncState();
        }

        _syncState() {
            const capsState = this._keymap.get_caps_lock_state();
            const numState = this._keymap.get_num_lock_state();
            const showCaps = this._settings.get_boolean('show-caps-lock');
            const showNum = this._settings.get_boolean('show-num-lock');
            const hideWhenOff = this._settings.get_boolean('hide-when-off');

            const updateWidget = (widget, state, show, onIcon, offIcon) => {
                if (show) {
                    if (state) {
                        widget.show();
                        widget.icon_name = onIcon;
                        widget.remove_style_class_name('capsnum-indicator-off');
                        widget.add_style_class_name('capsnum-indicator-on');
                        widget.ease({ opacity: 255, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
                    } else if (hideWhenOff) {
                        widget.ease({
                            opacity: 0, duration: 200, mode: Clutter.AnimationMode.EASE_IN_QUAD,
                            onComplete: () => widget.hide(),
                        });
                    } else {
                        widget.show();
                        widget.icon_name = offIcon;
                        widget.remove_style_class_name('capsnum-indicator-on');
                        widget.add_style_class_name('capsnum-indicator-off');
                        widget.ease({ opacity: 255, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
                    }
                } else {
                    widget.hide();
                }
            };

            updateWidget(this._capsWidget, capsState, showCaps, 'caps-lock-symbolic', 'caps-lock-off-symbolic');
            updateWidget(this._numWidget, numState, showNum, 'num-lock-symbolic', 'num-lock-off-symbolic');

            if (!this._capsWidget.visible && !this._numWidget.visible)
                this.hide();
            else
                this.show();

            const showNotifications = this._settings.get_boolean('show-notifications');
            if (showNotifications && this._initialized) {
                if (!this._notification)
                    this._notification = new NotificationWidget();
                if (capsState !== this._lastCapsState)
                    this._notification.showNotification(capsState ? 'caps-lock-symbolic' : 'caps-lock-off-symbolic', 'Caps Lock ' + (capsState ? 'ON' : 'OFF'));
                if (numState !== this._lastNumState)
                    this._notification.showNotification(numState ? 'num-lock-symbolic' : 'num-lock-off-symbolic', 'Num Lock ' + (numState ? 'ON' : 'OFF'));
            }

            this._lastCapsState = capsState;
            this._lastNumState = numState;
            this._initialized = true;
        }

        destroy() {
            if (this._keymapStateChangedId) {
                this._keymap.disconnect(this._keymapStateChangedId);
                this._keymapStateChangedId = null;
            }
            if (this._settingsChangedId) {
                this._settings.disconnect(this._settingsChangedId);
                this._settingsChangedId = null;
            }
            if (this._notification) {
                this._notification.destroy();
                this._notification = null;
            }
            super.destroy();
        }
    });

// ── Touchpad Icon (SystemIndicator) ──
const TouchpadIcon = GObject.registerClass({
    GTypeName: 'TouchpadIcon',
}, class TouchpadIcon extends SystemIndicator {
    constructor() {
        super();
        this.icon = this._addIndicator();
    }

    updateState(state) {
        const icons = {
            [TouchpadState.Disabled]: 'touchpad-disabled-symbolic',
            [TouchpadState.MouseOnly]: 'input-mouse-symbolic',
            [TouchpadState.Enabled]: 'input-touchpad-symbolic',
        };
        this.icon.icon_name = icons[state] || 'input-touchpad-symbolic';
    }
});

// ── Touchpad Quick Toggle ──
const TOGGLE_UNCHECKED_DISABLED = 'Disabled';
const TOGGLE_UNCHECKED_MOUSE = 'Off with external mouse';
const TOGGLE_CHECKED_ENABLED = 'Enabled';

const TouchpadToggle = GObject.registerClass({
    GTypeName: 'TouchpadToggle',
    Signals: {
        'state-updated': { param_types: [GObject.TYPE_INT] },
    },
}, class TouchpadToggle extends QuickMenuToggle {
    constructor() {
        super({
            title: 'Touchpad',
            subtitle: '',
            iconName: 'input-touchpad-symbolic',
            toggleMode: true,
        });

        this.lastDisabledState = TouchpadState.Disabled;
        this.connect('clicked', () => this._switchClicked());

        this.menu.setHeader('input-touchpad-symbolic', 'Touchpad settings');
        this.enabledOption = new PopupImageMenuItem(TOGGLE_CHECKED_ENABLED, 'input-touchpad-symbolic');
        this.enabledOption.connect('activate', () => this.switchTo(TouchpadState.Enabled, true));
        this.disabledOption = new PopupImageMenuItem(TOGGLE_UNCHECKED_DISABLED, 'touchpad-disabled-symbolic');
        this.disabledOption.connect('activate', () => this.switchTo(TouchpadState.Disabled, true));
        this.offWithMouseOption = new PopupImageMenuItem(TOGGLE_UNCHECKED_MOUSE, 'input-mouse-symbolic');
        this.offWithMouseOption.connect('activate', () => this.switchTo(TouchpadState.MouseOnly, true));

        this.menu.addMenuItem(this.enabledOption);
        this.menu.addMenuItem(this.disabledOption);
        this.menu.addMenuItem(this.offWithMouseOption);
    }

    updateState(state) {
        switch (state) {
            case TouchpadState.Disabled:
                this.lastDisabledState === TouchpadState.MouseOnly
                    ? this.switchTo(TouchpadState.MouseOnly, true)
                    : this.switchTo(TouchpadState.Disabled);
                break;
            case TouchpadState.MouseOnly:
                this.switchTo(TouchpadState.MouseOnly);
                break;
            default:
                this.switchTo(TouchpadState.Enabled);
        }
    }

    _switchClicked() {
        if (this.checked)
            this.switchTo(TouchpadState.Enabled, true);
        else
            this.switchTo(this.lastDisabledState, true);
    }

    switchTo(option, modifySettingsState = false) {
        this.enabledOption.setOrnament(option === TouchpadState.Enabled ? Ornament.CHECK : Ornament.NONE);
        this.disabledOption.setOrnament(option === TouchpadState.Disabled ? Ornament.CHECK : Ornament.NONE);
        this.offWithMouseOption.setOrnament(option === TouchpadState.MouseOnly ? Ornament.CHECK : Ornament.NONE);

        switch (option) {
            case TouchpadState.Disabled:
                this.subtitle = TOGGLE_UNCHECKED_DISABLED;
                this.iconName = 'touchpad-disabled-symbolic';
                this.checked = false;
                this.lastDisabledState = TouchpadState.Disabled;
                break;
            case TouchpadState.MouseOnly:
                this.subtitle = TOGGLE_UNCHECKED_MOUSE;
                this.iconName = 'input-mouse-symbolic';
                this.checked = false;
                this.lastDisabledState = TouchpadState.MouseOnly;
                break;
            default:
                this.subtitle = TOGGLE_CHECKED_ENABLED;
                this.iconName = 'input-touchpad-symbolic';
                this.checked = true;
        }

        if (modifySettingsState)
            this.emit('state-updated', option);
    }
});

// ── Main Extension ──
export default class CapsNumTouchpadExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        // Caps/Num indicator
        this._capsnumIndicator = new CapsNumIndicator(this._settings);
        PanelHost.addStatusItem('capsnum-indicator', this._capsnumIndicator, 1, 'right');

        // Touchpad keybinding
        Main.wm.addKeybinding(
            'toggle-shortcut',
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL,
            () => this._toggleTouchpad(),
        );

        // Touchpad quick toggle
        this._touchpadSettings = new Gio.Settings({ schema_id: TOUCHPAD_SCHEMA });
        this._enableTouchpadToggle();

        // Touchpad icon indicator
        if (this._settings.get_boolean('show-indicator'))
            this._enableTouchpadIcon();

        // Listeners
        this._touchpadStateId = this._touchpadSettings.connect('changed::send-events', () => this._onTouchpadStateChange());
        this._showIndicatorId = this._settings.connect('changed::show-indicator', () => {
            this._settings.get_boolean('show-indicator') ? this._enableTouchpadIcon() : this._disableTouchpadIcon();
        });

        this._onTouchpadStateChange();
    }

    disable() {
        Main.wm.removeKeybinding('toggle-shortcut');

        if (this._capsnumIndicator) {
            this._capsnumIndicator.destroy();
            this._capsnumIndicator = null;
        }
        if (this._notification) {
            this._notification.destroy();
            this._notification = null;
        }

        this._disableTouchpadToggle();
        this._disableTouchpadIcon();

        if (this._touchpadStateId) {
            this._touchpadSettings.disconnect(this._touchpadStateId);
            this._touchpadStateId = null;
        }
        if (this._showIndicatorId) {
            this._settings.disconnect(this._showIndicatorId);
            this._showIndicatorId = null;
        }

        this._touchpadSettings = null;
        this._settings = null;
    }

    _getTouchpadState() {
        const se = this._touchpadSettings.get_string('send-events');
        if (se === SEND_EVENTS_DISABLED) return TouchpadState.Disabled;
        if (se === SEND_EVENTS_DISABLED_ON_EXTERNAL_MOUSE) return TouchpadState.MouseOnly;
        return TouchpadState.Enabled;
    }

    _setTouchpadState(state) {
        const map = {
            [TouchpadState.Disabled]: SEND_EVENTS_DISABLED,
            [TouchpadState.MouseOnly]: SEND_EVENTS_DISABLED_ON_EXTERNAL_MOUSE,
            [TouchpadState.Enabled]: SEND_EVENTS_ENABLED,
        };
        this._touchpadSettings.set_string('send-events', map[state]);
    }

    _toggleTouchpad() {
        const state = this._getTouchpadState();
        this._setTouchpadState(state === TouchpadState.Enabled ? TouchpadState.Disabled : TouchpadState.Enabled);
    }

    _onTouchpadStateChange() {
        const state = this._getTouchpadState();

        if (this._touchpadIcon)
            this._touchpadIcon.updateState(state);

        if (this._touchpadToggle)
            this._touchpadToggle.updateState(state);

        if (this._settings.get_boolean('show-notifications')) {
            if (!this._notification)
                this._notification = new NotificationWidget();
            const isOn = state === TouchpadState.Enabled;
            this._notification.showNotification(
                isOn ? 'input-touchpad-symbolic' : 'touchpad-disabled-symbolic',
                'Touchpad ' + (isOn ? 'ON' : 'OFF'),
            );
        }
    }

    _enableTouchpadToggle() {
        if (this._touchpadToggle) return;

        this._touchpadToggle = new TouchpadToggle();
        this._touchpadToggle.updateState(this._getTouchpadState());

        this._toggleUpdateId = this._touchpadToggle.connect('state-updated', (_, state) => {
            this._setTouchpadState(state);
        });

        this._toggleIndicator = new SystemIndicator();
        this._toggleIndicator.quickSettingsItems.push(this._touchpadToggle);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._toggleIndicator);
    }

    _disableTouchpadToggle() {
        if (!this._touchpadToggle) return;

        this._touchpadToggle.disconnect(this._toggleUpdateId);
        this._toggleUpdateId = null;

        this._toggleIndicator.quickSettingsItems.forEach(i => i.destroy());
        this._toggleIndicator.destroy();
        this._toggleIndicator = null;
        this._touchpadToggle = null;
    }

    _enableTouchpadIcon() {
        if (this._touchpadIcon) return;

        this._touchpadIcon = new TouchpadIcon();
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._touchpadIcon);
        this._touchpadIcon.updateState(this._getTouchpadState());
    }

    _disableTouchpadIcon() {
        if (!this._touchpadIcon) return;

        this._touchpadIcon.quickSettingsItems.forEach(i => i.destroy());
        this._touchpadIcon.destroy();
        this._touchpadIcon = null;
    }
}
