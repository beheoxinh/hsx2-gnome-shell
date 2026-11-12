import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";
import {
  resolveGicon,
  resolveDisplayName,
  clearIconCache,
  applyMonochromeToIcon,
} from "../icon/IconResolver.js";
import { playerConstant } from "./playerConstant.js";

const _BROWSER_MPRIS_PREFIXES = [
  "firefox",
  "chromium",
  "chrome",
  "google-chrome",
  "brave",
  "opera",
  "vivaldi",
  "microsoft-edge",
  "epiphany",
  "falkon",
  "midori",
  "waterfox",
  "librewolf",
  "floorp",
];

function _isBrowserPlayer(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return _BROWSER_MPRIS_PREFIXES.some((prefix) => lower.includes(prefix));
}

function _browserPlayerHasMedia(playerName, manager) {
  if (!manager || !playerName) return false;
  try {
    const info = manager.getPlayerInfo(playerName);
    if (!info) return false;
    if (info.status === "Playing" || info.status === "Paused") return true;
    if (info.status === "Stopped" && info.title) return true;
    return false;
  } catch (_) {
    return false;
  }
}

const _DEFAULT_TAB_ICON_SIZE    = 18;
const _DEFAULT_SINGLE_ICON_SIZE = 28;


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

export const PlayerTabs = GObject.registerClass(
  {
    Signals: {
      "player-changed": { param_types: [GObject.TYPE_STRING] },
      "pin-toggled": {
        param_types: [GObject.TYPE_BOOLEAN, GObject.TYPE_STRING],
      },
    },
  },
  class PlayerTabs extends St.BoxLayout {
    _init() {
      super._init({
        vertical: true,
        style: "spacing: 0px;",
        reactive: true,
        x_expand: true,
      });

      this._currentPlayers = [];
      this._currentActivePlayer = null;
      this._pinned = false;
      this._dark = _isDarkTheme();
      this._settings = null;
      this._settingsSignalIds = [];
      this._buttonEntries = [];
      this._pinClickId = 0;
      this._pinEnterId = 0;
      this._pinLeaveId = 0;
      this._clickTimers = new Map();
      this._pulseTimers = new Set();
      this._themeSettings = null;
      this._themeSettingsId = 0;
      this._singleIconLastPressUs = 0;
      this._singleIconButton = null;
      this._singleIconPressId = 0;
      this._singleHoverEnterId = 0;
      this._singleHoverLeaveId = 0;

      this._playingPlayer = null;
      this._singleColourGicon = null;
      this._singlePlayerName = null;
      this._singleManager = null;

      this._watchTheme();
      this._buildPinButton();
      this._buildSingleRow();
      this._buildSwitcherRow();

      this._singleRow.opacity = 0;
      this._switcherRow.opacity = 0;
      this._singleRow.hide();
      this._switcherRow.hide();
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
            this._refreshStyles();
          },
        );
      } catch (_) {
        this._themeSettings = null;
        this._themeSettingsId = 0;
      }
    }

    _refreshStyles() {
      if (this._tabRow) this._tabRow.style = _tabRowStyle(this._dark);
      this._applyPinStyle();

      for (const entry of this._buttonEntries) this._styleEntry(entry, false);

      this._applyPinStyle();
    }

    /** Apply the active / hover / idle look to one tab. */
    _styleEntry(entry, hovered) {
      const active = entry.playerName === this._currentActivePlayer;
      entry.button.style = _tabStyle(this._dark, active, hovered);
      entry.label.style = _tabLabelStyle(this._dark, active);
      entry.icon.opacity = active ? 255 : 170;
      this._styleDot(entry);
    }

    /** Playing = accent dot, Paused = grey dot, otherwise no dot. */
    _styleDot(entry) {
      let status = null;
      try {
        const info = entry.manager?.getPlayerInfo(entry.playerName);
        status = info ? info.status : null;
      } catch (_) {}

      if (status === "Playing" || status === "Paused") {
        entry.dot.style = _dotStyle(status === "Playing");
        entry.dot.show();
      } else {
        entry.dot.hide();
      }
    }

    /** Called on every update so the status dots follow playback. */
    _refreshStatuses(manager) {
      for (const entry of this._buttonEntries) {
        if (manager) entry.manager = manager;
        this._styleDot(entry);
      }
    }

    _buildPinButton() {
      this._pinIcon = new St.Icon({
        icon_name: "view-pin-symbolic",
        icon_size: 14,
        y_align: Clutter.ActorAlign.CENTER,
        style: _pinIconStyle(false, this._dark),
      });

      // Text label makes the state readable at a glance: "Pin" vs "Pinned".
      this._pinLabel = new St.Label({
        text: "Pin",
        y_align: Clutter.ActorAlign.CENTER,
        style: _pinLabelStyle(false, this._dark),
      });

      const pinContent = new St.BoxLayout({
        y_align: Clutter.ActorAlign.CENTER,
        style: "spacing: 6px;",
      });
      pinContent.add_child(this._pinIcon);
      pinContent.add_child(this._pinLabel);

      this._pinButton = new St.Button({
        style_class: "media-tab-pin-button",
        style: _pinIdleStyle(this._dark),
        reactive: true,
        can_focus: true,
        track_hover: true,
        y_align: Clutter.ActorAlign.CENTER,
        accessible_name: "Pin media player popup",
      });
      this._pinButton.set_child(pinContent);
      this._pinButton.set_pivot_point(0.5, 0.5);

      this._pinClickId = this._pinButton.connect("clicked", () => {
        this._togglePin();
      });

      this._pinEnterId = this._pinButton.connect("enter-event", () => {
        if (!this._pinned) {
          this._pinButton.style = _pinHoverStyle(this._dark);
          this._easeOpacity(
            this._pinIcon,
            210,
            playerConstant.ANIM_DURATION_MS,
          );
          this._easeScale(this._pinButton, 1.12, 80);
        }
      });

      this._pinLeaveId = this._pinButton.connect("leave-event", () => {
        if (!this._pinned) {
          this._pinButton.style = _pinIdleStyle(this._dark);
          this._easeOpacity(
            this._pinIcon,
            130,
            playerConstant.ANIM_DURATION_MS,
          );
          this._easeScale(this._pinButton, 1.0, 80);
        }
      });
    }

    _togglePin() {
      this._pinned = !this._pinned;
      this._applyPinStyle();
      this._pulsePinButton();
      this.emit("pin-toggled", this._pinned, this._currentActivePlayer || "");
    }

    _applyPinStyle() {
      if (!this._pinButton) return;
      const pinned = this._pinned;

      this._pinButton.style = pinned
        ? _pinActiveStyle(this._dark)
        : _pinIdleStyle(this._dark);
      this._pinButton.checked = pinned; // exposes state to screen readers
      this._pinButton.accessible_name = pinned
        ? "Unpin media player popup"
        : "Pin media player popup";

      if (this._pinLabel) {
        this._pinLabel.text = pinned ? "Pinned" : "Pin";
        this._pinLabel.style = _pinLabelStyle(pinned, this._dark);
      }
      this._pinIcon.style = _pinIconStyle(pinned, this._dark);
      this._easeOpacity(
        this._pinIcon,
        pinned ? 255 : 150,
        playerConstant.ANIM_DURATION_MS,
      );
      if (!pinned) this._easeScale(this._pinButton, 1.0, 80);
    }

    _pulsePinButton() {
      if (!this._pinButton) return;
      this._easeScale(
        this._pinButton,
        playerConstant.PULSE_SCALE_UP,
        playerConstant.PULSE_UP_MS,
      );
      const tid = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        playerConstant.PULSE_UP_MS,
        () => {
          this._pulseTimers.delete(tid);
          this._easeScale(this._pinButton, 1.0, playerConstant.PULSE_DOWN_MS);
          return GLib.SOURCE_REMOVE;
        },
      );
      this._pulseTimers.add(tid);
    }

    _buildSingleRow() {
      this._singleRow = new St.BoxLayout({
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style: "spacing: 0px;",
      });

      this._singleIconButton = new St.Button({
        style_class: "media-single-icon-button",
        reactive: true,
        can_focus: false,
        track_hover: true,
        x_align: Clutter.ActorAlign.CENTER,
      });
      this._singleIconButton.set_pivot_point(0.5, 0.5);

      this._singleIcon = new St.Icon({
        icon_size: _DEFAULT_SINGLE_ICON_SIZE,
        gicon: Gio.ThemedIcon.new("audio-x-generic-symbolic"),
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.CENTER,
        style: "margin: 2px 0px;",
      });
      this._singleIconButton.set_child(this._singleIcon);

      this._singleHoverEnterId = this._singleIconButton.connect(
        "enter-event",
        () => {
          this._easeScale(this._singleIconButton, 1.06, 80);
        },
      );
      this._singleHoverLeaveId = this._singleIconButton.connect(
        "leave-event",
        () => {
          this._easeScale(this._singleIconButton, 1.0, 80);
        },
      );

      this._singleIconPressId = this._singleIconButton.connect(
        "button-press-event",
        (_actor, _event) => {
          const nowUs = GLib.get_monotonic_time();
          const deltaMs = (nowUs - this._singleIconLastPressUs) / 1000;
          this._singleIconLastPressUs = nowUs;

          if (deltaMs > 0 && deltaMs <= playerConstant.DOUBLE_CLICK_MS) {
            this._singleIconLastPressUs = 0;

            this._easeScale(this._singleIconButton, 0.82, 60);
            const squishTid = GLib.timeout_add(
              GLib.PRIORITY_DEFAULT,
              60,
              () => {
                this._pulseTimers.delete(squishTid);
                this._easeScale(this._singleIconButton, 1.0, 100);
                return GLib.SOURCE_REMOVE;
              },
            );
            this._pulseTimers.add(squishTid);

            this._togglePin();
          }

          return Clutter.EVENT_PROPAGATE;
        },
      );

      const centerBin = new St.Bin({
        x_expand: true,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      });
      centerBin.set_child(this._singleIconButton);
      this._singleRow.add_child(centerBin);

      this.add_child(this._singleRow);
    }

    _buildSwitcherRow() {
      this._switcherRow = new St.BoxLayout({
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style: "spacing: 6px;",
      });

      // Tabs share the row width; each one ellipsises its own name.
      this._tabRow = new St.BoxLayout({
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style: _tabRowStyle(this._dark),
      });

      this._switcherRow.add_child(this._tabRow);
      this.add_child(this._switcherRow);
    }

    _activateSingleMode() {
      this._reparentPin(this._singleRow);
      this._switcherRow.hide();
      this._switcherRow.opacity = 0;
      this._singleRow.show();
      this._easeOpacity(this._singleRow, 255, playerConstant.ANIM_DURATION_MS);
    }

    _activateMultiMode() {
      this._reparentPin(this._switcherRow);
      this._singleRow.hide();
      this._singleRow.opacity = 0;
      this._switcherRow.show();
      this._easeOpacity(
        this._switcherRow,
        255,
        playerConstant.ANIM_DURATION_MS,
      );
    }

    _reparentPin(target) {
      if (!this._pinButton) return;
      const current = this._pinButton.get_parent();
      if (current === target) return;
      if (current) current.remove_child(this._pinButton);
      target.add_child(this._pinButton);
    }

    _easeOpacity(actor, target, ms) {
      if (!actor) return;
      actor.save_easing_state();
      actor.set_easing_duration(ms);
      actor.set_easing_mode(playerConstant.ANIM_MODE);
      actor.opacity = target;
      actor.restore_easing_state();
    }

    _easeScale(actor, scale, ms) {
      if (!actor) return;
      actor.save_easing_state();
      actor.set_easing_duration(ms);
      actor.set_easing_mode(playerConstant.ANIM_MODE);
      actor.scale_x = scale;
      actor.scale_y = scale;
      actor.restore_easing_state();
    }

    get isPinned() {
      return this._pinned;
    }

    setPinned(value) {
      this._pinned = !!value;
      this._applyPinStyle();
    }

    // Called by the host when PlaybackStatus "Playing" moves to a different player
    // Stored separately so the tab highlight can follow the actual playing app

    updateTabs(players, currentPlayer, manager) {
      const playersChanged =
        players.length !== this._currentPlayers.length ||
        players.some((p, i) => p !== this._currentPlayers[i]);
      const activeChanged = currentPlayer !== this._currentActivePlayer;

      if (!playersChanged && !activeChanged) {
        this._refreshStatuses(manager);
        return;
      }

      this._currentPlayers = players.slice();
      this._currentActivePlayer = currentPlayer;
      this._dark = _isDarkTheme();

      if (players.length <= 1) {
        if (
          currentPlayer &&
          _isBrowserPlayer(currentPlayer) &&
          !_browserPlayerHasMedia(currentPlayer, manager)
        ) {
          this._singleRow.hide();
          this._singleRow.opacity = 0;
          this._switcherRow.hide();
          this._switcherRow.opacity = 0;
          this._cancelAllClickTimers();
          this._destroyTabButtons();
          this._tabRow.destroy_all_children();
          return;
        }

        const gicon = currentPlayer
          ? resolveGicon(currentPlayer, manager)
          : Gio.ThemedIcon.new("audio-x-generic-symbolic");

        this._singleColourGicon = gicon;
        this._singlePlayerName = currentPlayer || null;
        this._singleManager = manager || null;

        this._singleIcon.gicon = gicon;
        applyMonochromeToIcon(
          this._singleIcon,
          gicon,
          currentPlayer || null,
          manager,
          this._isMonochrome(),
        );

        this._activateSingleMode();
        this._cancelAllClickTimers();
        this._destroyTabButtons();
        this._tabRow.destroy_all_children();
      } else {
        const visiblePlayers = players.filter((p) => {
          if (!_isBrowserPlayer(p)) return true;
          return _browserPlayerHasMedia(p, manager);
        });

        if (visiblePlayers.length === 0) {
          this._singleRow.hide();
          this._singleRow.opacity = 0;
          this._switcherRow.hide();
          this._switcherRow.opacity = 0;
          this._cancelAllClickTimers();
          this._destroyTabButtons();
          this._tabRow.destroy_all_children();
          return;
        }

        if (visiblePlayers.length === 1) {
          const solo = visiblePlayers[0];
          const gicon = resolveGicon(solo, manager);

          this._singleColourGicon = gicon;
          this._singlePlayerName = solo;
          this._singleManager = manager || null;

          this._singleIcon.gicon = gicon;
          applyMonochromeToIcon(
            this._singleIcon,
            gicon,
            solo,
            manager,
            this._isMonochrome(),
          );

          this._activateSingleMode();
          this._cancelAllClickTimers();
          this._destroyTabButtons();
          this._tabRow.destroy_all_children();
          return;
        }

        this._tabRow.style = _tabRowStyle(this._dark);
        this._activateMultiMode();
        this._cancelAllClickTimers();
        this._destroyTabButtons();
        this._tabRow.destroy_all_children();

        for (const pName of visiblePlayers) {
          const entry = this._createTab(pName, currentPlayer, manager);
          this._buttonEntries.push(entry);
          this._tabRow.add_child(entry.button);
        }

        this._applyMonochrome();
      }
    }

    _createTab(playerName, currentPlayer, manager) {
      const gicon = resolveGicon(playerName, manager);
      const name = resolveDisplayName(playerName, manager);

      const button = new St.Button({
        style_class: "media-switcher-tab",
        reactive: true,
        can_focus: true,
        track_hover: true,
        x_expand: true,
        x_align: Clutter.ActorAlign.FILL,
        accessible_name: `Switch to ${name}`,
      });

      const content = new St.BoxLayout({
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style: "spacing: 6px;",
      });

      const icon = new St.Icon({
        gicon,
        icon_size: _DEFAULT_TAB_ICON_SIZE,
        y_align: Clutter.ActorAlign.CENTER,
      });

      const label = new St.Label({
        text: name,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      });
      label.clutter_text.ellipsize = 3;
      label.clutter_text.single_line_mode = true;

      const dot = new St.Widget({ y_align: Clutter.ActorAlign.CENTER });

      content.add_child(icon);
      content.add_child(label);
      content.add_child(dot);
      button.set_child(content);

      const entry = {
        button,
        icon,
        label,
        dot,
        colourGicon: gicon,
        playerName,
        manager,
        handlers: [],
      };
      const handlers = entry.handlers;
      let lastPressUs = 0;

      // Double-click a tab to pin the popup, as before.
      handlers.push(
        button.connect("button-press-event", () => {
          const nowUs = GLib.get_monotonic_time();
          const deltaMs = (nowUs - lastPressUs) / 1000;
          lastPressUs = nowUs;

          if (deltaMs > 0 && deltaMs <= playerConstant.DOUBLE_CLICK_MS) {
            lastPressUs = 0;

            const pending = this._clickTimers.get(button);
            if (pending !== undefined) {
              GLib.source_remove(pending);
              this._clickTimers.delete(button);
            }

            this._togglePin();
          }

          return Clutter.EVENT_PROPAGATE;
        }),
      );

      // Single click switches player after the double-click window passes.
      handlers.push(
        button.connect("clicked", () => {
          const existing = this._clickTimers.get(button);
          if (existing !== undefined) {
            GLib.source_remove(existing);
            this._clickTimers.delete(button);
          }

          const tid = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            playerConstant.DOUBLE_CLICK_MS,
            () => {
              this._clickTimers.delete(button);
              if (!this._currentPlayers || this._currentPlayers.length === 0)
                return GLib.SOURCE_REMOVE;
              this.emit("player-changed", playerName);
              return GLib.SOURCE_REMOVE;
            },
          );
          this._clickTimers.set(button, tid);
        }),
      );

      handlers.push(
        button.connect("enter-event", () => this._styleEntry(entry, true)),
      );
      handlers.push(
        button.connect("leave-event", () => this._styleEntry(entry, false)),
      );

      this._styleEntry(entry, false);
      return entry;
    }

    _cancelAllClickTimers() {
      for (const [, id] of this._clickTimers) {
        try {
          GLib.source_remove(id);
        } catch (_) {}
      }
      this._clickTimers.clear();
    }

    _cancelAllPulseTimers() {
      for (const id of this._pulseTimers) {
        try {
          GLib.source_remove(id);
        } catch (_) {}
      }
      this._pulseTimers.clear();
    }

    _destroyTabButtons() {
      for (const { button, handlers } of this._buttonEntries) {
        for (const id of handlers) {
          try {
            button.disconnect(id);
          } catch (_) {}
        }
      }
      this._buttonEntries = [];
    }

    /**
     * Attach a Gio.Settings instance so the tab can read icon-size prefs.
     * Call this immediately after constructing PlayerTabs (or after the
     * settings object is available).  Disconnects any previous listener.
     *
     * @param {Gio.Settings|null} settings
     */
    setSettings(settings) {
      // Disconnect old listeners
      for (const id of this._settingsSignalIds) {
        try { this._settings.disconnect(id); } catch (_) {}
      }
      this._settingsSignalIds = [];

      this._settings = settings || null;

      if (!settings) return;

      const sid = settings.connect("changed::monochrome-icons", () => {
        this._applyIconSizes();
        this._applyMonochrome();
      });
      this._settingsSignalIds.push(sid);
    }

    /** Re-apply icon sizes to all live tab buttons and the single icon. */
    _applyIconSizes() {
      const singleSz = _DEFAULT_SINGLE_ICON_SIZE;
      const tabSz    = _DEFAULT_TAB_ICON_SIZE;

      if (this._singleIcon) this._singleIcon.icon_size = singleSz;
      for (const { icon } of this._buttonEntries) icon.icon_size = tabSz;
    }

    _isMonochrome() {
      try {
        return this._settings
          ? this._settings.get_boolean("monochrome-icons")
          : false;
      } catch (_) {
        return false;
      }
    }

    _applyMonochrome() {
      const mono = this._isMonochrome();

      if (this._singleIcon && this._singleColourGicon) {
        applyMonochromeToIcon(
          this._singleIcon,
          this._singleColourGicon,
          this._singlePlayerName || null,
          this._singleManager || null,
          mono,
        );
      }

      for (const { icon, colourGicon, playerName, manager } of this._buttonEntries) {
        if (colourGicon) {
          applyMonochromeToIcon(icon, colourGicon, playerName, manager, mono);
        }
      }
    }

    static clearIconCache() {
      clearIconCache();
    }

    destroy() {
      if (this._settingsSignalIds && this._settings) {
        for (const id of this._settingsSignalIds) {
          try { this._settings.disconnect(id); } catch (_) {}
        }
        this._settingsSignalIds = [];
      }
      this._settings = null;

      if (this._themeSettings && this._themeSettingsId) {
        try {
          this._themeSettings.disconnect(this._themeSettingsId);
        } catch (_) {}
        this._themeSettingsId = 0;
        this._themeSettings = null;
      }

      this._cancelAllClickTimers();
      this._cancelAllPulseTimers();

      if (this._singleIconButton) {
        if (this._singleIconPressId) {
          this._singleIconButton.disconnect(this._singleIconPressId);
          this._singleIconPressId = 0;
        }
        if (this._singleHoverEnterId) {
          this._singleIconButton.disconnect(this._singleHoverEnterId);
          this._singleHoverEnterId = 0;
        }
        if (this._singleHoverLeaveId) {
          this._singleIconButton.disconnect(this._singleHoverLeaveId);
          this._singleHoverLeaveId = 0;
        }
      }

      this._destroyTabButtons();

      if (this._pinButton) {
        if (this._pinClickId) {
          this._pinButton.disconnect(this._pinClickId);
          this._pinClickId = 0;
        }
        if (this._pinEnterId) {
          this._pinButton.disconnect(this._pinEnterId);
          this._pinEnterId = 0;
        }
        if (this._pinLeaveId) {
          this._pinButton.disconnect(this._pinLeaveId);
          this._pinLeaveId = 0;
        }
      }

      this._currentPlayers = [];
      this._currentActivePlayer = null;
      this._playingPlayer = null;
      this._singleColourGicon = null;
      this._singlePlayerName = null;
      this._singleManager = null;
      this._singleRow = null;
      this._singleIcon = null;
      this._singleIconButton = null;
      this._switcherRow = null;
      this._tabRow = null;
      this._pinButton = null;
      this._pinIcon = null;

      super.destroy();
    }
  },
);

function _tabRowStyle(dark) {
  const line = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  return `spacing: 4px; border-bottom: 1px solid ${line};`;
}

function _tabStyle(dark, active, hovered) {
  let bg = "transparent";
  if (active) bg = dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.06)";
  else if (hovered) bg = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const line = active ? "-st-accent-color" : "transparent";
  return `padding: 6px 8px 5px 8px; background-color: ${bg}; border-bottom: 2px solid ${line};`;
}

function _tabLabelStyle(dark, active) {
  let color;
  if (active) color = dark ? "#ffffff" : "#1d1d1f";
  else color = dark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.55)";
  return `font-size: 12px; font-weight: ${active ? "bold" : "normal"}; color: ${color};`;
}

function _dotStyle(playing) {
  const bg = playing ? "-st-accent-color" : "rgba(160,160,160,0.9)";
  return `width: 6px; height: 6px; border-radius: 3px; background-color: ${bg};`;
}

// Pin control: same flat language as the tabs. Pinned = tinted background
// plus the accent underline used by the active tab, never a red badge.
function _pinIdleStyle(_dark) {
  return "padding: 5px 9px 3px 9px; background-color: transparent; border-bottom: 2px solid transparent;";
}

function _pinHoverStyle(dark) {
  const bg = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  return `padding: 5px 9px 3px 9px; background-color: ${bg}; border-bottom: 2px solid transparent;`;
}

function _pinActiveStyle(dark) {
  const bg = dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.06)";
  return `padding: 5px 9px 3px 9px; background-color: ${bg}; border-bottom: 2px solid -st-accent-color;`;
}

function _pinLabelStyle(pinned, dark) {
  let color;
  if (pinned) color = dark ? "#ffffff" : "#1d1d1f";
  else color = dark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.55)";
  return `font-size: 12px; font-weight: ${pinned ? "bold" : "normal"}; color: ${color};`;
}

function _pinIconStyle(pinned, dark) {
  if (pinned) return `color: ${dark ? "#ffffff" : "#1d1d1f"};`;
  const alpha = dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.40)";
  return `color: ${alpha};`;
}