/**
 * Preferences for alienware-advanced-media-controller.
 *
 * The three pages are the ones the module used to expose through a button in
 * the dash-to-panel preferences window.
 */

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {SplitPreferencesView} from '../../lib/ui/splitPrefsView.js';

import {buildGeneralPage} from './ui/generalPage.js';
import {buildPopupPage} from './ui/popupPage.js';
import {buildAppearancePage} from './ui/appearancePage.js';

export default class AdvancedMediaControllerPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        SplitPreferencesView.renderFromPages(dummyWin => {
            dummyWin.add(buildGeneralPage(settings));
            dummyWin.add(buildPopupPage(settings));
            dummyWin.add(buildAppearancePage(settings));
        }, window, 'Advanced Media Controller');
    }
}
