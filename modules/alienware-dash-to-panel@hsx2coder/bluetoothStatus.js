/*
 * Bluetooth Status indicator for Dash-to-Panel
 * Displays connected Bluetooth devices with battery percentage
 * in the panel leftBox area.
 */

import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'
import St from 'gi://St'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'

const BLUEZ_SERVICE = 'org.bluez'
const BLUEZ_OBJECT_PATH = '/org/bluez'
const DBUS_OM_IFACE = 'org.freedesktop.DBus.ObjectManager'
const DBUS_PROP_IFACE = 'org.freedesktop.DBus.Properties'
const DEVICE_IFACE = 'org.bluez.Device1'
const BATTERY_IFACE = 'org.bluez.Battery1'

// BlueZ device class categories (major class bits 8-12)
const CLASS_MAJOR_MISC = 0
const CLASS_MAJOR_COMPUTER = 1
const CLASS_MAJOR_PHONE = 2
const CLASS_MAJOR_AUDIO = 4
const CLASS_MAJOR_PERIPHERAL = 5
const CLASS_MAJOR_IMAGING = 6
const CLASS_MAJOR_WEARABLE = 7

// Device icon mapping by BlueZ Icon property
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

function getDeviceIcon(deviceProps) {
  // Prefer explicit Icon property
  if (deviceProps.Icon && DEVICE_ICONS[deviceProps.Icon.value]) {
    return DEVICE_ICONS[deviceProps.Icon.value]
  }
  // Fallback to class-based detection
  if (deviceProps.Class) {
    let major = (deviceProps.Class.value >> 8) & 0x1f
    switch (major) {
      case CLASS_MAJOR_AUDIO:
        return 'audio-headphones-symbolic'
      case CLASS_MAJOR_PERIPHERAL:
        // Check minor class for mouse vs keyboard
        let minor = (deviceProps.Class.value >> 2) & 0x3f
        if (minor === 0x20 || minor === 0x21) return 'input-keyboard-symbolic'
        if (minor === 0x10 || minor === 0x11 || minor === 0x12)
          return 'input-mouse-symbolic'
        return 'input-keyboard-symbolic'
      case CLASS_MAJOR_PHONE:
        return 'phone-symbolic'
      case CLASS_MAJOR_COMPUTER:
        return 'computer-symbolic'
      default:
        return 'bluetooth-active-symbolic'
    }
  }
  return 'bluetooth-active-symbolic'
}

function getDeviceTypeLabel(deviceProps) {
  if (deviceProps.Icon && DEVICE_TYPE_LABELS[deviceProps.Icon.value]) {
    return DEVICE_TYPE_LABELS[deviceProps.Icon.value]
  }
  if (deviceProps.Class) {
    let major = (deviceProps.Class.value >> 8) & 0x1f
    switch (major) {
      case CLASS_MAJOR_AUDIO:
        return 'Audio'
      case CLASS_MAJOR_PERIPHERAL:
        return 'Peripheral'
      case CLASS_MAJOR_PHONE:
        return 'Phone'
      case CLASS_MAJOR_COMPUTER:
        return 'Computer'
      default:
        return 'Device'
    }
  }
  return 'Device'
}

function formatBattery(percentage) {
  if (percentage == null || percentage === undefined) return ''
  return `${percentage}%`
}

function getBatteryIcon(percentage) {
  if (percentage == null) return 'battery-full-symbolic'
  if (percentage <= 10) return 'battery-empty-symbolic'
  if (percentage <= 20) return 'battery-caution-symbolic'
  if (percentage <= 40) return 'battery-low-symbolic'
  if (percentage <= 60) return 'battery-good-symbolic'
  if (percentage <= 80) return 'battery-good-symbolic'
  return 'battery-full-symbolic'
}

export const BluetoothStatus = GObject.registerClass(
  class BluetoothStatus extends PanelMenu.Button {
    _init() {
      super._init(0.0, 'Bluetooth Status')

      this._devices = new Map() // objectPath -> { name, icon, connected, battery, props }
      this._proxy = null
      this._omProxy = null
      this._signalIds = []
      this._deviceSignals = new Map()

      // Panel indicator
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

      // Build popup menu
      this._buildMenu()

      // Connect to BlueZ
      this._connectToBlueZ()
    }

    _buildMenu() {
      // Header
      this._headerItem = new PopupMenu.PopupMenuItem('Bluetooth Status', {
        reactive: false,
        style_class: 'bt-menu-header',
      })
      this.menu.addMenuItem(this._headerItem)

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

      // Device list container
      this._deviceSection = new PopupMenu.PopupMenuSection()
      this.menu.addMenuItem(this._deviceSection)

      // No devices placeholder
      this._emptyItem = new PopupMenu.PopupMenuItem('No paired devices', {
        reactive: false,
      })
      this._deviceSection.addMenuItem(this._emptyItem)

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

      // Bluetooth settings
      let settingsItem = new PopupMenu.PopupMenuItem('Bluetooth Settings')
      settingsItem.connect('activate', () => {
        GLib.spawn_command_line_async('gnome-control-center bluetooth')
      })
      this.menu.addMenuItem(settingsItem)
    }

    _connectToBlueZ() {
      try {
        // Create ObjectManager proxy to track all BlueZ objects
        this._omProxy = Gio.DBusProxy.new_for_bus_sync(
          Gio.BusType.SYSTEM,
          Gio.DBusProxyFlags.NONE,
          null,
          BLUEZ_SERVICE,
          BLUEZ_OBJECT_PATH,
          DBUS_OM_IFACE,
          null,
        )

        // Initial device enumeration
        let result = this._omProxy.call(
          'GetManagedObjects',
          null,
          Gio.DBusCallFlags.NONE,
          -1,
          null,
        )
        this._parseManagedObjects(result)

        // Watch for interface additions/removals
        this._signalIds.push(
          this._omProxy.connectSignal(
            'InterfacesAdded',
            this._onInterfacesAdded.bind(this),
          ),
        )
        this._signalIds.push(
          this._omProxy.connectSignal(
            'InterfacesRemoved',
            this._onInterfacesRemoved.bind(this),
          ),
        )

        // Watch for property changes on all devices
        this._signalIds.push(
          this._omProxy.connectSignal(
            'PropertiesChanged',
            this._onPropertiesChanged.bind(this),
          ),
        )

        this._updateUI()
      } catch (e) {
        logError(e, '[BluetoothStatus] Failed to connect to BlueZ')
      }
    }

    _parseManagedObjects(result) {
      if (!result) return

      let [objects] = result.deep_unpack()
      for (let [objPath, interfaces] of Object.entries(objects)) {
        if (interfaces[DEVICE_IFACE]) {
          // Merge Battery1 properties into device props for _addDevice
          let deviceProps = { ...interfaces[DEVICE_IFACE] }
          if (interfaces[BATTERY_IFACE]) {
            deviceProps.Percentage = interfaces[BATTERY_IFACE].Percentage
          }
          this._addDevice(objPath, deviceProps)
        }
      }
    }

    _addDevice(objPath, deviceProps) {
      let name =
        (deviceProps.Name && deviceProps.Name.value) ||
        (deviceProps.Alias && deviceProps.Alias.value) ||
        'Unknown'
      let connected =
        deviceProps.Connected && deviceProps.Connected.value === true
      let paired = deviceProps.Paired && deviceProps.Paired.value === true
      let icon = getDeviceIcon(deviceProps)
      let typeLabel = getDeviceTypeLabel(deviceProps)
      let battery = null

      // Check battery
      // Battery may come from a separate interface in the managed objects
      // or from the device's Battery1 interface
      if (deviceProps.Percentage) {
        battery = deviceProps.Percentage.value
      }

      this._devices.set(objPath, {
        name,
        connected,
        paired,
        icon,
        typeLabel,
        battery,
        props: deviceProps,
      })

      // Watch for property changes on this specific device
      this._watchDeviceProperties(objPath)
    }

    _watchDeviceProperties(objPath) {
      // We already handle properties via the ObjectManager PropertiesChanged signal
      // But we also subscribe per-device for Battery1 changes
      let subId = Gio.DBus.system.signal_subscribe(
        BLUEZ_SERVICE,
        DBUS_PROP_IFACE,
        'PropertiesChanged',
        objPath,
        null,
        Gio.DBusSignalFlags.NONE,
        (conn, sender, path, iface, signal, params) => {
          this._onDevicePropertiesChanged(path, params)
        },
      )
      this._deviceSignals.set(objPath, subId)
    }

    _onInterfacesAdded(proxy, sender, [objPath, interfaces]) {
      if (interfaces[DEVICE_IFACE]) {
        // Merge Battery1 if also present
        let deviceProps = { ...interfaces[DEVICE_IFACE] }
        if (interfaces[BATTERY_IFACE] && interfaces[BATTERY_IFACE].Percentage) {
          deviceProps.Percentage = interfaces[BATTERY_IFACE].Percentage
        }
        this._addDevice(objPath, deviceProps)
        this._updateUI()
      }
      // Battery may appear as a separate interface
      if (interfaces[BATTERY_IFACE]) {
        this._updateDeviceBattery(objPath, interfaces[BATTERY_IFACE])
        this._updateUI()
      }
    }

    _onInterfacesRemoved(proxy, sender, [objPath, interfaces]) {
      let ifaceNames = interfaces.deep_unpack ? interfaces.deep_unpack() : interfaces
      if (ifaceNames.includes && ifaceNames.includes(DEVICE_IFACE)) {
        // Clean up device signals
        if (this._deviceSignals.has(objPath)) {
          Gio.DBus.system.signal_unsubscribe(this._deviceSignals.get(objPath))
          this._deviceSignals.delete(objPath)
        }
        this._devices.delete(objPath)
        this._updateUI()
      }
    }

    _onPropertiesChanged(proxy, sender, [objPath, changedProps, invalidated]) {
      // This is the ObjectManager-level PropertiesChanged
      // Individual device property changes come through per-device subscriptions
    }

    _onDevicePropertiesChanged(objPath, params) {
      let [ifaceName, changedProps] = params.deep_unpack()
      let device = this._devices.get(objPath)
      if (!device) return

      if (ifaceName === DEVICE_IFACE) {
        if (changedProps.Connected) {
          device.connected = changedProps.Connected.value
        }
        if (changedProps.Name) {
          device.name = changedProps.Name.value
        }
        if (changedProps.Alias) {
          device.name = changedProps.Alias.value
        }
      }

      if (ifaceName === BATTERY_IFACE) {
        if (changedProps.Percentage != null) {
          device.battery =
            changedProps.Percentage != null
              ? changedProps.Percentage.value
              : null
        }
      }

      this._updateUI()
    }

    _updateDeviceBattery(objPath, batteryProps) {
      let device = this._devices.get(objPath)
      if (!device) return
      if (batteryProps.Percentage) {
        device.battery = batteryProps.Percentage.value
      }
    }

    _updateUI() {
      // Find all connected devices
      let connected = []
      let allPaired = []

      for (let [, device] of this._devices) {
        if (device.paired) allPaired.push(device)
        if (device.connected) connected.push(device)
      }

      // Sort connected: audio first, then peripherals
      connected.sort((a, b) => {
        let aAudio = a.icon.includes('audio') ? 0 : 1
        let bAudio = b.icon.includes('audio') ? 0 : 1
        return aAudio - bAudio
      })

      // Update panel indicator
      if (connected.length > 0) {
        // Show first connected device (primary)
        let primary = connected[0]
        let battStr = formatBattery(primary.battery)
        this._statusLabel.text =
          connected.length > 1
            ? `${primary.name} +${connected.length - 1}`
            : primary.name
        if (battStr) {
          this._btIcon.icon_name = getBatteryIcon(primary.battery)
        } else {
          this._btIcon.icon_name = 'bluetooth-active-symbolic'
        }
        this._panelBox.style = ''
      } else {
        this._statusLabel.text = ''
        this._btIcon.icon_name = 'bluetooth-active-symbolic'
        this._panelBox.style = 'opacity: 0.5'
      }

      // Rebuild device section in popup menu
      this._deviceSection.removeAll()

      if (allPaired.length === 0) {
        this._emptyItem = new PopupMenu.PopupMenuItem('No paired devices', {
          reactive: false,
        })
        this._deviceSection.addMenuItem(this._emptyItem)
      } else {
        // Connected first, then disconnected
        let sorted = [...allPaired].sort((a, b) => {
          if (a.connected && !b.connected) return -1
          if (!a.connected && b.connected) return 1
          return a.name.localeCompare(b.name)
        })

        for (let device of sorted) {
          let item = new PopupMenu.PopupMenuItem('', { reactive: true })

          // Build custom actor for the menu item
          let box = new St.BoxLayout({
            style_class: 'bt-menu-device-box',
            x_expand: true,
          })

          // Device icon
          let devIcon = new St.Icon({
            icon_name: device.icon,
            style_class: 'popup-menu-icon',
          })
          box.add_child(devIcon)

          // Device name + type
          let textBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
          })

          let nameLabel = new St.Label({
            text: device.name,
            style_class: 'bt-device-name',
          })
          textBox.add_child(nameLabel)

          let detailLabel = new St.Label({
            text: device.typeLabel,
            style_class: 'bt-device-detail',
          })
          textBox.add_child(detailLabel)

          box.add_child(textBox)

          // Status + battery on the right
          let rightBox = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.END,
          })

          if (device.connected) {
            let statusLabel = new St.Label({
              text: 'Connected',
              style_class: 'bt-status-connected',
            })
            rightBox.add_child(statusLabel)
          } else {
            let statusLabel = new St.Label({
              text: 'Paired',
              style_class: 'bt-status-paired',
            })
            rightBox.add_child(statusLabel)
          }

          if (device.battery != null) {
            let battIcon = new St.Icon({
              icon_name: getBatteryIcon(device.battery),
              style_class: 'popup-menu-icon',
            })
            let battLabel = new St.Label({
              text: `${device.battery}%`,
              style_class: 'bt-battery-label',
              y_align: Clutter.ActorAlign.CENTER,
            })
            let battBox = new St.BoxLayout({
              x_align: Clutter.ActorAlign.END,
            })
            battBox.add_child(battIcon)
            battBox.add_child(battLabel)
            rightBox.add_child(battBox)
          }

          box.add_child(rightBox)

          item.add_child(box)

          // Click to connect/disconnect
          item.connect('activate', () => {
            this._toggleConnection(device)
          })

          this._deviceSection.addMenuItem(item)
        }
      }
    }

    _toggleConnection(device) {
      // Find the object path for this device
      let objPath = null
      for (let [path, dev] of this._devices) {
        if (dev === device) {
          objPath = path
          break
        }
      }
      if (!objPath) return

      this._toggleBlueZConnection(objPath, device.connected)
    }

    _toggleBlueZConnection(objPath, wasConnected) {
      try {
        let method = wasConnected ? 'Disconnect' : 'Connect'
        Gio.DBus.system.call_sync(
          BLUEZ_SERVICE,
          objPath,
          DEVICE_IFACE,
          method,
          null,
          null,
          Gio.DBusCallFlags.NONE,
          -1,
          null,
        )
      } catch (e) {
        logError(e, `[BluetoothStatus] Failed to ${wasConnected ? 'disconnect' : 'connect'} device`)
      }
    }

    destroy() {
      // Clean up D-Bus subscriptions
      for (let [, subId] of this._deviceSignals) {
        Gio.DBus.system.signal_unsubscribe(subId)
      }
      this._deviceSignals.clear()

      this._devices.clear()
      super.destroy()
    }
  },
)
