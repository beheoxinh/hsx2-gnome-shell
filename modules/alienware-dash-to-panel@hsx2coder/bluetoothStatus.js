import Clutter from 'gi://Clutter'
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
// Updates are driven by bluez signals; the poll is only a safety net for a
// missed signal (bluez restart, adapter reset).
const POLL_INTERVAL_SEC = 60
const SIGNAL_DEBOUNCE_MS = 400
const PANEL_WIDTH = 200
const BATT_H = 16

function _deviceIconName(dev) {
  const icon = gv(dev.Icon) || ''
  const cls = gv(dev.Class) || 0
  const major = (cls >> 8) & 0x1f
  if (icon.includes('headset') || icon.includes('headphone')) return 'audio-headphones-symbolic'
  if (icon.includes('audio') || icon.includes('speaker') || major === 4) return 'audio-speakers-symbolic'
  if (icon.includes('keyboard')) return 'input-keyboard-symbolic'
  if (icon.includes('mouse')) return 'input-mouse-symbolic'
  if (icon.includes('phone') || major === 2) return 'phone-symbolic'
  if (major === 5) {
    const minor = (cls >> 2) & 0x3f
    return minor === 1 || minor === 2 ? 'input-gaming-symbolic' : 'input-keyboard-symbolic'
  }
  return 'bluetooth-symbolic'
}

function _batteryColor(pct) {
  if (pct >= 70) return '#4caf50'
  if (pct >= 40) return '#ff9800'
  if (pct >= 20) return '#ff5722'
  return '#f44336'
}

const DEVICE_KEYS = ['Connected', 'Name', 'Alias', 'Icon', 'Class']

// Discovery floods PropertiesChanged (RSSI, ManufacturerData...); only the
// properties the indicator shows are worth a GetManagedObjects round trip.
function _isRelevantSignal(signal, params) {
  try {
    if (signal === 'InterfacesAdded' || signal === 'InterfacesRemoved')
      return true
    if (signal !== 'PropertiesChanged') return false
    const iface = params.get_child_value(0).unpack()
    if (iface === BATTERY_IFACE) return true
    if (iface !== DEVICE_IFACE) return false
    const changed = params.get_child_value(1).deep_unpack()
    const invalidated = params.get_child_value(2).deep_unpack()
    return DEVICE_KEYS.some(k => k in changed || invalidated.includes(k))
  } catch (_e) {
    return true
  }
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
      this._isDestroyed = false
      this.add_style_class_name('panel-button')

      this._devices = []
      this._omProxy = null
      this._timerId = 0
      this._rollerIndex = 0
      this._rollerTimerId = 0
      this._animId = 0
      this._currentDevice = null
      this._signals = []
      this._bluezSubId = 0
      this._debounceId = 0
      this._initIdleId = 0
      this._cancellable = new Gio.Cancellable()

      try {
        this._myBox = new St.BoxLayout({
          style_class: 'panel-status-menu-box',
          y_expand: true,
          style: 'spacing: 8px; padding: 0 6px;',
        })
        this.add_child(this._myBox)

        this._btIndicator = new St.BoxLayout({ y_expand: true, y_align: Clutter.ActorAlign.CENTER, style: 'spacing: 4px;' })
        this._myBox.add_child(this._btIndicator)

        this._btIconLabel = new St.Icon({
          icon_name: 'bluetooth-active-symbolic',
          style_class: 'system-status-icon',
          icon_size: 16,
        })
        this._btIndicator.add_child(this._btIconLabel)

        this._btCountLabel = new St.Label({ text: '', y_align: Clutter.ActorAlign.CENTER })
        this._btIndicator.add_child(this._btCountLabel)

        this._row = new St.BoxLayout({
          x_expand: true,
          y_expand: true,
          y_align: Clutter.ActorAlign.CENTER,
          style: `width: ${PANEL_WIDTH}px; spacing: 8px;`,
        })
        this._myBox.add_child(this._row)

        this._iconLabel = new St.Icon({ icon_name: 'bluetooth-symbolic', icon_size: 16, y_align: Clutter.ActorAlign.CENTER })
        this._row.add_child(this._iconLabel)

        this._nameLabel = new St.Label({ text: 'BT', x_expand: true, y_align: Clutter.ActorAlign.CENTER })
        this._nameLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END
        this._row.add_child(this._nameLabel)

        this._battBox = new St.BoxLayout({ y_align: Clutter.ActorAlign.CENTER, style: 'spacing: 5px;' })
        this._battLabel = new St.Label({ text: '', y_align: Clutter.ActorAlign.CENTER })
        this._battBox.add_child(this._battLabel)
        this._battBar = new St.Widget({ width: 4, height: BATT_H, y_align: Clutter.ActorAlign.CENTER, style: 'background-color: rgba(255,255,255,0.15);' })
        this._battFill = new St.Widget({ width: 4, height: 0, y_align: Clutter.ActorAlign.END, style: 'background-color: #4caf50;' })
        this._battBar.add_child(this._battFill)
        this._battBox.add_child(this._battBar)
        this._battDot = new St.Widget({ width: 8, height: 8, y_align: Clutter.ActorAlign.CENTER, style: 'border-radius: 4px; background-color: #4caf50;' })
        this._battBox.add_child(this._battDot)
        this._row.add_child(this._battBox)

        this._setStaticPadding()

      } catch (e) {
        logError(e, `${TAG} init failed`)
      }

      try {
        this._deferredMenuIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this._deferredMenuIdleId = null
          this.menu = new PopupMenu.PopupMenu(this, 0.0, St.Side.BOTTOM)
          try { Main.uiGroup.add_child(this.menu.actor); this.menu.actor.hide() } catch (e) {console.warn('[dash-to-panel] _init: ' + ((e && e.message) ? e.message : e)) }
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
        this._initIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this._initIdleId = 0
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
        this._titleItem = titleItem
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
        // Async proxy creation: new_for_bus_sync blocks the shell main loop,
        // and bluez can be unresponsive right after lock/suspend.
        Gio.DBusProxy.new_for_bus(
          Gio.BusType.SYSTEM,
          Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES |
            Gio.DBusProxyFlags.DO_NOT_CONNECT_SIGNALS,
          null,
          BLUEZ_SERVICE, BLUEZ_ROOT, DBUS_OM_IFACE,
          this._cancellable,
          (_source, res) => {
            if (this._isDestroyed) return
            try {
              this._omProxy = Gio.DBusProxy.new_for_bus_finish(res)
            } catch (e) {
              logError(e, `${TAG} connect failed`)
              return
            }
            // One subscription for every bluez signal (InterfacesAdded/
            // Removed, PropertiesChanged on Connected/Battery1.Percentage);
            // bursts are coalesced into a single GetManagedObjects.
            try {
              this._bluezSubId = this._omProxy.get_connection().signal_subscribe(
                BLUEZ_SERVICE, null, null, null, null,
                Gio.DBusSignalFlags.NONE,
                (_c, _s, _p, _i, signal, params) => {
                  if (_isRelevantSignal(signal, params)) this._schedulePoll()
                },
              )
            } catch (e) {
              logError(e, `${TAG} signal subscribe failed`)
            }
            this._poll()
            this._timerId = GLib.timeout_add_seconds(
              GLib.PRIORITY_DEFAULT, POLL_INTERVAL_SEC, () => {
                try { this._poll() } catch (e) {
                  logError(e, `${TAG} poll failed`)
                }
                return GLib.SOURCE_CONTINUE
              },
            )
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
      } catch (_e) {console.warn('[dash-to-panel] _getPanelArrowSide: ' + ((_e && _e.message) ? _e.message : _e)) }
      return St.Side.BOTTOM
    }

    _attachToDTP() {
      if (this._isDestroyed) return
      if (this.get_parent()) return
      if (
        !global.dashToPanel ||
        !global.dashToPanel.panels ||
        global.dashToPanel.panels.length === 0
      ) {
        if (global.dashToPanel) {
          let id = global.dashToPanel.connect('panels-created', () => {
            try { global.dashToPanel?.disconnect(id) } catch (_e) {}
            if (this._isDestroyed) return
            try { this._attachToDTP() } catch (e) {
              logError(e, `${TAG} attach failed`)
            }
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

    _schedulePoll() {
      if (this._isDestroyed || this._debounceId) return
      this._debounceId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT, SIGNAL_DEBOUNCE_MS, () => {
          this._debounceId = 0
          this._poll()
          return GLib.SOURCE_REMOVE
        },
      )
    }

    _poll() {
      if (this._pollInFlight) {
        // a signal arrived mid-call: fetch again once it returns
        this._pollAgain = true
        return
      }
      if (!this._omProxy || this._isDestroyed)
        return
      this._pollAgain = false
      this._pollInFlight = true
      try {
        // Async call: call_sync with a 5s timeout ran inside the shell main
        // loop every 3s. When bluez stopped answering (lock, suspend, adapter
        // reset) the whole desktop froze for up to five seconds at a time.
        this._omProxy.call(
          'GetManagedObjects', null,
          Gio.DBusCallFlags.NONE, CALL_TIMEOUT, this._cancellable,
          (proxy, res) => {
            this._pollInFlight = false
            if (this._isDestroyed) return
            if (this._pollAgain) this._schedulePoll()
            let result
            try {
              result = proxy.call_finish(res)
            } catch (_e) { return }
            if (!result) return
            try {
              this._applyObjects(result)
            } catch (e) {
              logError(e, `${TAG} apply objects failed`)
            }
          },
        )
      } catch (_e) {
        this._pollInFlight = false
      }
    }

    _applyObjects(result) {
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
          let iconName = _deviceIconName(dev)
          let batteryIface = interfaces[BATTERY_IFACE]
          let batteryPct = batteryIface ? gv(batteryIface.Percentage) : null
          devices.push({
            name: gv(dev.Name) || gv(dev.Alias) || 'Unknown',
            battery: batteryPct,
            iconName,
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

    // Every connected device that is not hidden. Battery is optional, so
    // devices without Battery1 (headsets, keyboards...) are counted and cycled.
    _getVisibleDevices() {
      let hidden = this._getHiddenDevices()
      return this._devices.filter(d => hidden.indexOf(d.objPath) === -1)
    }

    _setStaticPadding() {
      this._btCountLabel.set_style('font-size: 11px; font-weight: 700; color: #8ab4f8;')
    }

    _setDisplay(d) {
      const prev = this._currentDevice
      this._currentDevice = d
      const n = this._getVisibleDevices().length
      this._btCountLabel.set_text(`${n}`)
      this._btCountLabel.visible = n > 0
      if (!d) {
        this._animateSwap(() => this._applyDisplay(null))
        return
      }
      const changed = !prev || prev.objPath !== d.objPath
      if (changed) this._animateSwap(() => this._applyDisplay(d))
      else this._applyDisplay(d)
    }

    // Roller change: the old line slides up and fades, the new one slides
    // in from below. A poll arriving mid-animation only updates the target.
    _animateSwap(apply) {
      this._pendingApply = apply
      if (!this._row || !this.mapped) {
        apply()
        return
      }
      this._row.remove_all_transitions()
      this._row.ease({
        opacity: 0,
        translation_y: -8,
        duration: 150,
        mode: Clutter.AnimationMode.EASE_IN_QUAD,
        onComplete: () => {
          if (this._isDestroyed || !this._row) return
          this._pendingApply?.()
          this._row.translation_y = 8
          this._row.ease({
            opacity: 255,
            translation_y: 0,
            duration: 240,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
          })
        },
      })
    }

    _applyDisplay(d) {
      if (!d) {
        this._iconLabel.set_icon_name('bluetooth-symbolic')
        this._nameLabel.set_text('')
        this._battLabel.hide()
        this._battBar.hide()
        this._battDot.hide()
        return
      }
      this._iconLabel.set_icon_name(d.iconName)
      this._nameLabel.set_text(d.name)
      if (d.battery != null) {
        const c = _batteryColor(d.battery)
        this._battDot.hide()
        this._battLabel.show()
        this._battBar.show()
        this._battLabel.set_text(`${d.battery}%`)
        this._battLabel.set_style(`font-size: 11px; font-weight: 700; color: ${c};`)
        this._battFill.set_style(`background-color: ${c};`)
        this._battFill.remove_all_transitions()
        this._battFill.ease({
          height: Math.max(2, Math.round(BATT_H * d.battery / 100)),
          duration: 400,
          mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        })
      } else {
        // connected, no battery report: a green dot says so
        this._battLabel.hide()
        this._battBar.hide()
        this._battDot.show()
      }
    }

    _updateUI() {
      try {
        this._cancelAnim()

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

    _updateTitle() {
      if (!this._titleItem?.label) return
      const total = this._devices.length
      const shown = this._getVisibleDevices().length
      this._titleItem.label.set_text(
        shown === total
          ? `Bluetooth \u00B7 ${total} connected`
          : `Bluetooth \u00B7 ${shown} of ${total} shown`,
      )
    }

    _rebuildMenuItems() {
      const hidden = this._getHiddenDevices()
      this._updateTitle()
      this._rowRefs = new Map()
      this._deviceSection.removeAll()
      if (this._devices.length === 0) {
        this._deviceSection.addMenuItem(
          new PopupMenu.PopupMenuItem('No connected devices', { reactive: false }),
        )
        return
      }
      this._devices.forEach((device, i) => {
        const isHidden = hidden.indexOf(device.objPath) !== -1
        const ref = this._mkDeviceRow(device, isHidden, i)
        this._rowRefs.set(device.objPath, ref)
        this._deviceSection.addMenuItem(ref.item)
      })
    }

    // Visual state of one device row; used on build and on toggle, so a
    // toggle updates the row in place (no rebuild, no flicker).
    _styleRow(ref, isHidden) {
      ref.isHidden = isHidden
      const hover = !!ref.hover
      const bg = isHidden
        ? (hover ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)')
        : (hover ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)')
      ref.card.set_style(`spacing: 12px; padding: 8px 12px; background-color: ${bg};`)
      ref.avatar.set_style('width: 40px; height: 40px;')
      ref.icon.set_style(`color: ${isHidden ? '#7a7a7a' : '#ffffff'};`)
      ref.name.set_style(`font-size: 13px; font-weight: 600; color: ${isHidden ? '#7a7a7a' : '#ffffff'};`)
      ref.sub.set_text(isHidden ? 'Hidden from panel' : ref.subText)
      ref.track.set_style(`width: 40px; height: 20px; background-color: ${isHidden ? 'rgba(255,255,255,0.16)' : '#3584e4'};`)
      ref.knob.remove_all_transitions()
      ref.knob.ease({
        translation_x: isHidden ? 3 : 23,
        duration: 200,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
      })
    }

    _mkDeviceRow(device, isHidden, index) {
      const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false })

      const card = new St.BoxLayout({
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        reactive: true,
        track_hover: true,
      })

      const avatar = new St.BoxLayout({
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
      })
      const icon = new St.Icon({ icon_name: device.iconName, icon_size: 20 })
      avatar.add_child(icon)
      card.add_child(avatar)

      const col = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style: 'spacing: 4px;',
      })
      const name = new St.Label({ text: device.name, x_expand: true })
      name.clutter_text.ellipsize = Pango.EllipsizeMode.END
      col.add_child(name)
      const subText = device.battery != null ? `Battery ${device.battery}%` : 'Connected'
      const sub = new St.Label({ text: subText, style: 'font-size: 11px; color: #8f8f8f;' })
      col.add_child(sub)
      if (device.battery != null) {
        const bar = new St.Widget({ width: 110, height: 4, style: 'background-color: rgba(255,255,255,0.12);' })
        bar.add_child(new St.Widget({
          width: Math.max(4, Math.round(110 * device.battery / 100)),
          height: 4,
          style: `background-color: ${_batteryColor(device.battery)};`,
        }))
        col.add_child(bar)
      }
      card.add_child(col)

      // switch: on = cycled in the panel. The whole row is the hit target.
      const track = new St.BoxLayout({ width: 40, height: 20, y_align: Clutter.ActorAlign.CENTER })
      const knob = new St.Widget({
        width: 14,
        height: 14,
        y_align: Clutter.ActorAlign.CENTER,
        x_align: Clutter.ActorAlign.START,
        style: 'background-color: #ffffff;',
      })
      track.add_child(knob)
      card.add_child(track)

      const ref = { item, card, avatar, icon, name, sub, subText, track, knob, hover: false }
      this._styleRow(ref, isHidden)

      card.connect('notify::hover', () => {
        ref.hover = card.hover
        this._styleRow(ref, ref.isHidden)
      })

      card.connect('button-press-event', () => {
        try {
          if (!SETTINGS) return Clutter.EVENT_STOP
          const h = SETTINGS.get_strv('bt-hidden-devices') || []
          const idx = h.indexOf(device.objPath)
          const nowHidden = idx === -1
          if (nowHidden) h.push(device.objPath)
          else h.splice(idx, 1)
          SETTINGS.set_strv('bt-hidden-devices', h)
          this._rollerIndex = 0
          this._styleRow(ref, nowHidden)
          this._updateTitle()
          this._updateUI()
        } catch (e) {
          logError(e, `${TAG} toggle hide failed`)
        }
        return Clutter.EVENT_STOP
      })

      // entrance: rows fade up one after another when the menu opens
      card.opacity = 0
      card.translation_y = 10
      card.ease({
        opacity: 255,
        translation_y: 0,
        duration: 280,
        delay: index * 50,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
      })

      item.add_child(card)
      return ref
    }

    destroy() {
      this._isDestroyed = true
      try { this._cancellable?.cancel() } catch (_) {}
      if (this._bluezSubId) {
        try { this._omProxy?.get_connection().signal_unsubscribe(this._bluezSubId) } catch (_) {}
        this._bluezSubId = 0
      }
      if (this._debounceId) { try { GLib.source_remove(this._debounceId) } catch (_) {} this._debounceId = 0 }
      if (this._initIdleId) { try { GLib.source_remove(this._initIdleId) } catch (_) {} this._initIdleId = 0 }
      this._omProxy = null
      if (this._deferredMenuIdleId) {
        try { GLib.Source.remove(this._deferredMenuIdleId); } catch (_) {}
        this._deferredMenuIdleId = null;
      }
      this._stopRoller()
      this._cancelAnim()
      this._rowRefs = null
      try { this._row?.remove_all_transitions(); this._battFill?.remove_all_transitions() } catch (_) {}
      if (this._timerId) { try { GLib.source_remove(this._timerId); this._timerId = 0 } catch (e) {} }
      if (this._rollerTimerId) { try { GLib.source_remove(this._rollerTimerId); this._rollerTimerId = 0 } catch (e) {} }
      if (this._animId) { try { GLib.source_remove(this._animId); this._animId = 0 } catch (e) {} }
      if (this.menu) { try { this.menu.destroy(); this.menu = null } catch (e) {} }
      super.destroy()
    }
  },
)
