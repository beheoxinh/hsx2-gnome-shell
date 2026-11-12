import {
  gettext as _,
  InjectionManager,
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
      // DtP schema can be found directly in sibling or parent
      let schemaDir = GLib.build_filenamev([this._path, '..', 'schemas']);
      if (!GLib.file_test(schemaDir, GLib.FileTest.IS_DIR)) {
        schemaDir = GLib.build_filenamev([
          this._path, '..', 'alienware-dash-to-panel@hsx2coder', 'schemas'
        ]);
      }
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
    // Destroy any indicator left over from a previous enable() that was never
    // fully torn down. An orphaned indicator keeps its MPRIS manager alive and
    // fires callbacks into disposed actors forever (the
    // "has been already disposed" storm seen after a lock/logout cycle).
    this._enabled = false;
    if (this._indicator) {
      try { this._indicator.destroy(); } catch (_e) {}
    }
    this._indicator = null;
    this._indicatorDestroyId = 0;
    this._addedToDTP = false;
    this._enabled = true;

    this._repositionDebounceId = null;
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
    // Block every late signal handler before any teardown: a 'panels-created'
    // emission that arrives mid-teardown must not build a new indicator on a
    // controller that is already disabled (that orphan then survives the
    // whole session with a live MPRIS manager).
    this._enabled = false;

    if (this._hideDefaultChangedId && this._settings) {
      try {
        this._settings.disconnect(this._hideDefaultChangedId);
      } catch (_e) {}
      this._hideDefaultChangedId = null;
    }

    this._removeFromDTP();

    if (this._dtpPanelsId) {
      // Unconditional: gating on global.dashToPanel leaked the connection when
      // the dash-to-panel module was already gone, so 'panels-created' fired
      // into this dead controller later.
      try {
        global.dashToPanel?.disconnect(this._dtpPanelsId);
      } catch (_e) {}
      this._dtpPanelsId = 0;
    }
    if (this._dtpChangedId) {
      try {
        this._dtpSettings?.disconnect(this._dtpChangedId);
      } catch (_e) {}
      this._dtpChangedId = 0;
    }

    this._applyHideDefaultPlayer(false);
    if (this._indicatorDestroyId && this._indicator) {
      this._indicator.disconnect(this._indicatorDestroyId);
      this._indicatorDestroyId = 0;
    }
    if (this._indicator) {
      try { this._indicator.destroy(); } catch (_) {}
      this._indicator = null;
    }

    this._updateDefaultPlayerVisibility(true);

    this._settings = null;
    this._dtpSettings = null;
    this._injectionManager = null;
  }

  _addToPanel() {
    if (global.dashToPanel && global.dashToPanel.panels && global.dashToPanel.panels.length > 0) {
      this._addToDTP();
    }
    if (global.dashToPanel && !this._dtpPanelsId) {
      this._dtpPanelsId = global.dashToPanel.connect('panels-created', () => {
        if (this._enabled) this._addToDTP();
      });
    }
  }

  _showForDtPSettings() {
    if (this._dtpSettings && !this._dtpSettings.get_boolean('show-media-player'))
      return false;
    return true;
  }

  _addToDTP() {
    if (!this._enabled) return;
    if (!global.dashToPanel || !global.dashToPanel.panels) return;
    if (!this._showForDtPSettings()) return;

    // Drop a reference to an indicator disposed behind our back (its actor was
    // destroyed with the panel instead of through disable()). Reusing it throws
    // on every property access and leaks the MPRIS manager.
    if (this._indicator) {
      let alive = true;
      try { this._indicator.get_parent(); } catch (_e) { alive = false; }
      if (!alive) {
        this._indicator = null;
        this._indicatorDestroyId = 0;
        this._addedToDTP = false;
      }
    }

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

    const box = panel._rightBox || panel._centerBox;
    if (!box) return;

    const parent = this._indicator.get_parent();
    if (parent === box) return;

    if (parent) parent.remove_child(this._indicator);

    box.add_child(this._indicator);
    this._addedToDTP = true;
    this._indicator.show();
  }

  _removeFromDTP() {
    if (!this._addedToDTP || !this._indicator) return;

    try {
      const parent = this._indicator.get_parent();
      if (parent) parent.remove_child(this._indicator);
    } catch (_e) {
      // The actor was disposed with the panel already; nothing left to detach.
    }
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
