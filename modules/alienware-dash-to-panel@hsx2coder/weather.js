import Clutter from 'gi://Clutter'
import Gio from 'gi://Gio'
import GLib from 'gi://GLib'
import Pango from 'gi://Pango'
import GObject from 'gi://GObject'
import Soup from 'gi://Soup'
import St from 'gi://St'

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'

const TAG = '[WX]'
const WX_POLL_SEC = 1800
const HOURLY_COUNT = 12
const DIM = '#9a9a9a'
const SUBTLE = '#8f8f8f'

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
  // Bounded timeouts: a stalled link must not keep requests (and the
  // callbacks that touch our actors) alive indefinitely.
  if (!_session) _session = new Soup.Session({ timeout: 20, idle_timeout: 30 })
  return _session
}

// Cold to hot, so each card's bar reads at a glance
function _tempColor(t) {
  if (t <= 0) return '#64b5f6'
  if (t < 10) return '#4dd0e1'
  if (t < 20) return '#81c784'
  if (t < 28) return '#ffb74d'
  return '#ff7043'
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
      this._wxPending = false
      this._updatedAt = null
      this._cancellable = new Gio.Cancellable()
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

        this._deferredMenuIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this._deferredMenuIdleId = null
          this.menu = new PopupMenu.PopupMenu(this, 0.0, St.Side.BOTTOM)
          try { Main.uiGroup.add_child(this.menu.actor); this.menu.actor.hide() } catch (e) {console.warn('[dash-to-panel] _init: ' + ((e && e.message) ? e.message : e)) }
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

        this._attachIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
          this._attachIdleId = 0
          this._attachToDTP()
          return GLib.SOURCE_REMOVE
        })
      } catch (e) {
        logError(e, `${TAG} init failed`)
      }
    }

    _buildMenu() {
      // Hero: current conditions, one calm block at the top
      const heroItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false })
      const hero = new St.BoxLayout({
        x_expand: true,
        style: 'spacing: 14px; padding: 10px 8px 10px; min-width: 340px;',
      })
      this._heroIcon = new St.Label({
        text: '\uD83C\uDF24\uFE0F',
        style: 'font-size: 52px;',
        y_align: Clutter.ActorAlign.CENTER,
      })
      hero.add_child(this._heroIcon)

      const textCol = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
      })
      this._heroTemp = new St.Label({
        text: '--\u00B0',
        style: 'font-size: 40px; font-weight: 700; color: #ffffff;',
      })
      this._heroDesc = new St.Label({
        text: 'Loading\u2026',
        style: `font-size: 13px; color: ${DIM};`,
      })
      textCol.add_child(this._heroTemp)
      textCol.add_child(this._heroDesc)
      hero.add_child(textCol)

      this._heroFeels = new St.Label({
        text: '',
        style: `font-size: 12px; color: ${DIM};`,
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.CENTER,
      })
      hero.add_child(this._heroFeels)

      heroItem.add_child(hero)
      this.menu.addMenuItem(heroItem)
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

      // Caption: section name left, last update right
      const captionItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false })
      const caption = new St.BoxLayout({ x_expand: true, style: 'min-width: 340px; padding: 2px 4px 4px;' })
      caption.add_child(new St.Label({
        text: 'NEXT 12 HOURS',
        x_expand: true,
        style: `font-size: 10px; font-weight: 700; color: ${SUBTLE};`,
        y_align: Clutter.ActorAlign.CENTER,
      }))
      this._updatedLabel = new St.Label({
        text: '',
        style: `font-size: 10px; color: ${SUBTLE};`,
        y_align: Clutter.ActorAlign.CENTER,
      })
      caption.add_child(this._updatedLabel)
      captionItem.add_child(caption)
      this.menu.addMenuItem(captionItem)

      // Hour list: one stacked card per hour, filled in _rebuildMenuItems
      this._hourSection = new PopupMenu.PopupMenuSection()
      this.menu.addMenuItem(this._hourSection)

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
      const settingsItem = new PopupMenu.PopupMenuItem('Weather Settings')
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
      const cancellable = this._cancellable
      _session_().send_and_read_async(
        msg, GLib.PRIORITY_DEFAULT, cancellable,
        (s, res) => {
          this._geoPending = false
          if (cancellable.is_cancelled()) return
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
      msg.request_headers.append('Accept-Encoding', 'identity')
      // one request at a time: the poll timer must not stack fetches
      // behind a slow response
      if (this._wxPending || !this._cancellable) return
      this._wxPending = true
      const cancellable = this._cancellable
      _session_().send_and_read_async(
        msg, GLib.PRIORITY_DEFAULT, cancellable,
        (s, res) => {
          this._wxPending = false
          if (cancellable.is_cancelled()) return
          try {
            let bytes = s.send_and_read_finish(res)
            if (!bytes) throw new Error('empty response body')
            if (msg.status_code < 200 || msg.status_code >= 300)
              throw new Error(`HTTP ${msg.status_code}`)
            let text = new TextDecoder().decode(bytes.get_data())
            let data
            try {
              data = JSON.parse(text)
            } catch (e) {
              throw new Error(`invalid JSON (${text.length} bytes): ${e.message}`)
            }
            this._processWeather(data)
            // A later (successful) fetch may legitimately fail again, so
            // allow the next failure to be logged once more.
            this._wxFetchErrorLogged = false
          } catch (e) {
            // Network/weather failures are expected on flaky links and in
            // headless sessions; log only the first one per failure streak
            // instead of spamming the journal every poll.
            if (!this._wxFetchErrorLogged) {
              this._wxFetchErrorLogged = true
              logError(e, `${TAG} fetch failed`)
            }
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

      this._updatedAt = new Date()
      this._updateDisplay()
    }

    _updateDisplay() {
      if (!this._weather) return
      this._iconLabel.set_text(this._weather.emoji)
      this._tempLabel.set_text(`${this._weather.temp}°`)
      this._feelsLabel.set_text(
        this._weather.feels != null
          ? `${this._weather.feels}°`
          : '',
      )
      this._updateHero()
    }

    _updateHero() {
      if (!this._heroTemp || !this._weather) return
      const w = this._weather
      this._heroIcon.set_text(w.emoji)
      this._heroTemp.set_text(`${w.temp}°`)
      this._heroDesc.set_text(w.desc)
      this._heroFeels.set_text(
        w.feels != null ? `Feels like ${w.feels}°` : '',
      )
      if (this._updatedLabel && this._updatedAt) {
        const d = this._updatedAt
        this._updatedLabel.set_text(
          `Updated ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        )
      }
    }

    _rebuildMenuItems() {
      if (!this._hourSection) return
      this._updateHero()
      this._hourSection.removeAll()

      if (!this._weather || !this._weather.hourly || this._weather.hourly.length === 0) {
        this._hourSection.addMenuItem(
          new PopupMenu.PopupMenuItem('No data available', { reactive: false }),
        )
        return
      }

      // The timeseries starts at the current hour: the first entries are the upcoming ones
      const hours = this._weather.hourly.slice(0, HOURLY_COUNT)
      const temps = hours.map(h => h.temp)
      const lo = Math.min(...temps)
      const hi = Math.max(...temps)
      hours.forEach((h, i) => {
        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false })
        item.add_child(this._mkRow(h, i === 0, i, lo, hi))
        this._hourSection.addMenuItem(item)
      })
    }

    _mkRow(h, isNow, index, lo, hi) {
      const row = new St.BoxLayout({
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style: [
          'spacing: 12px',
          'padding: 9px 12px',
          'min-width: 340px',
          `background-color: ${isNow ? 'st-transparentize(-st-accent-color, 0.7)' : 'rgba(255,255,255,0.04)'}`,
          `border-left: 3px solid ${_tempColor(h.temp)}`,
        ].join(';') + ';',
      })

      // time on top, condition and feels-like below
      const left = new St.BoxLayout({ vertical: true, x_expand: true, y_align: Clutter.ActorAlign.CENTER })
      left.add_child(new St.Label({
        text: isNow ? 'Now' : h.time,
        style: `font-size: 13px; font-weight: ${isNow ? '700' : '600'}; color: ${isNow ? '#ffffff' : '#e6e6e6'};`,
      }))
      const sub = new St.Label({
        text: `${h.desc} \u00B7 feels ${h.feels}\u00B0`,
        style: `font-size: 11px; color: ${SUBTLE};`,
      })
      sub.clutter_text.ellipsize = Pango.EllipsizeMode.END
      left.add_child(sub)
      row.add_child(left)

      row.add_child(new St.Label({
        text: h.emoji,
        y_align: Clutter.ActorAlign.CENTER,
        style: 'font-size: 22px;',
      }))

      // temperature bar: length = where this hour sits in the shown range
      const barW = 70
      const frac = hi === lo ? 1 : (h.temp - lo) / (hi - lo)
      const track = new St.Widget({
        width: barW,
        height: 4,
        y_align: Clutter.ActorAlign.CENTER,
        style: 'background-color: rgba(255,255,255,0.08);',
      })
      track.add_child(new St.Widget({
        width: Math.max(6, Math.round(barW * frac)),
        height: 4,
        style: `background-color: ${_tempColor(h.temp)};`,
      }))
      row.add_child(track)

      row.add_child(new St.Label({
        text: `${h.temp}\u00B0`,
        x_align: Clutter.ActorAlign.END,
        y_align: Clutter.ActorAlign.CENTER,
        style: 'width: 46px; font-size: 17px; font-weight: 700; color: #ffffff;',
      }))

      // staggered entrance each time the popup opens
      row.opacity = 0
      row.translation_y = 8
      row.ease({
        opacity: 255,
        translation_y: 0,
        duration: 280,
        delay: index * 40,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
      })
      return row
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
      } catch (_e) {console.warn('[dash-to-panel] _getPanelArrowSide: ' + ((_e && _e.message) ? _e.message : _e)) }
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
      try { this._cancellable?.cancel() } catch (_) {}
      this._cancellable = null
      if (this._attachIdleId) {
        try { GLib.source_remove(this._attachIdleId) } catch (_) {}
        this._attachIdleId = 0
      }
      if (this._deferredMenuIdleId) {
        try { GLib.Source.remove(this._deferredMenuIdleId); } catch (_) {}
        this._deferredMenuIdleId = null;
      }
      if (this._timerId) { try { GLib.source_remove(this._timerId); this._timerId = 0 } catch (e) {} }
      if (this.menu) { try { this.menu.destroy(); this.menu = null } catch (e) {} }
      super.destroy()
    }
  },
)
