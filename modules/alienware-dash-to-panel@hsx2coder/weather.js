import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import GObject from 'gi://GObject'
import Soup from 'gi://Soup'
import St from 'gi://St'

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'
const TAG = '[WX]'
const WX_POLL_SEC = 1800

function _symbol(code) {
  let isNight = false
  let base = code
  if (base.endsWith('_night')) { isNight = true; base = base.slice(0, -6) }
  else if (base.endsWith('_day')) base = base.slice(0, -4)

  let e, d
  if (base.includes('thunder')) { e = '\u26C8\uFE0F'; d = 'Thunderstorm' }
  else if (base.includes('snowshowers')) { e = '\uD83C\uDF28\uFE0F'; d = 'Snow Showers' }
  else if (base.includes('snow')) { e = '\u2744\uFE0F'; d = 'Snow' }
  else if (base.includes('sleetshowers')) { e = '\uD83C\uDF28\uFE0F'; d = 'Sleet Showers' }
  else if (base.includes('sleet')) { e = '\uD83C\uDF28\uFE0F'; d = 'Sleet' }
  else if (base.includes('rainshowers')) { e = '\uD83C\uDF27\uFE0F'; d = 'Rain Showers' }
  else if (base.includes('rain')) { e = '\uD83C\uDF27\uFE0F'; d = 'Rain' }
  else if (base === 'fog') { e = '\uD83C\uDF2B\uFE0F'; d = 'Fog' }
  else if (base === 'cloudy') { e = '\u2601\uFE0F'; d = 'Cloudy' }
  else if (base === 'partlycloudy') { e = isNight ? '\u2601\uFE0F' : '\u26C5'; d = 'Partly Cloudy' }
  else if (base === 'fair') { e = isNight ? '\uD83C\uDF19' : '\uD83C\uDF24\uFE0F'; d = 'Fair' }
  else if (base === 'clearsky') { e = isNight ? '\uD83C\uDF19' : '\u2600\uFE0F'; d = 'Clear' }
  else { e = '\u2753'; d = code }
  return { e, d }
}

// Same apparent-temperature formula libgweather uses (Australian BOM APPARENT_TEMP)
function _apparent(t, rh, ws) {
  let e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t))
  return t + 0.33 * e - 0.70 * ws - 4.00
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
      try {
        let s = new Gio.Settings({ schema_id: 'org.gnome.Weather' })
        let v = s.get_value('locations').recursiveUnpack()
        let pts = v && v[0] && v[0][1] && v[0][1][3]
        if (pts && pts[0]) {
          this._lat = pts[0][0] * 180 / Math.PI
          this._lon = pts[0][1] * 180 / Math.PI
          this._fetchWeather()
          return
        }
      } catch (e) {
        logError(e, `${TAG} gsettings location`)
      }
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
      this._lat = 21.0167
      this._lon = 105.8
      this._fetchWeather()
    }

    _fetchWeather() {
      let url =
        'https://api.met.no/weatherapi/locationforecast/2.0/compact' +
        `?lat=${this._lat}&lon=${this._lon}`
      let msg = new Soup.Message({
        method: 'GET',
        uri: GLib.Uri.parse(url, 0),
      })
      msg.request_headers.append(
        'User-Agent',
        'alienware-hsx2coder-gnome/1.0 (https://github.com/anomalyco/opencode)',
      )
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
      let ts = data && data.properties && data.properties.timeseries
      if (!ts || !ts[0]) return
      let now = ts[0].data.instant.details
      let temp = Math.round(now.air_temperature)
      let feels = Math.round(
        _apparent(now.air_temperature, now.relative_humidity, now.wind_speed),
      )
      let sym = ts[0].data.next_1_hours
        ? ts[0].data.next_1_hours.summary.symbol_code
        : 'cloudy'
      let w = _symbol(sym)
      this._weather = { temp, feels, code: sym, emoji: w.e, desc: w.d }

      this._weather.hourly = []
      for (let i = 0; i < ts.length && i < 24; i++) {
        let d = ts[i].data
        let det = d.instant.details
        let t = Math.round(det.air_temperature)
        let f = Math.round(
          _apparent(det.air_temperature, det.relative_humidity, det.wind_speed),
        )
        let s2 = d.next_1_hours
          ? d.next_1_hours.summary.symbol_code
          : 'cloudy'
        let w2 = _symbol(s2)
        let dt = new Date(ts[i].time)
        let hour = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
        this._weather.hourly.push({
          time: hour,
          temp: t,
          feels: f,
          code: s2,
          emoji: w2.e,
          desc: w2.d,
        })
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
