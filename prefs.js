import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

try {
    if (typeof imports !== 'undefined' && imports.package && typeof imports.package.initFormat === 'function') {
        imports.package.initFormat();
    }
} catch (e) {
    // ignore
}

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import TopbarPrefs from './modules/alienware-topbar@hsx2coder/prefs.js';
import DashToPanelPrefs from './modules/alienware-dash-to-panel@hsx2coder/prefs.js';
import DingPrefs from './modules/alienware-desktop-enable-gnome@hsx2coder/prefs.js';
import AdvancedAltTabPrefs from './modules/alienware-advanced-alt-tab@hsx2coder/prefs.js';
import GnomeCustomizerManagerPrefs from './modules/alienware-gnome-customizer-manager@hsx2coder/prefs.js';

import {MODULES, buildSubMetadata} from './modules.js';

const PREFS_REGISTRY = {
    'alienware-topbar@hsx2coder': TopbarPrefs,
    'alienware-dash-to-panel@hsx2coder': DashToPanelPrefs,
    'alienware-desktop-enable-gnome@hsx2coder': DingPrefs,
    'alienware-advanced-alt-tab@hsx2coder': AdvancedAltTabPrefs,
    'alienware-gnome-customizer-manager@hsx2coder': GnomeCustomizerManagerPrefs,
};

export default class AlienwareSuitePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.set_title('Alienware Suite — hsx2coder');
        window.set_default_size(1000, 750);

        const page = new Adw.PreferencesPage({
            title: 'Modules',
            icon_name: 'preferences-system-symbolic',
        });

        const headerGroup = new Adw.PreferencesGroup({
            title: 'Alienware Suite',
            description:
                'Master switches for every module (7 consolidated modules). ' +
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
                title: def.title.replace('&', '&amp;'),
            });

            if (def.iconName) {
                const icon = new Gtk.Image({
                    icon_name: def.iconName,
                    pixel_size: 20,
                    margin_end: 6,
                });
                row.add_prefix(icon);
            }

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
        });
        const aboutIcon = new Gtk.Image({
            icon_name: 'help-about-symbolic',
            pixel_size: 20,
            margin_end: 6,
        });
        aboutRow.add_prefix(aboutIcon);
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
            // Ensure translation lookup resolves sub-extension or suite fallback
            if (!subPrefs.gettext) {
                subPrefs.gettext = str => this.gettext ? this.gettext(str) : str;
                subPrefs.ngettext = (str, p, n) => this.ngettext ? this.ngettext(str, p, n) : (n === 1 ? str : p);
            }
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
            default_width: 1000,
            default_height: 750,
        });
        subWindow.set_default_size(1000, 750);

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
