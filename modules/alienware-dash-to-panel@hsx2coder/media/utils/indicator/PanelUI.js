import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import { ScrollingLabel } from "../ui/ScrollingLabel.js";
import { addPressFeedback } from "../ui/motion.js";
import { resolveGicon, applyMonochromeToIcon } from "../icon/IconResolver.js";
import { playerConstant } from "../ui/playerConstant.js";
import {
  PANEL_ELEMENT_ORDER,
  PANEL_FONT_SIZE,
  PANEL_ICON_SIZE,
  PANEL_SCROLL_ENABLED,
  PANEL_SCROLL_SPEED,
} from "../../lib/settingsDefaults.js";

const BASE_SCROLL_PX_PER_SEC = 50;
const LOOP_PAUSE_MS = 1200;
// Crossfade duration when the panel icon switches apps
const ICON_FADE_MS = 120;

function _isDarkTheme() {
  try {
    const s = new Gio.Settings({ schema_id: playerConstant.INTERFACE_SCHEMA });
    const keys = s.list_keys();
    if (keys.indexOf(playerConstant.INTERFACE_KEY) !== -1)
      return s.get_string(playerConstant.INTERFACE_KEY) === "prefer-dark";
    if (keys.indexOf(playerConstant.GTK_THEME_KEY) !== -1)
      return s
        .get_string(playerConstant.GTK_THEME_KEY)
        .toLowerCase()
        .includes("dark");
  } catch (_) {console.warn('[dash-to-panel] ?: ' + ((_ && _.message) ? _.message : _)) }
  return true;
}

function _labelWidth(settings) {
  try {
    return Math.max(60, settings.get_int("panel-label-width"));
  } catch (_) {
    return 160;
  }
}
/** CSS for the panel label: fixed font size, theme colour, user-set width. */
function _panelLabelStyle(settings) {
  return `font-size: ${PANEL_FONT_SIZE}px; max-width: ${_labelWidth(settings)}px;`;
}

function _isSafeActor(actor) {
  if (!actor) return false;
  try {
    // Never stringify a GObject wrapper here: the stringify itself is what
    // emits "Object St.Label (0x...), has been already disposed" warnings.
    // Only JS-side flags are safe to read (same pattern as host.js).
    if (actor._isDestroyed === true) return false;
    if (actor._destroyed === true) return false;
    return true;
  } catch (_) {
    return false;
  }
}

// Marks an actor as gone the moment it is destroyed, so _isSafeActor() can
// answer without ever touching the (possibly disposed) GObject wrapper.
function _watchDestroy(actor) {
  if (!actor || actor._isDestroyWatched) return;
  try {
    actor._isDestroyWatched = true;
    if (actor._isDestroyed !== true) actor._isDestroyed = false;
    actor.connect("destroy", () => { actor._isDestroyed = true; });
  } catch (_) {}
}

export class PanelUI {
  constructor(indicator) {
    this._indicator = indicator;
    this._scrollLabel = null;
    this._settings = null;
    this._status = "Stopped";

    this._dark = _isDarkTheme();
    this._themeSettings = null;
    this._themeSettingsId = 0;
    this._extSettings = indicator._settings || null;
    this._labelWidthChangedId = 0;

    this._playingPlayer = null;
    this._currentPlayer = null;
    this._manager = null;

    this._lastIconSource = null;
    this._iconFadeTid = 0;

    // Cache last scroll params so we can re-apply on width change
    this._lastScrollText = null;
    this._lastScrollStatus = "Stopped";

    this._buildUI();
    this._watchTheme();

    if (this._extSettings) {
      // Live-update label viewport when panel-label-width changes
      this._labelWidthChangedId = this._extSettings.connect(
        "changed::panel-label-width",
        () => this._onLabelWidthChanged(),
      );

      // Live-update the monochrome icon style
      this._appearanceChangedIds = [
        this._extSettings.connect("changed::monochrome-icons", () => {
          this._applyMonochrome();
          if (this._lastScrollText && this._lastScrollStatus) {
            this.startScrolling(
              this._lastScrollText,
              this._settings || this._extSettings,
              this._lastScrollStatus,
            );
          }
        }),
      ];
    }
  }

  _onLabelWidthChanged() {
    if (
      this._lastScrollText &&
      (this._lastScrollStatus === "Playing" ||
        this._lastScrollStatus === "Paused")
    ) {
      this.startScrolling(
        this._lastScrollText,
        this._settings || this._extSettings,
        this._lastScrollStatus,
      );
    }
  }

  _watchTheme() {
    try {
      this._themeSettings = new Gio.Settings({
        schema_id: playerConstant.INTERFACE_SCHEMA,
      });
      const keys = this._themeSettings.list_keys();
      const key =
        keys.indexOf(playerConstant.INTERFACE_KEY) !== -1
          ? playerConstant.INTERFACE_KEY
          : playerConstant.GTK_THEME_KEY;
      this._themeSettingsId = this._themeSettings.connect(
        `changed::${key}`,
        () => {
          this._dark = _isDarkTheme();
          this._applyButtonTheme();
        },
      );
    } catch (_) {
      this._themeSettings = null;
      this._themeSettingsId = 0;
    }
  }

  _applyButtonTheme() {
    if (this._panelPrevBtn)
      this._panelPrevBtn.style = _panelButtonStyle(this._dark);
    if (this._panelPlayBtn)
      this._panelPlayBtn.style = _panelButtonStyle(this._dark);
    if (this._panelNextBtn)
      this._panelNextBtn.style = _panelButtonStyle(this._dark);
  }

  _buildUI() {
    this._box = new St.BoxLayout({
      style_class: "panel-status-menu-box panel-button-box",
      style: "spacing: 6px;",
    });
    this._indicator.add_child(this._box);

    // Build all three panel elements unconditionally; ordering happens below.
    this._icon = new St.Icon({
      gicon: Gio.ThemedIcon.new("audio-x-generic-symbolic"),
      icon_size: PANEL_ICON_SIZE,
      y_align: Clutter.ActorAlign.CENTER,
      style: "icon-style: requested;",
    });
    this._icon.set_pivot_point(0.5, 0.5);

    this._panelControlsBox = new St.BoxLayout({
      style_class: "panel-controls-box",
      style: "spacing: 2px;",
    });

    this._panelPrevBtn = this._makeButton("media-skip-backward-symbolic");
    this._panelControlsBox.add_child(this._panelPrevBtn);

    this._panelPlayBtn = this._makeButton("media-playback-start-symbolic");
    this._panelControlsBox.add_child(this._panelPlayBtn);

    this._panelNextBtn = this._makeButton("media-skip-forward-symbolic");
    this._panelControlsBox.add_child(this._panelNextBtn);

    // No active media yet: the controls stay disabled until a player plays.
    this.setControlsEnabled(false);

    this._labelContainer = new St.BoxLayout({
      y_align: Clutter.ActorAlign.CENTER,
      style: "margin-left: 0;",
    });
    _watchDestroy(this._labelContainer);
    this._labelContainer.hide();

    // Insert children in the configured order
    this._reorderPanelElements();
  }

  /** Map an element id to its top-level widget in the panel box. */
  _elementForId(id) {
    switch (id) {
      case "icon":     return this._icon;
      case "label":    return this._labelContainer;
      case "controls": return this._panelControlsBox;
      default:         return null;
    }
  }

  /** Re-add panel box children in the order specified by the setting. */
  _reorderPanelElements() {
    // Remove all children; they are re-parented below so nothing is destroyed.
    this._box.remove_all_children();
    for (const id of PANEL_ELEMENT_ORDER) {
      const child = this._elementForId(id);
      if (child) this._box.add_child(child);
    }
  }

  _makeButton(iconName) {
    const btn = new St.Button({
      style_class: "panel-media-button",
      style: _panelButtonStyle(this._dark),
      can_focus: true,
      track_hover: true,
      reactive: true,
    });
    btn.set_child(new St.Icon({ icon_name: iconName, icon_size: 14 }));
    // Press "click" only: a hover scale would overflow the panel height.
    // Handlers live on the button itself and go away with it.
    addPressFeedback(btn, { hover: 1, press: 0.82 });
    return btn;
  }

  // Accessors

  get box() {
    return this._box;
  }
  get icon() {
    return this._icon;
  }
  get panelPrevBtn() {
    return this._panelPrevBtn;
  }
  get panelPlayBtn() {
    return this._panelPlayBtn;
  }
  get panelNextBtn() {
    return this._panelNextBtn;
  }

  get label() {
    if (!this._labelShim) {
      this._labelShim = {
        show: () => {
          if (_isSafeActor(this._labelContainer))
            this._labelContainer.show();
        },
        hide: () => {
          if (_isSafeActor(this._labelContainer))
            this._labelContainer.hide();
          this.stopScrolling();
        },
        set_text: (txt) => {
          this.stopScrolling();
          if (!txt) {
            this._labelShim.hide();
            return;
          }
          if (_isSafeActor(this._labelContainer)) {
            this._labelContainer.remove_all_children();
            const lbl = new St.Label({
              text: txt,
              y_align: Clutter.ActorAlign.CENTER,
            });
            this._labelContainer.add_child(lbl);
            this._labelContainer.show();
          }
        },
      };
    }
    return this._labelShim;
  }

  // Track label / scrolling

  startScrolling(fullText, settings, status = "Playing") {
      if (!fullText) {
        this.stopScrolling();
        return;
      }

      const labelW = _labelWidth(settings);

      // Unchanged text, status and width on a live scroller: nothing to redo.
      // updateLabel() calls this on every MPRIS update, and each full pass
      // builds and destroys a measuring label.
      if (
        fullText === this._lastScrollText &&
        status === this._lastScrollStatus &&
        this._scrollLabel &&
        _isSafeActor(this._scrollLabel) &&
        this._scrollLabel._viewW === labelW
      ) {
        this._settings = settings;
        return;
      }

      this._settings = settings;
      this._status = status;
      this._lastScrollText = fullText;
      this._lastScrollStatus = status;

      const isPlaying = status === "Playing";
      const isActiveMedia = status === "Playing" || status === "Paused";
      const enabled = PANEL_SCROLL_ENABLED;
      const textStyle = _panelLabelStyle(this._settings || this._extSettings || {});

      if (!isActiveMedia) {
        this.stopScrolling();
        return;
      }

      const testLbl = new St.Label({ text: fullText, style: textStyle });
      const [, natW] = testLbl.clutter_text.get_preferred_width(-1);
      testLbl.destroy();

      if (!isPlaying || !enabled || natW <= labelW) {
        if (this._scrollLabel) {
          try {
            if (_isSafeActor(this._scrollLabel))
              this._scrollLabel.destroy();
          } catch (_) {console.warn('[dash-to-panel] startScrolling: ' + ((_ && _.message) ? _.message : _)) }
          this._scrollLabel = null;
        }
        if (this._labelContainer) {
          try {
            if (_isSafeActor(this._labelContainer))
              this._labelContainer.remove_all_children();
          } catch (_) {console.warn('[dash-to-panel] startScrolling: ' + ((_ && _.message) ? _.message : _)) }
        }

        const lbl = new St.Label({
          text: fullText,
          y_align: Clutter.ActorAlign.CENTER,
          style: textStyle,
        });
        lbl.clutter_text.ellipsize = 3;
        lbl.clutter_text.single_line_mode = true;
        if (_isSafeActor(this._labelContainer)) {
          this._labelContainer.add_child(lbl);
          this._labelContainer.show();
        }
        return;
      }

      const speed = this._calcSpeed(settings);

      if (this._scrollLabel) {
        // Never read a property off a possibly-disposed wrapper: that read is
        // itself what emits "has been already disposed".
        const scrollSafe = _isSafeActor(this._scrollLabel);
        if (!scrollSafe || this._scrollLabel._viewW !== labelW) {
          try {
            if (scrollSafe)
              this._scrollLabel.destroy();
          } catch (_) {console.warn('[dash-to-panel] startScrolling: ' + ((_ && _.message) ? _.message : _)) }
          this._scrollLabel = null;
          if (this._labelContainer) {
            try {
              if (_isSafeActor(this._labelContainer))
                this._labelContainer.remove_all_children();
            } catch (_) {console.warn('[dash-to-panel] startScrolling: ' + ((_ && _.message) ? _.message : _)) }
          }
        } else {
          this._scrollLabel.setScrollSpeed(speed);
          this._scrollLabel.setTextStyle(textStyle);
          this._scrollLabel.setText(fullText);
          if (_isSafeActor(this._labelContainer))
            this._labelContainer.show();
          return;
        }
      }

      if (this._labelContainer) {
        try {
          if (_isSafeActor(this._labelContainer))
            this._labelContainer.remove_all_children();
        } catch (_) {console.warn('[dash-to-panel] startScrolling: ' + ((_ && _.message) ? _.message : _)) }
      }
      this._scrollLabel = new ScrollingLabel({
        text: fullText,
        viewportWidth: labelW,
        isScrolling: true,
        initPaused: false,
        scrollSpeed: speed,
        scrollPauseTime: LOOP_PAUSE_MS,
        textStyle,
      });
      if (_isSafeActor(this._labelContainer)) {
        this._labelContainer.add_child(this._scrollLabel);
        // The label is now parented into the panel: watch it so a C-side destroy
        // still flips the JS flag that _isSafeActor() reads.
        _watchDestroy(this._scrollLabel);
        this._labelContainer.show();
      }
    }

  _calcSpeed() {
    return Math.round(BASE_SCROLL_PX_PER_SEC * (PANEL_SCROLL_SPEED / 5));
  }

  stopScrolling() {
    if (this._scrollLabel) {
      try {
        if (_isSafeActor(this._scrollLabel))
          this._scrollLabel.destroy();
      } catch (_) {console.warn('[dash-to-panel] stopScrolling: ' + ((_ && _.message) ? _.message : _)) }
      this._scrollLabel = null;
    }
    if (this._labelContainer) {
      try {
        if (_isSafeActor(this._labelContainer))
          this._labelContainer.remove_all_children();
      } catch (_) {console.warn('[dash-to-panel] stopScrolling: ' + ((_ && _.message) ? _.message : _)) }
    }
    this._settings = null;
    this._lastScrollText = null;
    this._lastScrollStatus = "Stopped";
  }

  // App icon updaters

  /**
   * @param {string|null} playerName  MPRIS bus name of the playing app, or null
   * @param {object}      manager     MprisManager instance
   */

  /**
   * @param {string|null} playerName  MPRIS bus name the popup is focused on
   * @param {object}      manager     MprisManager instance
   */
  setCurrentPlayer(playerName, manager) {
    if (this._indicator._state._sessionChanging) return;
    this._currentPlayer = playerName || null;
    this._manager = manager;
    // Only re-render when nothing is playing
    if (!this._playingPlayer) this._refreshIcon();
  }

  // Back-compat shim
  updateAppIcon(manager, currentPlayer) {
    this.setCurrentPlayer(currentPlayer, manager);
  }

  /** Enable or disable the prev / play-pause / next buttons in the panel. */
  /**
   * `caps` carries per-button capability flags from the player (MPRIS
   * CanGoPrevious / CanGoNext / CanPlay / CanPause). Missing flags mean allowed.
   */
  setControlsEnabled(on, caps = {}) {
    const states = [
      [this._panelPrevBtn, on && caps.canGoPrevious !== false],
      [this._panelPlayBtn, on && (caps.canPlayPause !== false)],
      [this._panelNextBtn, on && caps.canGoNext !== false],
    ];
    for (const [btn, enabled] of states) {
      if (!btn || !_isSafeActor(btn)) continue;
      btn.reactive = enabled;
      btn.can_focus = enabled;
      btn.opacity = enabled ? 255 : 100;
    }
  }

  resetToDefault() {
    this._playingPlayer = null;
    this._currentPlayer = null;
    this._lastIconSource = null;
    this._lastColourGicon = null;
    this.setControlsEnabled(false);
    if (this._icon && typeof this._icon.set_gicon === 'function')
      this._icon.gicon = Gio.ThemedIcon.new("audio-x-generic-symbolic");
    if (this.panelPlayBtn?.child)
      this.panelPlayBtn.child.icon_name = "media-playback-start-symbolic";
    this.label?.set_text?.("");
    if (this._indicator) {
      this._indicator._blockPopup = true;
      if (this._indicator.menu) this._indicator.menu.close();
      if (this._indicator._menuItem) this._indicator._menuItem.visible = false;
    }
  }

  _refreshIcon() {
    if (!this._icon) return;

    const source = this._playingPlayer || this._currentPlayer;

    if (source === this._lastIconSource) return;
    this._lastIconSource = source;

    const newGicon = source
      ? resolveGicon(source, this._manager)
      : Gio.ThemedIcon.new("audio-x-generic-symbolic");

    this._crossfadeIcon(newGicon);
  }

  _applyMonochrome() {
    if (!this._icon || !this._extSettings) return;
    const mono = this._extSettings.get_boolean("monochrome-icons");
    applyMonochromeToIcon(
      this._icon,
      this._lastColourGicon || this._icon.gicon,
      this._lastIconSource,
      this._manager,
      mono,
    );
  }

  _crossfadeIcon(newGicon) {
    if (!this._icon) return;

    this._lastColourGicon = newGicon;

    if (this._iconFadeTid) {
      GLib.source_remove(this._iconFadeTid);
      this._iconFadeTid = 0;
    }

    _easeOpacity(this._icon, 0, ICON_FADE_MS);

    this._iconFadeTid = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      ICON_FADE_MS,
      () => {
        this._iconFadeTid = 0;
        if (!this._icon) return GLib.SOURCE_REMOVE;
        const mono = this._extSettings &&
          this._extSettings.get_boolean("monochrome-icons");
        if (mono) {
          applyMonochromeToIcon(
            this._icon,
            newGicon,
            this._lastIconSource,
            this._manager,
            true,
          );
        } else {
          this._icon.gicon = newGicon;
        }
        _easeOpacity(this._icon, 255, ICON_FADE_MS);
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  destroy() {
    // Orphan-timer guard: a ScrollingLabel only cancels its GLib sources in its
    // own destroy(); leaving it alive keeps a 60fps timer writing to a disposed
    // St.Label forever. Release every label owned by this object here.
    if (this._scrollLabel) {
      try {
        if (_isSafeActor(this._scrollLabel)) this._scrollLabel.destroy();
      } catch (_) {}
      this._scrollLabel = null;
    }
    if (this._labelWidthChangedId && this._extSettings) {
      try { this._extSettings.disconnect(this._labelWidthChangedId); } catch (_) {}
      this._labelWidthChangedId = 0;
    }

    if (this._appearanceChangedIds && this._extSettings) {
      for (const id of this._appearanceChangedIds) {
        try { this._extSettings.disconnect(id); } catch (_) {}
      }
      this._appearanceChangedIds = [];
    }

    if (this._themeSettings && this._themeSettingsId) {
      try {
        this._themeSettings.disconnect(this._themeSettingsId);
      } catch (_) {}
      this._themeSettingsId = 0;
      this._themeSettings = null;
    }

    if (this._iconFadeTid) {
      GLib.source_remove(this._iconFadeTid);
      this._iconFadeTid = 0;
    }

    this.stopScrolling();
    this._playingPlayer = null;
    this._currentPlayer = null;
    this._lastIconSource = null;
    this._lastColourGicon = null;
    this._manager = null;
    this._labelShim = null;
    this._extSettings = null;
    this._indicator = null;
  }
}

function _panelButtonStyle(_dark) {
  return "padding: 2px 4px; border-radius: 5px;";
}

function _easeOpacity(actor, target, ms) {
  if (!actor) return;
  actor.save_easing_state();
  actor.set_easing_duration(ms);
  actor.set_easing_mode(Clutter.AnimationMode.EASE_OUT_QUAD);
  actor.opacity = target;
  actor.restore_easing_state();
}
