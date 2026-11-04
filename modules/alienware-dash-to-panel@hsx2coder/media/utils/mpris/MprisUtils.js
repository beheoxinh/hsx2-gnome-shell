import Gio from "gi://Gio";
let GioUnix = null;
try {
  GioUnix = (await import("gi://GioUnix")).default;
} catch (_e) {}
import Shell from "gi://Shell";
import { MprisConstants } from "./MprisConstants.js";

export class MprisUtils {
  static getString(variant) {
    if (!variant) return null;
    try {
      const str = variant.get_string ? variant.get_string()[0] : null;
      return str || null;
    } catch (e) {
      return null;
    }
  }

  static getInt64(variant) {
    if (!variant) return null;
    try {
      return variant.get_int64();
    } catch (e) {
      return null;
    }
  }

  static getInt32(variant) {
    if (!variant) return null;
    try {
      return variant.get_int32();
    } catch (e) {
      return null;
    }
  }

  static getAppInfo(name, desktopEntries) {
    try {
      const desktopEntry = desktopEntries.get(name);
      if (desktopEntry) {
        const DesktopAppInfoClass = GioUnix?.DesktopAppInfo || Gio.DesktopAppInfo;
        let appInfo = DesktopAppInfoClass?.new(`${desktopEntry}.desktop`);
        if (appInfo) return appInfo;

        appInfo = DesktopAppInfoClass?.new(desktopEntry);
        if (appInfo) return appInfo;
      }

      let cleanName = name
        .replace(`${MprisConstants.MPRIS_PREFIX}.`, "")
        .toLowerCase();
      cleanName = cleanName.replace(/\.instance_\d+_\d+$/, "");

      const appSystem = Shell.AppSystem.get_default();
      let app = appSystem.lookup_app(`${cleanName}.desktop`);
      if (app) return app.get_app_info();

      if (cleanName === "spotify") {
        app = appSystem.lookup_app("com.spotify.Client.desktop");
        if (app) return app.get_app_info();
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  static getAppIcon(name, desktopEntries) {
    try {
      const appInfo = MprisUtils.getAppInfo(name, desktopEntries);
      if (appInfo && appInfo.get_icon()) {
        return appInfo.get_icon().to_string();
      }
      return "audio-x-generic-symbolic";
    } catch (_e) {
      return "audio-x-generic-symbolic";
    }
  }
}
