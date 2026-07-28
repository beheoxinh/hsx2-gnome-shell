import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'
import Pango from 'gi://Pango'
import St from 'gi://St'

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'

import { SETTINGS } from './extension.js'

const TAG = '[BT]'
const BLUEZ_SERVICE = 'org.bluez'
const BLUEZ_ROOT = '/'
const DBUS_OM_IFACE = 'org.freedesktop.DBus.ObjectManager'
const DEVICE_IFACE = 'org.bluez.Device1'
const BATTERY_IFACE = 'org.bluez.Battery1'
const CALL_TIMEOUT = 5000
const POLL_INTERVAL_SEC = 3
const PANEL_WIDTH = 200

function _deviceIcon(dev) {
  let icon = gv(dev.Icon) || ''
  let cls = gv(dev.Class) || 0
  let major = (cls >> 8) & 0x1f

  if (icon.includes('headset') || icon.includes('headphone') || icon.includes('audio-headset'))
    return '\uD83C\uDFA7'
  if (icon.includes('audio') || icon.includes('speaker') || major === 4)
    return '\uD83D\uDD0A'
  if (icon.includes('input-keyboard') || icon.includes('keyboard'))
    return '\u2328\uFE0F'
  if (icon.includes('input-mouse') || icon.includes('mouse'))
    return '\uD83D\uDDB1\uFE0F'
  if (major === 5) {
    let minor = (cls >> 2) & 0x3f
    if (minor === 1 || minor === 2) return '\uD83C\uDFAE'
    return '\u2328\uFE0F'
  }
  return '\uD83D\uDCF6'
}

function _batteryColor(pct) {
  if (pct >= 70) return '#4caf50'
  if (pct >= 40) return '#ff9800'
  if (pct >= 20) return '#ff5722'
  return '#f44336'
}

function gv(v) {
  if (v === null || v === undefined) return v
  if (typeof v.value !== 'undefined') return v.value
  if (typeof v.deep_unpack === 'function') return v.deep_unpack()
  return v
}

export const BluetoothStatus = GObject.registerClass(
  class BluetoothStatus extends St.Button {
    vfunc_button_press_event(event) {
      if (this.menu) {
        if (this.menu.isOpen) this.menu.close()
        else this.menu.open()
      }
      return true
    }

    _init() {
      super._init({ reactive: true, track_hover: true })
      this.add_style_class_name('panel-button')

      this._devices = []
      this._omProxy = null
      this._timerId = 0
      this._rollerIndex = 0
      this._rollerTimerId = 0
      this._animId = 0
      this._currentDevice = null
      this._signals = []

      try {
        this._myBox = new St.BoxLayout({
          style_class: 'panel-status-menu-box',
          y_expand: true,
        })
        this.add_child(this._myBox)

        this._btIndicator = new St.BoxLayout({
          y_expand: true,
        })
        this._myBox.add_child(this._btIndicator)

        this._btIconLabel = new St.Icon({
          icon_name: 'bluetooth-active-symbolic',
          style_class: 'system-status-icon',
          icon_size: 16,
        })
        this._btIndicator.add_child(this._btIconLabel)

        this._btCountLabel = new St.Label({ text: '' })
        this._btIndicator.add_child(this._btCountLabel)

        this._row = new St.BoxLayout({
          x_expand: true,
          y_expand: true,
          style: `width: ${PANEL_WIDTH}px;`,
        })
        this._myBox.add_child(this._row)

        this._iconLabel = new St.Label({ text: '\uD83D\uDCF6' })
        this._row.add_child(this._iconLabel)

        this._battLabel = new St.Label({ text: '' })
        this._row.add_child(this._battLabel)

        this._nameLabel = new St.Label({ text: 'BT', x_expand: true })
        this._nameLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END
        this._row.add_child(this._nameLabel)

        this._setStaticPadding()

      } catch (e) {
        logError(e, `${TAG} init failed`)
      }

      try {
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this.menu = new PopupMenu.PopupMenu(this, 0.0, St.Side.BOTTOM)
          try { Main.uiGroup.add_child(this.menu.actor); this.menu.actor.hide() } catch (e) {}
          this._localMgr = new PopupMenu.PopupMenuManager(this)
          this._localMgr.addMenu(this.menu)
          this._buildMenu()
          this.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen) {
              try { this._rebuildMenuItems() } catch (e) {
                logError(e, `${TAG} menu rebuild failed`)
              }
            }
          })
          return GLib.SOURCE_REMOVE
        })
      } catch (e) {
        logError(e, `${TAG} menu init failed`)
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

    _buildMenu() {
      try {
        let titleItem = new PopupMenu.PopupMenuItem('Connected Bluetooth Devices', {
          reactive: false,
        })
        if (titleItem.label) titleItem.label.x_align = 2
        this.menu.addMenuItem(titleItem)
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
        this._deviceSection = new PopupMenu.PopupMenuSection()
        this.menu.addMenuItem(this._deviceSection)
        this._deviceSection.addMenuItem(
          new PopupMenu.PopupMenuItem('Loading...', { reactive: false }),
        )
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
        let settingsItem = new PopupMenu.PopupMenuItem('Bluetooth Settings')
        if (settingsItem.label) settingsItem.label.x_align = 2
        settingsItem.connect('activate', () => {
          try {
            GLib.spawn_command_line_async('gnome-control-center bluetooth')
          } catch (e) {
            logError(e, `${TAG} settings`)
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

    _getPanelArrowSide() {
      try {
        const p = global.dashToPanel?.panels?.[0]
        if (p?.getPosition) {
          const pos = p.getPosition()
          // popup arrow points opposite to panel edge
          if (pos === St.Side.TOP) return St.Side.BOTTOM
          if (pos === St.Side.BOTTOM) return St.Side.TOP
          if (pos === St.Side.LEFT) return St.Side.RIGHT
          if (pos === St.Side.RIGHT) return St.Side.LEFT
        }
      } catch (_e) {}
      return St.Side.BOTTOM
    }

    _attachToDTP() {
      if (this.get_parent()) return
      if (
        !global.dashToPanel ||
        !global.dashToPanel.panels ||
        global.dashToPanel.panels.length === 0
      ) {
        if (global.dashToPanel) {
          let id = global.dashToPanel.connect('panels-created', () => {
            global.dashToPanel.disconnect(id)
            this._attachToDTP()
          })
        }
        return
      }
      const panel = global.dashToPanel.panels[0]
      if (!panel) return
      const box = panel._leftBox || panel._rightBox
      if (!box) return
      const parent = this.get_parent()
      if (parent && parent === box) return
      if (parent) parent.remove_child(this)
      box.add_child(this)
      // Update menu arrow side to match panel position
      const arrowSide = this._getPanelArrowSide()
      if (this.menu?.actor?._delegate) {
        const bp = this.menu.actor
        if (typeof bp.updateArrowSide === 'function')
          bp.updateArrowSide(arrowSide)
      }
    }

    _poll() {
      let result
      try {
        result = this._omProxy.call_sync(
          'GetManagedObjects', null,
          Gio.DBusCallFlags.NONE, CALL_TIMEOUT, null,
        )
      } catch (_e) { return }
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
          let icon = _deviceIcon(dev)
          let batteryIface = interfaces[BATTERY_IFACE]
          let batteryPct = batteryIface ? gv(batteryIface.Percentage) : null
          devices.push({
            name: gv(dev.Name) || gv(dev.Alias) || 'Unknown',
            battery: batteryPct,
            icon,
            objPath,
          })
        } catch (e) {
          logError(e, `${TAG} parse ${objPath}`)
        }
      }

      this._devices = devices
      this._updateUI()
    }

    _getHiddenDevices() {
      try {
        if (!SETTINGS) return []
        return SETTINGS.get_strv('bt-hidden-devices') || []
      } catch (e) {
        return []
      }
    }

    _getVisibleDevices() {
      let hidden = this._getHiddenDevices()
      return this._devices.filter(d =>
        d.battery != null && hidden.indexOf(d.objPath) === -1
      )
    }

    _setStaticPadding() {
      this._btCountLabel.set_style('padding: 0 4px 0 2px; font-size: 9px;')
      this._btCountLabel.y_align = 2
      this._battLabel.set_style('padding: 0 4px;')
      this._battLabel.y_align = 2
      this._iconLabel.set_style('padding: 0 4px 0 0;')
      this._iconLabel.y_align = 2
      this._nameLabel.set_style('padding: 0;')
      this._nameLabel.y_align = 2
    }

    _setDisplay(d) {
      this._currentDevice = d
      this._btCountLabel.set_text(`${this._getVisibleDevices().length}`)
      if (!d) {
        this._iconLabel.set_text('')
        this._battLabel.set_text('')
        this._battLabel.set_style(`padding: 0 4px;`)
        this._nameLabel.set_text('')
        return
      }
      this._iconLabel.set_text(d.icon)
      this._battLabel.set_text(`${d.battery}%`)
      this._battLabel.set_style(`padding: 0 4px; color: ${_batteryColor(d.battery)};`)
      this._nameLabel.set_text(d.name)
    }

    _updateUI() {
      try {
        this._cancelAnim()
        this._row.translation_y = 0

        let visible = this._getVisibleDevices()

        if (visible.length === 0) {
          this._stopRoller()
          this._setDisplay(null)
          return
        }

        if (this._rollerIndex >= visible.length)
          this._rollerIndex = 0

        this._setDisplay(visible[this._rollerIndex])

        if (visible.length > 1) {
          if (!this._rollerTimerId) this._startRoller()
        } else {
          this._stopRoller()
        }
      } catch (e) {
        logError(e, `${TAG} update UI failed`)
      }
    }

    _startRoller() {
      this._stopRoller()
      let intervalSec = SETTINGS ? SETTINGS.get_int('bt-roller-interval') : 30
      if (intervalSec < 10) intervalSec = 10
      if (intervalSec > 300) intervalSec = 300
      this._rollerTimerId = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT, intervalSec, () => {
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
      let visible = this._getVisibleDevices()
      if (visible.length < 2) return
      this._rollerIndex = (this._rollerIndex + 1) % visible.length
      this._setDisplay(visible[this._rollerIndex])
    }

    _rebuildMenuItems() {
      this._deviceSection.removeAll()
      let visible = this._getVisibleDevices()
      if (this._devices.length === 0) {
        this._deviceSection.addMenuItem(
          new PopupMenu.PopupMenuItem('No connected devices', { reactive: false }),
        )
        return
      }
      let hidden = this._getHiddenDevices()
      for (let device of this._devices) {
        let item = new PopupMenu.PopupMenuItem('', { reactive: false })
        let box = new St.BoxLayout({ x_expand: true })
        let isHidden = hidden.indexOf(device.objPath) !== -1

        let checkBtn = new St.Button({
          style: 'padding: 0 6px 0 0;',
          reactive: true,
          x_align: 0,
        })
        let checkLabel = new St.Label({
          text: isHidden ? '\u2610' : '\u2611',
          style: isHidden ? 'color: #888;' : 'color: #4caf50;',
        })
        checkBtn.add_child(checkLabel)
        checkBtn.connect('button-press-event', () => {
          try {
            let h = SETTINGS.get_strv('bt-hidden-devices') || []
            let idx = h.indexOf(device.objPath)
            if (idx === -1) {
              h.push(device.objPath)
            } else {
              h.splice(idx, 1)
            }
            SETTINGS.set_strv('bt-hidden-devices', h)
            this._rollerIndex = 0
            this._updateUI()
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
              try { this._rebuildMenuItems() } catch(e) {}
              return GLib.SOURCE_REMOVE
            })
          } catch (e) {
            logError(e, `${TAG} toggle hide failed`)
          }
          return true
        })
        box.add_child(checkBtn)

        box.add_child(new St.Label({
          text: `${device.icon} `,
          style: 'padding-right: 2px;',
        }))
        box.add_child(new St.Label({ text: device.name, x_expand: true }))
        if (device.battery != null) {
          box.add_child(new St.Label({
            text: `${device.battery}%`,
            style: `padding-left: 6px; color: ${_batteryColor(device.battery)};`,
          }))
        }
        item.add_child(box)
        this._deviceSection.addMenuItem(item)
      }
    }

    destroy() {
      this._stopRoller()
      this._cancelAnim()
      if (this._timerId) { try { GLib.source_remove(this._timerId); this._timerId = 0 } catch (e) {} }
      if (this._rollerTimerId) { try { GLib.source_remove(this._rollerTimerId); this._rollerTimerId = 0 } catch (e) {} }
      if (this._animId) { try { GLib.source_remove(this._animId); this._animId = 0 } catch (e) {} }
      if (this.menu) { try { this.menu.destroy(); this.menu = null } catch (e) {} }
      super.destroy()
    }
  },
)
