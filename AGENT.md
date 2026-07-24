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
├── schemas/              ← Suite GSettings schema (8 enable-* keys)
├── gschemas.compiled
├── AGENT.md              ← THIS FILE
├── CHECKPOINT.md         ← Trạng thái dự án
├── docs/                 ← Tài liệu BA/SA chi tiết
├── modules/              ← 8 wired + 5 legacy modules
│   ├── alienware-dash-to-panel@hsx2coder/
│   ├── alienware-monitor@hsx2coder/
│   ├── alienware-topbar-widgets@hsx2coder/    ← GỘP: clipboard + command-menu + topbar-clone
│   ├── alienware-indicators@hsx2coder/         ← GỘP: appindicator + capsnum-touchpad
│   ├── alienware-desktop-enable-gnome@hsx2coder/
│   ├── alienware-advanced-alt-tab@hsx2coder/
│   ├── alienware-just-perfection-desktop@hsx2coder/
│   ├── alienware-notification-configurator@hsx2coder/
│   └── (5 legacy modules — unwired)
├── stylesheet.css
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
├── metadata.json         ← BẮT BUỘC: UUID, optional settings-schema, shell-version
├── schemas/              ← NẾU CÓ SCHEMA RIÊNG
│   ├── gschemas.compiled
│   └── org.gnome.shell.extensions.{name}.gschema.xml
├── stylesheet.css        ← TUỲ CHỌN
└── subsystems/           ← TUỲ CHỌN (module gộp từ nhiều module cũ)
    ├── clipboard/
    ├── command-menu/
    └── ...
```

### 2.2 UUID naming convention

| UUID | Mô tả | Loại |
|------|-------|------|
| `alienware-dash-to-panel@hsx2coder` | Taskbar + panel replacement | standalone |
| `alienware-monitor@hsx2coder` | System monitor (CPU/RAM/disk/net) | standalone |
| `alienware-topbar-widgets@hsx2coder` | **Gộp**: clipboard-indicator, command-menu2, topbar-clone | merged |
| `alienware-indicators@hsx2coder` | **Gộp**: AppIndicator + CapsNum/Touchpad | merged |
| `alienware-desktop-enable-gnome@hsx2coder` | Desktop Icons NG (ding) | standalone |
| `alienware-advanced-alt-tab@hsx2coder` | Advanced Alt-Tab Window Switcher | standalone |
| `alienware-just-perfection-desktop@hsx2coder` | GNOME Shell tweaker | standalone |
| `alienware-notification-configurator@hsx2coder` | Notification behavior tweaker | standalone |

**Legacy (unwired) — tồn tại trên filesystem nhưng không trong suite:**

| UUID | Lý do |
|------|-------|
| `alienware-appindicatorsupport@hsx2coder` | Đã gộp vào `alienware-indicators` |
| `alienware-capsnum-touchpad@hsx2coder` | Đã gộp vào `alienware-indicators` |
| `alienware-clipboard-indicator@hsx2coder` | Đã gộp vào `alienware-topbar-widgets` |
| `alienware-command-menu2@hsx2coder` | Đã gộp vào `alienware-topbar-widgets` |
| `alienware-topbar-clone@hsx2coder` | Đã gộp vào `alienware-topbar-widgets` |

### 2.3 GSettings schema convention

- **Module có schema riêng** (`metadata.json` có `settings-schema`): dùng `this.getSettings()` — Extension base class lookup từ module's `schemas/` dir
- **Module wrapper** (topbar-widgets, indicators) không `settings-schema`: không gọi `this.getSettings()` trực tiếp; prefs.js delegate xuống subsystem prefs
- **Module hardcode schema ID**: dash-to-panel lookup `'org.gnome.shell.extensions.dash-to-panel'` + `'advanced-media-controller'`, ding lookup `'org.gnome.shell.extensions.ding'`
- Tất cả schema IDs giữ ID gốc — không đổi path dconf

### 2.4 Suite wiring

**modules.js** — `MODULES` array chứa 8 definitions:
```js
{
    key: 'dashToPanel',              // camelCase key
    enableKey: 'enable-dash-to-panel', // suite schema key
    title: 'Dash to Panel',          // UI display name
    iconName: 'view-app-grid-symbolic',
    uuid: 'alienware-dash-to-panel@hsx2coder',
    entry: 'extension.js',
    prefsEntry: 'prefs.js',
    sessionMode: 'user',
    hasStylesheet: true,
}
```

**extension.js** — `CLASS_REGISTRY` map UUID → Extension class, 8 entries.
**prefs.js** — `PREFS_REGISTRY` map UUID → ExtensionPreferences class, 8 entries.

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

## 4. Hướng dẫn AI Agent

Khi làm việc với project này:

1. **Luôn đọc AGENT.md + file liên quan** trước khi sửa bất kỳ module nào
2. **Kiểm tra UUID** — uuid phải khớp với tên thư mục
3. **Kiểm tra schema** — metadata.json settings-schema phải khớp với schema xml id của module đó (trừ wrapper module)
4. **Kiểm tra hardcoded schema** — dash-to-panel và ding có hardcoded schema ID
5. **Kiểm tra compile** — sau sửa schema, chạy `glib-compile-schemas schemas/`
6. **Không đổi schema path** — dconf data phụ thuộc vào path
7. **Wrapper module** (topbar-widgets, indicators) không có `settings-schema` — extension.js và prefs.js của chúng không gọi `this.getSettings()` trực tiếp

## 5. Các file tham chiếu trong docs/

| File | Nội dung |
|------|----------|
| `docs/ARCHITECTURE.md` | Kiến trúc tổng thể, luồng dữ liệu, lifecycle |
| `docs/advanced-alt-tab.md` | AATWS — Advanced Alt-Tab Window Switcher |
| `docs/appindicator-support.md` | AppIndicator, KStatusNotifierItem, tray icons |
| `docs/capsnum-touchpad.md` | Caps/Num + Touchpad combined |
| `docs/clipboard-indicator.md` | Clipboard manager |
| `docs/command-menu.md` | Custom dropdown menus |
| `docs/dash-to-panel.md` | Taskbar + panel replacement |
| `docs/desktop-icons.md` | Desktop Icons NG (ding) |
| `docs/just-perfection.md` | GNOME Shell tweaker |
| `docs/system-monitor.md` | System monitor widgets |
| `docs/notification-configurator.md` | Notification behavior |
| `docs/topbar-clone.md` | Multi-monitor top bar clone |
