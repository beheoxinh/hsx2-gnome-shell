import St from "gi://St";
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import { ControlButtons } from "./ControlButtons.js";
import { AlbumArt } from "./AlbumArt.js";
import { ProgressSlider } from "./ProgressSlider.js";
import { PlayerTabs } from "./PlayerTabs.js";
import { ScrollingLabel } from "./ScrollingLabel.js";
import {
  POPUP_INFO_CENTER,
  POPUP_TITLE_FONT_SIZE,
  POPUP_TITLE_BOLD,
  POPUP_ARTIST_FONT_SIZE,
  TITLE_SCROLL,
  ARTIST_SCROLL,
} from "../../lib/settingsDefaults.js";

const LOOP_PAUSE_MS = 1200;
const BASE_PX_PER_SEC = 50;

/** @param {Gio.Settings} s @returns {number} */
function _popupWidth(s) {
  try {
    return Math.max(280, s.get_int("popup-width"));
  } catch (_e) {
    return 340;
  }
}

function _titleW(s) {
  return Math.round(_popupWidth(s) * 0.88);
}

function _artistW(s) {
  return Math.round(_popupWidth(s) * 0.82);
}

const INFO_ALIGN = POPUP_INFO_CENTER
  ? Clutter.ActorAlign.CENTER
  : Clutter.ActorAlign.START;
const TITLE_STYLE = `font-size: ${POPUP_TITLE_FONT_SIZE}px; font-weight: ${POPUP_TITLE_BOLD ? "700" : "normal"};`;
const ARTIST_STYLE = `font-size: ${POPUP_ARTIST_FONT_SIZE}px; font-weight: 500;`;

export const MediaControls = GObject.registerClass(
  {
    Signals: {
      "play-pause": {},
      next: {},
      previous: {},
      shuffle: {},
      repeat: {},
      seek: { param_types: [GObject.TYPE_DOUBLE] },
      "player-changed": { param_types: [GObject.TYPE_STRING] },
      "pin-toggled": {
        param_types: [GObject.TYPE_BOOLEAN, GObject.TYPE_STRING],
      },
    },
  },
  class MediaControls extends St.BoxLayout {
    _init(settings) {
      const w = _popupWidth(settings);

      super._init({
        vertical: true,
        style_class: "media-controls-modern",
        style: `min-width: ${w}px; max-width: ${w}px;`,
      });

      this._settings = settings;
      this._currentPlayerName = null;
      this._currentManager = null;
      this._playerSliderPositions = new Map();
      this._playerArtCache = new Map();
      this._isDestroyed = false;

      // Cascade destroy: the shell can tear down the parent menu item without
      // calling our destroy(). Flag first so late MPRIS callbacks bail out
      // instead of writing into disposed slot actors.
      this.connect("destroy", () => {
        this._isDestroyed = true;
      });

      this._titleScrollLabel = null;
      this._artistScrollLabel = null;

      this._signalIds = [];

      const widthId = this._settings.connect("changed::popup-width", () => {
        if (!this._isDestroyed) this._applyPopupWidth();
      });
      this._signalIds.push({ source: this._settings, id: widthId });

      this._buildUI();
    }

    _applyPopupWidth() {
      const w = _popupWidth(this._settings);
      this.style = `min-width: ${w}px; max-width: ${w}px;`;

      const tw = _titleW(this._settings);
      const aw = _artistW(this._settings);
      this._titleSlot.style = `min-height: 28px; max-width: ${tw}px;`;
      this._artistSlot.style = `min-height: 22px; max-width: ${aw}px;`;

      if (this._currentTrackInfo) {
        const info = this._currentTrackInfo;
        this._updateTitleLabel(info.title || "Unknown", info.status);
        if (info.artists && info.artists.length > 0)
          this._updateArtistLabel(info.artists.join(", "), info.status);
      }
    }

    _buildUI() {
      const tw = _titleW(this._settings);
      const aw = _artistW(this._settings);
      const align = INFO_ALIGN;

      const headerBox = new St.BoxLayout({
        style: "margin-bottom: 14px; spacing: 8px;",
        x_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
      });
      this._playerTabs = new PlayerTabs();
      this._playerTabs.setSettings(this._settings);

      const tabsId = this._playerTabs.connect("player-changed", (_, name) =>
        this.emit("player-changed", name),
      );
      this._signalIds.push({ source: this._playerTabs, id: tabsId });

      const pinId = this._playerTabs.connect(
        "pin-toggled",
        (_, pinned, playerName) => this.emit("pin-toggled", pinned, playerName),
      );
      this._signalIds.push({ source: this._playerTabs, id: pinId });

      headerBox.add_child(this._playerTabs);
      this.add_child(headerBox);

      this._artSlot = new St.Bin({
        x_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        style: "margin-bottom: 0;",
      });

      this._albumArt = new AlbumArt(this._settings, null, null);

      this._artSlot.set_child(this._albumArt);
      this.add_child(this._artSlot);

      // Info box: text alignment from POPUP_INFO_CENTER
      this._infoBox = new St.BoxLayout({
        vertical: true,
        // AlbumArt no longer carries its own bottom margins (it had 24 px
        // twice over), so this is the single gap between cover and text.
        style: "spacing: 2px; margin-top: 18px; margin-bottom: 12px;",
        x_align: align,
        x_expand: true,
      });

      this._titleSlot = new St.BoxLayout({
        x_align: align,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        style: `min-height: 28px; max-width: ${tw}px;`,
      });
      this._infoBox.add_child(this._titleSlot);

      this._artistSlot = new St.BoxLayout({
        x_align: align,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
        style: `min-height: 22px; max-width: ${aw}px;`,
      });
      this._infoBox.add_child(this._artistSlot);

      this.add_child(this._infoBox);

      this._progressSlider = new ProgressSlider();

      const seekId = this._progressSlider.connect("seek", (_, position) =>
        this.emit("seek", position),
      );
      const dragBeginId = this._progressSlider.connect("drag-begin", () =>
        this.stopPositionUpdate(),
      );
      const dragEndId = this._progressSlider.connect("drag-end", () => {
        if (this._currentPlayerName) {
          this._playerSliderPositions.set(this._currentPlayerName, {
            position: this._progressSlider.currentPosition,
            length: this._progressSlider.trackLength,
            value: this._progressSlider.sliderValue,
          });
        }
        this._resumeArtIfPlaying();
      });
      const ratioId = this._progressSlider.connect(
        "slider-ratio-changed",
        (_, ratio) => {
          if (this._albumArt && this._albumArt.syncRotationToPosition)
            this._albumArt.syncRotationToPosition(ratio);
        },
      );
      this._signalIds.push(
        { source: this._progressSlider, id: seekId },
        { source: this._progressSlider, id: dragBeginId },
        { source: this._progressSlider, id: dragEndId },
        { source: this._progressSlider, id: ratioId },
      );
      this.add_child(this._progressSlider);

      this._controlButtons = new ControlButtons(this._settings);
      this._wireControlButtons();
      this.add_child(this._controlButtons);
    }

    /** Disconnect old control-button signals and connect fresh ones. */
    _wireControlButtons() {
      const ppId = this._controlButtons.connect("play-pause", () =>
        this.emit("play-pause"),
      );
      const nxId = this._controlButtons.connect("next", () =>
        this.emit("next"),
      );
      const pvId = this._controlButtons.connect("previous", () =>
        this.emit("previous"),
      );
      const shId = this._controlButtons.connect("shuffle", () =>
        this.emit("shuffle"),
      );
      const rpId = this._controlButtons.connect("repeat", () =>
        this.emit("repeat"),
      );
      this._signalIds.push(
        { source: this._controlButtons, id: ppId },
        { source: this._controlButtons, id: nxId },
        { source: this._controlButtons, id: pvId },
        { source: this._controlButtons, id: shId },
        { source: this._controlButtons, id: rpId },
      );
    }

    _calcSpeed(speedPref, status) {
      const eff =
        status === "Paused"
          ? Math.max(1, Math.floor(speedPref / 3))
          : speedPref;
      return Math.round(BASE_PX_PER_SEC * (eff / 5));
    }

    _updateSlotLabel(
      slot,
      existing,
      fullText,
      enabled,
      viewW,
      speedPref,
      status,
      textStyle,
    ) {
      // Slots can be Clutter-disposed by a cascade destroy while our JS object
      // still looks alive; touching them throws "has been already disposed".
      if (!slot || slot.is_finalized?.() || this._isDestroyed) return existing ?? null;

      if (!enabled) {
        if (existing && existing._destroyed !== true) existing.destroy();
        // Reuse the plain label when it is already there: this runs on every
        // MPRIS update, so rebuilding it each time is pure churn.
        const current = slot.get_first_child?.();
        if (!existing && current instanceof St.Label) {
          if (current.text !== fullText) current.text = fullText;
          if (current.style !== `${textStyle} max-width: ${viewW}px;`)
            current.style = `${textStyle} max-width: ${viewW}px;`;
          return null;
        }
        typeof slot.destroy_all_children === "function" ? slot.destroy_all_children() : slot.remove_all_children();
        const lbl = new St.Label({
          text: fullText,
          y_align: Clutter.ActorAlign.CENTER,
          style: `${textStyle} max-width: ${viewW}px;`,
        });
        lbl.clutter_text.ellipsize = 3;
        lbl.clutter_text.single_line_mode = true;
        slot.add_child(lbl);
        return null;
      }

      const speed = this._calcSpeed(speedPref, status);
      // A changed viewport width (popup-width) needs a new widget: the reuse
      // path only updates text, speed and style.
      if (existing && existing._destroyed !== true && existing._viewW === viewW) {
        existing.setScrollSpeed(speed);
        existing.setTextStyle(textStyle);
        existing.setText(fullText);
        return existing;
      }

      typeof slot.destroy_all_children === "function" ? slot.destroy_all_children() : slot.remove_all_children();
      const widget = new ScrollingLabel({
        text: fullText,
        viewportWidth: viewW,
        isScrolling: true,
        initPaused: false,
        scrollSpeed: speed,
        scrollPauseTime: LOOP_PAUSE_MS,
        textStyle,
      });
      slot.add_child(widget);
      return widget;
    }

    _updateTitleLabel(fullText, status) {
      const enabled = TITLE_SCROLL.enabled;
      const speed = TITLE_SCROLL.speed;
      this._titleScrollLabel = this._updateSlotLabel(
        this._titleSlot,
        this._titleScrollLabel,
        fullText,
        enabled,
        _titleW(this._settings),
        speed,
        status,
        TITLE_STYLE,
      );
    }

    _updateArtistLabel(fullText, status) {
      const enabled = ARTIST_SCROLL.enabled;
      const speed = ARTIST_SCROLL.speed;
      this._artistScrollLabel = this._updateSlotLabel(
        this._artistSlot,
        this._artistScrollLabel,
        fullText,
        enabled,
        _artistW(this._settings),
        speed,
        status,
        ARTIST_STYLE,
      );
    }

    _stopTitleLabel() {
      if (this._isDestroyed || this._titleSlot?.is_finalized?.()) {
        this._titleScrollLabel = null;
        return;
      }
      if (this._titleScrollLabel) {
        this._titleScrollLabel.destroy();
        this._titleScrollLabel = null;
      }
      if (this._titleSlot) typeof this._titleSlot.destroy_all_children === "function" ? this._titleSlot.destroy_all_children() : this._titleSlot.remove_all_children();
    }

    _stopArtistLabel() {
      if (this._isDestroyed || this._artistSlot?.is_finalized?.()) {
        this._artistScrollLabel = null;
        return;
      }
      if (this._artistScrollLabel) {
        this._artistScrollLabel.destroy();
        this._artistScrollLabel = null;
      }
      if (this._artistSlot) typeof this._artistSlot.destroy_all_children === "function" ? this._artistSlot.destroy_all_children() : this._artistSlot.remove_all_children();
    }

    update(info, playerName, manager) {
      if (!info) return;
      if (this._isDestroyed || this.is_finalized?.() || !this.get_stage()) return;
      // The MPRIS proxies outlive this widget: MediaController.disable()
      // destroys the indicator while MprisManager keeps delivering
      // PropertiesChanged for one more idle. Every actor below is gone by
      // then, so bail out instead of writing to disposed St nodes.
      if (this._isDestroyed) return;

      const playerChanged = this._currentPlayerName !== playerName;
      this._currentPlayerName = playerName;
      this._currentManager = manager;
      this._currentTrackInfo = info;

      this._progressSlider.setPlayerName(playerName);

      if (playerChanged) this._albumArt.setPlayer(manager, playerName);

      if (playerChanged) {
        if (info.artUrl) this._albumArt.loadCover(info.artUrl, true);
        else this._albumArt.setDefaultCover();
      } else if (
        info.artUrl &&
        this._playerArtCache.get(playerName) !== info.artUrl
      ) {
        this._albumArt.loadCover(info.artUrl);
      }
      this._playerArtCache.set(playerName, info.artUrl);

      this._updateTitleLabel(info.title || "Unknown", info.status);

      if (info.artists && info.artists.length > 0) {
        this._updateArtistLabel(info.artists.join(", "), info.status);
        this._artistSlot.show();
      } else {
        this._stopArtistLabel();
        this._artistSlot.hide();
      }

      this._controlButtons.updateButtons(info);

      const metadata = this._getMetadata(playerName, manager);
      this._progressSlider.updatePlaybackState(
        info.status === "Playing",
        metadata,
        info.status,
        info.canSeek !== false,
      );

      if (info.status === "Playing") this._albumArt.startRotation(true);
      else if (info.status === "Paused") this._albumArt.pauseRotation();
      else this._albumArt.stopRotation();
    }

    _getMetadata(playerName, manager) {
      if (!playerName || !manager) return null;
      try {
        const proxy = manager._proxies.get(playerName);
        if (!proxy) return null;
        const metaV = proxy.get_cached_property("Metadata");
        if (!metaV) return null;

        const meta = {};
        const len = metaV.n_children();
        for (let i = 0; i < len; i++) {
          const item = metaV.get_child_value(i);
          const key = item.get_child_value(0).get_string()[0];
          const val = item.get_child_value(1).get_variant();
          if (key) meta[key] = val ? val.recursiveUnpack() : null;
        }
        return meta;
      } catch (_) {
        return null;
      }
    }

    updateTabs(players, currentPlayer, manager) {
      this._playerTabs.updateTabs(players, currentPlayer, manager);
    }

    startPositionUpdate() {
      this._progressSlider.startPositionUpdate();
      if (this._titleScrollLabel) this._titleScrollLabel.resumeScrolling();
      if (this._artistScrollLabel) this._artistScrollLabel.resumeScrolling();
      this._resumeArtIfPlaying();
    }

    // stopPositionUpdate() parks the disc; nothing else restarts it when the
    // popup reopens or a scrub ends, so a playing track stayed frozen.
    _resumeArtIfPlaying() {
      if (this._albumArt && this._currentTrackInfo?.status === "Playing")
        this._albumArt.startRotation(true);
    }

    stopPositionUpdate() {
      this._progressSlider.stopPositionUpdate();
      if (this._titleScrollLabel) this._titleScrollLabel.pauseScrolling();
      if (this._artistScrollLabel) this._artistScrollLabel.pauseScrolling();
      if (this._albumArt) this._albumArt.pauseRotation();
    }

    onSeeked(position) {
      this._progressSlider.onSeeked(position);
      if (this._currentPlayerName) {
        const len = this._progressSlider.trackLength;
        this._playerSliderPositions.set(this._currentPlayerName, {
          position: this._progressSlider.currentPosition,
          length: len,
          value: len > 0 ? this._progressSlider.currentPosition / len : 0,
        });
      }
    }

    destroy() {
      // Orphan-timer guard: a ScrollingLabel only cancels its GLib sources in its
      // own destroy(); leaving it alive keeps a 60fps timer writing to a disposed
      // St.Label forever. Release every label owned by this object here.
      if (this._titleScrollLabel) {
        try {
          this._titleScrollLabel.destroy();
        } catch (_) {}
        this._titleScrollLabel = null;
      }
      if (this._artistScrollLabel) {
        try {
          this._artistScrollLabel.destroy();
        } catch (_) {}
        this._artistScrollLabel = null;
      }
      this._isDestroyed = true;

      for (const { source, id } of this._signalIds) {
        try {
          source.disconnect(id);
        } catch (_) {}
      }
      this._signalIds = [];

      this._stopTitleLabel();
      this._stopArtistLabel();
      if (this._progressSlider) this._progressSlider.stopPositionUpdate();

      this._playerSliderPositions.clear();
      this._playerArtCache.clear();


      if (this._artSlot) {
        this._artSlot.set_child(null);
        this._artSlot = null;
      }


      if (this._albumArt) {
        this._albumArt.destroy();
        this._albumArt = null;
      }

      PlayerTabs.clearIconCache();

      super.destroy();
    }
  },
);