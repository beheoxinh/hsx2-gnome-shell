import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CapsNumTouchpadPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const s = new Settings(this.getSettings());
        window.set_default_size(720, 500);

        const tabs = [
            {title: 'Indicator',  iconName: 'input-keyboard-symbolic',  groups: [s.indicator]},
            {title: 'Touchpad',   iconName: 'input-mouse-symbolic',     groups: [s.touchpad]},
        ];
        for (const {title, iconName, groups} of tabs) {
            const page = new Adw.PreferencesPage({title, icon_name: iconName});
            groups.forEach(g => page.add(g));
            window.add(page);
        }
    }
}

class Settings {
    constructor(schema) {
        this.schema = schema;

        // ── Indicator ──
        this.showCapsLock = new Adw.SwitchRow({
            title: 'Show Caps Lock Indicator',
            subtitle: 'Display the Caps Lock indicator in the top panel.',
        });
        this.showNumLock = new Adw.SwitchRow({
            title: 'Show Num Lock Indicator',
            subtitle: 'Display the Num Lock indicator in the top panel.',
        });
        this.hideWhenOff = new Adw.SwitchRow({
            title: 'Hide When Inactive',
            subtitle: 'Hide the indicator completely when the lock is off instead of dimming it.',
        });
        this.showNotifications = new Adw.SwitchRow({
            title: 'Show Notifications',
            subtitle: 'Display OSD notification when toggling touchpad, Caps Lock or Num Lock.',
        });
        this.indicator = new Adw.PreferencesGroup({title: 'Lock Indicators', description: 'Show or hide Caps Lock and Num Lock indicators in the panel.'});

        // ── Touchpad ──
        this.showTouchpadIndicator = new Adw.SwitchRow({
            title: 'Show Touchpad Indicator',
            subtitle: 'Show the touchpad panel indicator.',
        });
        this.touchpad = new Adw.PreferencesGroup({title: 'Touchpad', description: 'Touchpad indicator and shortcut settings.'});

        // Shortcut row
        this.shortcutRow = new Adw.ActionRow({
            title: 'Toggle Shortcut',
            subtitle: 'Keyboard shortcut to toggle the touchpad on/off.',
        });
        this.shortcutBtn = new Gtk.Button({
            label: this.#formatShortcut(schema.get_strv('toggle-shortcut')),
            valign: Gtk.Align.CENTER,
        });
        this.shortcutBtn.connect('clicked', () => this.#startShortcutCapture());
        this.shortcutRow.add_suffix(this.shortcutBtn);
        this.shortcutRow.activatable_widget = this.shortcutBtn;
        this.touchpad.add(this.shortcutRow);

        // ── Assemble ──
        for (const w of [
            this.showCapsLock, this.showNumLock, this.hideWhenOff, this.showNotifications,
        ]) this.indicator.add(w);

        this.touchpad.add(this.showTouchpadIndicator);

        // ── Bind ──
        this.schema.bind('show-caps-lock', this.showCapsLock, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('show-num-lock', this.showNumLock, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('hide-when-off', this.hideWhenOff, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('show-notifications', this.showNotifications, 'active', Gio.SettingsBindFlags.DEFAULT);
        this.schema.bind('show-indicator', this.showTouchpadIndicator, 'active', Gio.SettingsBindFlags.DEFAULT);
    }

    #formatShortcut(strv) {
        if (!strv || strv.length === 0) return 'Disabled';
        return strv.join(', ');
    }

    #startShortcutCapture() {
        const origLabel = this.shortcutBtn.label;
        this.shortcutBtn.label = 'Enter shortcut…';
        this.shortcutBtn.sensitive = false;

        const controller = new Gtk.EventControllerKey();
        this.shortcutBtn.add_controller(controller);

        const connId = controller.connect('key-pressed', (_ec, keyval, _keycode, mask) => {
            mask &= Gtk.accelerator_get_default_mod_mask();

            if (mask === 0 && keyval === Gdk.KEY_Escape) {
                this.shortcutBtn.label = origLabel;
                controller.disconnect(connId);
                this.shortcutBtn.sensitive = true;
                return Gdk.EVENT_STOP;
            }
            if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
                this.schema.set_strv('toggle-shortcut', []);
                this.shortcutBtn.label = 'Disabled';
                controller.disconnect(connId);
                this.shortcutBtn.sensitive = true;
                return Gdk.EVENT_STOP;
            }

            const shortcut = Gtk.accelerator_name_with_keycode(null, keyval, _keycode, mask);
            this.schema.set_strv('toggle-shortcut', [shortcut]);
            this.shortcutBtn.label = shortcut;
            controller.disconnect(connId);
            this.shortcutBtn.sensitive = true;
            return Gdk.EVENT_STOP;
        });
    }
}
