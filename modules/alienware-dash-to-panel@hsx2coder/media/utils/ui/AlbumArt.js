import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import Graphene from "gi://Graphene";
import Cairo from "cairo";

import { Tonearm } from "./widgets/tonearm.js";
import { fadeIn } from "./motion.js";
import Soup from "gi://Soup";

// Remote covers are fetched with a shared Soup session (Gio cannot copy http://).
const COVER_MAX_BYTES = 8 * 1024 * 1024;
const COVER_TIMEOUT_S = 15;
let _soupSession = null;
// URLs with a download already running; prevents duplicate requests.
const _coverInFlight = new Set();

function _getSoupSession() {
  if (!_soupSession) _soupSession = new Soup.Session({ timeout: COVER_TIMEOUT_S });
  return _soupSession;
}

// Keep the URL safe inside CSS url('...').
function _cssUrl(uri) {
  return String(uri).replace(/'/g, "%27");
}

const SPIN_TRANSITION = "amc-vinyl-spin";
const COVER_CACHE_MAX = 100;
const COVER_DIR_MAX_FILES = 300;
const COVER_DIR_MAX_AGE_S = 30 * 24 * 3600;
let _coverPruneStarted = false;

/**
 * Downloaded covers used to accumulate in ~/.cache/mpris-covers forever.
 * Once per shell process, keep the newest COVER_DIR_MAX_FILES files that are
 * younger than COVER_DIR_MAX_AGE_S. Fully async at low priority.
 * @param {string} dir
 */
function _pruneCoverDir(dir) {
  if (_coverPruneStarted) return;
  _coverPruneStarted = true;
  const folder = Gio.File.new_for_path(dir);
  folder.enumerate_children_async(
    "standard::name,time::modified",
    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
    GLib.PRIORITY_LOW, null,
    (src, res) => {
      let en;
      try { en = src.enumerate_children_finish(res); } catch (_e) { return; }
      const files = [];
      const step = () => en.next_files_async(64, GLib.PRIORITY_LOW, null, (e, r) => {
        let infos = [];
        try { infos = e.next_files_finish(r); } catch (_e) {}
        if (infos.length > 0) {
          for (const i of infos)
            files.push([i.get_name(), i.get_attribute_uint64("time::modified")]);
          step();
          return;
        }
        en.close_async(GLib.PRIORITY_LOW, null, null);
        const now = Date.now() / 1000;
        files.sort((a, b) => b[1] - a[1]);
        files.forEach(([name, mtime], idx) => {
          if (idx < COVER_DIR_MAX_FILES && now - mtime < COVER_DIR_MAX_AGE_S) return;
          folder.get_child(name).delete_async(GLib.PRIORITY_LOW, null, (f, rr) => {
            try { f.delete_finish(rr); } catch (_e) {}
          });
        });
      });
      step();
    },
  );
}

/** @param {Gio.Settings} settings @returns {number} */
function _artSize(settings) {
  try {
    return Math.max(180, settings.get_int("popup-width"));
  } catch (_e) {
    return 340;
  }
}

const SPINDLE_D = 12;

/** Centre label: half the disc, like a real 12" record. */
function _labelGeom(sz) {
  const labelD = Math.round(sz * 0.5);
  return { labelD, off: Math.round((sz - labelD) / 2) };
}

export const AlbumArt = GObject.registerClass(
  {},
  class AlbumArt extends St.BoxLayout {
    _init(settings, manager = null, playerName = null) {
      super._init({
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._settings = settings;
      this._manager = manager;
      this._playerName = playerName;
      this._isDestroyed = false;

      this._coverCache = new Map();
      this._currentArtUrl = null;
      this._rotationAngle = 0;
      this._rotationInterval = null;
      this._isRotating = false;
      this._isPlaying = false;

      // The vinyl disc is the only visual now (cover-image mode removed).
      this._vinylMode = true;

      this._buildUI();

      // Mutter keeps advancing a transition on an unmapped actor (verified
      // in a headless shell), which would keep the frame clock ticking at
      // the display rate while the popup is closed. Spin only while shown;
      // _isRotating keeps the intent so it resumes on the next map.
      this.connect("notify::mapped", () => {
        if (this._isDestroyed) return;
        if (!this.mapped) this._stopRotationInterval();
        else if (this._isRotating && this._vinylMode) this._startSpin();
      });

      // Resize every UI element when the user changes popup-width
      this._sizeChangedId = this._settings.connect(
        "changed::popup-width",
        () => {
          if (!this._isDestroyed) this._applySize();
        },
      );
    }

    setPlayer(manager, playerName) {
      this._manager = manager;
      this._playerName = playerName;
    }

    //  Build UI
    _buildUI() {
      const sz = _artSize(this._settings);
      const { labelD, off } = _labelGeom(sz);

      this._vinylContainer = new St.Widget({
        style: `width: ${sz}px; height: ${sz}px;`,
        layout_manager: new Clutter.FixedLayout(),
        reactive: true,
      });

      this._rotatingContainer = new St.Widget({
        width: sz,
        height: sz,
        x: 0,
        y: 0,
        pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
        layout_manager: new Clutter.FixedLayout(),
        reactive: false,
      });

      this._vinylLayer = new St.DrawingArea({
        width: sz,
        height: sz,
        x: 0,
        y: 0,
        reactive: false,
      });
      this._vinylLayer.connectObject(
        "repaint",
        (area) => this._drawVinylLayer(area),
        this,
      );

      // Cover art sits in the centre as the label of the disc
      this._vinylCoverArt = new St.Bin({
        style_class: "media-album-art",
        x: off,
        y: off,
        style: `width: ${labelD}px; height: ${labelD}px; border-radius: ${labelD / 2}px;`,
        reactive: false,
      });
      this._vinylCoverImage = new St.Widget({
        style_class: "cover-art-image",
        width: labelD,
        height: labelD,
        style: `
          border-radius: ${labelD / 2}px;
          background-size: cover;
          background-repeat: no-repeat;
        `,
        reactive: false,
      });
      this._vinylCoverArt.set_child(this._vinylCoverImage);

      // Spindle hole: a dark pin with a light rim, fixed at the centre
      const hole = Math.round((sz - SPINDLE_D) / 2);
      this._spindle = new St.Widget({
        x: hole,
        y: hole,
        width: SPINDLE_D,
        height: SPINDLE_D,
        style: `border-radius: ${SPINDLE_D / 2}px; background-color: #0b0b0b; border: 1px solid rgba(255,255,255,0.22);`,
        reactive: false,
      });

      this._rotatingContainer.add_child(this._vinylLayer);
      this._rotatingContainer.add_child(this._vinylCoverArt);
      this._rotatingContainer.add_child(this._spindle);

      // Pass settings to Tonearm so it can read angle prefs live
      this._tonearm = new Tonearm({ settings: this._settings });
      this._vinylContainer.add_child(this._rotatingContainer);
      this._vinylContainer.add_child(this._tonearm);

      this.add_child(this._vinylContainer);
    }

    // Size update

    _applySize() {
      const sz = _artSize(this._settings);
      const { labelD, off } = _labelGeom(sz);
      const hole = Math.round((sz - SPINDLE_D) / 2);

      this._vinylContainer.style = `width: ${sz}px; height: ${sz}px;`;
      this._rotatingContainer.set_width(sz);
      this._rotatingContainer.set_height(sz);

      this._vinylLayer.set_width(sz);
      this._vinylLayer.set_height(sz);
      this._vinylLayer.queue_repaint();

      this._vinylCoverArt.set_position(off, off);
      this._vinylCoverArt.style = `width: ${labelD}px; height: ${labelD}px; border-radius: ${labelD / 2}px;`;
      this._vinylCoverImage.set_width(labelD);
      this._vinylCoverImage.set_height(labelD);
      this._spindle.set_position(hole, hole);

      this._tonearm.set_width(sz);
      this._tonearm.set_height(sz);
      this._tonearm.queue_repaint();

      // Invalidate cover cache
      this._coverCache.clear();

      // Reload cover at the new size
      const pendingUrl = this._currentArtUrl;
      this._currentArtUrl = null;
      if (pendingUrl) {
        this.loadCover(pendingUrl);
      } else {
        this.setDefaultCover();
      }
    }

    // Vinyl disc drawing

    _drawVinylLayer(area) {
      const cr = area.get_context();
      const [width, height] = area.get_surface_size();
      const cx = width / 2;
      const cy = height / 2;
      const R = width / 2;
      const labelR = R * 0.5;
      const TAU = 2 * Math.PI;

      // 1. disc body: near-black vinyl, a touch lighter toward the label
      let g = new Cairo.RadialGradient(cx, cy, labelR, cx, cy, R);
      g.addColorStopRGBA(0, 0.11, 0.11, 0.12, 1);
      g.addColorStopRGBA(0.6, 0.075, 0.075, 0.085, 1);
      g.addColorStopRGBA(1, 0.035, 0.035, 0.04, 1);
      cr.arc(cx, cy, R, 0, TAU);
      cr.setSource(g);
      cr.fill();

      // 2. grooves: fine concentric lines with an irregular rhythm
      const grooveStart = labelR * 1.1;
      const grooveEnd = R * 0.95;
      cr.setLineWidth(0.6);
      for (let r = grooveStart; r < grooveEnd; r += 1.1) {
        const t = (r - grooveStart) / (grooveEnd - grooveStart);
        const shade = 0.5 + 0.5 * Math.sin(r * 1.7);
        cr.arc(cx, cy, r, 0, TAU);
        cr.setSourceRGBA(1, 1, 1, 0.022 + 0.03 * shade * (1 - 0.5 * t));
        cr.stroke();
      }

      // 3. dark groove walls give the grooves depth
      cr.setLineWidth(0.8);
      for (let r = grooveStart + 0.55; r < grooveEnd; r += 4.4) {
        cr.arc(cx, cy, r, 0, TAU);
        cr.setSourceRGBA(0, 0, 0, 0.35);
        cr.stroke();
      }

      // 4. lead-in band and rim highlight
      cr.setLineWidth(1.6);
      cr.arc(cx, cy, R * 0.965, 0, TAU);
      cr.setSourceRGBA(1, 1, 1, 0.06);
      cr.stroke();

      // 5. broad diagonal sheen, clipped to the disc
      cr.save();
      cr.arc(cx, cy, R, 0, TAU);
      cr.clip();
      const sheen = new Cairo.LinearGradient(cx - R, cy - R, cx + R * 0.3, cy + R * 0.3);
      sheen.addColorStopRGBA(0.3, 1, 1, 1, 0);
      sheen.addColorStopRGBA(0.47, 1, 1, 1, 0.085);
      sheen.addColorStopRGBA(0.6, 1, 1, 1, 0);
      cr.setSource(sheen);
      cr.rectangle(0, 0, width, height);
      cr.fill();
      cr.restore();

      // 6. outer edge
      cr.setLineWidth(1);
      cr.arc(cx, cy, R - 0.5, 0, TAU);
      cr.setSourceRGBA(1, 1, 1, 0.1);
      cr.stroke();

      // 7. centre label: shown only when there is no cover art on top of it
      g = new Cairo.RadialGradient(cx, cy, 0, cx, cy, labelR);
      g.addColorStopRGBA(0, 0.34, 0.34, 0.36, 1);
      g.addColorStopRGBA(0.9, 0.22, 0.22, 0.24, 1);
      g.addColorStopRGBA(1, 0.18, 0.18, 0.2, 1);
      cr.arc(cx, cy, labelR, 0, TAU);
      cr.setSource(g);
      cr.fill();
      cr.setLineWidth(1);
      cr.arc(cx, cy, labelR - 0.5, 0, TAU);
      cr.setSourceRGBA(1, 1, 1, 0.14);
      cr.stroke();

      cr.$dispose();
    }

    //  Cover art loading
    loadCover(url, forceRefresh = false) {
      if (!forceRefresh && this._currentArtUrl === url) return;
      this._currentArtUrl = url;
      // A download still running for a previous track must not overwrite this one.
      this._pendingCoverUrl = null;

      if (!forceRefresh) {
        const cached = this._coverCache.get(url);
        if (cached) {
          this._applyCoverStyle(cached);
          return;
        }
      }

      if (url.startsWith("file://") || url.startsWith("/")) {
        this._setCoverImage(url.startsWith("file://") ? url : `file://${url}`);
      } else {
        this._downloadCover(url);
      }
    }

    _setCoverImage(imageUrl) {
      const { labelD } = _labelGeom(_artSize(this._settings));

      const style = `
        width: ${labelD}px;
        height: ${labelD}px;
        border-radius: ${labelD / 2}px;
        background-image: url('${_cssUrl(imageUrl)}');
        background-size: cover;
        background-repeat: no-repeat;
      `;

      this._applyCoverStyle(style);
      // bounded: one entry per distinct cover played in this session
      if (this._coverCache.size >= COVER_CACHE_MAX && !this._coverCache.has(imageUrl))
        this._coverCache.delete(this._coverCache.keys().next().value);
      this._coverCache.set(imageUrl, style);
    }

    _applyCoverStyle(style) {
      const changed = this._vinylCoverImage.style !== style;
      this._vinylCoverImage.style = style;
      // Soft cross-in on track change instead of a hard swap (no-op while
      // the popup is closed).
      if (changed) fadeIn(this._vinylCoverImage);
    }

    _downloadCover(url) {
      const hash = GLib.compute_checksum_for_string(
        GLib.ChecksumType.MD5,
        url,
        -1,
      );
      const cacheDir = GLib.build_filenamev([
        GLib.get_user_cache_dir(),
        "mpris-covers",
      ]);
      const cachePath = GLib.build_filenamev([cacheDir, hash]);
      const cacheFile = Gio.File.new_for_path(cachePath);
      const cacheUri = cacheFile.get_uri();

      // Cache hit: no directory scan, no network.
      if (cacheFile.query_exists(null)) {
        this._setCoverImage(cacheUri);
        return;
      }

      // The cover to show is whatever was requested last.
      this._pendingCoverUrl = url;
      this.setDefaultCover();

      if (_coverInFlight.has(url)) return;
      _coverInFlight.add(url);

      const msg = Soup.Message.new("GET", url);
      if (!msg) {
        _coverInFlight.delete(url);
        return;
      }

      _getSoupSession().send_and_read_async(
        msg,
        GLib.PRIORITY_LOW,
        null,
        (session, res) => {
          _coverInFlight.delete(url);
          try {
            const bytes = session.send_and_read_finish(res);
            if (msg.get_status() !== Soup.Status.OK) return;
            const size = bytes.get_size();
            if (size === 0 || size > COVER_MAX_BYTES) return;

            GLib.mkdir_with_parents(cacheDir, 0o755);
            cacheFile.replace_contents_bytes_async(
              bytes,
              null,
              false,
              Gio.FileCreateFlags.REPLACE_DESTINATION,
              null,
              (file, writeRes) => {
                try {
                  file.replace_contents_finish(writeRes);
                } catch (e) {
                  console.warn('[dash-to-panel] _downloadCover write: ' + ((e && e.message) ? e.message : e));
                  return;
                }
                _pruneCoverDir(cacheDir);
                if (!this._isDestroyed && this._pendingCoverUrl === url)
                  this._setCoverImage(cacheUri);
              },
            );
          } catch (e) {
            console.warn('[dash-to-panel] _downloadCover: ' + ((e && e.message) ? e.message : e));
          }
        },
      );
    }

    setDefaultCover() {
      this._currentArtUrl = null;
      const { labelD } = _labelGeom(_artSize(this._settings));

      this._vinylCoverImage.style = `
        width: ${labelD}px; height: ${labelD}px; border-radius: ${labelD / 2}px;
        background-color: rgba(255, 255, 255, 0.06);
      `;
    }

    //  Rotation

    startRotation(isPlaying = true) {
      this._isPlaying = isPlaying;

      if (!this._vinylMode) {
        this._stopRotationInterval();
        return;
      }

      if (!isPlaying) {
        this.pauseRotation();
        return;
      }

      this._tonearm.moveToPlaying();

      if (this._isRotating) return;

      this._isRotating = true;
      this._startSpin();
    }

    // The spin is a repeating Clutter transition instead of a 50 ms GLib
    // timer: it is driven by the frame clock, so it is smooth at the
    // display's refresh rate, and it only advances while the disc is on
    // screen. The old timer kept rewriting rotation_angle_z (and woke the
    // shell 20x/s) whenever a vinyl player was playing, popup open or not.
    _startSpin() {
      const actor = this._rotatingContainer;
      if (!actor || this._isDestroyed) return;
      this._stopRotationInterval();
      if (!this.mapped) return; // notify::mapped starts it when shown

      let seconds = 20;
      try {
        seconds = Math.max(1, this._settings.get_int("album-art-rotation-speed"));
      } catch (_e) {}

      const from = this._rotationAngle % 360;
      const spin = new Clutter.PropertyTransition({
        property_name: "rotation-angle-z",
        duration: seconds * 1000,
        repeat_count: -1,
        progress_mode: Clutter.AnimationMode.LINEAR,
      });
      spin.set_from(from);
      spin.set_to(from + 360);
      actor.add_transition(SPIN_TRANSITION, spin);
      this._rotationInterval = spin;
    }

    stopRotation() {
      this._isPlaying = false;
      this._isRotating = false;
      this._stopRotationInterval();
      if (this._vinylMode) this._tonearm.moveToParked();
      this._rotationAngle = 0;
      if (this._rotatingContainer) this._rotatingContainer.rotation_angle_z = 0;
    }

    pauseRotation() {
      this._isPlaying = false;
      this._isRotating = false;
      this._stopRotationInterval();
      if (this._vinylMode) this._tonearm.moveToParked();
    }

    _stopRotationInterval() {
      if (!this._rotationInterval) return;
      this._rotationInterval = null;
      const actor = this._rotatingContainer;
      if (!actor) return;
      // Freeze where the disc currently is, so pause/resume continues from
      // the same angle instead of snapping.
      const angle = actor.rotation_angle_z % 360;
      actor.remove_transition(SPIN_TRANSITION);
      this._rotationAngle = angle;
      actor.rotation_angle_z = angle;
    }

    /**
     * @param {number} ratio  0.0–1.0  currentPosition / trackLength
     */
    syncRotationToPosition(ratio) {
      if (this._isDestroyed || !this._vinylMode || !this._rotatingContainer)
        return;

      // Only override the angle while the user is actively scrubbing
      if (this._isRotating) return;

      const angle = (ratio * 360) % 360;
      this._rotationAngle = angle;
      this._rotatingContainer.rotation_angle_z = angle;
    }

    destroy() {
      this._isDestroyed = true;

      this.stopRotation();

      if (this._sizeChangedId) {
        this._settings.disconnect(this._sizeChangedId);
        this._sizeChangedId = 0;
      }

      this._vinylContainer?.disconnectObject(this);
      this._vinylLayer?.disconnectObject(this);

      this._tonearm?.destroy();
      this._tonearm = null;

      this._coverCache.clear();
      this._currentArtUrl = null;
      super.destroy();
    }
  },
);

