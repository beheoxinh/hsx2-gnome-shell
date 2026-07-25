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

function gv(v) {
  if (v === null || v === undefined) return v
  // GVariant leaf values (from deep_unpack) — .value is the JS getter
  if (typeof v.value !== 'undefined') return v.value
  if (typeof v.deep_unpack === 'function') return v.deep_unpack()
  return v
}

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

        console.log(`${TAG} init done`)
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
          // Attach to DTP panel _rightBox, same pattern as MediaIndicator
          try { this._attachToDTP() } catch (e) {
            logError(e, `${TAG} attach failed`)
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
        // **** ROOT CAUSE FIX ***
        // parent (_leftBox) has visible=false. Force it visible.
        if (parent && !parent.visible) {
          console.log(`${TAG} *** parent invisible — showing it`)
          parent.show()
          // Also check if grandparent panel needs visibility
          let gp = parent.get_parent()
          if (gp && !gp.visible) {
            console.log(`${TAG} *** grandparent invisible — showing it`)
            gp.show()
          }
        }
      } catch (e) {
        logError(e, `${TAG} debugWidget ${label}`)
      }
    }

    _attachToDTP() {
      // Same pattern as MediaController._addToDTP()
      if (!global.dashToPanel || !global.dashToPanel.panels || global.dashToPanel.panels.length === 0) {
        // Panels not ready yet — listen for signal
        let id = global.dashToPanel.connect('panels-created', () => {
          global.dashToPanel.disconnect(id)
          this._attachToDTP()
        })
        return
      }
      const panel = global.dashToPanel.panels[0]
      if (!panel) return
      // Prefer _leftBox (LEFT_BOX element, labeled "Bluetooth Status" in settings)
      // Fall back to _rightBox
      const box = panel._leftBox || panel._rightBox
      if (!box) return
      const parent = this.get_parent()
      if (parent === box) return
      if (parent) parent.remove_child(this)
      box.add_child(this)
      console.log(`${TAG} attached to DTP ${panel._leftBox ? '_leftBox' : '_rightBox'}`)
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
        let unpacked = result.deep_unpack()
        // deep_unpack can return a single object or an array wrapping one
        objects = (unpacked && unpacked[0] && typeof unpacked[0] === 'object')
          ? unpacked[0]
          : unpacked
      } catch (e) {
        logError(e, `${TAG} deep_unpack failed`)
        return
      }
      if (!objects || typeof objects !== 'object') {
        console.log(`${TAG} poll: objects=${typeof objects} keys=${objects ? Object.keys(objects).length : 0}`)
        return
      }

      console.log(`${TAG} poll: found ${Object.keys(objects).length} object paths`)
      let devices = []
      for (let [objPath, interfaces] of Object.entries(objects)) {
        try {
          let dev = interfaces[DEVICE_IFACE]
          if (!dev) continue
          if (gv(dev.Connected) !== true) continue
          let battery = null
          if (interfaces[BATTERY_IFACE]) {
            let pct = gv(interfaces[BATTERY_IFACE].Percentage)
            if (pct != null) battery = pct
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
