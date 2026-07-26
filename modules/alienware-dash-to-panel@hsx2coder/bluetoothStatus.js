/*
 * Bluetooth Status indicator for Dash-to-Panel
 * Uses polling (5s) via BlueZ GetManagedObjects.
 * Shows all connected devices with scrolling roller animation.
 * Configurable width via alienware-suite bt-panel-width setting.
 */

import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'
import Pango from 'gi://Pango'
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
const ROLLER_INTERVAL_MS = 3000
const ROLLER_ANIMATION_MS = 400

function gv(v) {
  if (v === null || v === undefined) return v
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
      this._rollerIndex = 0
      this._rollerTimerId = 0
      this._animId = 0
      this._lineHeight = 20

      // Read configurable panel width from alienware-suite settings
      this._panelWidth = 150
      try {
        let s = Gio.Settings.new('org.gnome.shell.extensions.alienware-suite')
        this._panelWidth = s.get_int('bt-panel-width') || 150
        s.run_dispose()
      } catch (_e) {
        // Use default
      }

      try {
        this._myBox = new St.BoxLayout({
          style_class: 'panel-status-menu-box',
        })
        this.add_child(this._myBox)

        // ScrollView clips content to its allocation — perfect for roller
        this._scrollView = new St.ScrollView({
          hscrollbar_policy: St.PolicyType.NEVER,
          vscrollbar_policy: St.PolicyType.NEVER,
          style: `width: ${this._panelWidth}px;`,
        })
        this._scrollView.y_fill = true
        this._scrollView.y_expand = true
        this._myBox.add_child(this._scrollView)

        // Vertical box of device labels
        this._rollerBox = new St.BoxLayout({
          vertical: true,
          x_expand: true,
        })
        this._scrollView.add_child(this._rollerBox)

        this._showStaticLabel('BT\u00A0')

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

      try {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          try { this._connectAndPoll() } catch (e) {
            logError(e, `${TAG} init poll failed`)
          }
          try { this._attachToDTP() } catch (e) {
            logError(e, `${TAG} attach failed`)
          }
          return GLib.SOURCE_REMOVE
        })
      } catch (e) {
        logError(e, `${TAG} idle init failed`)
      }
    }

    _showStaticLabel(text) {
      this._rollerBox.destroy_all_children()
      this._rollerBox.add_child(new St.Label({ text }))
    }

    _buildMenu() {
      try {
        this.menu.addMenuItem(new PopupMenu.PopupMenuItem('Bluetooth Status', {
          reactive: false,
        }))
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
        this._deviceSection = new PopupMenu.PopupMenuSection()
        this.menu.addMenuItem(this._deviceSection)
        this._deviceSection.addMenuItem(
          new PopupMenu.PopupMenuItem('Loading...', { reactive: false }),
        )
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
      } catch (e) {
        logError(e, `${TAG} connect failed`)
      }
    }

    _attachToDTP() {
      if (
        !global.dashToPanel ||
        !global.dashToPanel.panels ||
        global.dashToPanel.panels.length === 0
      ) {
        let id = global.dashToPanel.connect('panels-created', () => {
          global.dashToPanel.disconnect(id)
          this._attachToDTP()
        })
        return
      }
      const panel = global.dashToPanel.panels[0]
      if (!panel) return
      const box = panel._leftBox || panel._rightBox
      if (!box) return
      const parent = this.get_parent()
      if (parent === box) return
      if (parent) parent.remove_child(this)
      box.add_child(this)
    }

    _poll() {
      let result
      try {
        result = this._omProxy.call_sync(
          'GetManagedObjects', null,
          Gio.DBusCallFlags.NONE, CALL_TIMEOUT, null,
        )
      } catch (_e) {
        return
      }
      if (!result) return

      let objects
      try {
        let unpacked = result.deep_unpack()
        objects =
          unpacked && unpacked[0] && typeof unpacked[0] === 'object'
            ? unpacked[0]
            : unpacked
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

    /* ========== Roller UI ========== */

    _updateUI() {
      try {
        this._stopRoller()
        this._cancelAnim()

        this._rollerBox.destroy_all_children()

        if (this._devices.length === 0) {
          this._showStaticLabel('BT\u00A0')
          return
        }

        // Apply panel width
        this._scrollView.set_style(`width: ${this._panelWidth}px;`)

        // Add labels for all devices
        for (let d of this._devices) {
          let text =
            d.battery != null ? `${d.name}  ${d.battery}%` : d.name
          let label = new St.Label({ text, x_expand: true })
          label.clutter_text.ellipsize = Pango.EllipsizeMode.END
          this._rollerBox.add_child(label)
        }

        // Duplicate first label at end for seamless wrap-around
        if (this._devices.length > 1) {
          let first = this._devices[0]
          let firstText =
            first.battery != null
              ? `${first.name}  ${first.battery}%`
              : first.name
          let clone = new St.Label({ text: firstText, x_expand: true })
          clone.clutter_text.ellipsize = Pango.EllipsizeMode.END
          this._rollerBox.add_child(clone)
        }

        // Measure line height from first label
        this._measureLineHeight()

        // Reset scroll position
        let adj = this._getAdjustment()
        if (adj) adj.set_value(0)

        this._rollerIndex = 0

        // Start roller if more than 1 device
        if (this._devices.length > 1) this._startRoller()
      } catch (e) {
        logError(e, `${TAG} update UI failed`)
      }
    }

    _measureLineHeight() {
      try {
        let first = this._rollerBox.get_first_child()
        if (first) {
          let [, nat] = first.get_preferred_height(-1)
          if (nat > 0) {
            this._lineHeight = nat
            return
          }
        }
      } catch (_e) {
        // fallback
      }
      this._lineHeight = 20
    }

    _getAdjustment() {
      try {
        return this._scrollView.vscroll.adjustment
      } catch (_e) {
        return null
      }
    }

    _startRoller() {
      this._stopRoller()
      this._rollerTimerId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        ROLLER_INTERVAL_MS,
        () => {
          this._advanceRoller()
          return GLib.SOURCE_CONTINUE
        },
      )
    }

    _stopRoller() {
      if (this._rollerTimerId) {
        GLib.source_remove(this._rollerTimerId)
        this._rollerTimerId = 0
      }
    }

    _cancelAnim() {
      if (this._animId) {
        GLib.source_remove(this._animId)
        this._animId = 0
      }
    }

    _advanceRoller() {
      let n = this._devices.length
      if (n < 2) return

      // If at ghost-duplicate position, snap back to start
      if (this._rollerIndex >= n) {
        this._rollerIndex = 0
        let adj = this._getAdjustment()
        if (adj) adj.set_value(0)
        return
      }

      // Next device
      this._rollerIndex++
      let targetY = this._rollerIndex * this._lineHeight
      this._animateScroll(targetY)
    }

    _animateScroll(targetY) {
      let adj = this._getAdjustment()
      if (!adj) return

      this._cancelAnim()

      let startVal = adj.get_value()
      let diff = targetY - startVal
      if (Math.abs(diff) < 1) return

      let startTime = GLib.get_monotonic_time()
      let durationUs = ROLLER_ANIMATION_MS * 1000

      this._animId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        16,
        () => {
          let elapsed = GLib.get_monotonic_time() - startTime
          let frac = Math.min(elapsed / durationUs, 1)
          // ease-out-cubic
          let t = frac
          let eased = 1 - (1 - t) * (1 - t) * (1 - t)
          adj.set_value(startVal + diff * eased)

          if (frac >= 1) {
            this._animId = 0
            return GLib.SOURCE_REMOVE
          }
          return GLib.SOURCE_CONTINUE
        },
      )
    }

    /* ========== Menu ========== */

    _rebuildMenuItems() {
      this._deviceSection.removeAll()
      if (this._devices.length === 0) {
        this._deviceSection.addMenuItem(
          new PopupMenu.PopupMenuItem('No connected devices', {
            reactive: false,
          }),
        )
        return
      }
      let sorted = [...this._devices].sort((a, b) =>
        a.name.localeCompare(b.name),
      )
      for (let device of sorted) {
        let item = new PopupMenu.PopupMenuItem('', { reactive: true })
        let box = new St.BoxLayout({
          style_class: 'bt-menu-device-box',
          x_expand: true,
        })
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
        let proxy = Gio.DBusProxy.new_for_bus_sync(
          Gio.BusType.SYSTEM,
          Gio.DBusProxyFlags.NO_AUTO_START,
          null,
          BLUEZ_SERVICE,
          device.objPath,
          DEVICE_IFACE,
          null,
        )
        proxy.call_sync(
          'Disconnect',
          null,
          Gio.DBusCallFlags.NONE,
          CALL_TIMEOUT,
          null,
        )
      } catch (e) {
        logError(e, `${TAG} disconnect failed`)
      }
    }

    destroy() {
      try {
        this._stopRoller()
        this._cancelAnim()
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
