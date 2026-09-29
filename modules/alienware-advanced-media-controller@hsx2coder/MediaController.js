import {
  gettext as _,
} from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import { MediaIndicator } from "./utils/indicator.js";
import * as Mpris from "resource:///org/gnome/shell/ui/mpris.js";

export default class MediaController {
  constructor(settings, path) {
    this._settings = settings;
    this._path = path;
    this._dtpSettings = this._loadDtPSettings();
    this._hideDefaultChangedId = null;
    this._injectionManager = null;
    this._dtpPanelsId = 0;
    this._dtpChangedId = 0;
    this._addedToDTP = false;
    this._indicatorDestroyId = 0;
  }

  _loadDtPSettings() {
    try {
      const GioSSS = Gio.SettingsSchemaSource;
      // the dash-to-panel schema lives in the sibling module directory
      const schemaDir = GLib.build_filenamev([
        this._path, '..', 'alienware-dash-to-panel@hsx2coder', 'schemas'
      ]);
      if (GLib.file_test(schemaDir, GLib.FileTest.IS_DIR)) {
        const schemaSource = GioSSS.new_from_directory(
          schemaDir, GioSSS.get_default(), false
        );
        const schemaObj = schemaSource.lookup(
          'org.gnome.shell.extensions.dash-to-panel', true
        );
        if (schemaObj)
          return new Gio.Settings({settings_schema: schemaObj});
      }
    } catch (e) {
      logError(e, 'Failed to load DtP settings');
    }
    return null;
  }

  enable() {
    this._repositionDebounceId = null;
    this._settingsChangedId = 0;
    this._hideDefaultChangedId = null;
    this._injectionManager = null;
    this._dtpPanelsId = 0;
    this._dtpChangedId = 0;
    this._addedToDTP = false;
    this._indicatorDestroyId = 0;

    this._indicator = new MediaIndicator(this._settings, this);
    this._indicatorDestroyId = this._indicator.connect('destroy', () => {
      this._addedToDTP = false;
      this._indicator = null;
      this._indicatorDestroyId = 0;
    });
    this._addToPanel();

    this._applyHideDefaultPlayer(
      this._settings.get_boolean("hide-default-player"),
    );

    this._hideDefaultChangedId = this._settings.connect(
      "changed::hide-default-player",
      () => {
        this._applyHideDefaultPlayer(
          this._settings.get_boolean("hide-default-player"),
        );
        this._updateDefaultPlayerVisibility();
      },
    );

    this._updateDefaultPlayerVisibility();

    if (this._dtpSettings) {
      this._dtpChangedId = this._dtpSettings.connect(
        'changed::show-media-player', () => {
          if (this._dtpSettings.get_boolean('show-media-player'))
            this._addToDTP();
          else
            this._removeFromDTP();
        }
      );
    }
  }

  disable() {
    if (this._hideDefaultChangedId) {
      this._settings.disconnect(this._hideDefaultChangedId);
      this._hideDefaultChangedId = null;
    }

    this._removeFromDTP();

    if (this._dtpPanelsId && global.dashToPanel) {
      global.dashToPanel.disconnect(this._dtpPanelsId);
      this._dtpPanelsId = 0;
    }
    if (this._dtpChangedId && this._dtpSettings) {
      this._dtpSettings.disconnect(this._dtpChangedId);
      this._dtpChangedId = 0;
    }

    this._applyHideDefaultPlayer(false);
    if (this._indicatorDestroyId && this._indicator) {
      this._indicator.disconnect(this._indicatorDestroyId);
      this._indicatorDestroyId = 0;
    }
    this._indicator.destroy();
    this._indicator = null;

    this._updateDefaultPlayerVisibility(true);

    this._settings = null;
    this._dtpSettings = null;
    this._injectionManager = null;
  }

  _addToPanel() {
    if (global.dashToPanel && global.dashToPanel.panels && global.dashToPanel.panels.length > 0) {
      this._addToDTP();
    } else if (global.dashToPanel) {
      this._dtpPanelsId = global.dashToPanel.connect('panels-created', () => {
        this._dtpPanelsId = 0;
        this._addToDTP();
      });
      this._indicator.hide();
    }
  }

  _showForDtPSettings() {
    if (this._dtpSettings && !this._dtpSettings.get_boolean('show-media-player'))
      return false;
    return true;
  }

  _addToDTP() {
    if (!global.dashToPanel || !global.dashToPanel.panels) return;
    if (!this._showForDtPSettings()) return;

    if (!this._indicator) {
      this._indicator = new MediaIndicator(this._settings, this);
      this._indicatorDestroyId = this._indicator.connect('destroy', () => {
        this._addedToDTP = false;
        this._indicator = null;
        this._indicatorDestroyId = 0;
      });
    }

    const panel = global.dashToPanel.panels[0];
    if (!panel) return;

    const box = panel._rightBox;
    if (!box) return;

    const parent = this._indicator.get_parent();
    if (parent === box) return;

    if (parent) parent.remove_child(this._indicator);

    box.add_child(this._indicator);
    this._addedToDTP = true;
  }

  _removeFromDTP() {
    if (!this._addedToDTP || !this._indicator) return;

    const parent = this._indicator.get_parent();
    if (parent) parent.remove_child(this._indicator);
    this._addedToDTP = false;
  }

  _applyHideDefaultPlayer(hide) {
    const mediaSection = this._getMediaSection();
    if (mediaSection) mediaSection.visible = !hide;
  }

  _getMediaSection() {
    const messageList = Main.panel.statusArea.dateMenu._messageList;
    return messageList._messageView?._mediaSource ?? messageList._mediaSection;
  }

  _getQuickSettingsMedia() {
    return Main.panel.statusArea.quickSettings._mediaSection;
  }

  _updateDefaultPlayerVisibility(shouldReset = false) {
    if (!this._settings) return;
    const hide = this._settings.get_boolean("hide-default-player");

    const MprisSource = Mpris.MprisSource ?? Mpris.MediaSection;
    const mediaSection = this._getMediaSection();
    const qsMedia = this._getQuickSettingsMedia();

    if (shouldReset || hide === false) {
      if (this._injectionManager) {
        this._injectionManager.clear();
        this._injectionManager = null;
      }
      if (mediaSection) mediaSection._onProxyReady?.();
      if (qsMedia) qsMedia._onProxyReady?.();
      return;
    }

    if (this._injectionManager || !MprisSource) return;

    this._injectionManager = new InjectionManager();
    this._injectionManager.overrideMethod(
      MprisSource.prototype,
      "_addPlayer",
      () => function () {},
    );

    for (const section of [mediaSection, qsMedia]) {
      if (!section || !section._players) continue;
      for (const player of section._players.values()) {
        const busName = player._busName || player.busName;
        if (section._onNameOwnerChanged && busName)
          section._onNameOwnerChanged(null, null, [busName, busName, ""]);
      }
    }
  }
}
