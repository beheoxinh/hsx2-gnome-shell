import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import CapsNumTouchpadPrefs from './modules/alienware-capsnum-touchpad@hsx2coder/prefs.js';
import ClipboardIndicatorPrefs from './modules/alienware-clipboard-indicator@tudmotu.com/prefs.js';
import DashToPanelPrefs from './modules/alienware-dash-to-panel@jderose9.github.com/prefs.js';
import DingPrefs from './modules/alienware-desktop-enable-gnome@rastersoft.com/prefs.js';
import JustPerfectionPrefs from './modules/alienware-just-perfection-desktop@just-perfection/prefs.js';
import SystemMonitorPrefs from './modules/alienware-monitor@mgalgs.github.com/prefs.js';
import NotificationConfiguratorPrefs from './modules/alienware-notification-configurator@exposedcat/prefs.js';
import TopbarClonePrefs from './modules/alienware-topbar-clone@hsx2coder/prefs.js';
import MediaControllerPrefs from './modules/alienware-advanced-media-controller@sanjai.com/prefs.js';
import CommandMenu2Prefs from './modules/alienware-command-menu2@goldentree1.github.com/prefs.js';

import {MODULES, buildSubMetadata} from './modules.js';

const PREFS_REGISTRY = {
    'alienware-capsnum-touchpad@hsx2coder': CapsNumTouchpadPrefs,
    'alienware-clipboard-indicator@tudmotu.com': ClipboardIndicatorPrefs,
    'alienware-dash-to-panel@jderose9.github.com': DashToPanelPrefs,
    'alienware-desktop-enable-gnome@rastersoft.com': DingPrefs,
    'alienware-just-perfection-desktop@just-perfection': JustPerfectionPrefs,
    'alienware-monitor@mgalgs.github.com': SystemMonitorPrefs,
    'alienware-notification-configurator@exposedcat': NotificationConfiguratorPrefs,
    'alienware-topbar-clone@hsx2coder': TopbarClonePrefs,
    'alienware-advanced-media-controller@sanjai.com': MediaControllerPrefs,
    'alienware-command-menu2@goldentree1.github.com': CommandMenu2Prefs,
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
                'Master switches for every aggregated module. ' +
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
                subtitle: def.uuid,
                icon_name: def.iconName,
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

        const subWindow = new Adw.PreferencesWindow({
            transient_for: parent,
            modal: true,
            title: def.title,
            search_enabled: true,
        });
        subWindow.set_default_size(820, 720);

        const restoreShim = this._installLookupShim(def.uuid, subPrefs);
        subWindow.connect('close-request', () => {
            restoreShim();
            return false;
        });

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
            restoreShim();
            subWindow.destroy();
            return;
        }

        subWindow.present();
    }

    _installLookupShim(uuid, subPrefs) {
        const orig = ExtensionPreferences.lookupByUUID.bind(ExtensionPreferences);
        ExtensionPreferences.lookupByUUID = function (queryUuid) {
            if (queryUuid === uuid)
                return subPrefs;
            return orig(queryUuid);
        };
        return () => {
            if (ExtensionPreferences.lookupByUUID !== orig)
                ExtensionPreferences.lookupByUUID = orig;
        };
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
