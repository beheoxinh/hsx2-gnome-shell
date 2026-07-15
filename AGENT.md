# AGENT.md — Alienware Suite GNOME Shell Extension

> Hướng dẫn cho AI Agent về cấu trúc, quy tắc và cách đọc tài liệu của dự án này.
> Mọi file trong `docs/` là tài liệu BA/SA nghiệp vụ chi tiết của từng module.

---

## 1. Tổng quan kiến trúc

Đây là một **GNOME Shell Extension** dạng **Suite** (tổ hợp), đóng vai trò như một container load/unload nhiều sub-modules bên trong.

```
alienware-hsx2coder-gnome@hsx2coder.github.com/
├── extension.js          ← Extension class (AlienwareSuiteExtension)
├── prefs.js              ← Preferences class (AlienwareSuitePreferences)
├── modules.js            ← MODULES array + buildSubMetadata() helper
├── schemas/              ← Suite GSettings schema (enable-* keys)
├── AGENT.md              ← THIS FILE
├── docs/                 ← Tài liệu BA/SA chi tiết từng module
├── modules/              ← Thư mục chứa các sub-modules
│   ├── alienware-dash-to-panel@hsx2coder/
│   ├── alienware-clipboard-indicator@hsx2coder/
│   └── ...               ← 13 modules tổng cộng
│
├── stylesheet.css        ← Suite-wide styles (optional)
```

**Mô hình hoạt động:**

1. GNOME Shell load extension theo UUID: `alienware-hsx2coder-gnome@hsx2coder.github.com`
2. `extension.js` khởi tạo `AlienwareSuiteExtension`, đọc `modules.js` để biết module nào có sẵn
3. Duyệt `MODULES` array, nếu `enable-{key}` trong suite settings = true → gọi `_enableModule()`
4. `_enableModule()` tạo instance của module class bằng `new Klass(subMetadata)` và gọi `instance.enable()`
5. Mỗi module là một class extend `Extension` từ GNOME Shell resource
6. Module được load từ thư mục `modules/<uuid>/` với `extension.js`, `prefs.js`, `schemas/`

## 2. Quy tắc Module

### 2.1 Cấu trúc thư mục module

```
modules/alienware-{name}@hsx2coder/
├── extension.js          ← BẮT BUỘC: export default class extends Extension
├── prefs.js              ← TUỲ CHỌN: export default class extends ExtensionPreferences  
├── metadata.json         ← BẮT BUỘC: UUID, settings-schema, shell-version
├── schemas/              ← NẾU CÓ SCHEMA RIÊNG
│   ├── gschemas.compiled
│   └── org.gnome.shell.extensions.{name}.gschema.xml
├── media/schemas/        ← NẾU CÓ SUB-SCHEMA (VD dash-to-panel media controller)
│   ├── gschemas.compiled
│   └── *.gschema.xml
├── stylesheet.css        ← TUỲ CHỌN
├── locale/               ← Bản dịch gettext
└── (các file .js khác)   ← Nội bộ module
```

### 2.2 UUID naming convention

Tất cả module: `alienware-{short-name}@hsx2coder`

| UUID | Mô tả |
|------|-------|
| `alienware-advanced-alt-tab@hsx2coder` | Advanced Alt-Tab Window Switcher |
| `alienware-appindicatorsupport@hsx2coder` | AppIndicator + KStatusNotifierItem |
| `alienware-capsnum-indicator@hsx2coder` | Caps/Num Lock indicator (*standalone*) |
| `alienware-capsnum-touchpad@hsx2coder` | Caps/Num + Touchpad toggle |
| `alienware-clipboard-indicator@hsx2coder` | Clipboard manager |
| `alienware-command-menu2@hsx2coder` | Custom dropdown menu |
| `alienware-dash-to-panel@hsx2coder` | Taskbar + panel |
| `alienware-desktop-enable-gnome@hsx2coder` | Desktop Icons NG (ding) |
| `alienware-just-perfection-desktop@hsx2coder` | GNOME Shell tweaker |
| `alienware-monitor@hsx2coder` | System monitor (CPU/RAM/disk/net) |
| `alienware-notification-configurator@hsx2coder` | Notification behavior tweaker |
| `alienware-topbar-clone@hsx2coder` | Clone top bar to secondary monitors |
| `alienware-touchpad@hsx2coder` | Touchpad quick-toggle (*standalone*) |

### 2.3 GSettings schema convention

- **Module có schema riêng**: dùng `this.getSettings()` (Extension base class tự lookup từ `metadata['settings-schema']`)
- **Module hardcode schema ID**: dash-to-panel lookup `'org.gnome.shell.extensions.dash-to-panel'` + `'advanced-media-controller'`, ding lookup `'org.gnome.shell.extensions.ding'` trong `enums.js`
- **Topbar-clone**: không có schema riêng, dùng schema của suite: `org.gnome.shell.extensions.alienware-suite`
- Tất cả schema IDs đã revert về ID gốc (không còn hậu tố `-aliensuite`)

### 2.4 Suite wiring

**modules.js** — `MODULES` array chứa 11 definitions, mỗi definition có:
```js
{
    key: 'dashToPanel',              // camelCase key
    enableKey: 'enable-dash-to-panel', // suite schema key
    title: 'Dash to Panel',          // UI display name
    iconName: 'view-app-grid-symbolic', // icon
    uuid: 'alienware-dash-to-panel@hsx2coder', // module UUID
    entry: 'extension.js',           // entry point file
    prefsEntry: 'prefs.js',          // prefs entry point
    sessionMode: 'user',             // session mode
    hasStylesheet: true,             // has stylesheet.css
}
```

**extension.js** — `CLASS_REGISTRY` map UUID → Extension class, 11 entries.

**prefs.js** — `PREFS_REGISTRY` map UUID → ExtensionPreferences class, 11 entries.

### 2.5 Schema wiring flow

```
Suite schema key (enable-*) = true
  → _enableModule() gọi buildSubMetadata() 
  → tạo module class instance với subMetadata{dir, path, uuid, ...}
  → module.enable() gọi this.getSettings()
  → Extension base class lookup schema từ this.dir.get_child('schemas')
  → Nếu có schema file → GSettings đọc từ dconf
  → Nếu không có schema riêng → dùng schema mặc định (system)
```

## 3. GSettings & dconf

- Dữ liệu cấu hình người dùng lưu trong **dconf** tại path tương ứng schema path
- Suite schema path: `/org/gnome/shell/extensions/alienware-suite/`
- Module schema paths: `/org/gnome/shell/extensions/{name}/`
- Khi đổi schema ID nhưng giữ nguyên **path**, dữ liệu dconf cũ vẫn truy cập được
- `Extension.getSettings()` mặc định lookup từ `metadata['settings-schema']`

## 4. validate AI Agent

Khi làm việc với project này:

1. **Luôn đọc AGENT.md + file liên quan** trước khi sửa bất kỳ module nào
2. **Kiểm tra UUID** — uuid phải khớp với tên thư mục
3. **Kiểm tra schema** — metadata.json settings-schema phải khớp với schema xml id
4. **Kiểm tra hardcoded schema** — dash-to-panel và ding có hardcoded schema ID, cần verify
5. **Kiểm tra compile** — sau sửa schema, chạy `glib-compile-schemas schemas/`
6. **Không đổi schema path** — dconf data phụ thuộc vào path
7. **Không xoá thư mục modules/** — extension runtime phụ thuộc vào cấu trúc này
8. **Không rename UUID module** trừ khi update tất cả các file sau: metadata.json, modules.js, extension.js, prefs.js, schemas/*
9. **Tham khảo docs/** cho business logic chi tiết từng module

## 5. Các file tham chiếu trong docs/

| File | Nội dung |
|------|----------|
| `docs/ARCHITECTURE.md` | Kiến trúc tổng thể, luồng dữ liệu, lifecycle |
| `docs/advanced-alt-tab.md` | AATWS — Advanced Alt-Tab Window Switcher |
| `docs/appindicator-support.md` | AppIndicator, KStatusNotifierItem, tray icons |
| `docs/capsnum-indicator.md` | Caps/Num Lock indicator |
| `docs/capsnum-touchpad.md` | Caps/Num + Touchpad combined |
| `docs/clipboard-indicator.md` | Clipboard manager |
| `docs/command-menu.md` | Custom dropdown menus |
| `docs/dash-to-panel.md` | Taskbar + panel replacement |
| `docs/desktop-icons.md` | Desktop Icons NG (ding) |
| `docs/just-perfection.md` | GNOME Shell tweaker |
| `docs/system-monitor.md` | System monitor widgets |
| `docs/notification-configurator.md` | Notification behavior |
| `docs/topbar-clone.md` | Multi-monitor top bar clone |
| `docs/touchpad-switcher.md` | Touchpad quick toggle |
