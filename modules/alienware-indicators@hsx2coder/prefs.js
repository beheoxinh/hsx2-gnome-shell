import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import AppIndicatorPrefs from './subsystems/appindicator/prefs.js';
import CapsNumTouchpadPrefs from './subsystems/capsnum-touchpad/prefs.js';

export default class IndicatorsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(720, 600);

        // AppIndicator page
        const appindMeta = {
            ...this.metadata,
            uuid: this.uuid,
            dir: this.dir,
            path: this.path,
            'settings-schema': 'org.gnome.shell.extensions.indicators-appindicator',
        };
        const appindPrefs = new AppIndicatorPrefs(appindMeta);
        appindPrefs.fillPreferencesWindow(window);

        // CapsNum+Touchpad page
        const capsMeta = {
            ...this.metadata,
            uuid: this.uuid,
            dir: this.dir,
            path: this.path,
            'settings-schema': 'org.gnome.shell.extensions.capsnum-touchpad',
        };
        const capsPrefs = new CapsNumTouchpadPrefs(capsMeta);
        capsPrefs.fillPreferencesWindow(window);
    }
}
