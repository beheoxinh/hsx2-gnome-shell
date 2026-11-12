/* DING: Desktop Icons New Generation for GNOME Shell
 *
 * Copyright (C) 2019 Sergio Costas (rastersoft@gmail.com)
 * Based on code original (C) Carlos Soriano
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
'use strict';
import Clutter from 'gi://Clutter'
import GLib from 'gi://GLib'
import Gio from 'gi://Gio'
import Meta from 'gi://Meta'
import St from 'gi://St'

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js'

import * as EmulateX11 from './emulateX11WindowType.js';
import * as VisibleArea from './visibleArea.js';
import * as GnomeShellOverride from './gnomeShellOverride.js';

const Clipboard = St.Clipboard.get_default();
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

function is_wayland_compositor() {
    return Meta.is_wayland_compositor === undefined ||
           Meta.is_wayland_compositor();
}

// Once per shell process; see the constructor.
let _oldProcessesKilled = false;

// Respawn backoff for the desktop helper process.
const RESPAWN_HEALTHY_US = 30 * 1000000;
const RESPAWN_MAX_DELAY_MS = 60 * 1000;

export default class DING extends Extension {
    constructor(metadata) {
        super(metadata);
        this.DesktopIconsUsableArea = null;
        this.data = {};
        this.data.isEnabled = false;
        this._geomIdleId = 0;
        this.data.launchDesktopId = 0;
        this.data.currentProcess = null;
        this.data.dbusTimeoutId = 0;
        this.data.switchWorkspaceId = 0;

        this.data.GnomeShellOverride = null;

        /* The constructor of the EmulateX11 class only initializes some
        * internal properties, but nothing else. In fact, it has its own
        * enable() and disable() methods. That's why it could have been
        * created here, in init(). But since the rule seems to be NO CLASS
        * CREATION IN INIT UNDER NO CIRCUMSTANCES...
        */
        this.data.x11Manager = null;
        this.data.visibleArea = null;

        /* Ensures that there aren't "rogue" processes.
        * This is a safeguard measure for the case of Gnome Shell being
        * relaunched (for example, under X11, with Alt+F2 and R), to kill
        * any old DING instance. That's why it must be here, in init(),
        * and not in enable() or disable() (disable already guarantees that
        * the current instance is killed).
        *
        * The suite builds a new instance of this class on every unlock, and
        * the scan below is async: run on each construction it raced the
        * launch in enable() and could kill the freshly started desktop.
        * Only the first construction in this shell process can find
        * leftovers from a previous shell, so run it once.
        */
        if (!_oldProcessesKilled) {
            _oldProcessesKilled = true;
            this.doKillAllOldDesktopProcesses();
        }
        this.data.fastFailures = 0;
        this.data.unlockRecoveryId = 0;
    }

    enable() {
        if (!this.data.GnomeShellOverride) {
            this.data.GnomeShellOverride = new GnomeShellOverride.GnomeShellOverride();
        }
        if (!this.data.x11Manager) {
            this.data.x11Manager = new EmulateX11.EmulateX11WindowType();
        }
        if (!this.DesktopIconsUsableArea) {
            this.DesktopIconsUsableArea = new VisibleArea.VisibleArea();
            this.data.visibleArea = this.DesktopIconsUsableArea;
        }
        // If the desktop is still starting up, we wait until it is ready
        if (Main.layoutManager._startingUp) {
            this.data.startupPreparedId = Main.layoutManager.connect('startup-complete', () => this.innerEnable());
        } else {
            this.data.startupPreparedId = null;
            this.innerEnable();
        }
    }

    disable() {
        this.DesktopIconsUsableArea = null;
        this.data.isEnabled = false;
        this.killCurrentProcess();
        this.data.GnomeShellOverride.disable();
        this.data.x11Manager.disable();
        this.data.visibleArea.disable();

        if (this.data.doCopyId) {
            this.data.doCopy.disconnect(this.data.doCopyId);
            this.data.doCopyId = 0;
            this.data.doCopy = undefined;
        }

        if (this.data.switchWorkspaceId) {
            global.window_manager.disconnect(this.data.switchWorkspaceId);
            this.data.switchWorkspaceId = 0;
        }
        if (this.data.doCutId) {
            this.data.doCut.disconnect(this.data.doCutId);
            this.data.doCutId = 0;
            this.data.doCut = undefined;
        }

        if (this.data.disableTimerId) {
            this.data.disableTimer.disconnect(this.data.disableTimerId);
            this.data.disableTimerId = 0;
            this.data.disableTimer = undefined;
        }
        if (this._geomIdleId) {
            GLib.source_remove(this._geomIdleId);
            this._geomIdleId = 0;
        }

        this.data.desktopGeometry = undefined;

        // disconnect signals only if connected
        if (this.data.dbusConnectionGroupId) {
            this.data.dbusConnection.unexport_action_group(this.data.dbusConnectionGroupId);
            this.data.dbusConnectionGroupId = 0;
            this.data.dbusConnection = undefined;
        }

        if (this.data.dbusConnectionId) {
            Gio.bus_unown_name(this.data.dbusConnectionId);
            this.data.dbusConnectionId = 0;
        }
        if (this.data.refreshGeometryId) {
            this.data.refreshGeometry.disconnect(this.data.refreshGeometryId);
            this.data.refreshGeometryId = 0;
        }
        this.data.actionGroup = undefined;

        if (this.data.scaleFactorId) {
            St.ThemeContext.get_for_stage(global.stage).disconnect(this.data.scaleFactorId);
            this.data.scaleFactorId = 0;
        }
        if (this.data.lockedChangedId && Main.screenShield) {
            Main.screenShield.disconnect(this.data.lockedChangedId);
            this.data.lockedChangedId = 0;
        }
        if (this.data.visibleAreaId) {
            this.data.visibleArea.disconnect(this.data.visibleAreaId);
            this.data.visibleAreaId = 0;
        }
        if (this.data.startupPreparedId) {
            Main.layoutManager.disconnect(this.data.startupPreparedId);
            this.data.startupPreparedId = 0;
        }
        if (this.data.monitorsChangedId) {
            Main.layoutManager.disconnect(this.data.monitorsChangedId);
            this.data.monitorsChangedId = 0;
        }
        if (this.data.workareasChangedId) {
            global.display.disconnect(this.data.workareasChangedId);
            this.data.workareasChangedId = 0;
        }
        if (this.data.sizeChangedId) {
            global.window_manager.disconnect(this.data.sizeChangedId);
            this.data.sizeChangedId = 0;
        }
        if (this.data.dbusTimeoutId) {
            GLib.source_remove(this.data.dbusTimeoutId);
            this.data.dbusTimeoutId = 0;
        }
        if (this.data.unlockRecoveryId) {
            GLib.source_remove(this.data.unlockRecoveryId);
            this.data.unlockRecoveryId = 0;
        }
        if (this.data.launchDesktopId) {
            GLib.source_remove(this.data.launchDesktopId);
            this.data.launchDesktopId = 0;
        }
    }

    /**
     * The true code that configures everything and launches the desktop program
     */
    innerEnable() {
        if (this.data.startupPreparedId !== null) {
            Main.layoutManager.disconnect(this.data.startupPreparedId);
            this.data.startupPreparedId = null;
        }

        this.data.GnomeShellOverride.enable();

        // under X11 we don't need to cheat, so only do all this under wayland
        if (is_wayland_compositor()) {
            this.data.x11Manager.enable();
        } else {
            this.data.switchWorkspaceId = global.window_manager.connect('switch-workspace', () => {
                let windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, global.workspace_manager.get_active_workspace());
                windows = global.display.sort_windows_by_stacking(windows);
                if (windows.length) {
                    let topWindow = windows[windows.length - 1];
                    topWindow.focus(Clutter.CURRENT_TIME);
                }
            });
        }

        /*
        * If the desktop geometry changes (because a new monitor has been added, for example),
        * we kill the desktop program. It will be relaunched automatically with the new geometry,
        * thus adapting to it on-the-fly.
        */
        this.data.monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this.updateDesktopGeometry());
        /*
        * Any change in the workareas must be detected too, for example if the used size
        * changes.
        */
        this.data.workareasChangedId = global.display.connect('workareas-changed', () => this.updateDesktopGeometry());

        /*
        * This callback allows to detect a change in the working area (like when changing the Scale value)
        */
        this.data.visibleAreaId = this.data.visibleArea.connect('updated-usable-area', () => this.updateDesktopGeometry());

        /*
         * This callback allows to detect a change in the scale factor, to adapt the desktop geometry to it.
         */
        this.data.scaleFactorId = St.ThemeContext.get_for_stage(global.stage).connect('notify::scale-factor',
            () => this.updateDesktopGeometry());

        /*
         * Recover margins and geometry when unlocking screen or waking up from lock
         */
        if (Main.screenShield) {
            this.data.lockedChangedId = Main.screenShield.connect('locked-changed', () => {
                if (!Main.screenShield.locked) {
                    // Delay slightly to let Mutter chrome and panels finish layout after unlock
                    if (this.data.unlockRecoveryId)
                        GLib.source_remove(this.data.unlockRecoveryId);
                    this.data.unlockRecoveryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 350, () => {
                        this.data.unlockRecoveryId = 0;
                        if (!this.data.isEnabled)
                            return GLib.SOURCE_REMOVE;
                        try {
                            this.data.visibleArea._refreshMargins();
                            this.updateDesktopGeometry();
                            const dtpModule = Main.extensionManager?.lookup?.('alienware-hsx2coder-gnome@hsx2coder.github.com')?.stateObj?._loaded?.get('alienware-dash-to-panel@hsx2coder');
                            if (dtpModule?.panelManager?._setDesktopIconsMargins) {
                                dtpModule.panelManager._setDesktopIconsMargins();
                            }
                        } catch (e) {
                            logError(e, 'DING screenShield unlock geometry recovery');
                        }
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });
        }

        this.data.isEnabled = true;
        this.data.fastFailures = 0;
        if (this.data.launchDesktopId) {
            GLib.source_remove(this.data.launchDesktopId);
            this.data.launchDesktopId = 0;
        }

        /*
        * Due to a problem in the Clipboard API in Gtk3, it is not possible to do the CUT/COPY operation from
        * dynamic languages like Javascript, because one of the methods needed is marked as NOT INTROSPECTABLE
        *
        * https://discourse.gnome.org/t/missing-gtk-clipboard-set-with-data-in-gtk-3/6920
        *
        * The right solution is to migrate DING to Gtk4, where the whole API is available, but that is a very
        * big task, so in the meantime, we take advantage of the fact that the St API, in Gnome Shell, can put
        * binary contents in the clipboard, so we use DBus to notify that we want to do a CUT or a COPY operation,
        * passing the URIs as parameters, and delegate that to the DING Gnome Shell extension. This is easily done
        * with a GLib.SimpleAction.
        */
        this.data.dbusConnectionId = Gio.bus_own_name(Gio.BusType.SESSION, 'com.rastersoft.dingextension', Gio.BusNameOwnerFlags.NONE, null, (connection, name) => {
            this.data.dbusConnection = connection;

            this.data.doCopy = new Gio.SimpleAction({
                name: 'doCopy',
                parameter_type: new GLib.VariantType('as'),
            });
            this.data.doCut = new Gio.SimpleAction({
                name: 'doCut',
                parameter_type: new GLib.VariantType('as'),
            });
            this.data.disableTimer = new Gio.SimpleAction({
                name: 'disableTimer',
            });
            this.data.refreshGeometry = new Gio.SimpleAction({
                name: 'refreshGeometry',
            });
            this.data.desktopGeometry = Gio.SimpleAction.new_stateful('desktopGeometry', new GLib.VariantType('av'), this.getDesktopGeometry());
            this.data.desktopGeometry.set_enabled(true);
            this.data.doCopyId = this.data.doCopy.connect('activate', (action, parameters) => this.manageCutCopy(action, parameters));
            this.data.doCutId = this.data.doCut.connect('activate', (action, parameters) => this.manageCutCopy(action, parameters));
            this.data.disableTimerId = this.data.disableTimer.connect('activate', () => {
                if (this.data.currentProcess && this.data.currentProcess.subprocess) {
                    this.data.currentProcess.cancel_timer();
                }
            });
            this.data.refreshGeometryId = this.data.refreshGeometry.connect('activate', () => {
                try {
                    // Force refresh margins from usable area and update desktop geometry
                    this.data.visibleArea._refreshMargins();
                    this.updateDesktopGeometry();
                    // Also trigger dash-to-panel sync if available
                    const dtpModule = Main.extensionManager?.lookup?.('alienware-hsx2coder-gnome@hsx2coder.github.com')?.stateObj?._loaded?.get('alienware-dash-to-panel@hsx2coder');
                    if (dtpModule?.panelManager?._setDesktopIconsMargins) {
                        dtpModule.panelManager._setDesktopIconsMargins();
                    }
                } catch (e) {
                    logError(e, 'DING refreshGeometry');
                }
            });
            this.data.actionGroup = new Gio.SimpleActionGroup();
            this.data.actionGroup.add_action(this.data.doCopy);
            this.data.actionGroup.add_action(this.data.doCut);
            this.data.actionGroup.add_action(this.data.disableTimer);
            this.data.actionGroup.add_action(this.data.refreshGeometry);
            this.data.actionGroup.add_action(this.data.desktopGeometry);

            this.data.dbusConnectionGroupId = this.data.dbusConnection.export_action_group(
                '/com/rastersoft/dingextension/control',
                this.data.actionGroup
            );
            this.launchDesktop();
        }, null);
    }

    /*
    * Before Gnome Shell 40, St API couldn't access binary data in the clipboard, only text data. Also, the
    * original Desktop Icons was a pure extension, so it was limited to what Clutter and St offered. That was
    * the reason why Nautilus accepted a text format for CUT and COPY operations in the form
    *
    *     x-special/nautilus-clipboard
    *     OPERATION
    *     FILE_URI
    *     [FILE_URI]
    *     [...]
    *
    * In Gnome Shell 40, St was enhanced and now it supports binary data; that's why Nautilus migrated to a
    * binary format identified by the atom 'x-special/gnome-copied-files', where the CUT or COPY operation is
    * shared.
    *
    */
    /**
     *
     * @param action
     * @param parameters
     */
    manageCutCopy(action, parameters) {
        let content = '';
        if (action.name == 'doCut') {
            content += 'cut\n';
        } else {
            content += 'copy\n';
        }

        let first = true;
        for (let file of parameters.recursiveUnpack()) {
            if (!first) {
                content += '\n';
            }
            first = false;
            content += file;
        }
        let obj = new TextEncoder();
        Clipboard.set_content(CLIPBOARD_TYPE, 'x-special/gnome-copied-files', new GLib.Bytes(obj.encode(content)));
    }

    /**
     * Kills the current desktop program
     */
    killCurrentProcess() {
        if (this.data.launchDesktopId) {
            GLib.source_remove(this.data.launchDesktopId);
            this.data.launchDesktopId = 0;
        }

        // kill the desktop program. It will be reloaded automatically.
        if (this.data.currentProcess && this.data.currentProcess.subprocess) {
            this.data.currentProcess.cancel_timer();
            // null once the process has already exited
            this.data.currentProcess.cancellable?.cancel();
            this.data.currentProcess.subprocess.send_signal(15);
        }
        this.data.currentProcess = null;
        this.data.x11Manager.setWaylandClient(null);
    }

    /**
     *
     */
    updateDesktopGeometry() {

        try {
        if (this._geomIdleId) {
            GLib.source_remove(this._geomIdleId);
        }
        this._geomIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._geomIdleId = 0;
            if (this.data.actionGroup && (Main.layoutManager.monitors.length != 0)) {
                this.data.actionGroup.change_action_state('desktopGeometry', this.getDesktopGeometry());
                this.data.x11Manager.refreshWindowsPosition();
            }
            return GLib.SOURCE_REMOVE;
        });
            } catch (e) {
            logError(e, 'DING');
        }
    }

    /**
     *
     */
    getDesktopGeometry() {

        try {
        let desktopVariantList = [];
        let desktopList = [];
        const ws = global.workspace_manager.get_active_workspace();
        const { scaleFactor } = St.ThemeContext.get_for_stage(global.stage);
        for (let monitorIndex = 0; monitorIndex < Main.layoutManager.monitors.length; monitorIndex++) {
            let area = this.data.visibleArea.getMonitorGeometry(ws, monitorIndex);
            let monitorData = {
                'x': area.x,
                'y': area.y,
                'width': area.width,
                'height': area.height,
                'scaleFactor': scaleFactor,
                'marginTop': area.marginTop,
                'marginBottom': area.marginBottom,
                'marginLeft': area.marginLeft,
                'marginRight': area.marginRight,
                monitorIndex,
                'primaryMonitor': Main.layoutManager.primaryIndex,
            };
            let desktopListElement = new GLib.Variant('a{sd}', monitorData);
            desktopVariantList.push(desktopListElement);
            desktopList.push(monitorData);
        }
        this.data.x11Manager.setMonitorData(desktopList);
        return new GLib.Variant('av', desktopVariantList);
            } catch (e) {
            logError(e, 'DING');
        }
    }

    /**
     * This function checks all the processes in the system and kills those
     * that are a desktop manager from the current user (but not others).
     * This allows to avoid having several ones in case gnome shell resets,
     * or other odd cases. It requires the /proc virtual filesystem, but
     * doesn't fail if it doesn't exist.
     */

    /**
     *
     */
    doKillAllOldDesktopProcesses() {
        let procFolder = Gio.File.new_for_path('/proc');
        if (!procFolder.query_exists(null)) {
            return;
        }

        let fileEnum = procFolder.enumerate_children('standard::*', Gio.FileQueryInfoFlags.NONE, null);
        let info;
        let entries = [];
        while ((info = fileEnum.next_file(null))) {
            let filename = info.get_name();
            if (filename) {
                entries.push(filename);
            }
        }

        this._killOldDesktopProcesses(entries);
    }

    /**
     * Same dangling-process cleanup as before, but each /proc/<pid>/cmdline is
     * read asynchronously and the /bin/kill subprocess is waited on asynchronously,
     * so a scan over every running process never blocks the shell's main loop
     * while the extension is being enabled.
     * @param {string[]} entries - /proc entries left to inspect
     * @param {number} index - position in entries, kept across async callbacks
     */
    _killOldDesktopProcesses(entries, index = 0) {
        while (index < entries.length) {
            let entry = entries[index];
            index++;

            let processUser = Gio.File.new_for_path(GLib.build_filenamev(['/proc', entry, 'cmdline']));
            processUser.load_bytes_async(null, (file, res) => {
                let binaryData = null;
                try {
                    binaryData = file.load_bytes_finish(res);
                } catch (e) {
                    // process vanished between the scan and the read: nothing to kill
                    binaryData = null;
                }
                if (Array.isArray(binaryData)) {
                    binaryData = binaryData[0];
                }

                let contents = '';
                if (binaryData) {
                    let readData = binaryData.get_data();
                    for (let i = 0; i < readData.length; i++) {
                        if (readData[i] < 32) {
                            contents += ' ';
                        } else {
                            contents += String.fromCharCode(readData[i]);
                        }
                    }
                }

                let path = `gjs ${GLib.build_filenamev([this.path, 'app', 'ding.js'])}`;
                // The scan is async and can still be running when enable()
                // launches the new helper: never kill our own process.
                const ownPid = this.data.currentProcess?.subprocess?.get_identifier?.();
                if (contents.startsWith(path) && entry !== ownPid) {
                    let proc = new Gio.Subprocess({argv: ['/bin/kill', entry]});
                    proc.init(null);
                    proc.wait_async(null, () => this._killOldDesktopProcesses(entries, index));
                } else {
                    this._killOldDesktopProcesses(entries, index);
                }
            });
            return;
        }
    }

    /**
     *
     * @param reloadTime
     */
    /**
     * Delay before the next respawn. A helper that ran for a while and then
     * died comes back at once; one that keeps dying young (no display for
     * Gtk, RDP session without a client, the 3 s window-detection kill) backs
     * off 1, 2, 4 ... 60 s instead of spawning a gjs+Gtk process every
     * second forever.
     *
     * @param {boolean} healthy whether the last process stayed up long enough
     * @returns {number} milliseconds
     */
    _nextRespawnDelay(healthy) {
        if (healthy) {
            this.data.fastFailures = 0;
            return 1;
        }
        this.data.fastFailures = (this.data.fastFailures ?? 0) + 1;
        const delay = Math.min(1000 * 2 ** (this.data.fastFailures - 1), RESPAWN_MAX_DELAY_MS);
        if (this.data.fastFailures === 6)
            console.warn(`DING: desktop process keeps exiting, retrying every ${RESPAWN_MAX_DELAY_MS / 1000}s at most`);
        return delay;
    }

    doRelaunch(reloadTime) {
        this.data.currentProcess = null;
        this.data.x11Manager.setWaylandClient(null);
        if (this.data.isEnabled) {
            if (this.data.launchDesktopId) {
                GLib.source_remove(this.data.launchDesktopId);
            }
            this.data.launchDesktopId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, reloadTime, () => {
                this.data.launchDesktopId = 0;
                this.launchDesktop();
                return false;
            });
        }
    }

    /**
     * Launches the desktop program, passing to it the current desktop geometry for each monitor
     * and the path where it is stored. It also monitors it, to relaunch it in case it dies or is
     * killed. Finally, it reads STDOUT and STDERR and redirects them to the journal, to help to
     * debug it.
     */
    launchDesktop() {

        try {
        console.log('Launching DING process');
        let argv = [];
        argv.push(GLib.build_filenamev([this.path, 'app', 'ding.js']));
        // Specify that it must work as true desktop
        argv.push('-E');
        // The path. Allows the program to find translations, settings and modules.
        argv.push('-P');
        argv.push(GLib.build_filenamev([this.path, 'app']));

        this.data.currentProcess = new LaunchSubprocess(0, 'DING');
        this.data.currentProcess.set_cwd(GLib.get_home_dir());
        if (this.data.currentProcess.spawnv(argv) === null) {
            this.doRelaunch(this._nextRespawnDelay(false));
            return;
        }
        this.data.x11Manager.setWaylandClient(this.data.currentProcess);
        this.data.launchTime = GLib.get_monotonic_time();

        /*
        * If the desktop process dies, wait 100ms and relaunch it, unless the exit status is different than
        * zero, in which case it will wait one second. This is done this way to avoid relaunching the desktop
        * too fast if it has a bug that makes it fail continuously, avoiding filling the journal too fast.
        */
        this.data.currentProcess.subprocess.wait_async(null, (obj, res) => {
            const delta = GLib.get_monotonic_time() - this.data.launchTime;
            try {
                obj.wait_finish(res);
            } catch (e) {
                logError(e, 'DING wait');
            }
            if (!this.data.currentProcess || obj !== this.data.currentProcess.subprocess) {
                return;
            }
            // A clean exit after the first second is an orderly shutdown of
            // the helper, not a crash loop: respawn at once as before.
            const cleanExit = obj.get_if_exited() && obj.get_exit_status() === 0;
            const healthy = delta >= RESPAWN_HEALTHY_US || (cleanExit && delta >= 1000000);
            this.doRelaunch(this._nextRespawnDelay(healthy));
        });
            } catch (e) {
            logError(e, 'DING');
        }
    }
}
/**
 * This class encapsulates the code to launch a subprocess that can detect whether a window belongs to it
 * It only accepts to do it under Wayland, because under X11 there is no need to do these tricks
 *
 * It is compatible with https://gitlab.gnome.org/GNOME/mutter/merge_requests/754 to simplify the code
 *
 * @param {int} flags Flags for the SubprocessLauncher class
 * @param {string} process_id An string id for the debug output
 */
class LaunchSubprocess {
    constructor(flags, process_id) {
        this._process_id = process_id;
        this.cancellable = new Gio.Cancellable();
        this._launcher = new Gio.SubprocessLauncher({flags: flags | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE});
        this.subprocess = null;
        this.process_running = false;
        this._launch_timer = 0;
        this._waiting_for_windows = 0;
    }

    spawnv(argv) {
        try {
            if (is_wayland_compositor()) {
                if (Meta.WaylandClient.new_subprocess) {
                    // New API introduced in https://gitlab.gnome.org/GNOME/mutter/-/merge_requests/4491
                    this._waylandClient = Meta.WaylandClient.new_subprocess (global.context, this._launcher, argv);
                    this.subprocess = this._waylandClient.get_subprocess();
                } else {
                    // Old APIs
                    try {
                        // Oldest API
                        this._waylandClient = Meta.WaylandClient.new(this._launcher);
                    } catch (e) {
                        // Not-so-old API
                        this._waylandClient = Meta.WaylandClient.new(global.context,
                                                                    this._launcher);
                    }
                    this.subprocess = this._waylandClient.spawnv(global.display, argv);
                }
            } else {
                this.subprocess = this._launcher.spawnv(argv);
            }
        } catch (e) {
            this.subprocess = null;
            console.log(`Error while trying to launch DING process: ${e.message}\n${e.stack}`);
        }
        // This is for GLib 2.68 or greater
        if (this._launcher.close) {
            this._launcher.close();
        }
        this._launcher = null;
        if (this.subprocess) {
            /*
                 * It reads STDOUT and STDERR and sends it to the journal using console.log(). This allows to
                 * have any error from the desktop app in the same journal than other extensions. Every line from
                 * the desktop program is prepended with the "process_id" parameter sent in the constructor.
                 */
            this._dataInputStream = Gio.DataInputStream.new(this.subprocess.get_stdout_pipe());
            this.read_output();
            this.subprocess.wait_async(this.cancellable, () => {
                this.process_running = false;
                this._dataInputStream = null;
                this.cancellable = null;
                if (this._launch_timer != 0) {
                    GLib.source_remove(this._launch_timer);
                    this._launch_timer = 0;
                    this._waiting_for_windows = 0;
                }
            });
            this.process_running = true;
            if (is_wayland_compositor() && (Main.layoutManager.monitors.length != 0)) {
                // This ensures that, if the DING window isn't detected in three seconds
                // after launch, the desktop will be killed and, thus, relaunched again.
                this._waiting_for_windows = Main.layoutManager.monitors.length;
                this._launch_timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                    this._launch_timer = 0;
                    this.subprocess.force_exit();
                    return false;
                });
            }
        }
        return this.subprocess;
    }

    cancel_timer() {
        if (this._launch_timer != 0) {
            GLib.source_remove(this._launch_timer);
            this._launch_timer = 0;
            this._waiting_for_windows = 0;
        }
    }

    set_cwd(cwd) {
        this._launcher.set_cwd(cwd);
    }

    read_output() {
        if (!this._dataInputStream) {
            return;
        }
        this._dataInputStream.read_line_async(GLib.PRIORITY_DEFAULT, this.cancellable, (object, res) => {
            try {
                const [output, length] = object.read_line_finish_utf8(res);
                if (length) {
                    print(`${this._process_id}: ${output}`);
                }
            } catch (e) {
                if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
                    return;
                }
                console.error(e, `${this._process_id}_Error`);
            }

            this.read_output();
        });
    }

    /**
     * Queries whether the passed window belongs to the launched subprocess or not.
     *
     * @param {MetaWindow} window The window to check.
     */
    query_window_belongs_to(window) {
        if (!is_wayland_compositor()) {
            return false;
        }
        if (!this.process_running) {
            return false;
        }
        try {
            let ownsWindow = this._waylandClient.owns_window(window);
            if (ownsWindow && (this._launch_timer != 0) && (this._waiting_for_windows != 0)) {
                console.log(`Received notification for window. ${this._waiting_for_windows - 1} notifications remaining.`);
                this._waiting_for_windows--;
                if (this._waiting_for_windows == 0) {
                    GLib.source_remove(this._launch_timer);
                    this._launch_timer = 0;
                }
            }
            return ownsWindow;
        } catch (error) {
            console.log(`Exception error: ${error.message}\n${error.stack}`);
            return false;
        }
    }

    show_in_window_list(window) {
        if (is_wayland_compositor() && this.process_running) {
            if (window.show_in_window_list) {
                window.show_in_window_list();
            } else {
                this._waylandClient.show_in_window_list(window);
            }
        }
    }

    hide_from_window_list(window) {
        if (is_wayland_compositor() && this.process_running) {
            if (window.hide_from_window_list) {
                window.hide_from_window_list();
            } else {
                this._waylandClient.hide_from_window_list(window);
            }
        }
    }
};
