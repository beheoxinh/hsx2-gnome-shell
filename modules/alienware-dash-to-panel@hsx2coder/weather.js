import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'
import Soup from 'gi://Soup'
import St from 'gi://St'

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'
const TAG = '[WX]'
const WX_POLL_SEC = 1800

const WMO = {
  0: { e: '\u2600\uFE0F', d: 'Clear' },
  1: { e: '\uD83C\uDF24\uFE0F', d: 'Mainly Clear' },
  2: { e: '\u26C5', d: 'Partly Cloudy' },
  3: { e: '\u2601\uFE0F', d: 'Overcast' },
  45: { e: '\uD83C\uDF2B\uFE0F', d: 'Foggy' },
  48: { e: '\uD83C\uDF2B\uFE0F', d: 'Deposit Fog' },
  51: { e: '\uD83C\uDF26\uFE0F', d: 'Light Drizzle' },
  53: { e: '\uD83C\uDF26\uFE0F', d: 'Moderate Drizzle' },
  55: { e: '\uD83C\uDF26\uFE0F', d: 'Dense Drizzle' },
  61: { e: '\uD83C\uDF27\uFE0F', d: 'Slight Rain' },
  63: { e: '\uD83C\uDF27\uFE0F', d: 'Moderate Rain' },
  65: { e: '\uD83C\uDF27\uFE0F', d: 'Heavy Rain' },
  71: { e: '\u2744\uFE0F', d: 'Slight Snow' },
  73: { e: '\u2744\uFE0F', d: 'Moderate Snow' },
  75: { e: '\u2744\uFE0F', d: 'Heavy Snow' },
  80: { e: '\uD83C\uDF26\uFE0F', d: 'Light Showers' },
  81: { e: '\uD83C\uDF26\uFE0F', d: 'Moderate Showers' },
  82: { e: '\uD83C\uDF26\uFE0F', d: 'Violent Showers' },
  85: { e: '\uD83C\uDF28\uFE0F', d: 'Snow Showers' },
  86: { e: '\uD83C\uDF28\uFE0F', d: 'Snow Showers' },
  95: { e: '\u26C8\uFE0F', d: 'Thunderstorm' },
  96: { e: '\u26C8\uFE0F', d: 'Thunderstorm' },
  99: { e: '\u26C8\uFE0F', d: 'Thunderstorm' },
}

function _wmo(code) {
  return WMO[code] || { e: '\u2753', d: 'Unknown' }
}

let _session = null
function _session_() {
  if (!_session) _session = new Soup.Session()
  return _session
}

export const WeatherStatus = GObject.registerClass(
  class WeatherStatus extends St.Button {
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

      this._weather = null
      this._lat = null
      this._lon = null
      this._timerId = 0
      this._geoPending = false
      try {
        let box = new St.BoxLayout({
          style_class: 'panel-status-menu-box',
          y_expand: true,
          style: 'padding: 0 5px;',
        })
        this.add_child(box)

        this._iconLabel = new St.Label({
          text: '\uD83C\uDF24\uFE0F',
          style: 'font-size: 28px; padding-right: 4px;',
        })
        this._iconLabel.y_align = 2
        box.add_child(this._iconLabel)

        this._tempLabel = new St.Label({
          text: '--\u00B0',
          style: 'font-size: 24px; font-weight: bold;',
        })
        this._tempLabel.y_align = 2
        box.add_child(this._tempLabel)

        this._feelsLabel = new St.Label({
          text: '',
          style: 'font-size: 12px; color: #aaa; padding-left: 1px;',
        })
        this._feelsLabel.y_align = 2
        this._feelsLabel.translation_y = 4
        box.add_child(this._feelsLabel)

        this._execQuery()

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this.menu = new PopupMenu.PopupMenu(this, 0.0, St.Side.BOTTOM)
          try { Main.uiGroup.add_child(this.menu.actor); this.menu.actor.hide() } catch (e) {}
          this._localMgr = new PopupMenu.PopupMenuManager(this)
          this._localMgr.addMenu(this.menu)
          this._buildMenu()
          this.menu.connect('open-state-changed', (_m, isOpen) => {
            if (isOpen) {
              try { this._rebuildMenuItems() } catch (e) {
                logError(e, `${TAG} menu rebuild failed`)
              }
            }
          })
          return GLib.SOURCE_REMOVE
        })

        this._timerId = GLib.timeout_add_seconds(
          GLib.PRIORITY_DEFAULT, WX_POLL_SEC, () => {
            this._execQuery()
            return GLib.SOURCE_CONTINUE
          },
        )

        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this._attachToDTP()
          return GLib.SOURCE_REMOVE
        })
      } catch (e) {
        logError(e, `${TAG} init failed`)
      }
    }

    _buildMenu() {
      let titleItem = new PopupMenu.PopupMenuItem('Today\'s Weather', {
        reactive: false,
      })
      if (titleItem.label) titleItem.label.x_align = 2
      this.menu.addMenuItem(titleItem)
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
      this._forecastSection = new PopupMenu.PopupMenuSection()
      this.menu.addMenuItem(this._forecastSection)
      this._forecastSection.addMenuItem(
        new PopupMenu.PopupMenuItem('Loading...', { reactive: false }),
      )
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
      let settingsItem = new PopupMenu.PopupMenuItem('Weather Settings')
      if (settingsItem.label) settingsItem.label.x_align = 2
      settingsItem.connect('activate', () => {
        try {
          GLib.spawn_command_line_async('gnome-weather')
        } catch (e) {
          logError(e, `${TAG} settings`)
        }
      })
      this.menu.addMenuItem(settingsItem)
    }

    _execQuery() {
      if (!this._lat || !this._lon) {
        this._resolveCoords()
        return
      }
      this._fetchWeather()
    }

    _resolveCoords() {
      if (this._geoPending) return
      this._geoPending = true
      let msg = new Soup.Message({
        method: 'GET',
        uri: GLib.Uri.parse('http://ip-api.com/json/', 0),
      })
      if (!msg) { this._geoPending = false; return }
      _session_().send_and_read_async(
        msg, GLib.PRIORITY_DEFAULT, null,
        (s, res) => {
          this._geoPending = false
          try {
            let bytes = s.send_and_read_finish(res)
            if (!bytes) { this._fallbackCoords(); return }
            let data = JSON.parse(
              new TextDecoder().decode(bytes.get_data()),
            )
            if (data && data.lat && data.lon) {
              this._lat = data.lat
              this._lon = data.lon
              this._fetchWeather()
            } else {
              this._fallbackCoords()
            }
          } catch (_e) { this._fallbackCoords() }
        },
      )
    }

    _fallbackCoords() {
      this._lat = 10.8231
      this._lon = 106.6297
      this._fetchWeather()
    }

    _fetchWeather() {
      let url =
        'https://api.open-meteo.com/v1/forecast' +
        `?latitude=${this._lat}&longitude=${this._lon}` +
        '&current=temperature_2m,apparent_temperature,weather_code' +
        '&hourly=temperature_2m,apparent_temperature,weather_code' +
        '&timezone=auto&forecast_days=1'
      let msg = new Soup.Message({
        method: 'GET',
        uri: GLib.Uri.parse(url, 0),
      })
      if (!msg) return
      _session_().send_and_read_async(
        msg, GLib.PRIORITY_DEFAULT, null,
        (s, res) => {
          try {
            let bytes = s.send_and_read_finish(res)
            if (!bytes) return
            let data = JSON.parse(
              new TextDecoder().decode(bytes.get_data()),
            )
            this._processWeather(data)
          } catch (e) {
            logError(e, `${TAG} fetch failed`)
          }
        },
      )
    }

    _processWeather(data) {
      if (!data || !data.current) return
      let temp = Math.round(data.current.temperature_2m)
      let feels = data.current.apparent_temperature != null
        ? Math.round(data.current.apparent_temperature)
        : null
      let code = data.current.weather_code
      let w = _wmo(code)
      this._weather = { temp, feels, code, emoji: w.e, desc: w.d }

      if (data.hourly && data.hourly.time) {
        this._weather.hourly = []
        for (let i = 0; i < data.hourly.time.length; i++) {
          if (i >= 24) break
          let t = data.hourly.temperature_2m[i]
          let f = data.hourly.apparent_temperature != null
            ? Math.round(data.hourly.apparent_temperature[i])
            : null
          let c = data.hourly.weather_code[i]
          let w2 = _wmo(c)
          let timeStr = data.hourly.time[i]
          let hour = timeStr.includes('T')
            ? timeStr.split('T')[1].substring(0, 5)
            : '--:--'
          this._weather.hourly.push({
            time: hour,
            temp: Math.round(t),
            feels: f,
            code: c,
            emoji: w2.e,
            desc: w2.d,
          })
        }
      }

      this._updateDisplay()
    }

    _updateDisplay() {
      if (!this._weather) return
      this._iconLabel.set_text(this._weather.emoji)
      this._tempLabel.set_text(`${this._weather.temp}\u00B0`)
      this._feelsLabel.set_text(
        this._weather.feels != null
          ? `${this._weather.feels}\u00B0`
          : '',
      )
    }

    _rebuildMenuItems() {
      this._forecastSection.removeAll()
      if (!this._weather || !this._weather.hourly) {
        this._forecastSection.addMenuItem(
          new PopupMenu.PopupMenuItem('No data available', {
            reactive: false,
          }),
        )
        return
      }

      let now = new Date()
      let currentHour = now.getHours()

      let p = this._weather.hourly
      let fNow = this._weather.feels != null
        ? ` (${this._weather.feels}\u00B0)`
        : ''

      // 3 hours before, 6 hours after \u2014 include current hour as "Now" inline
      let rangeStart = currentHour - 3
      let rangeEnd = currentHour + 6
      for (let h of p) {
        let hr = parseInt(h.time.split(':')[0], 10)
        if (hr < rangeStart || hr > rangeEnd) continue
        let isNow = hr === currentHour
        let label = isNow ? 'Now' : h.time
        let fH = isNow ? fNow : (h.feels != null ? ` (feels ${h.feels}\u00B0)` : '')
        this._forecastSection.addMenuItem(
          this._mkRow(label, h.emoji, `${h.temp}\u00B0${fH}`, h.desc, isNow),
        )
      }
    }

    _mkRow(time, emoji, temp, desc, isNow) {
      let item = new PopupMenu.PopupMenuItem('', { reactive: false })
      let row = new St.BoxLayout({ x_expand: true })

      let timeStyle = isNow
        ? 'padding-right: 8px; font-weight: bold; font-size: 1.2em; min-width: 36px;'
        : 'padding-right: 8px; min-width: 36px;'
      let timeLabel = new St.Label({ text: time, style: timeStyle })
      row.add_child(timeLabel)

      let iconLabel = new St.Label({ text: ` ${emoji} ` })
      row.add_child(iconLabel)

      let tempLabel = new St.Label({
        text: ` ${temp}`,
        style: 'padding-left: 4px; min-width: 32px;',
      })
      row.add_child(tempLabel)

      let descLabel = new St.Label({
        text: ` ${desc}`,
        x_expand: true,
      })
      row.add_child(descLabel)

      item.add_child(row)
      return item
    }

    _getPanelArrowSide() {
      try {
        const p = global.dashToPanel?.panels?.[0]
        if (p?.getPosition) {
          const pos = p.getPosition()
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
      if (!global.dashToPanel || !global.dashToPanel.panels || global.dashToPanel.panels.length === 0) {
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

    destroy() {
      if (this._timerId) { try { GLib.source_remove(this._timerId); this._timerId = 0 } catch (e) {} }
      if (this.menu) { try { this.menu.destroy(); this.menu = null } catch (e) {} }
      super.destroy()
    }
  },
)
