/**
 * Preferences for alienware-advanced-media-controller.
 *
 * The three pages are the ones the module used to expose through a button in
 * the dash-to-panel preferences window.
 */

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {SplitPreferencesView} from '../../../lib/ui/splitPrefsView.js';

import {buildGeneralPage} from './ui/generalPage.js';
import {buildPopupPage} from './ui/popupPage.js';
import {buildAppearancePage} from './ui/appearancePage.js';
import {buildLyricsPage} from './ui/lyricsPage.js';
import {buildPlayerFilterPage} from './ui/playerFilterPage.js';

export default class AdvancedMediaControllerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const mediaPages = [
            { id: 'media_general', title: 'General', iconName: 'preferences-system-symbolic', page: buildGeneralPage(settings) },
            { id: 'media_popup', title: 'Popup', iconName: 'view-paged-symbolic', page: buildPopupPage(settings) },
            { id: 'media_appearance', title: 'Appearance', iconName: 'applications-graphics-symbolic', page: buildAppearancePage(settings) },
            { id: 'media_lyrics', title: 'Lyrics', iconName: 'audio-x-generic-symbolic', page: buildLyricsPage(settings) },
            { id: 'media_filter', title: 'Player Filter', iconName: 'edit-find-symbolic', page: buildPlayerFilterPage(settings) },
        ];

        const split = new SplitPreferencesView({
            title: 'Media Player',
            sections: mediaPages,
        });
        split.attachToWindow(window);
    }
}
