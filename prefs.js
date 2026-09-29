import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import AdvancedMediaControllerPrefs from './modules/alienware-advanced-media-controller@hsx2coder/prefs.js';
import TopbarPrefs from './modules/alienware-topbar@hsx2coder/prefs.js';
import DashToPanelPrefs from './modules/alienware-dash-to-panel@hsx2coder/prefs.js';
import SystemMonitorPrefs from './modules/alienware-monitor@hsx2coder/prefs.js';
import IndicatorsPrefs from './modules/alienware-indicators@hsx2coder/prefs.js';
import DingPrefs from './modules/alienware-desktop-enable-gnome@hsx2coder/prefs.js';
import AdvancedAltTabPrefs from './modules/alienware-advanced-alt-tab@hsx2coder/prefs.js';
import NotificationConfiguratorPrefs from './modules/alienware-notification-configurator@hsx2coder/prefs.js';
import GnomeCustomizerManagerPrefs from './modules/alienware-gnome-customizer-manager@hsx2coder/prefs.js';

import {MODULES, buildSubMetadata} from './modules.js';

const PREFS_REGISTRY = {
    'alienware-advanced-media-controller@hsx2coder': AdvancedMediaControllerPrefs,
    'alienware-topbar@hsx2coder': TopbarPrefs,
    'alienware-dash-to-panel@hsx2coder': DashToPanelPrefs,
    'alienware-monitor@hsx2coder': SystemMonitorPrefs,
    'alienware-indicators@hsx2coder': IndicatorsPrefs,
    'alienware-desktop-enable-gnome@hsx2coder': DingPrefs,
    'alienware-advanced-alt-tab@hsx2coder': AdvancedAltTabPrefs,
    'alienware-notification-configurator@hsx2coder': NotificationConfiguratorPrefs,
    'alienware-gnome-customizer-manager@hsx2coder': GnomeCustomizerManagerPrefs,
};

export default class AlienwareSuitePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_title('Alienware Suite — hsx2coder');
        window.set_default_size(720, 720);

        const page = new Adw.PreferencesPage({
            title: 'Modules',
            icon_name: 'preferences-system-symbolic',
        });

        const headerGroup = new Adw.PreferencesGroup({
            title: 'Alienware Suite',
            description:
                'Master switches for every module. ' +
                'Open per-module settings with the Configure button.',
        });
        page.add(headerGroup);

        const togglesGroup = new Adw.PreferencesGroup({
            title: 'Modules',
            description:
                'Disabling a module here unloads it immediately on next shell reload. ' +
                'Re-enabling reloads it without restarting the shell.',
        });
        page.add(togglesGroup);

        for (const def of MODULES) {
            const row = new Adw.ActionRow({
                title: def.title,
            });

            const toggle = new Gtk.Switch({
                valign: Gtk.Align.CENTER,
                active: settings.get_boolean(def.enableKey),
            });
            settings.bind(
                def.enableKey,
                toggle,
                'active',
                Gio.SettingsBindFlags.DEFAULT,
            );
            row.add_suffix(toggle);

            if (def.prefsEntry && PREFS_REGISTRY[def.uuid]) {
                const button = new Gtk.Button({
                    icon_name: 'emblem-system-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                    tooltip_text: 'Configure…',
                });
                button.connect('clicked', () =>
                    this._openModuleWindow(window, def),
                );
                row.add_suffix(button);
            }

            row.activatable_widget = toggle;
            togglesGroup.add(row);
        }

        const aboutGroup = new Adw.PreferencesGroup({title: 'About'});
        const aboutRow = new Adw.ActionRow({
            title: 'Alienware Suite',
            subtitle: `${this.metadata.uuid} · v${this.metadata.version}`,
            icon_name: 'help-about-symbolic',
        });
        aboutGroup.add(aboutRow);
        page.add(aboutGroup);

        window.add(page);
    }

    _openModuleWindow(parent, def) {
        const PrefsClass = PREFS_REGISTRY[def.uuid];
        if (!PrefsClass) {
            this._notify(parent, `No preferences UI for ${def.title}`);
            return;
        }

        let subPrefs;
        let subMetadata;
        try {
            subMetadata = buildSubMetadata(this, def);
            subPrefs = new PrefsClass(subMetadata);
        } catch (e) {
            logError(e, `[alienware-suite] cannot construct prefs for ${def.uuid}`);
            this._notify(parent, `Failed to load preferences for ${def.title}`);
            return;
        }

        // Module provides its own window (ViewSwitcher + ViewStack top tabs)
        log(`[alienware-suite] prefs for ${def.uuid}: openPreferences=${typeof subPrefs.openPreferences}`);
        if (typeof subPrefs.openPreferences === 'function') {
            try {
                subPrefs.openPreferences(parent);
            } catch (e) {
                logError(e, `[alienware-suite] openPreferences threw for ${def.uuid}`);
                this._notify(parent, `Preferences failed for ${def.title}`);
            }
            return;
        }

        // Fallback: legacy Adw.PreferencesWindow sub-window
        const subWindow = new Adw.PreferencesWindow({
            transient_for: parent,
            modal: true,
            title: def.title,
            search_enabled: true,
        });
        subWindow.set_default_size(720, 650);

        try {
            const result = subPrefs.fillPreferencesWindow(subWindow);
            if (result && typeof result.then === 'function') {
                result.catch(e =>
                    logError(e, `[alienware-suite] async fill failed for ${def.uuid}`),
                );
            }
        } catch (e) {
            logError(e, `[alienware-suite] fillPreferencesWindow threw for ${def.uuid}`);
            this._notify(parent, `Preferences failed for ${def.title}`);
            subWindow.destroy();
            return;
        }

        subWindow.present();
    }

    _notify(parent, message) {
        const dialog = new Adw.MessageDialog({
            transient_for: parent,
            modal: true,
            heading: 'Alienware Suite',
            body: message,
        });
        dialog.add_response('ok', 'OK');
        dialog.set_default_response('ok');
        dialog.present();
    }
}
