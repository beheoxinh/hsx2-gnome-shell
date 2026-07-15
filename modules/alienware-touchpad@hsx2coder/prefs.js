import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import { ExtensionPreferences, gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
const PREFS_WINDOW_TITLE = _('prefs.window.title', 'Touchpad switcher preferences');
const PREFS_WINDOW_ICON = 'input-touchpad-symbolic';
const PREFS_GROUP_APPEARANCE_TITLE = _('prefs.group.appearance.title', 'Appearance');
const PREFS_GROUP_APPEARANCE_DESCRIPTION = _('prefs.group.appearance.description', 'Configure the appearance of Touchpad Switcher');
const PREFS_SHOW_INDICATOR_TITLE = _('prefs.show_indicator.title', 'Show indicator');
const PREFS_SHOW_INDICATOR_SUBTITLE = _('prefs.show_indicator.subtitle', 'Whether to show the panel indicator');
// const PREFS_SHOW_INDICATOR_ICON = '';
/**
 * TouchpadExtensionPreferences class
 * Manages the preferences window for the extension. This class fills the window with relevant settings UI.
 */
export default class TouchpadExtensionPreferences extends ExtensionPreferences {
    /**
     * Fills the preferences window with the extension's settings.
     * Creates a preferences page with general settings and binds a switch for showing the touchpad indicator.
     *
     * @param window - The preferences window object from Adw.PreferencesWindow.
     * @returns A Promise that resolves once the window is filled.
     */
    fillPreferencesWindow(window) {
        // Create a preferences page with a title and icon.
        const page = new Adw.PreferencesPage({
            title: PREFS_WINDOW_TITLE(),
            icon_name: PREFS_WINDOW_ICON,
        });
        window.add(page);
        // Create a appearance settings group with a title and description.
        const generalGroup = new Adw.PreferencesGroup({
            title: PREFS_GROUP_APPEARANCE_TITLE(),
            description: PREFS_GROUP_APPEARANCE_DESCRIPTION(),
        });
        page.add(generalGroup);
        // Create a switch for showing the touchpad indicator in the UI.
        const showIndicator = new Adw.SwitchRow({
            title: PREFS_SHOW_INDICATOR_TITLE(),
            // icon_name: PREFS_SHOW_INDICATOR_ICON,
            subtitle: PREFS_SHOW_INDICATOR_SUBTITLE(),
        });
        generalGroup.add(showIndicator);

        const showNotifications = new Adw.SwitchRow({
            title: _('prefs.show_notifications.title', 'Show notifications')(),
            subtitle: _('prefs.show_notifications.subtitle', 'Show OSD notification when toggling touchpad')(),
        });
        generalGroup.add(showNotifications);

        // Bind the 'show-indicator' setting to the switch control.
        window.gSettings = this.getSettings();
        window.gSettings.bind('show-indicator', showIndicator, 'active', Gio.SettingsBindFlags.DEFAULT);
        window.gSettings.bind('show-notifications', showNotifications, 'active', Gio.SettingsBindFlags.DEFAULT);

        // Add an EntryRow for shortcuts
        const shortcutEntry = new Adw.EntryRow({
            title: _('prefs.shortcut.title', 'Shortcut (e.g. <Super>Insert, XF86TouchpadToggle)')(),
        });
        
        let currentShortcuts = window.gSettings.get_strv('toggle-shortcut');
        shortcutEntry.text = currentShortcuts.join(', ');
        
        shortcutEntry.connect('notify::text', () => {
            let val = shortcutEntry.text;
            let arr = val.split(',').map(s => s.trim()).filter(s => s.length > 0);
            window.gSettings.set_strv('toggle-shortcut', arr);
        });
        
        window.gSettings.connect('changed::toggle-shortcut', () => {
            let newArr = window.gSettings.get_strv('toggle-shortcut');
            let newText = newArr.join(', ');
            if (shortcutEntry.text !== newText) {
                shortcutEntry.text = newText;
            }
        });
        
        generalGroup.add(shortcutEntry);

        return Promise.resolve();
    }
}
function _(id, defaultValue) {
    return () => {
        const translated = gettext(id);
        return translated !== id ? translated : defaultValue;
    };
}
