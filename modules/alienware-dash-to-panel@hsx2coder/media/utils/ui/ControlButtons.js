import St from "gi://St";
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import { addPressFeedback } from "./motion.js";

// Transport controls for the media popup.
//
// Look & feel lives in the module stylesheet (.amc-ctl-*): round, borderless
// secondary buttons that only show a surface on hover/press, and a solid
// accent-colored play button. Only geometry (derived from popup-width) is
// set inline. Hover/press scale is animated by motion.addPressFeedback; the
// old inline `transform: scale()` / `linear-gradient()` / `50%` radius were
// not St CSS and were silently ignored.

/** @param {Gio.Settings|null} s  @returns {number} popup width in px */
function _pw(s) {
  if (!s) return 340;
  try {
    return Math.max(280, s.get_int("popup-width"));
  } catch (_e) {
    return 340;
  }
}

const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function _metrics(s) {
  const pw = _pw(s);
  const sidePad = Math.round(pw * 0.04); // ~14 px at 340
  const sec = _clamp(Math.round(pw * 0.13), 36, 54); // 44 at 340
  const play = _clamp(Math.round(pw * 0.19), 52, 78); // 65 at 340
  const spacing = Math.max(
    4,
    Math.floor((pw - sidePad * 2 - sec * 4 - play) / 4),
  );
  return {
    sidePad,
    spacing,
    sec,
    play,
    iconToggle: Math.round(sec * 0.42), // shuffle / repeat
    iconSkip: Math.round(sec * 0.5), // prev / next
    iconPlay: Math.round(play * 0.4),
  };
}

/** Read popup-button-order from settings, returning ordered button id array.
 *  Valid ids: "shuffle","previous","play","next","repeat"
 */
function _btnOrder(s) {
  const DEFAULT = ["shuffle", "previous", "play", "next", "repeat"];
  if (!s) return DEFAULT;
  try {
    const raw = s.get_string("popup-button-order");
    if (!raw) return DEFAULT;
    const VALID = new Set(DEFAULT);
    const seen = new Set();
    const out = [];
    for (const id of raw.split(",").map((t) => t.trim()).filter(Boolean)) {
      if (VALID.has(id) && !seen.has(id)) {
        out.push(id);
        seen.add(id);
      }
    }
    for (const id of DEFAULT) {
      if (!seen.has(id)) out.push(id);
    }
    return out;
  } catch (_e) {
    return DEFAULT;
  }
}

const SPEC = {
  shuffle: {
    icon: "media-playlist-shuffle-symbolic",
    size: "iconToggle",
    a11y: "Shuffle",
  },
  previous: {
    icon: "media-skip-backward-symbolic",
    size: "iconSkip",
    a11y: "Previous track",
  },
  play: { icon: "media-playback-start-symbolic", size: "iconPlay", a11y: "Play" },
  next: { icon: "media-skip-forward-symbolic", size: "iconSkip", a11y: "Next track" },
  repeat: {
    icon: "media-playlist-repeat-symbolic",
    size: "iconToggle",
    a11y: "Repeat",
  },
};

const SIGNAL_FOR = {
  shuffle: "shuffle",
  previous: "previous",
  play: "play-pause",
  next: "next",
  repeat: "repeat",
};

export const ControlButtons = GObject.registerClass(
  {
    Signals: {
      "play-pause": {},
      next: {},
      previous: {},
      shuffle: {},
      repeat: {},
    },
  },
  class ControlButtons extends St.BoxLayout {
    /**
     * @param {Gio.Settings|null} [settings]  Extension GSettings
     *   re-sizes live when that setting changes
     */
    _init(settings = null) {
      super._init({
        style_class: "amc-ctl-row",
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        x_expand: true,
      });

      this._settings = settings;
      this._widthChangedId = 0;
      this._orderChangedId = 0;
      this._isDestroyed = false;
      this._buttons = {};
      this._feedback = [];

      // A parent actor can be destroyed by the shell (menu teardown) without
      // calling our destroy(). Without this flag the MPRIS callbacks keep
      // mutating buttons that Clutter already disposed.
      this.connect("destroy", () => {
        this._isDestroyed = true;
      });

      this._buildUI();

      if (this._settings) {
        this._widthChangedId = this._settings.connect(
          "changed::popup-width",
          () => {
            if (!this._isDestroyed) this._applyMetrics();
          },
        );
        this._orderChangedId = this._settings.connect(
          "changed::popup-button-order",
          () => {
            if (!this._isDestroyed) this._addChildrenInOrder();
          },
        );
      }
    }

    _buildUI() {
      for (const id of Object.keys(SPEC)) {
        const isPlay = id === "play";
        const btn = new St.Button({
          style_class: isPlay ? "amc-ctl-btn amc-ctl-play" : "amc-ctl-btn",
          child: new St.Icon({
            icon_name: SPEC[id].icon,
            style_class: "amc-ctl-icon",
          }),
          can_focus: true,
          track_hover: true,
          y_align: Clutter.ActorAlign.CENTER,
          accessible_name: SPEC[id].a11y,
        });
        btn.connect("clicked", () => this.emit(SIGNAL_FOR[id]));
        this._feedback.push(
          addPressFeedback(btn, isPlay ? { hover: 1.05, press: 0.9 } : {}),
        );
        this._buttons[id] = btn;
      }

      // Keep the historical field names: other code may still poke them.
      this._shuffleBtn = this._buttons.shuffle;
      this._prevBtn = this._buttons.previous;
      this._playBtn = this._buttons.play;
      this._nextBtn = this._buttons.next;
      this._repeatBtn = this._buttons.repeat;

      this._applyMetrics();
      this._addChildrenInOrder();
    }

    /** Add (or re-order) children according to the current order setting. */
    _addChildrenInOrder() {
      for (const child of this.get_children()) this.remove_child(child);
      for (const id of _btnOrder(this._settings)) {
        const btn = this._buttons[id];
        if (btn) this.add_child(btn);
      }
    }

    _applyMetrics() {
      const m = _metrics(this._settings);
      this.style = `spacing: ${m.spacing}px; padding: 0 ${m.sidePad}px;`;

      for (const [id, btn] of Object.entries(this._buttons)) {
        const d = id === "play" ? m.play : m.sec;
        const r = Math.round(d / 2);
        btn.style = `width: ${d}px; height: ${d}px; border-radius: ${r}px;`;
        if (btn.child) btn.child.icon_size = m[SPEC[id].size];
      }
    }

    _setEnabled(btn, enabled) {
      if (!btn || btn.reactive === enabled) return;
      btn.reactive = enabled;
      btn.can_focus = enabled;
      btn.opacity = enabled ? 255 : 100;
    }

    _setToggle(btn, on) {
      if (on) btn.add_style_class_name("amc-toggle-on");
      else btn.remove_style_class_name("amc-toggle-on");
      btn.toggle_mode = false;
      btn.checked = on; // exposes the state to screen readers
    }

    updateButtons(info) {
      if (this._isDestroyed) return;

      const playing = info.status === "Playing";
      if (this._playBtn.child) {
        this._playBtn.child.icon_name = playing
          ? "media-playback-pause-symbolic"
          : "media-playback-start-symbolic";
      }
      this._playBtn.accessible_name = playing ? "Pause" : "Play";

      // Prev / next / play follow the player's advertised capabilities.
      // Missing flags mean allowed (MPRIS spec defaults).
      const canPlayPause = playing ? info.canPause !== false : info.canPlay !== false;
      this._setEnabled(this._playBtn, canPlayPause);
      this._setEnabled(this._prevBtn, info.canGoPrevious !== false);
      this._setEnabled(this._nextBtn, info.canGoNext !== false);

      this._setToggle(this._shuffleBtn, !!info.shuffle);

      const loop = info.loopStatus;
      if (this._repeatBtn.child) {
        this._repeatBtn.child.icon_name =
          loop === "Track"
            ? "media-playlist-repeat-song-symbolic"
            : "media-playlist-repeat-symbolic";
      }
      this._setToggle(this._repeatBtn, loop === "Track" || loop === "Playlist");
    }

    destroy() {
      this._isDestroyed = true;
      for (const off of this._feedback) off();
      this._feedback = [];
      if (this._widthChangedId && this._settings) {
        this._settings.disconnect(this._widthChangedId);
        this._widthChangedId = 0;
      }
      if (this._orderChangedId && this._settings) {
        this._settings.disconnect(this._orderChangedId);
        this._orderChangedId = 0;
      }
      super.destroy();
    }
  },
);
