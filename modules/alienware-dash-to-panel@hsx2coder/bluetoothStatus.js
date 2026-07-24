/*
 * Bluetooth Status indicator for Dash-to-Panel
 * Displays connected Bluetooth devices with battery percentage
 * in the panel leftBox area.
 *
 * Uses BlueZ D-Bus (system bus):
 *   - GetManagedObjects returns {path -> {iface -> {prop: <GVariant>}}}
 *   - After deep_unpack(), leaf values are still GVariant — use .value
 *   - Per-device PropertiesChanged subscriptions for Battery1 updates
 *
 * CRASH SAFETY: Every method that touches D-Bus or widgets is wrapped
 * in try/catch so a Bluetooth hiccup never kills gnome-shell.
 * _updateUI is debounced to prevent Clutter add_child assertion failures
 * from concurrent signal handlers.
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
const DBUS_PROP_IFACE = 'org.freedesktop.DBus.Properties'
const DEVICE_IFACE = 'org.bluez.Device1'
const BATTERY_IFACE = 'org.bluez.Battery1'
const CALL_TIMEOUT = 5000

const DEVICE_ICONS = {
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

const DEVICE_TYPE_LABELS = {
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

function gv(str) { return str && str.value !== undefined ? str.value : str }
function gvInt(n) { return n && n.value !== undefined ? n.value : n }

function getDeviceIcon(props) {
  let icon = gv(props.Icon)
  if (icon && DEVICE_ICONS[icon]) return DEVICE_ICONS[icon]
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
  if (icon && DEVICE_TYPE_LABELS[icon]) return DEVICE_TYPE_LABELS[icon]
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

function gvBattery(pct) {
  return pct != null ? (pct.value !== undefined ? pct.value : pct) : null
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

      this._devices = new Map()
      this._omProxy = null
      this._signalIds = []
      this._deviceSignals = new Map()
      this._idleId = 0
      this._connected = false
      this._updateQueued = false

      try {
        this._panelBox = new St.BoxLayout({
          style_class: 'panel-status-menu-box bt-status-panel',
        })

        this._btIcon = new St.Icon({
          icon_name: 'bluetooth-active-symbolic',
          style_class: 'system-status-icon',
        })
        this._panelBox.add_child(this._btIcon)

        this._statusLabel = new St.Label({
          text: '',
          y_align: Clutter.ActorAlign.CENTER,
          style_class: 'bt-status-label',
        })
        this._panelBox.add_child(this._statusLabel)

        this.add_child(this._panelBox)
        this._buildMenu()
      } catch (e) {
        logError(e, `${TAG} Failed to build panel UI`)
      }

      try {
        this._idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this._idleId = 0
          try {
            this._connectToBlueZ()
          } catch (e) {
            logError(e, `${TAG} BlueZ idle connect failed`)
          }
          return GLib.SOURCE_REMOVE
        })
      } catch (e) {
        logError(e, `${TAG} Failed to schedule idle connect`)
      }
    }

    _buildMenu() {
      try {
        this._headerItem = new PopupMenu.PopupMenuItem('Bluetooth Status', {
          reactive: false,
        })
        this.menu.addMenuItem(this._headerItem)
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

        this._deviceSection = new PopupMenu.PopupMenuSection()
        this.menu.addMenuItem(this._deviceSection)

        this._emptyItem = new PopupMenu.PopupMenuItem('No paired devices', {
          reactive: false,
        })
        this._deviceSection.addMenuItem(this._emptyItem)

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

        let settingsItem = new PopupMenu.PopupMenuItem('Bluetooth Settings')
        settingsItem.connect('activate', () => {
          try {
            GLib.spawn_command_line_async('gnome-control-center bluetooth')
          } catch (e) {
            logError(e, `${TAG} Failed to spawn BT settings`)
          }
        })
        this.menu.addMenuItem(settingsItem)
      } catch (e) {
        logError(e, `${TAG} Failed to build menu`)
      }
    }

    _connectToBlueZ() {
      if (this._connected) return
      try {
        this._omProxy = Gio.DBusProxy.new_for_bus_sync(
          Gio.BusType.SYSTEM,
          Gio.DBusProxyFlags.NONE, null,
          BLUEZ_SERVICE, BLUEZ_ROOT, DBUS_OM_IFACE, null,
        )
      } catch (e) {
        logError(e, `${TAG} DBusProxy.new_for_bus_sync failed — BlueZ not available?`)
        return
      }

      try {
        let result = this._omProxy.call_sync(
          'GetManagedObjects', null,
          Gio.DBusCallFlags.NONE, CALL_TIMEOUT, null,
        )
        this._parseManagedObjects(result)
      } catch (e) {
        logError(e, `${TAG} GetManagedObjects failed`)
        return
      }

      try {
        this._signalIds.push({
          id: this._omProxy.connectSignal(
            'InterfacesAdded', this._onInterfacesAdded.bind(this)),
          proxy: this._omProxy,
        })
        this._signalIds.push({
          id: this._omProxy.connectSignal(
            'InterfacesRemoved', this._onInterfacesRemoved.bind(this)),
          proxy: this._omProxy,
        })
        this._connected = true
      } catch (e) {
        logError(e, `${TAG} connectSignal failed`)
      }

      this._updateUI()
    }

    _parseManagedObjects(result) {
      try {
        if (!result) return
        let [objects] = result.deep_unpack()
        if (!objects || typeof objects !== 'object') return
        for (let [objPath, interfaces] of Object.entries(objects)) {
          try {
            if (!interfaces[DEVICE_IFACE]) continue
            let dev = interfaces[DEVICE_IFACE]
            if (interfaces[BATTERY_IFACE] && interfaces[BATTERY_IFACE].Percentage != null) {
              dev.Percentage = interfaces[BATTERY_IFACE].Percentage
            }
            this._addDevice(objPath, dev)
          } catch (e) {
            logError(e, `${TAG} Failed to parse device ${objPath}`)
          }
        }
      } catch (e) {
        logError(e, `${TAG} _parseManagedObjects failed`)
      }
    }

    _addDevice(objPath, props) {
      try {
        let name = gv(props.Name) || gv(props.Alias) || 'Unknown'
        let connected = gv(props.Connected) === true
        let paired = gv(props.Paired) === true
        let battery = null
        if (props.Percentage != null) battery = gvBattery(props.Percentage)

        this._devices.set(objPath, {
          name, connected, paired,
          icon: getDeviceIcon(props),
          typeLabel: getDeviceTypeLabel(props),
          battery,
        })

        this._watchDeviceProperties(objPath)
      } catch (e) {
        logError(e, `${TAG} _addDevice failed for ${objPath}`)
      }
    }

    _watchDeviceProperties(objPath) {
      try {
        let subId = Gio.DBus.system.signal_subscribe(
          BLUEZ_SERVICE, DBUS_PROP_IFACE, 'PropertiesChanged',
          objPath, null, Gio.DBusSignalFlags.NONE,
          (conn, sender, path, iface, signal, params) => {
            this._onDevicePropertiesChanged(path, params)
          },
        )
        this._deviceSignals.set(objPath, subId)
      } catch (e) {
        logError(e, `${TAG} signal_subscribe failed for ${objPath}`)
      }
    }

    _onInterfacesAdded(proxy, senderName, signalName, params) {
      try {
        let [objPath, interfaces] = params.deep_unpack()
        if (interfaces[DEVICE_IFACE]) {
          let dev = interfaces[DEVICE_IFACE]
          if (interfaces[BATTERY_IFACE] && interfaces[BATTERY_IFACE].Percentage != null) {
            dev.Percentage = interfaces[BATTERY_IFACE].Percentage
          }
          this._addDevice(objPath, dev)
        } else if (interfaces[BATTERY_IFACE]) {
          this._updateDeviceBattery(objPath, interfaces[BATTERY_IFACE])
        }
        this._updateUI()
      } catch (e) {
        logError(e, `${TAG} InterfacesAdded handler`)
      }
    }

    _onInterfacesRemoved(proxy, senderName, signalName, params) {
      try {
        let [objPath, ifaces] = params.deep_unpack()
        if (!ifaces.includes(DEVICE_IFACE)) return
        if (this._deviceSignals.has(objPath)) {
          Gio.DBus.system.signal_unsubscribe(this._deviceSignals.get(objPath))
          this._deviceSignals.delete(objPath)
        }
        this._devices.delete(objPath)
        this._updateUI()
      } catch (e) {
        logError(e, `${TAG} InterfacesRemoved handler`)
      }
    }

    _onDevicePropertiesChanged(objPath, params) {
      try {
        let [ifaceName, changedProps] = params.deep_unpack()
        let device = this._devices.get(objPath)
        if (!device) return

        if (ifaceName === DEVICE_IFACE) {
          if (changedProps.Connected != null)
            device.connected = gv(changedProps.Connected)
          if (changedProps.Name)
            device.name = gv(changedProps.Name)
          if (changedProps.Alias)
            device.name = gv(changedProps.Alias)
        }
        if (ifaceName === BATTERY_IFACE && changedProps.Percentage != null)
          device.battery = gvBattery(changedProps.Percentage)

        this._updateUI()
      } catch (e) {
        logError(e, `${TAG} PropertiesChanged handler`)
      }
    }

    _updateDeviceBattery(objPath, batteryProps) {
      try {
        let device = this._devices.get(objPath)
        if (!device) return
        if (batteryProps.Percentage != null)
          device.battery = gvBattery(batteryProps.Percentage)
      } catch (e) {
        logError(e, `${TAG} _updateDeviceBattery failed for ${objPath}`)
      }
    }

    /* ---- UI (debounced) ---- */

    _updateUI() {
      // Coalesce rapid signal bursts (InterfacesAdded + PropertiesChanged
      // fire together on connect) into a single Clutter-safe rebuild.
      // Without debounce, concurrent removeAll/add_child calls trigger
      // clutter_actor_add_child: assertion 'child->priv->parent == NULL'
      // which is a C-level assertion — JS try/catch cannot catch it.
      if (this._updateQueued) return
      this._updateQueued = true
      try {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this._updateQueued = false
          try {
            this._doUpdateUI()
          } catch (e) {
            logError(e, `${TAG} _doUpdateUI failed`)
          }
          return GLib.SOURCE_REMOVE
        })
      } catch (e) {
        this._updateQueued = false
        logError(e, `${TAG} Failed to schedule _updateUI`)
      }
    }

    _doUpdateUI() {
      let connected = []
      let allPaired = []

      for (let [, device] of this._devices) {
        if (device.paired) allPaired.push(device)
        if (device.connected) connected.push(device)
      }

      // Panel label
      if (connected.length > 0) {
        let primary = connected.sort((a, b) =>
          (a.icon.includes('audio') ? 0 : 1) - (b.icon.includes('audio') ? 0 : 1)
        )[0]
        this._statusLabel.text = connected.length > 1
          ? `${primary.name} +${connected.length - 1}`
          : primary.name
        this._btIcon.icon_name = primary.battery != null
          ? batteryIcon(primary.battery)
          : 'bluetooth-active-symbolic'
        this._panelBox.style = ''
      } else {
        this._statusLabel.text = ''
        this._btIcon.icon_name = 'bluetooth-active-symbolic'
        this._panelBox.style = 'opacity: 0.5'
      }

      // Popup menu — full rebuild. removeAll() unparent everything first,
      // then we add fresh widgets. Single-threaded via debounce ensures
      // no concurrent removeAll/add_child race.
      this._deviceSection.removeAll()

      if (allPaired.length === 0) {
        this._emptyItem = new PopupMenu.PopupMenuItem('No paired devices', {
          reactive: false,
        })
        this._deviceSection.addMenuItem(this._emptyItem)
        return
      }

      let sorted = [...allPaired].sort((a, b) => {
        if (a.connected && !b.connected) return -1
        if (!a.connected && b.connected) return 1
        return a.name.localeCompare(b.name)
      })

      for (let device of sorted) {
        let item = new PopupMenu.PopupMenuItem('', { reactive: true })

        let box = new St.BoxLayout({ style_class: 'bt-menu-device-box', x_expand: true })

        let devIcon = new St.Icon({ icon_name: device.icon, style_class: 'popup-menu-icon' })
        box.add_child(devIcon)

        let textBox = new St.BoxLayout({ vertical: true, x_expand: true, x_align: Clutter.ActorAlign.START })
        textBox.add_child(new St.Label({ text: device.name }))
        textBox.add_child(new St.Label({ text: device.typeLabel, style_class: 'bt-detail' }))
        box.add_child(textBox)

        let rightBox = new St.BoxLayout({ vertical: true, x_align: Clutter.ActorAlign.END })
        rightBox.add_child(new St.Label({
          text: device.connected ? 'Connected' : 'Paired',
        }))

        if (device.battery != null) {
          let battBox = new St.BoxLayout({ x_align: Clutter.ActorAlign.END })
          battBox.add_child(new St.Icon({ icon_name: batteryIcon(device.battery), style_class: 'popup-menu-icon' }))
          battBox.add_child(new St.Label({ text: `${device.battery}%`, y_align: Clutter.ActorAlign.CENTER }))
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
      let objPath = null
      for (let [path, dev] of this._devices) {
        if (dev === device) { objPath = path; break }
      }
      if (!objPath) return

      try {
        let method = device.connected ? 'Disconnect' : 'Connect'
        let proxy = new Gio.DBusProxy.new_for_bus_sync(
          Gio.BusType.SYSTEM, Gio.DBusProxyFlags.NO_AUTO_START, null,
          BLUEZ_SERVICE, objPath, DEVICE_IFACE, null,
        )
        proxy.call_sync(method, null, Gio.DBusCallFlags.NONE, CALL_TIMEOUT, null)
      } catch (e) {
        logError(e, `${TAG} Toggle connection failed`)
      }
    }

    destroy() {
      try {
        if (this._idleId) {
          GLib.source_remove(this._idleId)
          this._idleId = 0
        }
        this._updateQueued = false
        for (let entry of this._signalIds) {
          try {
            if (entry.proxy && entry.id) entry.proxy.disconnectSignal(entry.id)
          } catch (e) {
            logError(e, `${TAG} disconnectSignal failed`)
          }
        }
        this._signalIds = []
        for (let [, subId] of this._deviceSignals) {
          try {
            Gio.DBus.system.signal_unsubscribe(subId)
          } catch (e) {
            logError(e, `${TAG} signal_unsubscribe failed`)
          }
        }
        this._deviceSignals.clear()
        this._devices.clear()
        this._connected = false
      } catch (e) {
        logError(e, `${TAG} destroy cleanup failed`)
      }
      try {
        super.destroy()
      } catch (e) {
        logError(e, `${TAG} super.destroy() failed`)
      }
    }
  },
)
