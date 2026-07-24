/*
 * Bluetooth Status indicator for Dash-to-Panel
 * Displays connected Bluetooth devices with battery percentage
 * in the panel leftBox area.
 *
 * Uses polling (5s) via BlueZ GetManagedObjects to list devices and
 * update battery levels. No D-Bus signal subscriptions — avoids all
 * C→JS boundary crash vectors and Clutter assertion races from
 * signal-triggered widget manipulation.
 *
 * Menu items are rebuilt on demand when the user opens the menu.
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
function gvInt(n) { return n && n.value !== undefined ? n.value : n }

function getDeviceIcon(props) {
  let icon = gv(props.Icon)
  if (icon && icon in ICONS) return ICONS[icon]
  let cls = gvInt(props.Class)
  if (cls != null) {
    let major = (cls >> 8) & 0x1f
    if (major === 4) return 'audio-headphones-symbolic'
    if (major === 5) {
      let minor = (cls >> 2) & 0x3f
      if (minor >= 0x20 && minor <= 0x21) return 'input-keyboard-symbolic'
      if (minor >= 0x10 && minor <= 0x12) return 'input-mouse-symbolic'
      return 'input-keyboard-symbolic'
    }
    if (major === 2) return 'phone-symbolic'
    if (major === 1) return 'computer-symbolic'
  }
  return 'bluetooth-active-symbolic'
}

function getDeviceTypeLabel(props) {
  let icon = gv(props.Icon)
  if (icon && icon in TYPE_LABELS) return TYPE_LABELS[icon]
  let cls = gvInt(props.Class)
  if (cls != null) {
    let major = (cls >> 8) & 0x1f
    if (major === 4) return 'Audio'
    if (major === 5) return 'Peripheral'
    if (major === 2) return 'Phone'
    if (major === 1) return 'Computer'
  }
  return 'Device'
}

const ICONS = {
  'audio-headset': 'audio-headphones-symbolic',
  'audio-headphones': 'audio-headphones-symbolic',
  'audio-speakers': 'audio-speakers-symbolic',
  'audio-card': 'audio-speakers-symbolic',
  'input-mouse': 'input-mouse-symbolic',
  'input-keyboard': 'input-keyboard-symbolic',
  'input-gaming': 'input-gaming-symbolic',
  'phone': 'phone-symbolic',
  'computer': 'computer-symbolic',
  'video-display': 'video-display-symbolic',
}

const TYPE_LABELS = {
  'audio-headset': 'Headset',
  'audio-headphones': 'Headphones',
  'audio-speakers': 'Speaker',
  'audio-card': 'Audio',
  'input-mouse': 'Mouse',
  'input-keyboard': 'Keyboard',
  'input-gaming': 'Gaming',
  'phone': 'Phone',
  'computer': 'Computer',
  'video-display': 'Display',
}

function batteryIcon(pct) {
  if (pct == null) return 'battery-level-100-symbolic'
  if (pct <= 10) return 'battery-level-10-symbolic'
  if (pct <= 20) return 'battery-level-20-symbolic'
  if (pct <= 30) return 'battery-level-30-symbolic'
  if (pct <= 40) return 'battery-level-40-symbolic'
  if (pct <= 50) return 'battery-level-50-symbolic'
  if (pct <= 60) return 'battery-level-60-symbolic'
  if (pct <= 70) return 'battery-level-70-symbolic'
  if (pct <= 80) return 'battery-level-80-symbolic'
  if (pct <= 90) return 'battery-level-90-symbolic'
  return 'battery-level-100-symbolic'
}

export const BluetoothStatus = GObject.registerClass(
  class BluetoothStatus extends PanelMenu.Button {
    _init() {
      super._init(0.0, 'Bluetooth Status')

      this._devices = []
      this._omProxy = null
      this._timerId = 0
      this._connected = false
      this._pollCount = 0

      try {
        this._btIcon = new St.Icon({
          icon_name: 'bluetooth-active-symbolic',
          style_class: 'system-status-icon',
          icon_size: 16,
          y_align: Clutter.ActorAlign.CENTER,
        })
        this.add_child(this._btIcon)

        this._statusLabel = new St.Label({
          text: '\u00A0\u00A0',  // NBSPs — non-collapsible, ensures width > 0
          style_class: 'bt-status-label',
        })
        this.add_child(this._statusLabel)

        this._buildMenu()
        console.log(`${TAG} panel built`)

        // Rebuild menu items on open (using latest device data)
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

      // Connect on idle, then start polling
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

    /* ---- Polling ---- */

    _connectAndPoll() {
      console.log(`${TAG} _connectAndPoll start`)
      try {
        console.log(`${TAG} creating DBusProxy for BlueZ`)
        this._omProxy = Gio.DBusProxy.new_for_bus_sync(
          Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NONE, null,
          BLUEZ_SERVICE, BLUEZ_ROOT, DBUS_OM_IFACE, null,
        )
        console.log(`${TAG} DBusProxy OK, connected=${this._connected}`)
        this._connected = true
        this._poll()
        this._timerId = GLib.timeout_add_seconds(
          GLib.PRIORITY_DEFAULT, POLL_INTERVAL_SEC, () => {
            try { this._poll() } catch (e) {
              logError(e, `${TAG} poll tick failed`)
            }
            return GLib.SOURCE_CONTINUE
          },
        )
      } catch (e) {
        logError(e, `${TAG} connectAndPoll failed`)
      }
    }

    _poll() {
      console.log(`${TAG} _poll start`)
      let result
      try {
        result = this._omProxy.call_sync(
          'GetManagedObjects', null,
          Gio.DBusCallFlags.NONE, CALL_TIMEOUT, null,
        )
        console.log(`${TAG} _poll got result: ${!!result}`)
      } catch (e) {
        // BlueZ not responding — keep last known state
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
          let props = {
            name: gv(dev.Name) || gv(dev.Alias) || 'Unknown',
            icon: getDeviceIcon(dev),
            typeLabel: getDeviceTypeLabel(dev),
            battery: null,
            objPath,
          }
          if (interfaces[BATTERY_IFACE] && interfaces[BATTERY_IFACE].Percentage != null) {
            let pct = interfaces[BATTERY_IFACE].Percentage
            props.battery = pct && pct.value !== undefined ? pct.value : pct
          }
          devices.push(props)
        } catch (e) {
          logError(e, `${TAG} parse device ${objPath}`)
        }
      }

      this._devices = devices
      this._updateIndicator()
      // Visibility check every 3 polls (every ~15s)
      if (this._pollCount % 3 === 0) this._checkVisibility()
      this._pollCount++
    }

    /* ---- Panel indicator ---- */

    _updateIndicator() {
      try {
        if (this._devices.length > 0) {
          let primary = this._devices.sort((a, b) =>
            (a.icon.includes('audio') ? 0 : 1) - (b.icon.includes('audio') ? 0 : 1)
          )[0]
          let labelText = this._devices.length > 1
            ? `${primary.name} +${this._devices.length - 1}`
            : primary.name
          this._statusLabel.text = labelText
          this._btIcon.icon_name = primary.battery != null
            ? batteryIcon(primary.battery)
            : 'bluetooth-active-symbolic'
          console.log(`${TAG} indicator: label="${labelText}" icon=${this._btIcon.icon_name}`)
        } else {
          this._statusLabel.text = '\u00A0\u00A0'
          this._btIcon.icon_name = 'bluetooth-active-symbolic'
          console.log(`${TAG} indicator: no devices, NBSP label`)
        }
      } catch (e) {
        logError(e, `${TAG} indicator update failed`)
      }
    }

    /* ---- Visibility check (debug) ---- */

    _checkVisibility() {
      try {
        let parent = this.get_parent()
        let grandparent = parent ? parent.get_parent() : null
        let [wMin, wNat] = this.get_preferred_width(-1)
        let [hMin, hNat] = this.get_preferred_height(-1)
        let allocW = this.get_width()
        let allocH = this.get_height()
        let mapped = this.mapped
        let visible = this.visible
        console.log(`${TAG} VIS: parent=${!!parent} gp=${!!grandparent}` +
          ` mapped=${mapped} visible=${visible}` +
          ` prefW=${wNat} prefH=${hNat}` +
          ` alloc=(${allocW},${allocH})` +
          ` children=${this.get_children().length}` +
          ` labelW=${this._statusLabel ? this._statusLabel.get_width() : -1}` +
          ` iconW=${this._btIcon ? this._btIcon.get_width() : -1}` +
          (parent ? ` parentChildren=${parent.get_children().length}` : '')
        )
        // Also check leftBox visibility
        let leftBox = global && Main && Main.panel ? Main.panel._leftBox : null
        if (leftBox) {
          console.log(`${TAG} leftBox: visible=${leftBox.visible} mapped=${leftBox.mapped}` +
            ` width=${leftBox.get_width()} height=${leftBox.get_height()}` +
            ` children=${leftBox.get_children().length}`)
        }
      } catch (e) {
        logError(e, `${TAG} visibility check failed`)
      }
    }

    /* ---- Menu items (on open) ---- */

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

        let devIcon = new St.Icon({ icon_name: device.icon, style_class: 'popup-menu-icon' })
        box.add_child(devIcon)

        let textBox = new St.BoxLayout({
          vertical: true, x_expand: true,
          x_align: Clutter.ActorAlign.START,
        })
        textBox.add_child(new St.Label({ text: device.name }))
        textBox.add_child(new St.Label({ text: device.typeLabel, style_class: 'bt-detail' }))
        box.add_child(textBox)

        let rightBox = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.END })
        rightBox.add_child(new St.Label({ text: 'Connected' }))

        if (device.battery != null) {
          let battBox = new St.BoxLayout({ x_align: Clutter.ActorAlign.END })
          battBox.add_child(new St.Icon({
            icon_name: batteryIcon(device.battery),
            style_class: 'popup-menu-icon',
          }))
          battBox.add_child(new St.Label({
            text: `${device.battery}%`,
            y_align: Clutter.ActorAlign.CENTER,
          }))
          rightBox.add_child(battBox)
        }

        box.add_child(rightBox)
        item.add_child(box)

        item.connect('activate', () => this._toggleConnection(device))
        this._deviceSection.addMenuItem(item)
      }
    }

    /* ---- Actions ---- */

    _toggleConnection(device) {
      try {
        let method = 'Disconnect'
        let proxy = new Gio.DBusProxy.new_for_bus_sync(
          Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NO_AUTO_START, null,
          BLUEZ_SERVICE, device.objPath, DEVICE_IFACE, null,
        )
        proxy.call_sync(method, null, Gio.DBusCallFlags.NONE, CALL_TIMEOUT, null)
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
