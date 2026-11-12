import GObject from "gi://GObject";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import { MprisManager } from "./mpris/MprisManager.js";
import { MediaControls } from "./ui/MediaControls.js";
import { PanelUI } from "./indicator/PanelUI.js";
import { IndicatorState } from "./indicator/IndicatorState.js";
import { IndicatorEventHandlers } from "./indicator/IndicatorEventHandlers.js";
import { IndicatorPlayerHandlers } from "./indicator/IndicatorPlayerHandlers.js";
import { IndicatorUIUpdater } from "./indicator/IndicatorUIUpdater.js";
import { guardClass } from "../../../../lib/guard.js";

// Plain helper classes never pass through GObject.registerClass, so they get
// the same error boundary explicitly. MediaIndicator itself is a GObject class
// and is wrapped automatically by the registerClass patch.
for (const [Klass, tag] of [
  [MprisManager, "MprisManager"],
  [MediaControls, "MediaControls"],
  [PanelUI, "PanelUI"],
  [IndicatorState, "IndicatorState"],
  [IndicatorEventHandlers, "IndicatorEventHandlers"],
  [IndicatorPlayerHandlers, "IndicatorPlayerHandlers"],
  [IndicatorUIUpdater, "IndicatorUIUpdater"],
])
  guardClass(Klass, tag);

export const MediaIndicator = GObject.registerClass(
  class MediaIndicator extends PanelMenu.Button {
    _init(settings, extension) {
      const _ = extension.gettext ? extension.gettext.bind(extension) : (s) => s;

      this._blockPopup = true;
      this._menuItem = null;
      super._init(0.5, _("Media Controls"), false);

      this._settings = settings;
      this._extension = extension;
      this._state = new IndicatorState();

      // Safety net: if the actor is destroyed by its parent instead of through
      // our destroy(), still mark the state dead so MPRIS callbacks stop
      // touching it. Without this the manager keeps calling into a finalized
      // GObject and floods the journal with "has been already disposed".
      // A cascade destroy (panelBox.destroy() on a panel reset with a
      // standalone panel) never calls our JS destroy() override, so the
      // MPRIS manager -- DBus subscriptions plus a 1 s position poll -- must
      // be released here too, or one manager leaks per panel reset.
      this.connect('destroy', () => {
        try {
          this._state._isDestroyed = true;
          this._state._sessionChanging = true;
          this._state._safetyLock = true;
        } catch (_e) {}
        try {
          this._manager?.destroy();
        } catch (_e) {}
        this._manager = null;
        if (this._state?._settingsChangedId && this._settings) {
          try {
            this._settings.disconnect(this._state._settingsChangedId);
          } catch (_e) {}
          this._state._settingsChangedId = 0;
        }
        for (const key of ['_applyHideSourceId', '_initSourceId',
          '_reinitSourceId', '_reinitDelaySourceId']) {
          if (this[key]) {
            GLib.Source.remove(this[key]);
            this[key] = null;
          }
        }
      });

      this._panelUI = new PanelUI(this);
      this._controls = new MediaControls(settings);

      this._eventHandlers = new IndicatorEventHandlers(this);
      this._playerHandlers = new IndicatorPlayerHandlers(this);
      this._uiUpdater = new IndicatorUIUpdater(this);

      this._menuItem = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
      });
      this._menuItem.add_child(this._controls);
      this.menu.addMenuItem(this._menuItem);

      // Own manager, as weather/bluetooth do: it owns the grab, so a click
      // outside the popup closes it. Without it the menu stayed open.
      this._localMgr = new PopupMenu.PopupMenuManager(this);
      this._localMgr.addMenu(this.menu);
      // Rounded "now playing" card look, see .amc-media-popup in stylesheet
      this.menu.box?.add_style_class_name("amc-media-popup");

      this._eventHandlers.connectControlSignals();

      this._menuStateChangedId = this.menu.connect(
        "open-state-changed",
        (menu, open) => {
          if (open) {
            const cp = this._state?._currentPlayer;
            const info = cp && this._manager?.getPlayerInfo(cp);
            if (!cp || !info || (info.status !== "Playing" && info.status !== "Paused")) {
              menu.close();
              return;
            }
          }
          this._state.safeExecute(() => {
            if (open) {
              this._controls.startPositionUpdate();
              this._eventHandlers.setupWindowMonitoring();
            } else {
              this._controls.stopPositionUpdate();
              this._eventHandlers.removeWindowMonitoring();
            }

            // Keep IndicatorState  menuOpen in sync and handle the
            // "popup just closed" auto-switch re-evaluation
            this._eventHandlers.onMenuOpenStateChanged(open);
          });
        },
      );

      this._state._settingsChangedId = this._settings.connect(
        "changed",
        (_, key) => {
          this._state.safeExecute(() => {
            if (key === "hide-default-player") {
              this._applyHideDefaultPlayer();
              return;
            }

            if (key === "player-filter-mode" || key === "player-filter-list") {
              this._reinitManager();
              return;
            }

            this._uiUpdater.updateLabel();
            this._uiUpdater.updateVisibility();
          });
        },
      );

      this._eventHandlers.setupSessionMonitoring();

      this.hide();

      this._applyHideSourceId = GLib.idle_add(
        GLib.PRIORITY_DEFAULT_IDLE,
        () => {
          this._applyHideSourceId = null;
          this._applyHideDefaultPlayer();
          return GLib.SOURCE_REMOVE;
        },
      );

      this._initSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
        this._initSourceId = null;
        this._state.safeExecute(() => this._initManager());
        return GLib.SOURCE_REMOVE;
      });
    }

    _applyHideDefaultPlayer() {
      const hide = this._settings.get_boolean("hide-default-player");
      this._setDefaultPlayerVisible(!hide);
    }

    _setDefaultPlayerVisible(visible) {
      const dateMenu = Main.panel.statusArea.dateMenu;
      if (!dateMenu) return;

      const ms = dateMenu._messageList?._mediaSection;
      if (ms) ms.visible = visible;

      const ml = dateMenu._messageList?._mprisMediaPlayersList;
      if (ml) ml.visible = visible;

      const ind = dateMenu._indicator;
      if (ind) {
        if (ind._primaryIndicator) ind._primaryIndicator.visible = visible;

        const ml2 = ind._messageList?._mediaSection;
        if (ml2) ml2.visible = visible;

        const ml3 = ind._messageList?._mprisMediaPlayersList;
        if (ml3) ml3.visible = visible;
      }

      const cl = dateMenu._clock;
      if (cl) {
        const cms = cl._messageList?._mediaSection;
        if (cms) cms.visible = visible;
      }
    }

    _reinitManager() {
      if (
        this._state._sessionChanging ||
        this._state._safetyLock ||
        this._state._preventLogout
      )
        return;

      if (this._manager) {
        this._manager.pauseOperations();
      }

      // Two filter edits in quick succession used to overwrite the pending
      // source ids, leaving an orphaned timer that could build a second
      // manager and that destroy() could no longer cancel.
      for (const key of ['_reinitSourceId', '_reinitDelaySourceId']) {
        if (this[key]) {
          GLib.Source.remove(this[key]);
          this[key] = null;
        }
      }

      this._reinitSourceId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT_IDLE,
        100,
        () => {
          this._reinitSourceId = null;

          if (this._state._sessionChanging || this._state._safetyLock)
            return GLib.SOURCE_REMOVE;

          if (this._manager) {
            this._manager.destroy();
            this._manager = null;
          }

          this._state._currentPlayer = null;
          this._state._manuallySelected = false;
          this._state._managerInitialized = false;

          this._panelUI.stopScrolling();
          this._panelUI.label.hide();
          this.hide();

          this._reinitDelaySourceId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            50,
            () => {
              this._reinitDelaySourceId = null;
              this._state.safeExecute(() => this._initManager());
              return GLib.SOURCE_REMOVE;
            },
          );

          return GLib.SOURCE_REMOVE;
        },
      );
    }

    async _initManager() {
      if (this._state._isDestroyed) return;

      try {
        const manager = new MprisManager();
        this._manager = manager;
        manager.setSettings(this._settings);

        // Capture plain JS references, NOT `this`. These closures outlive the
        // indicator: a disposed GObject throws on ANY property access, so
        // `this._state` inside a callback would throw before safeExecute's own
        // guard could run. `state`/`handlers` are ordinary JS objects and stay
        // readable after the indicator is disposed.
        const state = this._state;
        const handlers = this._playerHandlers;
        const guarded = (fn) => (name, position) => {
          if (state._isDestroyed) return;
          state.safeExecute(() => fn(name, position));
        };

        await manager.init({
          added: guarded((name) => handlers.onPlayerAdded(name)),
          removed: guarded((name) => handlers.onPlayerRemoved(name)),
          changed: guarded((name) => handlers.onPlayerChanged(name)),
          seeked: guarded((name, position) => handlers.onSeeked(name, position)),
        });

        // destroy() can run while init() is still awaited (lock/unlock tears the
        // module down). Without this check the freshly created manager would be
        // assigned onto a dead indicator and kept alive by its DBus subscriptions,
        // which fires player callbacks into disposed actors forever.
        if (this._state._isDestroyed || this._manager !== manager) {
          manager.destroy();
          if (this._manager === manager) this._manager = null;
          return;
        }

        this._state._managerInitialized = true;

        const players = manager.getPlayers();
        if (players.length > 0) {
          for (const name of players) {
            const info = manager.getPlayerInfo(name);
            if (info && info.status === "Playing") {
              this._state._currentPlayer = name;
              break;
            }
          }

          if (!this._state._currentPlayer) {
            this._state._currentPlayer = players[0];
          }

          this._uiUpdater.updateUI();
          this._uiUpdater.updateVisibility();
        }

        this._state._isInitializing = false;
      } catch (e) {
        // A failed manager init leaves the media widget blank; without a log
        // that state is indistinguishable from "no players running".
        console.warn('[dash-to-panel] _initManager failed: ' +
          ((e && e.message) ? e.message : e));
        this._state._isInitializing = false;
        this._state._managerInitialized = false;
      }
    }

    destroy() {
      // Re-entrant guards: destroy() is called both by MediaController.disable()
      // and by MediaController's own 'destroy' signal handler.
      if (this._destroyedOnce) return;
      this._destroyedOnce = true;

      // Set every death flag BEFORE touching any widget: an MPRIS
      // PropertiesChanged callback can land on this same main-loop iteration,
      // between controls.destroy() and state.destroy(). If _isDestroyed is
      // not already true at that point, safeExecute() lets the callback
      // through and it writes to actors that are already disposed.
      if (this._state) {
        this._state._isDestroyed = true;
        this._state._sessionChanging = true;
        this._state._safetyLock = true;
        this._state._preventLogout = true;
      }
      if (this._controls) this._controls._isDestroyed = true;
      if (this._panelUI) this._panelUI._isDestroyed = true;
      if (this._uiUpdater) this._uiUpdater._isDestroyed = true;

      // Kill the MPRIS manager FIRST. It owns the DBus subscriptions; if any
      // later teardown step throws on an already-disposed actor, the callbacks
      // would otherwise keep firing into dead widgets forever. That abort --
      // controls.destroy() throwing on a Clutter-disposed child -- is exactly
      // what leaked the manager and produced tens of thousands of
      // "has been already disposed" errors after a lock/unlock cycle.
      try {
        this._manager?.destroy();
      } catch (e) {
        console.warn('[dash-to-panel] destroy manager: ' + ((e && e.message) ? e.message : e));
      }
      this._manager = null;

      try {
        this._setDefaultPlayerVisible(true);
      } catch (_e) {console.warn('[dash-to-panel] destroy: ' + ((_e && _e.message) ? _e.message : _e)) }

      this._state._sessionChanging = true;
      this._state._safetyLock = true;
      this._state._preventLogout = true;

      if (this._applyHideSourceId) {
        GLib.Source.remove(this._applyHideSourceId);
        this._applyHideSourceId = null;
      }

      if (this._initSourceId) {
        GLib.Source.remove(this._initSourceId);
        this._initSourceId = null;
      }

      if (this._reinitSourceId) {
        GLib.Source.remove(this._reinitSourceId);
        this._reinitSourceId = null;
      }

      if (this._reinitDelaySourceId) {
        GLib.Source.remove(this._reinitDelaySourceId);
        this._reinitDelaySourceId = null;
      }

      if (this._menuStateChangedId) {
        this.menu.disconnect(this._menuStateChangedId);
        this._menuStateChangedId = null;
      }

      if (this._state._settingsChangedId && this._settings) {
        try {
          this._settings.disconnect(this._state._settingsChangedId);
        } catch (e) {
          console.warn('[dash-to-panel] disconnect settings failed: ' +
            ((e && e.message) ? e.message : e));
        }
        this._state._settingsChangedId = 0;
      }

      // Each step is isolated: an already-disposed actor throws, and an
      // unguarded throw here would skip every step after it -- including
      // super.destroy(), which leaves the indicator's own actors alive.
      const steps = [
        () => { if (this._eventHandlers) { this._eventHandlers.destroy(); this._eventHandlers = null; } },
        () => { if (this._playerHandlers) { this._playerHandlers.destroy(); this._playerHandlers = null; } },
        () => { if (this._controls) { this._controls.destroy(); this._controls = null; } },
        () => { if (this._panelUI) { this._panelUI.destroy(); this._panelUI = null; } },
        () => { if (this._state) { this._state.destroy(); } },
        () => { if (this._manager) { this._manager.destroy(); this._manager = null; } },
        () => super.destroy(),
      ];
      for (const step of steps) {
        try {
          step();
        } catch (e) {
          console.warn('[dash-to-panel] indicator teardown step failed: ' +
            ((e && e.message) ? e.message : e));
        }
      }
    }
  },
);