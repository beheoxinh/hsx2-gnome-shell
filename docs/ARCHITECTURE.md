# Kiến trúc Alienware Suite — GNOME Shell Extension

> **Vai trò:** Tài liệu BA/SA tổng thể về kiến trúc, luồng dữ liệu, lifecycle và thiết kế giải pháp của toàn bộ extension suite.

---

## 0. Module ownership sau khi gộp (2026-09)

Suite load 9 module, mỗi module một chức năng. Ownership cứng:

| Tài nguyên | Chủ sở hữu duy nhất | Cách module khác dùng |
|---|---|---|
| `Main.panel`, `_leftBox`, `_centerBox`, `_rightBox`, `statusArea`, `panelBox` | `alienware-topbar` | `PanelHost` |
| panel geometry / clock / quick settings / panel item visibility | `alienware-topbar` | không ai khác có key |
| `_computeWorkspacesBoxForState` patch | `lib/workspacesBoxLayout.js` (refcount) | `addWorkspacesBoxPatch()` |
| `workspaceSwitcherPopup`, `overview`, `windowMenu`, `lookingGlass`, OSD | `alienware-gnome-customizer-manager` | import `API` trực tiếp |
| `WindowIcon._init`, `SwitcherPopup.show` | `alienware-advanced-alt-tab` | import `AltTabApi` |
| dash visibility / dash icon size | `alienware-dash-to-panel` | import `DashApi` |

Không còn `Extension.lookupByUUID` nào trong suite: trước đó có 5 chỗ, và mỗi
chỗ im lặng trở thành no-op nếu `enable-gnome-customizer-manager` bị tắt,
vì phụ thuộc thứ tự enable trong `MODULES`.

### 0.1 Vì sao có `lib/workspacesBoxLayout.js`

Hai domain sửa cùng một hàm shell: search entry (topbar) nới khoảng trống trên
workspace box, và `workspaces-in-app-grid` ép chiều cao box. Trước khi tách, cả
hai nằm trong một class nên chỉ có một lần patch. Tách xong, mỗi class tự lưu
`_computeWorkspacesBoxForState` gốc rồi tự khôi phục — module tắt trước sẽ
khôi phục lại wrapper của module kia và rò nó. `lib/workspacesBoxLayout.js` giữ
một patch duy nhất, đếm số record, và chỉ khôi phục khi record cuối cùng đi.

### 0.2 Vì sao `tools/` tồn tại

Suite đã có 119 key trùng tên giữa hai schema id trong suốt thời gian tồn tại,
và 46 trong số đó bị hai module đọc/ghi cùng lúc với **hai ý nghĩa khác nhau**
(`app-button`, `weather`, `world-clock`, `type-to-search`, `top-panel-position`).
GSettings không cảnh báo vì khác schema id. Không có gì bắt được, nên giờ có:
`tools/check-schema-collisions.sh`, `tools/check-key-usage.py` và
`tools/check-wiring.py`, tất cả chạy được ngoài GNOME Shell.

---

## 1. Tổng quan giải pháp

### 1.1 Vấn đề

GNOME Shell Extension ecosystem cho phép cài đặt extension riêng lẻ, mỗi extension có UUID, schema, preferences riêng. Khi số lượng extension tăng lên, việc quản lý trở nên phức tạp: xung đột schema, trùng tài nguyên, khó kiểm soát enable/disable đồng bộ, và performance overhead do nhiều extension độc lập cùng chạy.

### 1.2 Giải pháp

**Alienware Suite** là một GNOME Shell Extension đóng vai trò container (suite). Thay vì cài 8 extension riêng lẻ, người dùng chỉ cài một extension duy nhất. Suite này:

1. Định nghĩa một module registry (`modules.js`) chứa danh sách tất cả sub-modules
2. Cung cấp cơ chế enable/disable từng module qua suite-level GSettings
3. Tự động load/unload module class instances tại runtime
4. Cung cấp single preferences window cho tất cả modules
5. Duy trì lookup shim để hỗ trợ các module gọi `Extension.lookupByUUID()`

### 1.3 Lợi ích

- **Một extension duy nhất** trong GNOME Extensions manager
- **Một preferences window** quản lý tất cả modules
- **Không xung đột UUID** với extension khác
- **Quản lý bộ nhớ tập trung** — disable module giải phóng tài nguyên
- **Cho phép tuỳ chỉnh từng module** độc lập

---

## 2. Luồng dữ liệu và lifecycle

### 2.1 Extension startup flow

```mermaid
flowchart TD
    A[GNOME Shell start] --> B[Load extension by UUID]
    B --> C[AlienwareSuiteExtension.constructor]
    C --> D[_installLookupShim]
    D --> E[Read suite settings]
    E --> F[For each MODULE definition]
    F --> G{enableKey = true?}
    G -- Yes --> H[_enableModule]
    G -- No --> I[Skip - module disabled]
    H --> J[Lookup CLASS_REGISTRY[uuid]]
    J --> K[Create subMetadata via buildSubMetadata]
    K --> L[new Klass(subMetadata)]
    L --> M[instance.enable]
    M --> N[module registers UI elements]
    N --> O{Next module?}
    O -- Yes --> F
    O -- No --> P[Suite ready]
```

### 2.2 Module enable/disable runtime flow

```mermaid
flowchart TD
    A[User toggles switch in preferences] --> B[GSettings changed::enable-{key}]
    B --> C[_reactToToggle]
    C --> D{enabled now?}
    D -- Yes --> E[Module was off ?]
    E -- Yes --> F[_enableModule]
    F --> G[Create instance + enable]
    D -- No --> H[Module was on ?]
    H -- Yes --> I[_disableModule]
    I --> J[instance.disable + cleanup]
    G --> K[UI updates]
    J --> K
```

### 2.3 buildSubMetadata flow

```
Suite extension dir
  └── get_child('modules')
       └── get_child(moduleDef.uuid)
            ├── get_child('metadata.json') → read + JSON.parse
            └── get_path() → module path

subMetadata = {
    ...original,          // từ metadata.json gốc
    uuid: moduleDef.uuid, // override UUID
    dir: moduleDir,       // GFile pointer (quan trọng cho getSettings)
    path: modulePath,     // absolute path string
    url: `file://${path}/` // resource URL
}
```

### 2.4 GSettings schema resolution

Khi module gọi `this.getSettings()`:

```
this.getSettings() // không argument → đọc từ metadata['settings-schema']

Extension base class:
  dir = this.metadata.dir            // module's dir
  schemaDir = dir.get_child('schemas')
  source = GioSSS.new_from_directory(schemaDir, GioSSS.get_default(), false)
  schemaObj = source.lookup(schemaId, true)
  return new Gio.Settings({settings_schema: schemaObj})
```

**Fallback chain:** module schemas → system schemas

Key insight: dconf data được lưu theo **path** (ví dụ `/org/gnome/shell/extensions/dash-to-panel/`), không phụ thuộc schema ID. Do đó, đổi schema ID không làm mất dữ liệu nếu giữ nguyên path.

---

## 3. Extension lookup shim

Một số module (đặc biệt là dash-to-panel) gọi `Extension.lookupByUUID()` để tìm extension instance khác. Khi các module đó đã được nhúng vào suite, chúng không còn là standalone extension nữa → `lookupByUUID` sẽ không tìm thấy chúng.

**Giải pháp:** Suite cài một shim lên `Extension.lookupByUUID`:

```js
Extension.lookupByUUID = function(uuid) {
    if (uuid === self.uuid) return self;        // suite itself
    const sub = loaded.get(uuid);               // loaded module instances
    if (sub) return sub;
    return orig(uuid);                          // fallback to original
};
```

Shim được cài trong `enable()` và khôi phục trong `disable()`.

---

## 4. Preferences window architecture

### 4.1 Suite preferences (main window)

- Suite prefs class: `AlienwareSuitePreferences extends ExtensionPreferences`
- Mở từ GNOME Extensions app → **Alienware Suite — hsx2coder**
- Hiển thị tất cả modules trong Adw.PreferencesPage
- Mỗi module có toggle switch + Configure button
- Configure button mở sub-window riêng cho module

### 4.2 Module preferences (sub-windows)

- Module prefs class extends `ExtensionPreferences`
- Suite tạo instance với `buildSubMetadata` → `subPrefs = new PrefsClass(subMetadata)`
- Suite cài lookup shim cho `ExtensionPreferences.lookupByUUID`
- Module gọi `this.getSettings()` → tìm schema từ module dir
- Module gọi `ExtensionPreferences.lookupByURL(import.meta.url)` → tìm metadata

### 4.3 Preferences data flow

```
User clicks Configure
  → _openModuleWindow()
  → buildSubMetadata() tạo subMetadata{dir, path, uuid}
  → new PrefsClass(subMetadata) → prefs instance với module dir
  → subPrefs.fillPreferencesWindow(subWindow)
  → module prefs đọc cấu hình từ GSettings (dconf)
  → user chỉnh sửa → GSettings tự động sync xuống dconf
  → runtime module đọc thay đổi qua signal 'changed'
```

---

## 5. GSettings schema design

### 5.1 Suite schema

- **Schema ID:** `org.gnome.shell.extensions.alienware-suite`
- **Path:** `/org/gnome/shell/extensions/alienware-suite/`
- **Purpose:** chứa enable/disable switches cho tất cả modules + extra settings cho topbar-clone
- **Keys:** 11 `enable-{name}` + 2 `topbar-clone-*` = 13 keys
- **Default:** tất cả `true` (modules enabled by default)

### 5.2 Module schemas

Mỗi module giữ schema ID gốc (từ standalone extension gốc) để tương thích dconf data:

| Module | Schema ID | Schema File(s) | Path | Keys |
|--------|-----------|---------------|------|------|
| Dash to Panel | `org.gnome.shell.extensions.dash-to-panel` | dash-to-panel.gschema.xml | `/org/gnome/shell/extensions/dash-to-panel/` | 250 |
| Dash-to-Panel Media | `org.gnome.shell.extensions.advanced-media-controller` | (media/schemas/) | `/org/gnome/shell/extensions/advanced-media-controller/` | ~30 |
| System Monitor | `org.gnome.shell.extensions.system-monitor-next-applet` | system-monitor-next-applet.gschema.xml | (sub-schema) | 130 |
| **Topbar Widgets** | *wrapper* | clipboard-indicator(44), commandmenu2(2), panel-clone(2) | paths giữ nguyên gốc | 48 |
| **Indicators** | *wrapper* | indicators-appindicator(10), capsnum-touchpad(6) | paths giữ nguyên gốc | 16 |
| Desktop Icons | `org.gnome.shell.extensions.ding` | ding.gschema.xml | `/org/gnome/shell/extensions/ding/` | 22 |
| AATWS | `org.gnome.shell.extensions.advanced-alt-tab-window-switcher` | advanced-alt-tab-window-switcher.gschema.xml | `/org/gnome/shell/extensions/advanced-alt-tab-window-switcher/` | 111 |
| Just Perfection | `org.gnome.shell.extensions.just-perfection` | just-perfection.gschema.xml | `/org/gnome/shell/extensions/just-perfection/` | 0 — all keys distributed |
| Notification Config | `org.gnome.shell.extensions.notification-configurator` | notification-configurator.gschema.xml | `/org/gnome/shell/extensions/notification-configurator/` | 14 |
| **Workspace Control** | đã gộp vào `alienware-gnome-customizer-manager` (schema `…extensions.gnome-customizer-manager`) | workspace-control.gschema.xml | `/org/gnome/shell/extensions/workspace-control/` | 14 |
| **Gnome Customizer Mgr** | `org.gnome.shell.extensions.gnome-customizer-manager` | gnome-customizer-manager.gschema.xml | `/org/gnome/shell/extensions/gnome-customizer-manager/` | 24 |
| **Topbar Panel Ctrls** | đã gộp vào `alienware-topbar` (schema `…extensions.alienware-topbar`) | `/org/gnome/shell/extensions/topbar-panel-controls/` | 26 |

### 5.3 Hardcoded schema lookups (cần chú ý)

Hai module không dùng `this.getSettings()` mà hardcode schema ID trong source:

1. **Dash to Panel** — `extension.js` dòng 72: `lookup('org.gnome.shell.extensions.dash-to-panel')`
2. **Dash to Panel** — `extension.js` dòng 211: `lookup('org.gnome.shell.extensions.advanced-media-controller')`
3. **Dash to Panel** — `prefs.js` dòng 4286: `this.getSettings('org.gnome.shell.extensions.dash-to-panel')`
4. **Desktop Icons (ding)** — `app/enums.js` dòng 109: `SCHEMA = 'org.gnome.shell.extensions.ding'`

Các module còn lại dùng `this.getSettings()` (không argument), tự động đọc từ `metadata['settings-schema']`.

---

## 6. Multi-monitor considerations

- **Dash to Panel** hỗ trợ config per-monitor qua panel editor
- **Topbar Clone** clone native top bar (clock + tray) ra secondary monitors
- **AATWS** cấu hình switcher popup position per-monitor
- **System Monitor** hiển thị widget trên panel chính, tuỳ chọn monitor

---

## 7. Security & Isolation

- Suite extension chạy trong cùng process với GNOME Shell (không sandbox)
- Các module chia sẻ cùng JS global context → cần tránh xung đột tên biến
- Suite dùng `global.dashToPanel` cho cross-module communication (dash-to-panel pattern)
- AppIndicator module giao tiếp với process ngoài qua DBus (StatusNotifierWatcher)
- Desktop Icons (ding) spawn subprocess cho file operations

---

## 8. Dependencies

### GNOME Shell version
- Tối thiểu: GNOME Shell 45 (ESModules API)
- Đã test: 45–53
- Tương thích: 45–54 (tuỳ module)

### System packages
- **System Monitor:** cần `gir1.2-gtop-2.0`, `gir1.2-nm-1.0`, `gir1.2-upowerglib-1.0`
- **Desktop Icons:** spawn `nautilus` process cho desktop file operations
- **AppIndicator:** không cần thêm package (dùng DBus session bus)

### GJS imports
- Core: `Gio`, `GLib`, `GObject`, `St`, `Clutter`, `Meta`, `Shell`
- Shell UI: `resource:///org/gnome/shell/ui/main.js`, `panelMenu.js`, `popupMenu.js`
- Shell extensions: `resource:///org/gnome/shell/extensions/extension.js`

---

## 9. Module NOT in Suite (legacy/unwired)

Các module sau có sẵn trong thư mục `modules/` NHƯNG không được đăng ký trong suite `modules.js`, `extension.js` (CLASS_REGISTRY) và `prefs.js` (PREFS_REGISTRY):

1. **alienware-appindicatorsupport@hsx2coder** — AppIndicator Support (đã được gộp vào alienware-indicators)
2. **alienware-capsnum-touchpad@hsx2coder** — CapsNum+Touchpad standalone (đã được gộp vào alienware-indicators)
3. **alienware-clipboard-indicator@hsx2coder** — Clipboard indicator standalone (đã được gộp vào alienware-topbar-widgets)
4. **alienware-command-menu2@hsx2coder** — Command Menu standalone (đã được gộp vào alienware-topbar-widgets)
5. **alienware-topbar-clone@hsx2coder** — Topbar Clone standalone (đã được gộp vào alienware-topbar-widgets)

Chúng giữ nguyên UUID và schema trên filesystem cho mục đích rollback an toàn.
