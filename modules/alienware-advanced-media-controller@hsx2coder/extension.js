/**
 * alienware-advanced-media-controller
 *
 * Split out of the dash-to-panel module, which had been carrying a second
 * product in media/ (12k LOC) behind its own schema and its own prefs imports.
 * It now has its own uuid, enable key and directory, so the two can be enabled
 * independently.
 */

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import MediaControllerExtension from './MediaController.js';

export default class AdvancedMediaControllerExtension extends Extension {
    #settings = null;
    #media = null;

    enable() {
        this.#settings = this.getSettings();
        this.#media = new MediaControllerExtension(this.#settings, this.path);
        this.#media.enable();
    }

    disable() {
        this.#media?.disable();
        this.#media = null;
        this.#settings = null;
    }
}
