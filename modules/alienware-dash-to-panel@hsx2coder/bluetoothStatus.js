/*
 * Bluetooth Status indicator for Dash-to-Panel
 * Uses polling (5s) via BlueZ GetManagedObjects.
 * Menu rebuilt on open.
 */

import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'
import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'

const TAG = '[BT]'
const BLUEZ_SERVICE = 'org.bluez'
const BLUEZ_ROOT = '/'
const DBUS_OM_IFACE = 'org.freedesktop.DBus.ObjectManager'
const DEVICE_IFACE = 'org.bluez.Device1'
const BATTERY_IFACE = 'org.bluez.Battery1'
const CALL_TIMEOUT = 5000
const POLL_INTERVAL_SEC = 5

function gv(str) { return str && str.value !== undefined ? str.value : str }

export const BluetoothStatus = GObject.registerClass(
  class BluetoothStatus extends PanelMenu.Button {
    _init() {
      super._init(0.0, 'Bluetooth Status')

      this._devices = []
      this._omProxy = null
      this._timerId = 0
      this._connected = false

      try {
        // Create our own box — same pattern as MediaIndicator/PanelUI
        this._myBox = new St.BoxLayout({
          style_class: 'panel-status-menu-box',
        })
        this.add_child(this._myBox)

        // Simple label only for now
        this._label = new St.Label({ text: 'BT' })
        this._myBox.add_child(this._label)

        // Debug: verify we're in the panel tree
        let parent = this.get_parent()
        let me = Main.panel ? 'hasPanel' : 'noPanel'
        console.log(`${TAG} init: parent=${!!parent} ${me} myBox ok label ok`)
        if (parent) {
          console.log(`${TAG} parent type=${parent.constructor.name} children=${parent.get_children().length}`)
          let idx = parent.get_children().indexOf(this)
          console.log(`${TAG} myIndex=${idx}`)
        }
        // Check leftBox directly
        if (Main.panel) {
          let lb = Main.panel._leftBox || Main.panel._leftBox
          // In dash-to-panel, _leftBox might be on the panel or elsewhere
          console.log(`${TAG} Main.panel._leftBox=${!!Main.panel._leftBox} children=${Main.panel._leftBox ? Main.panel._leftBox.get_children().length : -1}`)
        }

        this._buildMenu()

        this.menu.connect('open-state-changed', (menu, isOpen) => {
          if (isOpen) {
            try { this._rebuildMenuItems() } catch (e) {
              logError(e, `${TAG} menu rebuild failed`)
            }
          }
        })
      } catch (e) {
        logError(e, `${TAG} init failed`)
      }

      // Start polling on idle
      try {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          try { this._connectAndPoll() } catch (e) {
            logError(e, `${TAG} init poll failed`)
          }
          return GLib.SOURCE_REMOVE
        })
      } catch (e) {
        logError(e, `${TAG} idle init failed`)
      }
    }

    _buildMenu() {
      try {
        this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Bluetooth Status', {
          reactive: false,
        }))
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
        this._deviceSection = new PopupMenu.PopupMenuSection()
        this.menu.addMenuItem(this._deviceSection)
        this._deviceSection.addMenuItem(new PopupMenu.PopupMenuItem(
          'Loading...', { reactive: false },
        ))
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

        let settingsItem = new PopupMenu.PopupMenuItem('Bluetooth Settings')
        settingsItem.connect('activate', () => {
          try {
            GLib.spawn_command_line_async('gnome-control-center bluetooth')
          } catch (e) {
            logError(e, `${TAG} BT settings`)
          }
        })
        this.menu.addMenuItem(settingsItem)
      } catch (e) {
        logError(e, `${TAG} buildMenu failed`)
      }
    }

    _connectAndPoll() {
      console.log(`${TAG} connect`)
      try {
        this._omProxy = Gio.DBusProxy.new_for_bus_sync(
          Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
          BLUEZ_SERVICE, BLUEZ_ROOT, DBUS_OM_IFACE, null,
        )
        this._connected = true
        this._poll()
        this._timerId = GLib.timeout_add_seconds(
          GLib.PRIORITY_DEFAULT, POLL_INTERVAL_SEC, () => {
            try { this._poll() } catch (e) {
              logError(e, `${TAG} poll failed`)
            }
            return GLib.SOURCE_CONTINUE
          },
        )
        // Debug timers: log widget state at 1s, 3s, 10s
        this._debugTimer1 = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
          this._debugWidget('t=1s')
          return GLib.SOURCE_REMOVE
        })
        this._debugTimer3 = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
          this._debugWidget('t=3s')
          return GLib.SOURCE_REMOVE
        })
        this._debugTimer10 = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10000, () => {
          this._debugWidget('t=10s')
          return GLib.SOURCE_REMOVE
        })
      } catch (e) {
        logError(e, `${TAG} connect failed`)
      }
    }

    _debugWidget(label) {
      try {
        let parent = this.get_parent()
        let [wMin, wNat] = this.get_preferred_width(-1)
        let [hMin, hNat] = this.get_preferred_height(-1)
        let aw = this.get_width()
        let ah = this.get_height()
        let mapped = this.mapped
        let vis = this.visible
        let pv = parent ? (parent.visible + '/' + parent.mapped) : '-'
        console.log(`${TAG} ${label}: parent=${!!parent} vis=${vis} mapped=${mapped} pref=(${wNat},${hNat}) alloc=(${aw},${ah}) parentV=${pv} labelW=${this._label.get_width()} labelH=${this._label.get_height()}`
        )
      } catch (e) {
        logError(e, `${TAG} debugWidget ${label}`)
      }
    }

    _poll() {
      console.log(`${TAG} poll`)
      let result
      try {
        result = this._omProxy.call_sync(
          'GetManagedObjects', null,
          Gio.DBusCallFlags.NONE, CALL_TIMEOUT, null,
        )
      } catch (e) {
        return
      }
      if (!result) return

      let objects
      try {
        [objects] = result.deep_unpack()
      } catch (e) {
        logError(e, `${TAG} deep_unpack failed`)
        return
      }
      if (!objects || typeof objects !== 'object') return

      let devices = []
      for (let [objPath, interfaces] of Object.entries(objects)) {
        try {
          let dev = interfaces[DEVICE_IFACE]
          if (!dev) continue
          if (gv(dev.Connected) !== true) continue
          let battery = null
          if (interfaces[BATTERY_IFACE] && interfaces[BATTERY_IFACE].Percentage != null) {
            let pct = interfaces[BATTERY_IFACE].Percentage
            battery = pct && pct.value !== undefined ? pct.value : pct
          }
          devices.push({
            name: gv(dev.Name) || gv(dev.Alias) || 'Unknown',
            battery,
            objPath,
          })
        } catch (e) {
          logError(e, `${TAG} parse ${objPath}`)
        }
      }

      this._devices = devices
      this._updateUI()
    }

    _updateUI() {
      try {
        if (this._devices.length > 0) {
          let d = this._devices[0]
          this._label.text = d.battery != null ? `${d.name} ${d.battery}%` : d.name
          console.log(`${TAG} show: "${this._label.text}"`)
        } else {
          this._label.text = 'BT\u00A0'
          console.log(`${TAG} show: no devices`)
        }
      } catch (e) {
        logError(e, `${TAG} update failed`)
      }
    }

    _rebuildMenuItems() {
      this._deviceSection.removeAll()
      if (this._devices.length === 0) {
        this._deviceSection.addMenuItem(new PopupMenu.PopupMenuItem(
          'No connected devices', { reactive: false },
        ))
        return
      }
      let sorted = [...this._devices].sort((a, b) =>
        a.name.localeCompare(b.name),
      )
      for (let device of sorted) {
        let item = new PopupMenu.PopupMenuItem('', { reactive: true })
        let box = new St.BoxLayout({ style_class: 'bt-menu-device-box', x_expand: true })
        box.add_child(new St.Label({ text: device.name, x_expand: true }))
        if (device.battery != null) {
          box.add_child(new St.Label({ text: `${device.battery}%` }))
        }
        item.add_child(box)
        item.connect('activate', () => this._toggleConnection(device))
        this._deviceSection.addMenuItem(item)
      }
    }

    _toggleConnection(device) {
      try {
        let proxy = new Gio.DBusProxy.new_for_bus_sync(
          Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NO_AUTO_START, null,
          BLUEZ_SERVICE, device.objPath, DEVICE_IFACE, null,
        )
        proxy.call_sync('Disconnect', null, Gio.DBusCallFlags.NONE, CALL_TIMEOUT, null)
      } catch (e) {
        logError(e, `${TAG} disconnect failed`)
      }
    }

    destroy() {
      try {
        if (this._timerId) {
          GLib.source_remove(this._timerId)
          this._timerId = 0
        }
        ;['_debugTimer1','_debugTimer3','_debugTimer10'].forEach(t => {
          if (this[t]) { GLib.source_remove(this[t]); this[t] = 0 }
        })
        this._omProxy = null
        this._devices = []
        this._connected = false
      } catch (e) {
        logError(e, `${TAG} destroy failed`)
      }
      try {
        super.destroy()
      } catch (e) {
        logError(e, `${TAG} super.destroy failed`)
      }
    }
  },
)
