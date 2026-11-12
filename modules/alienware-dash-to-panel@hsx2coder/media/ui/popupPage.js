import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import { gettext as _ } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

/**
 * Builds the Popup Player preferences page.
 *
 * @param {Gio.Settings} settings
 * @returns {Adw.PreferencesPage}
 */
export function buildPopupPage(settings) {
  const popupPage = new Adw.PreferencesPage({
    title: _("Popup Player"),
    icon_name: "media-playback-start-symbolic",
  });

  // Popup Size
  const sizeGroup = new Adw.PreferencesGroup({
    title: _("Popup Size"),
    description: _("Width of the popup media player panel (height scales with album art)"),
  });
  popupPage.add(sizeGroup);

  const popupWidthRow = new Adw.SpinRow({
    title: _("Popup Width"),
    subtitle: _("Width in pixels — album art and labels scale with this value (280 – 600 px)"),
    adjustment: new Gtk.Adjustment({
      lower: 280,
      upper: 600,
      step_increment: 10,
      page_increment: 40,
      value: settings.get_int("popup-width"),
    }),
  });
  settings.bind("popup-width", popupWidthRow, "value", Gio.SettingsBindFlags.DEFAULT);
  sizeGroup.add(popupWidthRow);

  // Appearance
  const appearanceGroup = new Adw.PreferencesGroup({
    title: _("Appearance"),
  });
  popupPage.add(appearanceGroup);

  const monochromeRow = new Adw.SwitchRow({
    title: _("Monochrome Icons"),
    subtitle: _("Render the player and control icons in a single colour"),
  });
  settings.bind("monochrome-icons", monochromeRow, "active", Gio.SettingsBindFlags.DEFAULT);
  appearanceGroup.add(monochromeRow);

  return popupPage;
}
