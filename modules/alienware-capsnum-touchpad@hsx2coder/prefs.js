import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CapsNumTouchpadPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        window.add(page);

        // ── Indicator Behavior group ──
        const indicatorGroup = new Adw.PreferencesGroup({
            title: 'Indicator Behavior',
            description: 'Configure how the Caps Lock and Num Lock indicators are displayed.',
        });
        page.add(indicatorGroup);

        const createSwitchRow = (title, subtitle, key) => {
            const row = new Adw.ActionRow({ title, subtitle });
            const toggle = new Gtk.Switch({
                active: settings.get_boolean(key),
                valign: Gtk.Align.CENTER,
            });
            settings.bind(key, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
            row.add_suffix(toggle);
            row.activatable_widget = toggle;
            return row;
        };

        indicatorGroup.add(createSwitchRow('Show Caps Lock', 'Display the Caps Lock indicator in the top panel.', 'show-caps-lock'));
        indicatorGroup.add(createSwitchRow('Show Num Lock', 'Display the Num Lock indicator in the top panel.', 'show-num-lock'));
        indicatorGroup.add(createSwitchRow('Hide when inactive', 'Hide the indicator completely when the lock is turned off.', 'hide-when-off'));

        // ── Touchpad group ──
        const touchpadGroup = new Adw.PreferencesGroup({
            title: 'Touchpad Switcher',
            description: 'Configure Touchpad Switcher behavior.',
        });
        page.add(touchpadGroup);

        const showIndicator = new Adw.SwitchRow({
            title: 'Show indicator',
            subtitle: 'Whether to show the touchpad panel indicator',
        });
        touchpadGroup.add(showIndicator);
        settings.bind('show-indicator', showIndicator, 'active', Gio.SettingsBindFlags.DEFAULT);

        const showNotifications = new Adw.SwitchRow({
            title: 'Show notifications',
            subtitle: 'Show OSD notification when toggling touchpad, Caps Lock or Num Lock',
        });
        touchpadGroup.add(showNotifications);
        settings.bind('show-notifications', showNotifications, 'active', Gio.SettingsBindFlags.DEFAULT);

        const shortcutEntry = new Adw.EntryRow({
            title: 'Shortcut (e.g. <Super>Insert, XF86TouchpadToggle)',
        });

        let currentShortcuts = settings.get_strv('toggle-shortcut');
        shortcutEntry.text = currentShortcuts.join(', ');

        shortcutEntry.connect('notify::text', () => {
            const arr = shortcutEntry.text.split(',').map(s => s.trim()).filter(s => s.length > 0);
            settings.set_strv('toggle-shortcut', arr);
        });

        settings.connect('changed::toggle-shortcut', () => {
            const newArr = settings.get_strv('toggle-shortcut');
            const newText = newArr.join(', ');
            if (shortcutEntry.text !== newText)
                shortcutEntry.text = newText;
        });

        touchpadGroup.add(shortcutEntry);

        return Promise.resolve();
    }
}
