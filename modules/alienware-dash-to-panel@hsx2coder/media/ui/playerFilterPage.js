import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
let GioUnix = null;
try {
  GioUnix = (await import("gi://GioUnix")).default;
} catch (_) {console.warn('[dash-to-panel] ?: ' + ((_ && _.message) ? _.message : _)) }
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

/**
 * Built-in fallback helper to resolve Gio.AppInfo from desktop/mpris id
 * @param {string} desktopId
 * @param {string} fallbackId
 * @returns {Gio.AppInfo|null}
 */
export function defaultFindAppInfo(desktopId, fallbackId) {
  const tokens = new Set();
  for (const base of [desktopId, fallbackId]) {
    if (!base) continue;
    const stripped = base
      .replace(/\.instance[_\d]+$/i, "")
      .replace(/\.\d+$/, "");
    for (const variant of [base, stripped]) {
      const lower = variant.toLowerCase();
      tokens.add(lower);
      tokens.add(`${lower}.desktop`);
      for (const seg of lower.split(".")) {
        if (seg.length > 2) tokens.add(seg);
      }
    }
  }

  // Common browser and player aliases
  if (tokens.has("chromium")) {
    tokens.add("org.chromium.thorium");
    tokens.add("google-chrome");
    tokens.add("chromium-browser");
  }

  for (const generic of [
    "org", "com", "net", "io", "app", "application", "browser",
    "client", "player", "media", "desktop", "instance", "snap", "flatpak"
  ]) {
    tokens.delete(generic);
  }

  // 1. Try exact desktop ID
  for (const base of [desktopId, fallbackId]) {
    if (!base) continue;
    const id = base.endsWith(".desktop") ? base : `${base}.desktop`;
    try {
      if (GioUnix && GioUnix.DesktopAppInfo) {
        const app = GioUnix.DesktopAppInfo.new(id);
        if (app) return app;
      }
    } catch (_) {console.warn('[dash-to-panel] ?: ' + ((_ && _.message) ? _.message : _)) }
    try {
      if (Gio.DesktopAppInfo) {
        const app = Gio.DesktopAppInfo.new(id);
        if (app) return app;
      }
    } catch (_) {console.warn('[dash-to-panel] ?: ' + ((_ && _.message) ? _.message : _)) }
  }

  let allApps = [];
  try {
    allApps = Gio.AppInfo.get_all();
  } catch (_) {console.warn('[dash-to-panel] ?: ' + ((_ && _.message) ? _.message : _)) }

  // 2. Search allApps by ID
  for (const app of allApps) {
    const appId = (app.get_id() ?? "").toLowerCase();
    const appIdClean = appId.endsWith(".desktop") ? appId.slice(0, -8) : appId;
    if (tokens.has(appId) || tokens.has(appIdClean)) return app;
  }

  // 3. Search allApps by ID segments
  for (const app of allApps) {
    const appId = (app.get_id() ?? "").toLowerCase();
    const appIdClean = appId.endsWith(".desktop") ? appId.slice(0, -8) : appId;
    for (const seg of appIdClean.split(".")) {
      if (seg.length > 2 && tokens.has(seg)) return app;
    }
  }

  // 4. Search by display name
  for (const app of allApps) {
    const name = (app.get_display_name() ?? "").toLowerCase().replace(/\s+/g, "");
    if (tokens.has(name)) return app;
    const firstWord = (app.get_display_name() ?? "").toLowerCase().split(/\s+/)[0];
    if (firstWord.length > 2 && tokens.has(firstWord)) return app;
  }

  return null;
}

/**
 * @param {Adw.PreferencesPage} pageOrSettings
 * @param {Gio.Settings} [settings]
 * @param {function(string, string): Gio.AppInfo|null} [findAppInfo]
 */
export function buildPlayerFilterPage(pageOrSettings, settings, findAppInfo) {
  let page = pageOrSettings;
  let s = settings;
  if (!s) {
    s = pageOrSettings;
    page = new Adw.PreferencesPage({
      title: _("Player Filter"),
      icon_name: "edit-find-symbolic",
    });
  }

  const resolveAppInfo = (dId, fId) => {
    if (typeof findAppInfo === "function") {
      try {
        const r = findAppInfo(dId, fId);
        if (r) return r;
      } catch (_) {console.warn('[dash-to-panel] ?: ' + ((_ && _.message) ? _.message : _)) }
    }
    return defaultFindAppInfo(dId, fId);
  };
  const _connIds = [];
  const _settingsConnect = (signal, fn) => {
    _connIds.push(s.connect(signal, fn));
  };

  page.connect("destroy", () => {
    for (const id of _connIds) {
      try {
        s.disconnect(id);
      } catch (_) {}
    }
    _connIds.length = 0;
  });

  const parseList = () => {
    const raw = s.get_string("player-filter-list") || "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        if (entry.startsWith("~"))
          return { name: entry.slice(1).trim(), enabled: false };
        return { name: entry, enabled: true };
      });
  };

  const serializeList = (entries) => {
    const str = entries
      .map((e) => (e.enabled ? e.name : `~${e.name}`))
      .join(", ");
    s.set_string("player-filter-list", str);
  };

  const toShort = (busName) =>
    busName
      .replace("org.mpris.MediaPlayer2.", "")
      .replace(/\.instance[_\d]+$/i, "")
      .replace(/\.\d+$/, "");

  const getBusPlayerIdentifiers = (fullBus) => {
    const short = toShort(fullBus);
    let identity = null;
    let desktopEntry = null;

    try {
      const res = Gio.DBus.session.call_sync(
        fullBus,
        "/org/mpris/MediaPlayer2",
        "org.freedesktop.DBus.Properties",
        "Get",
        new GLib.Variant("(ss)", ["org.mpris.MediaPlayer2", "Identity"]),
        null,
        Gio.DBusCallFlags.NONE,
        400,
        null,
      );
      identity = res.deep_unpack()[0].deep_unpack();
    } catch (_) {console.warn('[dash-to-panel] ?: ' + ((_ && _.message) ? _.message : _)) }

    try {
      const res = Gio.DBus.session.call_sync(
        fullBus,
        "/org/mpris/MediaPlayer2",
        "org.freedesktop.DBus.Properties",
        "Get",
        new GLib.Variant("(ss)", ["org.mpris.MediaPlayer2", "DesktopEntry"]),
        null,
        Gio.DBusCallFlags.NONE,
        400,
        null,
      );
      desktopEntry = res.deep_unpack()[0].deep_unpack();
    } catch (_) {console.warn('[dash-to-panel] ?: ' + ((_ && _.message) ? _.message : _)) }

    // Pick best canonical identifier: desktopEntry > identity > short
    const bestKey = desktopEntry || identity || short;
    return { short, identity, desktopEntry, bestKey };
  };

  // Filter Mode

  const modeGroup = new Adw.PreferencesGroup({
    title: _("Filter Mode"),
    description: _(
      "Choose whether the list below acts as a blacklist (block listed " +
        "apps) or a whitelist (allow only listed apps). Set to Off to " +
        "disable filtering entirely.",
    ),
  });
  page.add(modeGroup);

  const filterModel = new Gtk.StringList();
  [_("Off"), _("Blacklist"), _("Whitelist")].forEach((l) =>
    filterModel.append(l),
  );

  const filterModeDescriptions = [
    _("Show all media players — filtering is disabled"),
    _("Hide only the players you add to the list below"),
    _("Show only the players you add to the list below"),
  ];

  const filterModeRow = new Adw.ComboRow({
    title: _("Filter Mode"),
    subtitle: filterModeDescriptions[s.get_int("player-filter-mode")],
    model: filterModel,
    selected: s.get_int("player-filter-mode"),
  });

  filterModeRow.connect("notify::selected", () => {
    const idx = filterModeRow.selected;
    s.set_int("player-filter-mode", idx);
    filterModeRow.subtitle = filterModeDescriptions[idx];
  });

  const updateModeVisibility = () => {
    const v = s.get_int("player-filter-mode");
    if (filterModeRow.selected !== v) {
      filterModeRow.selected = v;
      filterModeRow.subtitle = filterModeDescriptions[v];
    }
  };

  modeGroup.add(filterModeRow);

  // Saved Players

  const savedGroup = new Adw.PreferencesGroup({
    title: _("Saved Players"),
    description: _(
      "Each saved player can be individually enabled or disabled in the " +
        "filter without removing it. The toggle controls whether the filter " +
        "rule is active for that app. Use the trash button to remove it " +
        "from the list entirely.",
    ),
  });
  page.add(savedGroup);

  const addHeaderRow = new Adw.ActionRow({
    title: _("Add application to filter"),
    subtitle: _("Select an installed application to add to the filter list"),
  });
  const addAppBtn = new Gtk.Button({
    icon_name: "list-add-symbolic",
    valign: Gtk.Align.CENTER,
    css_classes: ["suggested-action"],
    tooltip_text: _("Choose an application to filter"),
  });
  addHeaderRow.add_suffix(addAppBtn);
  savedGroup.add(addHeaderRow);

  const _showAddAppDialog = () => {
    let rootWin = null;
    try {
      if (typeof page.get_root === "function") {
        rootWin = page.get_root();
      }
    } catch (_) {console.warn('[dash-to-panel] ?: ' + ((_ && _.message) ? _.message : _)) }
    if (!(rootWin instanceof Gtk.Window)) rootWin = null;

    const dialog = new Gtk.Dialog({
      title: _("Add Application to Filter"),
      transient_for: rootWin,
      use_header_bar: true,
      modal: true,
      default_width: 500,
      default_height: 550,
    });
    dialog.add_button(_("Cancel"), Gtk.ResponseType.CANCEL);
    dialog.add_button(_("Add"), Gtk.ResponseType.OK);
    dialog.set_default_response(Gtk.ResponseType.OK);

    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 8,
      margin_top: 8,
      margin_bottom: 8,
      margin_start: 8,
      margin_end: 8,
    });

    const searchEntry = new Gtk.SearchEntry({
      placeholder_text: _("Search applications..."),
    });
    box.append(searchEntry);

    const scrolled = new Gtk.ScrolledWindow({ vexpand: true });
    const listbox = new Gtk.ListBox({
      selection_mode: Gtk.SelectionMode.SINGLE,
    });
    listbox.add_css_class("boxed-list");
    scrolled.set_child(listbox);
    box.append(scrolled);

    let allApps = [];
    try {
      allApps = Gio.AppInfo.get_all().filter((app) => app.should_show());
      allApps.sort((a, b) =>
        (a.get_name() || "").localeCompare(b.get_name() || ""),
      );
    } catch (_) {console.warn('[dash-to-panel] ?: ' + ((_ && _.message) ? _.message : _)) }

    const currentSavedNames = new Set(parseList().map((e) => e.name.toLowerCase()));

    for (const app of allApps) {
      const rawId = app.get_id() || "";
      const baseName = rawId.endsWith(".desktop")
        ? rawId.slice(0, -8)
        : rawId;
      if (!baseName) continue;
      if (currentSavedNames.has(baseName.toLowerCase()) || currentSavedNames.has(rawId.toLowerCase()))
        continue;

      const row = new Gtk.ListBoxRow();
      row._appInfo = app;
      row._baseName = baseName;

      const rowBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 10,
        margin_top: 6,
        margin_bottom: 6,
        margin_start: 10,
        margin_end: 10,
      });

      const icon = new Gtk.Image({
        gicon: app.get_icon(),
        icon_size: Gtk.IconSize.LARGE,
      });
      const label = new Gtk.Label({
        label: app.get_name() || baseName,
        xalign: 0,
        hexpand: true,
      });
      const subLabel = new Gtk.Label({
        label: baseName,
        xalign: 1,
        css_classes: ["dim-label"],
      });

      rowBox.append(icon);
      rowBox.append(label);
      rowBox.append(subLabel);
      row.set_child(rowBox);
      listbox.append(row);
    }

    searchEntry.connect("search-changed", () => {
      const text = searchEntry.get_text().toLowerCase().trim();
      let child = listbox.get_first_child();
      while (child) {
        if (child instanceof Gtk.ListBoxRow && child._appInfo) {
          const name = (child._appInfo.get_name() || "").toLowerCase();
          const id = (child._baseName || "").toLowerCase();
          child.set_visible(
            text === "" || name.includes(text) || id.includes(text),
          );
        }
        child = child.get_next_sibling();
      }
    });

    listbox.connect("row-activated", () =>
      dialog.response(Gtk.ResponseType.OK),
    );

    dialog.get_content_area().append(box);

    dialog.connect("response", (dlg, id) => {
      if (id === Gtk.ResponseType.OK) {
        const selected = listbox.get_selected_row();
        if (selected && selected._baseName) {
          const chosen = selected._baseName;
          const current = parseList();
          if (!current.some((e) => e.name.toLowerCase() === chosen.toLowerCase())) {
            current.push({ name: chosen, enabled: true });
            serializeList(current);
          }
        }
      }
      dlg.destroy();
    });

    dialog.present();
  };

  addAppBtn.connect("clicked", _showAddAppDialog);

  let savedFilterRows = [];

  const rebuildSavedList = () => {
    for (const r of savedFilterRows) savedGroup.remove(r);
    savedFilterRows = [];

    const entries = parseList();

    if (entries.length === 0) {
      const ph = new Adw.ActionRow({
        title: _("No players saved yet"),
        subtitle: _(
          "Detect running players below and click \u201cAdd to Filter\u201d " +
            "to add them here.",
        ),
        activatable: false,
      });
      ph.add_prefix(
        new Gtk.Image({
          icon_name: "view-list-symbolic",
          pixel_size: 28,
          valign: Gtk.Align.CENTER,
          opacity: 0.4,
        }),
      );
      savedGroup.add(ph);
      savedFilterRows.push(ph);
      return;
    }

    for (const entry of entries) {
      const { name, enabled } = entry;
      const appInfo = resolveAppInfo(name, name);
      const appIcon = appInfo ? appInfo.get_icon() : null;

      const row = new Adw.ActionRow({
        title: appInfo
          ? appInfo.get_display_name() || appInfo.get_name() || name
          : name,
        subtitle: name,
        activatable: false,
      });

      row.add_prefix(
        appIcon
          ? new Gtk.Image({
              gicon: appIcon,
              pixel_size: 32,
              valign: Gtk.Align.CENTER,
            })
          : new Gtk.Image({
              icon_name: "application-x-executable-symbolic",
              pixel_size: 32,
              valign: Gtk.Align.CENTER,
              opacity: 0.6,
            }),
      );

      const toggle = new Gtk.Switch({
        active: enabled,
        valign: Gtk.Align.CENTER,
        tooltip_text: enabled
          ? _(
              "Filter rule active for \u201c%s\u201d \u2014 click to disable",
            ).format(name)
          : _(
              "Filter rule disabled for \u201c%s\u201d \u2014 click to enable",
            ).format(name),
      });

      toggle.connect("state-set", (_sw, state) => {
        const current = parseList();
        const idx = current.findIndex((e) => e.name === name);
        if (idx !== -1) {
          current[idx].enabled = state;
          serializeList(current);
        }
        return false;
      });

      row.add_suffix(toggle);

      const removeBtn = new Gtk.Button({
        icon_name: "user-trash-symbolic",
        valign: Gtk.Align.CENTER,
        css_classes: ["flat", "destructive-action"],
        tooltip_text: _("Remove \u201c%s\u201d from the filter list").format(
          name,
        ),
      });

      removeBtn.connect("clicked", () => {
        const current = parseList();
        const updated = current.filter((e) => e.name !== name);
        serializeList(updated);
      });

      row.add_suffix(removeBtn);
      savedGroup.add(row);
      savedFilterRows.push(row);
    }
  };

  _settingsConnect("changed::player-filter-list", () => {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      rebuildSavedList();
      return GLib.SOURCE_REMOVE;
    });
  });

  rebuildSavedList();

  // Detected Players

  const detectGroup = new Adw.PreferencesGroup({
    title: _("Detected Players"),
    description: _(
      "Active MPRIS players found on the session D-Bus. " +
        "Click \u201cAdd to Filter\u201d to save a player to the list above.",
    ),
  });
  page.add(detectGroup);

  const scanHeaderRow = new Adw.ActionRow({
    title: _("Scan for running players"),
    subtitle: _("Detects players currently broadcasting on MPRIS"),
  });
  const refreshBtn = new Gtk.Button({
    icon_name: "view-refresh-symbolic",
    valign: Gtk.Align.CENTER,
    css_classes: ["flat"],
    tooltip_text: _("Refresh the detected player list"),
  });
  scanHeaderRow.add_suffix(refreshBtn);
  detectGroup.add(scanHeaderRow);

  const liveGroup = new Adw.PreferencesGroup();
  page.add(liveGroup);

  let filterLiveRows = [];

  const _liveAddBtns = new Map();

  const clearLiveRows = () => {
    for (const r of filterLiveRows) liveGroup.remove(r);
    filterLiveRows = [];
    _liveAddBtns.clear();
  };

  const _updateLiveAddBtns = () => {
    for (const [short, btn] of _liveAddBtns) {
      const saved = parseList().some((e) => e.name === short);
      btn.label = saved ? _("Saved \u2713") : _("Add to Filter");
      btn.css_classes = saved ? ["flat"] : ["suggested-action"];
    }
  };

  _settingsConnect("changed::player-filter-list", _updateLiveAddBtns);

  const scanPlayers = () => {
    clearLiveRows();

    Gio.DBus.session.call(
      "org.freedesktop.DBus",
      "/org/freedesktop/DBus",
      "org.freedesktop.DBus",
      "ListNames",
      null,
      null,
      Gio.DBusCallFlags.NONE,
      -1,
      null,
      (conn, res) => {
        try {
          const result = conn.call_finish(res);
          const names = result.deep_unpack()[0];
          const mprisNames = names.filter((n) =>
            n.startsWith("org.mpris.MediaPlayer2."),
          );

          clearLiveRows();

          if (mprisNames.length === 0) {
            const noneRow = new Adw.ActionRow({
              title: _("No active players detected"),
              subtitle: _("Open a music app and click Refresh"),
              activatable: false,
            });
            noneRow.add_prefix(
              new Gtk.Image({
                icon_name: "media-playback-stop-symbolic",
                pixel_size: 24,
                valign: Gtk.Align.CENTER,
                opacity: 0.5,
              }),
            );
            liveGroup.add(noneRow);
            filterLiveRows.push(noneRow);
            return;
          }

          const seen = new Set();

          for (const fullBus of mprisNames) {
            const { short, identity, desktopEntry, bestKey } =
              getBusPlayerIdentifiers(fullBus);
            const lookupKey = desktopEntry || identity || short;

            if (seen.has(lookupKey.toLowerCase()) || seen.has(short.toLowerCase()))
              continue;
            seen.add(lookupKey.toLowerCase());
            seen.add(short.toLowerCase());

            const appInfo =
              resolveAppInfo(lookupKey, short) ||
              (identity ? resolveAppInfo(identity, identity) : null);
            const appIcon = appInfo ? appInfo.get_icon() : null;
            const displayName =
              identity ||
              (appInfo ? appInfo.get_display_name() || appInfo.get_name() : null) ||
              short;

            const row = new Adw.ActionRow({
              title: displayName,
              subtitle: fullBus,
              activatable: false,
            });

            row.add_prefix(
              appIcon
                ? new Gtk.Image({
                    gicon: appIcon,
                    pixel_size: 32,
                    valign: Gtk.Align.CENTER,
                  })
                : new Gtk.Image({
                    icon_name: "application-x-executable-symbolic",
                    pixel_size: 32,
                    valign: Gtk.Align.CENTER,
                    opacity: 0.6,
                  }),
            );

            const isAlreadySaved = () => {
              const list = parseList().map((e) => e.name.toLowerCase());
              return (
                list.includes(short.toLowerCase()) ||
                (identity && list.includes(identity.toLowerCase())) ||
                (desktopEntry && list.includes(desktopEntry.toLowerCase())) ||
                list.includes(bestKey.toLowerCase())
              );
            };

            const alreadySaved = isAlreadySaved();

            const addBtn = new Gtk.Button({
              label: alreadySaved ? _("Saved \u2713") : _("Add to Filter"),
              valign: Gtk.Align.CENTER,
              css_classes: alreadySaved ? ["flat"] : ["suggested-action"],
              tooltip_text: alreadySaved
                ? _("\u201c%s\u201d is already in the filter list").format(
                    displayName,
                  )
                : _(
                    "Add \u201c%s\u201d to the filter list (enabled by default)",
                  ).format(displayName),
            });

            addBtn.connect("clicked", () => {
              if (isAlreadySaved()) return;
              const current = parseList();
              // Save both short bus identifier and best key (e.g. chromium and Message)
              current.push({ name: bestKey, enabled: true });
              if (short.toLowerCase() !== bestKey.toLowerCase()) {
                current.push({ name: short, enabled: true });
              }
              serializeList(current);
            });

            _liveAddBtns.set(lookupKey, addBtn);
            if (short !== lookupKey) _liveAddBtns.set(short, addBtn);
            row.add_suffix(addBtn);
            liveGroup.add(row);
            filterLiveRows.push(row);
          }
        } catch (e) {console.warn('[dash-to-panel] ?: ' + ((e && e.message) ? e.message : e)) }
      },
    );
  };

  refreshBtn.connect("clicked", scanPlayers);

  GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
    scanPlayers();
    return GLib.SOURCE_REMOVE;
  });

  return page;
}