import St from "gi://St";
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import { ControlButtons } from "./ControlButtons.js";
import { AlbumArt } from "./AlbumArt.js";
import { ProgressSlider } from "./ProgressSlider.js";
import { PlayerTabs } from "./PlayerTabs.js";
import { ScrollingLabel } from "./ScrollingLabel.js";
import { LyricsClient } from "../../Lyrics/client/_LyricsClient.js";
import { LyricsWidget } from "../../Lyrics/widgets/_LyricsWidget.js";

const LOOP_PAUSE_MS = 1200;
const BASE_PX_PER_SEC = 50;
const LYRICS_POLL_MS = 250;
// Disc and lyrics take turns while the popup is open, one phase each.
const LYRICS_CYCLE_MS = 8000;

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

/** Returns Clutter.ActorAlign based on info-align-center setting */
function _infoAlign(s) {
  try {
    const center = s.get_boolean("info-align-center");
    return center ? Clutter.ActorAlign.CENTER : Clutter.ActorAlign.START;
  } catch (_e) {
    return Clutter.ActorAlign.CENTER;
  }
}

/** Read popup-button-order, returning an array of button ids in order.
 *  Valid ids: "shuffle","previous","play","next","repeat"
 *  Falls back to the standard order if the setting is missing/invalid.
 */
function _buttonOrder(s) {
  const DEFAULT = ["shuffle", "previous", "play", "next", "repeat"];
  try {
    const raw = s.get_string("popup-button-order");
    if (!raw) return DEFAULT;
    const parsed = raw.split(",").map((t) => t.trim()).filter(Boolean);
    const VALID = new Set(DEFAULT);
    const seen = new Set();
    const out = [];
    for (const id of parsed) {
      if (VALID.has(id) && !seen.has(id)) { out.push(id); seen.add(id); }
    }
    for (const id of DEFAULT) { if (!seen.has(id)) out.push(id); }
    return out;
  } catch (_e) {
    return DEFAULT;
  }
}

/** Build CSS style string for popup title from appearance settings. */
function _popupTitleStyle(s) {
  try {
    const size   = s.get_int("popup-title-font-size") || 16;
    const bold   = s.get_boolean("popup-title-font-bold");
    const family = (s.get_string("popup-title-font-family") || "").trim();
    const color  = (s.get_string("popup-title-font-color") || "").trim();
    let style = `font-size: ${size}px; font-weight: ${bold ? "700" : "normal"};`;
    if (family) style += ` font-family: ${family};`;
    if (color)  style += ` color: ${color};`;
    return style;
  } catch (_) {
    return "font-weight: 700; font-size: 16px;";
  }
}

/** Build CSS style string for popup artist from appearance settings. */
function _popupArtistStyle(s) {
  try {
    const size   = s.get_int("popup-artist-font-size") || 13;
    const bold   = s.get_boolean("popup-artist-font-bold");
    const family = (s.get_string("popup-artist-font-family") || "").trim();
    const color  = (s.get_string("popup-artist-font-color") || "").trim();
    let style = `font-size: ${size}px; font-weight: ${bold ? "700" : "500"};`;
    if (family) style += ` font-family: ${family};`;
    if (color)  style += ` color: ${color};`;
    return style;
  } catch (_) {
    return "font-size: 13px; font-weight: 500;";
  }
}

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

      this._lyricsClient = null;
      this._lyricsView = null;
      this._playerLyricsState = new Map();
      this._lyricsCache = new Map();
      this._currentTrackInfo = null;
      this._lyricsSyncTimer = null;
      this._lyricsCycleTimer = null;

      this._signalIds = [];

      const widthId = this._settings.connect("changed::popup-width", () => {
        if (!this._isDestroyed) this._applyPopupWidth();
      });
      this._signalIds.push({ source: this._settings, id: widthId });

      const orderChangedId = this._settings.connect(
        "changed::popup-button-order",
        () => { if (!this._isDestroyed) this._rebuildControlButtons(); },
      );
      this._signalIds.push({ source: this._settings, id: orderChangedId });

      // Live-update info box alignment when the setting changes
      const alignChangedId = this._settings.connect(
        "changed::info-align-center",
        () => { if (!this._isDestroyed) this._applyInfoAlignment(); },
      );
      this._signalIds.push({ source: this._settings, id: alignChangedId });

      // Live-update fonts when any appearance key changes
      const POPUP_APPEARANCE_KEYS = [
        "popup-title-font-family", "popup-title-font-size",
        "popup-title-font-bold",  "popup-title-font-color",
        "popup-artist-font-family", "popup-artist-font-size",
        "popup-artist-font-bold", "popup-artist-font-color",
      ];
      for (const key of POPUP_APPEARANCE_KEYS) {
        const aid = this._settings.connect(`changed::${key}`, () => {
          if (this._isDestroyed || !this._currentTrackInfo) return;
          this._stopTitleLabel();
          this._stopArtistLabel();
          const info = this._currentTrackInfo;
          this._updateTitleLabel(info.title || "Unknown", info.status);
          if (info.artists && info.artists.length > 0)
            this._updateArtistLabel(info.artists.join(", "), info.status);
        });
        this._signalIds.push({ source: this._settings, id: aid });
      }

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

      if (this._lyricsView && this._lyricsView.setSize)
        this._lyricsView.setSize(w, w);
    }

    /** Apply x_align to both the infoBox and its slot children based on setting */
    _applyInfoAlignment() {
      if (!this._infoBox) return;
      const align = _infoAlign(this._settings);
      this._infoBox.x_align = align;
      if (this._titleSlot) this._titleSlot.x_align = align;
      if (this._artistSlot) this._artistSlot.x_align = align;
    }

    _buildUI() {
      const tw = _titleW(this._settings);
      const aw = _artistW(this._settings);
      const align = _infoAlign(this._settings);

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

      const w = _popupWidth(this._settings);
      this._lyricsView = new LyricsWidget(w, w, this._settings);

      const lyrDismissId = this._lyricsView.connect("dismiss", () =>
        this._setLyricsPhase(this._currentPlayerName, false),
      );
      this._signalIds.push({ source: this._lyricsView, id: lyrDismissId });

      this._artSlot.set_child(this._albumArt);
      this.add_child(this._artSlot);

      // Info box: alignment controlled by info-align-center setting
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

    /** Rebuild ControlButtons widget live when order setting changes. */
    _rebuildControlButtons() {
      if (!this._controlButtons) return;

      this._signalIds = this._signalIds.filter(({ source, id }) => {
        if (source === this._controlButtons) {
          source.disconnect(id);
          return false;
        }
        return true;
      });

      this.remove_child(this._controlButtons);
      this._controlButtons.destroy();

      this._controlButtons = new ControlButtons(this._settings);
      this._wireControlButtons();
      this.add_child(this._controlButtons);

      if (this._currentTrackInfo)
        this._controlButtons.updateButtons(this._currentTrackInfo);
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
      if (existing && existing._destroyed !== true) {
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
      const enabled = this._settings.get_boolean("enable-title-scroll");
      const speed = this._settings.get_int("title-scroll-speed");
      this._titleScrollLabel = this._updateSlotLabel(
        this._titleSlot,
        this._titleScrollLabel,
        fullText,
        enabled,
        _titleW(this._settings),
        speed,
        status,
        _popupTitleStyle(this._settings),
      );
    }

    _updateArtistLabel(fullText, status) {
      const enabled = this._settings.get_boolean("enable-artist-scroll");
      const speed = this._settings.get_int("artist-scroll-speed");
      this._artistScrollLabel = this._updateSlotLabel(
        this._artistSlot,
        this._artistScrollLabel,
        fullText,
        enabled,
        _artistW(this._settings),
        speed,
        status,
        _popupArtistStyle(this._settings),
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
      );

      if (info.status === "Playing") this._albumArt.startRotation(true);
      else if (info.status === "Paused") this._albumArt.pauseRotation();
      else this._albumArt.stopRotation();

      if (!this._settings.get_boolean("enable-lyrics")) {
        this._stopLyricsCycle();
        const s = this._playerLyricsState.get(playerName);
        // A player switch must not leave the previous player's lyrics up.
        if (playerChanged || (s && s.visible)) this._setLyricsPhase(playerName, false);
        return;
      }

      const playerState = this._getPlayerLyricsState(playerName);
      const newKey = `${info.title || ""}||${(info.artists || []).join(",")}`;

      if (playerChanged || newKey !== playerState.lastKey) {
        // New track (or player): drop the old lyrics and fetch the new ones.
        playerState.lastKey = newKey;
        playerState.hasLyrics = false;
        this._lyricsView.clear();
        this._fetchLyricsForCurrentTrack();
      }

      if (playerChanged) this._setLyricsPhase(playerName, false);
      else if (playerState.visible) this._pushLyricsPosition();
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

      const state = this._playerLyricsState.get(this._currentPlayerName);
      if (state && state.visible) this._startLyricsSyncTimer();
      if (this._settings.get_boolean("enable-lyrics")) this._startLyricsCycle();
    }

    stopPositionUpdate() {
      this._progressSlider.stopPositionUpdate();
      if (this._titleScrollLabel) this._titleScrollLabel.pauseScrolling();
      if (this._artistScrollLabel) this._artistScrollLabel.pauseScrolling();
      if (this._albumArt) this._albumArt.pauseRotation();
      this._stopLyricsSyncTimer();
    }

    onSeeked(position) {
      this._progressSlider.onSeeked(position);
      if (this._currentPlayerName) {
        this._playerSliderPositions.set(this._currentPlayerName, {
          position: this._progressSlider.currentPosition,
          length: this._progressSlider.trackLength,
          value:
            this._progressSlider.currentPosition /
            this._progressSlider.trackLength,
        });
      }

      const seekState = this._playerLyricsState.get(this._currentPlayerName);
      if (seekState && seekState.visible && this._lyricsView)
        this._lyricsView.setPosition(position * 1000);
    }

    onMenuClosed() {
      this._stopLyricsSyncTimer();
      this._stopLyricsCycle();
    }

    _startLyricsSyncTimer() {
      this._stopLyricsSyncTimer();
      this._lyricsSyncTimer = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        LYRICS_POLL_MS,
        () => {
          const s = this._playerLyricsState.get(this._currentPlayerName);
          if (!s || !s.visible) {
            this._lyricsSyncTimer = null;
            return GLib.SOURCE_REMOVE;
          }
          this._pushLyricsPosition();
          return GLib.SOURCE_CONTINUE;
        },
      );
    }

    _stopLyricsSyncTimer() {
      if (this._lyricsSyncTimer) {
        GLib.source_remove(this._lyricsSyncTimer);
        this._lyricsSyncTimer = null;
      }
    }

    _pushLyricsPosition() {
      const state = this._playerLyricsState.get(this._currentPlayerName);
      if (!state || !state.visible || !this._lyricsView) return;
      const posUs =
        (this._progressSlider && this._progressSlider.currentPosition) || 0;
      this._lyricsView.setPosition(posUs / 1000);
    }

    _getPlayerLyricsState(playerName) {
      if (!this._playerLyricsState.has(playerName))
        this._playerLyricsState.set(playerName, {
          visible: false,
          hasLyrics: false,
          lastKey: null,
        });
      return this._playerLyricsState.get(playerName);
    }

    /** Show the lyrics in the art slot (true) or the vinyl disc (false). */
    _setLyricsPhase(playerName, show) {
      if (this._isDestroyed || !this._artSlot || !playerName) return;
      const state = this._getPlayerLyricsState(playerName);
      state.visible = show;
      if (show) {
        if (this._artSlot.get_child() !== this._lyricsView)
          this._artSlot.set_child(this._lyricsView);
        this._pushLyricsPosition();
        this._startLyricsSyncTimer();
      } else {
        this._stopLyricsSyncTimer();
        if (this._artSlot.get_child() !== this._albumArt)
          this._artSlot.set_child(this._albumArt);
      }
    }

    _startLyricsCycle() {
      if (this._lyricsCycleTimer) return;
      this._lyricsCycleTimer = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        LYRICS_CYCLE_MS,
        () => {
          if (this._isDestroyed) {
            this._lyricsCycleTimer = null;
            return GLib.SOURCE_REMOVE;
          }
          this._advanceLyricsCycle();
          return GLib.SOURCE_CONTINUE;
        },
      );
    }

    _stopLyricsCycle() {
      if (this._lyricsCycleTimer) {
        GLib.source_remove(this._lyricsCycleTimer);
        this._lyricsCycleTimer = null;
      }
    }

    _advanceLyricsCycle() {
      const name = this._currentPlayerName;
      if (!name) return;
      const state = this._getPlayerLyricsState(name);
      // Only swap when there is something to show; otherwise stay on the disc.
      const canShowLyrics =
        this._settings.get_boolean("enable-lyrics") && state.hasLyrics;
      this._setLyricsPhase(name, canShowLyrics ? !state.visible : false);
    }

    async _fetchLyricsForCurrentTrack() {
      if (!this._currentTrackInfo || !this._currentPlayerName) return;

      const fetchPlayerName = this._currentPlayerName;
      const info = this._currentTrackInfo;
      const trackKey = `${info.title || ""}||${(info.artists || []).join(",")}`;
      const state = this._getPlayerLyricsState(fetchPlayerName);

      // Apply a result only if the same track is still current when it lands.
      const apply = (lines) => {
        if (this._isDestroyed || this._currentPlayerName !== fetchPlayerName)
          return;
        if (state.lastKey !== trackKey) return;
        state.hasLyrics = Array.isArray(lines) && lines.length > 0;
        if (this._lyricsView) this._lyricsView.setLyrics(lines ?? null);
        this._pushLyricsPosition();
      };

      if (this._lyricsCache.has(trackKey)) {
        apply(this._lyricsCache.get(trackKey));
        return;
      }

      if (!this._lyricsClient) this._lyricsClient = new LyricsClient();

      const artist = (info.artists || []).join(", ");
      const durationS = (info.length || 0) > 0 ? info.length / 1_000_000 : 0;

      try {
        const lines = await this._lyricsClient.getLyrics(
          info.title || "",
          artist,
          info.album || "",
          durationS,
        );
        this._lyricsCache.set(trackKey, lines ?? null);
        apply(lines);
      } catch (_e) {
        apply(null);
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
      this._stopLyricsSyncTimer();
      this._stopLyricsCycle();

      this._playerSliderPositions.clear();
      this._playerArtCache.clear();
      this._playerLyricsState.clear();
      this._lyricsCache.clear();

      if (this._lyricsClient) {
        this._lyricsClient.destroy();
        this._lyricsClient = null;
      }

      if (this._artSlot) {
        this._artSlot.set_child(null);
        this._artSlot = null;
      }

      if (this._lyricsView) {
        this._lyricsView.destroy();
        this._lyricsView = null;
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