# AppIndicator Support — Module Documentation

> **Vai trò:** Hiển thị AppIndicator (KStatusNotifierItem) và legacy tray icons từ ứng dụng Linux lên top bar.

---

## 1. Tổng quan

Module này cung cấp khả năng hiển thị các indicator icon từ ứng dụng (như Telegram, Discord, Slack, Steam, Dropbox) vào GNOME Shell top bar hoặc system tray area.

**Kế thừa từ:** `appindicatorsupport@rgcjonas.gmail.com`

### 1.1 Tính năng chính

- KStatusNotifierItem protocol (DBus `org.kde.StatusNotifierWatcher`)
- Legacy tray icons (XEmbed) cho ứng dụng cũ
- Custom icon handling (themes, brightness, saturation, contrast)
- Tray order: sắp xếp indicator vị trí
- Compact mode: ẩn label chỉ hiển thị icon
- Icon size control: từ 14px đến 48px

### 1.2 Module integration

- **Class:** `AppIndicatorExtension extends Extension`
- **Extension import pattern:** `import * as Extension` → `Extension.Extension`
- **SettingsManager:** Dùng `extension.getSettings()` pattern
- **No own UI:** Chỉ render indicator icons, không preferences page riêng

---

## 2. GSchema Keys

Schema: `org.gnome.shell.extensions.indicators-appindicator` (10 keys)

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `icon-size` | i | 14 | Icon size in pixels |
| `icon-opacity` | i | 255 | Icon opacity (0–255) |
| `icon-saturation` | d | 0.0 | Color saturation adjustment |
| `icon-brightness` | d | 0.0 | Brightness adjustment |
| `icon-contrast` | d | 0.0 | Contrast adjustment |
| `tray-order` | i | 1 | Display order in tray |
| `tray-pos` | s | 'right' | Tray position (left/right) |
| `legacy-tray-enabled` | b | true | Enable legacy XEmbed tray icons |
| `compact-mode-enabled` | b | false | Compact mode (icon only, no label) |
| `custom-icons` | a(sss) | [] | Custom icon map [app_id, icon_name, icon_data] |

---

## 3. Luồng nghiệp vụ

### 3.1 Startup flow

```
enable()
  → SettingsManager.initialize(this)  // lưu GSettings reference
  → Util.tryCleanupOldIndicators()
  → _maybeEnableAfterNameAvailabler()  // wait for name to appear
  → TrayIconsManager.initialize()
       ├── StatusNotifierWatcher (DBus)
       └── LegacyTrayManager (X11 fallback)
```

### 3.2 Indicator registration

```
App launches (e.g., Telegram)
  → app registers StatusNotifierItem on DBus
  → StatusNotifierWatcher receives org.freedesktop.DBus.NameOwnerChanged
  → TrayIconsManager creates AppIndicator instance
  → render icon in top bar tray area
  → on click: activate app or show menu
```

### 3.3 Legacy tray icons

```
X11 app creates tray window (XEmbed)
  → LegacyTrayManager detects via X11 events
  → Reparent into GNOME Shell St widget
  → Render in same tray area as SNI icons
```

---

## 4. Cấu hình mặc định

- Icon size: 14px
- Opacity: 255 (full)
- Saturation/brightness/contrast: 0 (no adjustment)
- Tray position: right
- Legacy tray: enabled
- Compact mode: disabled

---

## 5. Lưu ý kỹ thuật

- **Icon processing:** Dùng GdkPixbuf để xử lý custom icon data
- **DBus interface:** Implementation của `org.kde.StatusNotifierWatcher`
- **X11/Wayland:** Legacy tray chỉ hoạt động trên X11. Trên Wayland dùng SNI protocol
- **Import pattern:** Module dùng `import * as Extension` thay vì `import { Extension }` — duy nhất trong suite

---

## 6. References

- Dconf path: `/org/gnome/shell/extensions/indicators-appindicator/`
- Protocol: https://www.freedesktop.org/wiki/Specifications/StatusNotifierItem/
