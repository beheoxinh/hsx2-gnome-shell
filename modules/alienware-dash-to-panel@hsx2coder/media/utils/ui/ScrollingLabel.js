import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import Pango from "gi://Pango";
import St from "gi://St";
import GLib from "gi://GLib";

const FRAME_MS = 16; // fastest tick (~60 fps)

// Move by whole pixels at the slowest rate that keeps the configured speed.
// Sub-pixel steps every 16 ms (e.g. 0.32 px at 20 px/s) forced a full panel
// repaint 60x/s for motion the eye can't resolve; one 1 px step per tick
// looks the same and repaints only as often as the text actually moves.
function tickParams(speed) {
  const step = Math.max(1, Math.ceil((speed * FRAME_MS) / 1000));
  const interval = Math.max(FRAME_MS, Math.round((1000 * step) / speed));
  return { interval, step };
}

export const ScrollingLabel = GObject.registerClass(
  { GTypeName: "AMCScrollingLabel" },
  class ScrollingLabel extends St.Widget {
    /**
     * @param {object}  params
     * @param {string}  params.text              – text to display / scroll
     * @param {number}  params.viewportWidth     – visible pixel width
     * @param {boolean} [params.isScrolling]     – enable scrolling (default true)
     * @param {boolean} [params.initPaused]      – start paused (default false)
     * @param {number}  [params.scrollSpeed]     – px/second (default 50)
     * @param {number}  [params.scrollPauseTime] – ms pause between loops (default 1200)
     * @param {string}  [params.textStyle]       – inline CSS for the inner St.Label
     */
    _init(params = {}) {
      super._init({
        clip_to_allocation: true,
        x_expand: false,
        y_expand: false,
        reactive: false,
      });
      this._destroyed = false;
      this.connect('destroy', () => {
        this._destroyed = true;
        try {
          this._stopAll();
        } catch (e) {
          console.warn('[dash-to-panel] ScrollingLabel destroy: ' + (e && e.message ? e.message : e));
        }
        this._label = null;
      });

      this._origText = params.text ?? "";
      this._viewW = params.viewportWidth ?? 280;
      this._isScrolling = params.isScrolling ?? true;
      this._paused = params.initPaused ?? false;
      this._speed = Math.max(10, params.scrollSpeed ?? 50);
      this._pauseMs = Math.max(0, params.scrollPauseTime ?? 1200);
      this._textStyle = params.textStyle ?? "";

      this._tick = tickParams(this._speed);
      this._oneWidth = 0;

      this._measureId = null;
      this._pauseId = null;
      this._tickId = null;
      this._mappedSigId = null;
      this._resumeOnMapId = null;

      this._buildUI();
    }

    _buildUI() {
      this.set_width(this._viewW);

      this._label = new St.Label({
        text: this._origText,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.START,
        style: this._textStyle,
      });
      this._label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
      this._label.clutter_text.single_line_mode = true;

      this.add_child(this._label);
      this._label.connect('destroy', () => {
        this._label = null;
        this._stopAll();
      });

      this._mappedSigId = this.connect("notify::mapped", () => {
        if (this.is_mapped()) {
          this.disconnect(this._mappedSigId);
          this._mappedSigId = null;
          this._scheduleMeasure();
        }
      });

      if (this.is_mapped()) {
        this.disconnect(this._mappedSigId);
        this._mappedSigId = null;
        this._scheduleMeasure();
      }
    }

    _scheduleMeasure() {
      if (this._destroyed) return;
      if (this._measureId !== null) return;
      this._measureId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this._measureId = null;
        this._measure();
        return GLib.SOURCE_REMOVE;
      });
    }

    _measure() {
      if (this._destroyed || !this._label) return;

      const labelW = this._label.width;

      if (!this._isScrolling || labelW <= this._viewW || this._viewW <= 0) {
        // This widget has the default fixed layout, which ignores x_align,
        // so short text used to sit at the left of a viewport-wide box no
        // matter what. Shrink to the text instead and let the parent slot's
        // alignment (info-align-center) place it.
        this.set_width(Math.min(Math.ceil(labelW), this._viewW));
        return;
      }

      this._label.text = this._origText + "   " + this._origText;

      // A pending measure idle must be cancelled before the id is replaced by
      // the loop idle, otherwise the old source id is lost and can never be
      // removed (it would then fire against a possibly disposed label).
      if (this._measureId !== null) {
        GLib.source_remove(this._measureId);
        this._measureId = null;
      }
      this._measureId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this._measureId = null;
        this._startLoop();
        return GLib.SOURCE_REMOVE;
      });
    }

    _startLoop() {
      if (this._destroyed || !this._label) return;

      this._oneWidth = Math.ceil(this._label.width / 2);
      this._label.translation_x = 0;

      if (this._paused) return;
      this._scheduleAfterPause(true);
    }

    _scheduleAfterPause(firstLoop = false) {
      if (this._destroyed || !this._label) return;
      this._stopTickAndPause();

      const delay = firstLoop && this._pauseMs === 0 ? 0 : this._pauseMs;

      if (delay > 0) {
        this._pauseId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
          this._pauseId = null;
          if (!this._paused && this._label) this._startTick();
          return GLib.SOURCE_REMOVE;
        });
      } else {
        this._startTick();
      }
    }

    _startTick() {
      if (this._destroyed || !this._label) return;
      if (this._tickId !== null) return;

      const { interval, step } = this._tick;
      this._tickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
        try {
          if (this._paused || this._destroyed || !this._label) {
            this._tickId = null;
            return GLib.SOURCE_REMOVE;
          }

          // Hidden (closed popup, panel on a locked screen…): stop waking up
          // and continue from the same offset once shown again.
          if (!this.is_mapped()) {
            this._tickId = null;
            this._resumeWhenMapped();
            return GLib.SOURCE_REMOVE;
          }

          const next = Math.round(this._label.translation_x) - step;

          if (-next >= this._oneWidth) {
            this._label.translation_x = 0;
            this._tickId = null;
            this._scheduleAfterPause(false);
            return GLib.SOURCE_REMOVE;
          }

          this._label.translation_x = next;
        } catch (e) {
          log(`AMCScrollingLabel: tick error, stopping: ${e}`);
          this._tickId = null;
          return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
      });
    }

    _resumeWhenMapped() {
      if (this._destroyed || this._resumeOnMapId !== null) return;
      this._resumeOnMapId = this.connect("notify::mapped", () => {
        if (!this.is_mapped()) return;
        this._cancelResumeOnMap();
        if (!this._paused && this._oneWidth > 0) this._startTick();
      });
    }

    _cancelResumeOnMap() {
      if (this._resumeOnMapId !== null) {
        this.disconnect(this._resumeOnMapId);
        this._resumeOnMapId = null;
      }
    }

    pauseScrolling() {
      if (this._destroyed) return;
      this._paused = true;
      this._stopTickAndPause();
    }

    resumeScrolling() {
      if (this._destroyed || !this._label) return;
      if (!this._paused) return;
      this._paused = false;
      if (this._oneWidth > 0) this._startTick();
    }

    setText(text) {
      if (this._destroyed) return;
      if (text === this._origText) return;
      this._stopAll();
      this._oneWidth = 0;
      this._origText = text;
      this.set_width(this._viewW); // undo a shrink-to-text from _measure
      if (this._label) {
        this._label.text = text;
        this._label.translation_x = 0;
      }
      this._scheduleMeasure();
    }

    setScrollSpeed(pxPerSec) {
      if (this._destroyed) return;
      this._speed = Math.max(10, pxPerSec);
      this._tick = tickParams(this._speed);
      // A running tick keeps its old interval; restart it with the new one.
      if (this._tickId !== null) {
        GLib.source_remove(this._tickId);
        this._tickId = null;
        this._startTick();
      }
    }

    setTextStyle(style) {
      if (this._destroyed) return;
      if (style === this._textStyle) return;
      this._textStyle = style;
      if (this._label) this._label.style = style;
    }

    _stopTickAndPause() {
      this._cancelResumeOnMap();
      if (this._tickId !== null) {
        GLib.source_remove(this._tickId);
        this._tickId = null;
      }
      if (this._pauseId !== null) {
        GLib.source_remove(this._pauseId);
        this._pauseId = null;
      }
    }

    _stopAll() {
      this._stopTickAndPause();
      if (this._measureId !== null) {
        GLib.source_remove(this._measureId);
        this._measureId = null;
      }
    }

    destroy() {
      if (this._destroyed) return;
      this._destroyed = true;
      this._stopAll();
      if (this._mappedSigId !== null) {
        this.disconnect(this._mappedSigId);
        this._mappedSigId = null;
      }
      super.destroy();
    }
  },
);