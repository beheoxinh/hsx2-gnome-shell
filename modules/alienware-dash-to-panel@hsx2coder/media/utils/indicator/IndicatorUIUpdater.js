import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { PANEL_TEXT_SEPARATOR } from "../../lib/settingsDefaults.js";

const BROWSER_MPRIS_PREFIXES = [
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

export class IndicatorUIUpdater {
  constructor(indicator) {
    this._indicator = indicator;
  }

  _isBrowserPlayer(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return BROWSER_MPRIS_PREFIXES.some((prefix) => lower.includes(prefix));
  }

  // A player is idle when it is not making sound any more. This applies to
  // every player: a stopped local app must hand over to one that is playing.
  // Browsers keep a stopped tab (with a title) as the current player.
  _isPlayerIdle(name, manager) {
    try {
      const info = manager.getPlayerInfo(name);
      if (!info) return true;
      if (info.status === "Playing" || info.status === "Paused") return false;
      if (info.status === "Stopped" && info.title && this._isBrowserPlayer(name)) return false;
      return true;
    } catch (_) {
      return true;
    }
  }

  _findBestFallback(players, exclude, manager) {
    let paused = null;

    for (const name of players) {
      if (name === exclude) continue;
      try {
        const pInfo = manager.getPlayerInfo(name);
        if (!pInfo) continue;
        if (pInfo.status === "Playing") return name;
        if (pInfo.status === "Paused" && !paused) paused = name;
      } catch (_) {console.warn('[dash-to-panel] _findBestFallback: ' + ((_ && _.message) ? _.message : _)) }
    }

    return paused ?? null;
  }

  updateVisibility() {
    if (
      this._indicator._state._isDestroyed ||
      this._indicator._state._isInitializing ||
      this._indicator._state._sessionChanging ||
      !this._indicator._state._managerInitialized
    )
      return;

    try {
      const isLocked = Main.sessionMode.isLocked || false;
      const isUnlockDialog = Main.sessionMode.currentMode === "unlock-dialog";

      if (isLocked || isUnlockDialog) {
        this._indicator.hide();
        return;
      }

      const manager = this._indicator._manager;
      if (!manager) {
        this._indicator.show();
        this._indicator._panelUI.label.hide();
        return;
      }

      const players = manager.getPlayers();
      if (players.length === 0) {
        this._indicator._panelUI.resetToDefault();
        this._indicator.show();
        return;
      }

      this._indicator._state.refreshMultiPlayingState(manager);

      const currentPlayer = this._indicator._state._currentPlayer;
      const info = currentPlayer ? manager.getPlayerInfo(currentPlayer) : null;

      const currentHasMedia =
        info && (info.status === "Playing" || info.status === "Paused");
      const currentIsStopped = info && info.status === "Stopped";

      if (currentHasMedia) {
        this._indicator.show();
        return;
      }

      if (currentIsStopped && currentPlayer) {
        // reset icon and label to defaults when player is stopped
        this._indicator._panelUI.resetToDefault();
        this._indicator.show();
        const currentIsIdleBrowser = this._isPlayerIdle(currentPlayer, manager);

        if (currentIsIdleBrowser) {
          const fallback = this._findBestFallback(
            players,
            currentPlayer,
            manager,
          );
          if (fallback) {
            if (!this._indicator._state.autoSwitchBlocked)
              this._indicator._state._currentPlayer = fallback;
            this.updateUI();
            this.updateTabs();
            this._indicator.show();
            return;
          }
          this._indicator._state._currentPlayer = null;
          this._indicator._panelUI.stopScrolling();
          this._indicator._panelUI.label.hide();
          this._indicator.show();
          return;
        }

        this._indicator.show();
        return;
      }

      if (!this._indicator._state.autoSwitchBlocked) {
        for (const name of players) {
          const pInfo = manager.getPlayerInfo(name);
          if (
            pInfo &&
            (pInfo.status === "Playing" || pInfo.status === "Paused")
          ) {
            this._indicator._state._currentPlayer = name;
            this.updateUI();
            this._indicator.show();
            return;
          }
        }
      } else {
        for (const name of players) {
          const pInfo = manager.getPlayerInfo(name);
          if (
            pInfo &&
            (pInfo.status === "Playing" || pInfo.status === "Paused")
          ) {
            this._indicator.show();
            return;
          }
        }
      }

      this._indicator._panelUI.resetToDefault();
      this._indicator.show();
    } catch (e) {console.warn('[dash-to-panel] updateVisibility: ' + ((e && e.message) ? e.message : e)) }
  }

  updateUI() {
    if (
      this._isDestroyed ||
      this._indicator._state._isDestroyed ||
      this._indicator._state._sessionChanging ||
      this._indicator._controls?._isDestroyed ||
      this._indicator._controls?.is_finalized?.() ||
      !this._indicator._controls?.get_stage?.()
    )
      return;

    try {
      if (!this._indicator._state._currentPlayer) {
        this._indicator._panelUI.stopScrolling();
        this._indicator._panelUI.label.hide();
        this._indicator._panelUI.resetToDefault();
        this._indicator.show();
        return;
      }

      const info = this._indicator._manager.getPlayerInfo(
        this._indicator._state._currentPlayer,
      );
      if (!info) {
        this._indicator._panelUI.stopScrolling();
        this._indicator._panelUI.label.hide();
        this._indicator._panelUI.resetToDefault();
        this._indicator.show();
        return;
      }

      this._indicator._controls.update(
        info,
        this._indicator._state._currentPlayer,
        this._indicator._manager,
      );
      this._indicator._panelUI.updateAppIcon(
        this._indicator._manager,
        this._indicator._state._currentPlayer,
      );
      this._indicator._blockPopup = false;
      if (this._indicator._menuItem) this._indicator._menuItem.visible = true;

      const playIcon =
        info.status === "Playing"
          ? "media-playback-pause-symbolic"
          : "media-playback-start-symbolic";
      if (this._indicator._panelUI?.panelPlayBtn?.child)
        this._indicator._panelUI.panelPlayBtn.child.icon_name = playIcon;

      // Controls only work while something is actually playing or paused.
      this._indicator._panelUI?.setControlsEnabled?.(
        info.status === "Playing" || info.status === "Paused",
        {
          canPlayPause:
            info.status === "Playing" ? info.canPause !== false : info.canPlay !== false,
          canGoNext: info.canGoNext !== false,
          canGoPrevious: info.canGoPrevious !== false,
        },
      );

      this.updateLabel();
      this.updateTabs();
    } catch (e) {console.warn('[dash-to-panel] updateUI: ' + ((e && e.message) ? e.message : e)) }
  }

  updateLabel() {
    if (
      this._indicator._state._isDestroyed ||
      this._indicator._state._sessionChanging
    )
      return;

    try {
      const showTrackName =
        this._indicator._settings.get_boolean("show-track-name");

      if (!this._indicator._state._currentPlayer) {
        this._indicator._panelUI.stopScrolling();
        this._indicator._panelUI.label.hide();
        return;
      }

      const info = this._indicator._manager.getPlayerInfo(
        this._indicator._state._currentPlayer,
      );

      if (!showTrackName) {
        this._indicator._panelUI.stopScrolling();
        this._indicator._panelUI.label.hide();
        return;
      }

      if (info && (info.status === "Playing" || info.status === "Paused")) {
        const showArtist = this._indicator._settings.get_boolean("show-artist");
        let text = info.title || "Unknown";
        if (showArtist && info.artists && info.artists.length > 0)
          text += PANEL_TEXT_SEPARATOR + info.artists.join(", ");

        this._lastLabelText = text;

        this._indicator._panelUI.startScrolling(
          text,
          this._indicator._settings,
          info.status,
        );
        this._indicator._panelUI.label.show();
        return;
      }

      if (this._isBrowserPlayer(this._indicator._state._currentPlayer)) {
        if (!(info && info.title)) {
          this._lastLabelText = null;
          this._indicator._panelUI.stopScrolling();
          this._indicator._panelUI.label.hide();
          return;
        }
      }

      // A stopped player has no paused track to keep showing
      if (info && info.status === "Stopped") this._lastLabelText = null;

      if (this._lastLabelText) {
        this._indicator._panelUI.startScrolling(
          this._lastLabelText,
          this._indicator._settings,
          "Paused",
        );
        this._indicator._panelUI.label.show();
        return;
      }

      this._indicator._panelUI.stopScrolling();
      this._indicator._panelUI.label.hide();
    } catch (e) {console.warn('[dash-to-panel] updateLabel: ' + ((e && e.message) ? e.message : e)) }
  }

  updateTabs() {
    if (
      this._indicator._state._isDestroyed ||
      !this._indicator._controls ||
      this._indicator._state._sessionChanging
    )
      return;

    try {
      const players = this._indicator._manager.getPlayers();
      this._indicator._controls.updateTabs(
        players,
        this._indicator._state._currentPlayer,
        this._indicator._manager,
      );
    } catch (e) {console.warn('[dash-to-panel] updateTabs: ' + ((e && e.message) ? e.message : e)) }
  }
}
