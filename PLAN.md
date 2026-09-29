# PLAN — Restructure Extension Suite

> **LƯU Ý (2026-09-29):** tài liệu này mô tả trạng thái **trước** đợt gộp theo chức năng.
> Bốn module trong đây không còn tồn tại: `topbar-widgets`, `topbar-panel-controls`
> và `workspace-control` đã gộp, còn `dash-to-panel/media/` đã tách thành
> `alienware-advanced-media-controller`. Layout hiện hành: `AGENT.md` mục 1,
> `docs/ARCHITECTURE.md` mục 0, `CHECKPOINT.md`.


> File: `.hermes/plan/restructure-plan.md`
> Trạng thái: **COMPLETED** — 8 wired modules, 2 merged (topbar-widgets, indicators), 5 legacy unwired
> Last updated: 2026-07-15

---

## I. MÔ HÌNH KIẾN TRÚC MỚI

### Hiện tại: Suite orchestrator import sub-modules
```
alienware-suite (@hsx2coder.github.com)
├── extension.js       ← CLASS_REGISTRY: 13 modules (11 wired + 2 unwired)
├── prefs.js           ← PREFS_REGISTRY: 11 prefs
├── modules.js         ← 11 definitions (key, enableKey, title, iconName, uuid)
├── schemas/           ← 11 enable-keys
└── modules/           ← 13 thư mục module riêng
    ├── alienware-dash-to-panel@hsx2coder/       ← 21K LOC
    ├── alienware-monitor@hsx2coder/              ← 8K LOC
    ├── alienware-clipboard-indicator@hsx2coder/  ← 6K LOC
    ├── alienware-just-perfection-desktop@hsx2coder/ ← 150K LOC
    ├── ... (9 modules nữa)
    └── alienware-touchpad@hsx2coder/             ← legacy (xoá)
```

### Sau: Module thật, suite lightweight
```
alienware-suite (@hsx2coder.github.com)
├── extension.js       ← Load 5 standalone extensions (giống GNOME Shell: gọi enable/disable)
├── prefs.js           ← 5 pages
├── schemas/           ← 5 enable-keys + topbar-clone keys
└── modules/
    ├── (NEW) alienware-panel@hsx2coder           ← Gộp 7 module
    ├── alienware-advanced-alt-tab@hsx2coder      ← Giữ nguyên
    ├── alienware-desktop-enable-gnome@hsx2coder  ← Giữ nguyên (cần test DIND)
    ├── alienware-just-perfection-desktop@hsx2coder ← Giữ nguyên
    └── alienware-notification-configurator@hsx2coder ← Giữ nguyên
```

**Thay đổi cốt lõi:** Module mới là extension thật (extends Extension), không còn sub-module pattern. Từng module cũ được MOVE code vào bên trong module mới.

---

## II. MERGE 7 → 1: PANEL MODULE

### 2.1 Target
```
modules/alienware-panel@hsx2coder/
├── metadata.json              ← uuid: alienware-panel@hsx2coder
├── extension.js               ← PanelExtension (extends Extension)
├── prefs.js                   ← Tabbed preferences
├── schemas/                   ← 7 schemas gộp lại
│   ├── org.gnome.shell.extensions.dash-to-panel.gschema.xml
│   ├── org.gnome.shell.extensions.system-monitor.gschema.xml
│   ├── org.gnome.shell.extensions.clipboard-indicator.gschema.xml
│   ├── org.gnome.shell.extensions.indicators-appindicator.gschema.xml
│   ├── org.gnome.shell.extensions.command-menu2.gschema.xml
│   ├── org.gnome.shell.extensions.topbar-clone(panel-clone).gschema.xml  ← rename
│   └── org.gnome.shell.extensions.capsnum-touchpad.gschema.xml
├── subsystems/                ← code từ 7 module cũ
│   ├── taskbar/               ← từ dash-to-panel (48 files, 21K LOC)
│   │   ├── panelManager.js
│   │   ├── appIcons.js
│   │   ├── intellihide.js
│   │   ├── windowPreview.js
│   │   ├── settings.js
│   │   ├── media/
│   │   └── ...
│   ├── system-monitor/        ← từ monitor (10 files, 8K LOC)
│   │   ├── main.js
│   │   └── ...
│   ├── clipboard/             ← từ clipboard-indicator (6 files, 6K LOC)
│   │   ├── clipboardManager.js
│   │   └── ...
│   ├── appindicator/          ← từ appindicatorsupport (17 files, 5K LOC)
│   │   ├── appIndicator.js
│   │   ├── dbusMenu.js
│   │   └── ...
│   ├── command-menu/          ← từ command-menu2 (6 files, 2K LOC)
│   │   └── ...
│   ├── capsnum-touchpad/      ← từ capsnum-touchpad (2 files, 1K LOC)
│   │   └── ...
│   └── topbar-clone/          ← từ topbar-clone (2 files, 1.6K LOC)
│       └── ...
├── icons/
├── stylesheet.css
└── gschemas.compiled
```

### 2.2 Extension class pattern

```js
// extension.js
import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {TaskbarSubsystem} from './subsystems/taskbar/main.js';
import {SystemMonitorSubsystem} from './subsystems/system-monitor/main.js';
import {ClipboardSubsystem} from './subsystems/clipboard/main.js';
import {AppIndicatorSubsystem} from './subsystems/appindicator/main.js';
import {CommandMenuSubsystem} from './subsystems/command-menu/main.js';
import {CapsNumTouchpadSubsystem} from './subsystems/capsnum-touchpad/main.js';
import {TopbarCloneSubsystem} from './subsystems/topbar-clone/main.js';

const SUBSYSTEMS = [
    TaskbarSubsystem,
    SystemMonitorSubsystem,
    ClipboardSubsystem,
    AppIndicatorSubsystem,
    CommandMenuSubsystem,
    CapsNumTouchpadSubsystem,
    TopbarCloneSubsystem,
];

export default class PanelExtension extends Extension {
    enable() {
        this._extension = this;  // for subsystems that need the extension context
        
        this._subs = SUBSYSTEMS.map(Sub => {
            const sub = new Sub({
                extension: this,
                settings: {
                    taskbar: this._loadSettings('org.gnome.shell.extensions.dash-to-panel'),
                    systemMonitor: this._loadSettings('org.gnome.shell.extensions.system-monitor'),
                    clipboard: this._loadSettings('org.gnome.shell.extensions.clipboard-indicator'),
                    appindicator: this._loadSettings('org.gnome.shell.extensions.indicators-appindicator'),
                    commandMenu: this._loadSettings('org.gnome.shell.extensions.command-menu2'),
                    capsnumTouchpad: this._loadSettings('org.gnome.shell.extensions.capsnum-touchpad'),
                },
                path: this.path,
                dir: this.dir,
            });
            sub.enable();
            return sub;
        });
    }
    
    disable() {
        this._subs.forEach(s => s.disable());
        this._subs = [];
    }
    
    _loadSettings(schemaId) {
        const schemaDir = this.dir.get_child('schemas').get_path();
        const source = Gio.SettingsSchemaSource.new_from_directory(
            schemaDir, Gio.SettingsSchemaSource.get_default(), false);
        const schema = source.lookup(schemaId, true);
        if (schema) return new Gio.Settings({settings_schema: schema});
        // fallback
        return this.getSettings(schemaId);
    }
}
```

### 2.3 Subsystem interface

```js
// subsystems/taskbar/main.js
export class TaskbarSubsystem {
    constructor({extension, settings, path, dir}) {
        this._ext = extension;
        this._settings = settings.taskbar;
        this._modPath = path;           // = extension.path
        this._baseDir = dir;            // = extension.dir
    }
    
    enable() {
        // Initialize taskbar code (từ dash-to-panel extension.js)
        // Sử dụng this._settings thay vì this.getSettings()
        // Sử dụng this._modPath thay vì this.path
        // Sử dụng this._baseDir thay vì this.dir
    }
    
    disable() {
        // Cleanup
    }
}
```

### 2.4 Path migration mapping

Mỗi module cũ dùng `this.path` chỉ đến thư mục module của nó.
Trong module mới, code sẽ ở `subsystems/X/`, cần:

| Code reference | Module cũ trỏ tới | Module mới trỏ tới |
|---------------|-------------------|-------------------|
| `this.path` | `modules/alienware-dash-to-panel@hsx2coder/` | `modules/alienware-panel@hsx2coder/` |
| `this.path + '/schemas'` | `...dash-to-panel/schemas` | `...panel/schemas` (cùng 1 dir) |
| `this.path + '/media'` | `...dash-to-panel/media/` | `...panel/subsystems/taskbar/media/` |
| `this.path + '/img/...'` | `...dash-to-panel/img/...` | `...panel/subsystems/taskbar/img/...` |
| `this.dir.get_child('interfaces-xml')` | `...appindicatorsupport/interfaces-xml/` | `...panel/subsystems/appindicator/interfaces-xml/` |

### 2.5 GSettings schema gộp

Mỗi module cũ có schema riêng với ID riêng (đã revert về gốc). Khi gộp vào panel module:
- **Giữ nguyên schema ID** — không đổi path dconf → user settings không mất
- **Gộp file XML vào 1 schemas/ dir** của panel module
- **Compile chung** thành 1 `gschemas.compiled`
- **Topbar-clone** schema keys hiện nằm trong suite schema → chuyển vào schema riêng của panel module

**Quan trọng:** `topbar-clone` hiện dùng suite schema `org.gnome.shell.extensions.alienware-suite` với keys `enable-topbar-clone`, `always-show-secondary-monitor`. Khi gộp, cần chuyển 2 keys này vào schema mới (vd `org.gnome.shell.extensions.panel-clone`). Dconf data sẽ mất trừ khi migration.

### 2.6 CSS và Icons

Gộp:
- `dash-to-panel/stylesheet.css` → `panel/stylesheet.css`
- `appindicatorsupport/icons/` → `panel/icons/`
- `dash-to-panel/img/` → `panel/subsystems/taskbar/img/`

---

## III. GIỮ NGUYÊN 4 MODULE

### 3.1 alienware-advanced-alt-tab@hsx2coder
- 14 files, 3,970 LOC
- Schema: `org.gnome.shell.extensions.advanced-alt-tab-window-switcher`
- Extension class: `AATWS extends Extension`
- Gọi `this.getSettings()` → tự nhiên hoạt động với metadata settings-schema
- **Giữ nguyên** — không thay đổi gì

### 3.2 alienware-just-perfection-desktop@hsx2coder
- 7 files + lib/ (API.js 99K, Manager.js 50K, ScreenshotBox.js 13K)
- 134 LOC extension.js
- Schema: `org.gnome.shell.extensions.just-perfection`
- Extension class: `JustPerfection extends Extension`
- **Giữ nguyên** — khối code quá lớn và phức tạp, không liên quan module khác

### 3.3 alienware-desktop-enable-gnome@hsx2coder (DING)
- 30 files, 2,149 LOC
- Spawns `ding.js` subprocess
- **Giữ nguyên** — cần kiểm tra DIND hoạt động sau restructure (hiện tại đang gọi `this.path` để tìm ding.js)

### 3.4 alienware-notification-configurator@hsx2coder
- 21 files, 1,662 LOC
- Schema: `org.gnome.shell.extensions.notification-configurator`
- Extension class: `NotificationConfiguratorExtension extends Extension`
- **Giữ nguyên**

---

## IV. XOÁ 2 MODULE LEGACY

### 4.1 alienware-capsnum-indicator@hsx2coder
- 2 files, 724 LOC
- Schema: `org.gnome.shell.extensions.capsnum-indicator`
- Đã có `capsnum-touchpad` gộp cả Caps/Num + Touchpad
- **Xoá**: rm -rf module, xoá khỏi modules.js/extension.js/prefs.js

### 4.2 alienware-touchpad@hsx2coder
- 5 files, 956 LOC
- Schema: `org.gnome.shell.extensions.touchpad-switcher`
- Đã có `capsnum-touchpad` gộp cả
- **Xoá**: rm -rf module, xoá khỏi modules.js/extension.js/prefs.js

---

## V. SUITE SCHEMA THAY ĐỔI

### Hiện tại: 11 enable-keys
```
enable-dash-to-panel
enable-system-monitor
enable-clipboard-indicator
enable-appindicator
enable-advanced-alt-tab
enable-command-menu
enable-desktop-icons
enable-topbar-clone     ← cũng có topbar-clone keys riêng
enable-just-perfection
enable-notification-configurator
enable-capsnum-touchpad

(trong cùng schema: always-show-secondary-monitor, extra-topbar-clone-key)
```

### Sau: 5 enable-keys
```
enable-panel             ← gộp 7 module cũ
enable-window-switcher   ← advanced-alt-tab
enable-desktop-icons     ← desktop-enable-gnome
enable-just-perfection
enable-notification-configurator

+ chuyển topbar-clone keys sang schema của panel module
```

---

## VI. VẤN ĐỀ KỸ THUẬT CẦN GIẢI QUYẾT

### 6.1 Hardcode path trong dash-to-panel
- `extension.js` d66: `this.path + '/schemas'` → `this.path + '/schemas'` (giống nhau, OK)
- `extension.js` d83: `EXTENSION_PATH = this.path` → cần đổi thành path đến subsystems/taskbar/
- `extension.js` d110: `${this.path}/img/...` → cần đổi path
- `extension.js` d207: `this.path + '/media/schemas'` → cần đổi path
- `extension.js` d229: `this.path + '/media'` → cần đổi path
- Nhiều file internal import relative (vd `./panelManager.js`) → vẫn OK nếu giữ cấu trúc thư mục con

### 6.2 appindicator: extension.dir.get_child('interfaces-xml')
- Code gọi `extension.dir.get_child('interfaces-xml')` → path đúng
- Sau khi gộp: `extension.dir` trỏ đến `alienware-panel/` → không có `interfaces-xml/` ở đó
- **Fix:** pass dir riêng: `interfacesDir = subsysDir.get_child('appindicator')`

### 6.3 clipboard-indicator: getSettings + uuid
- `this.uuid` để debug log
- `this.getSettings()` → OK nếu pass settings riêng

### 6.4 command-menu: error log uuid
- `this.uuid` trong error handler
- OK nếu pass uuid context

### 6.5 topbar-clone: parent.parent dir trick
- D69-718: `this.dir.get_parent().get_parent()` để tìm suite schemas
- Sau merge: schema trong cùng `alienware-panel/schemas/`
- **Fix:** dùng settings loaded từ PanelExtension._loadSettings()

### 6.6 system-monitor: this.path trong debug log
- Chỉ dùng `this.path` trong debug log
- OK, chỉ cosmetic

### 6.7 Capsnum-touchpad: extra Gio.Settings
- `new Gio.Settings({ schema_id: 'org.gnome.desktop.peripherals.touchpad' })`
- Đây là system schema → không liên quan module, OK

### 6.8 Suite schema topbar-clone keys
- `enable-topbar-clone`, `always-show-secondary-monitor` hiện trong suite schema
- Khi merge, `enable-*` không còn cần (panel module tự control)
- `always-show-secondary-monitor` → cần chuyển vào schema module mới

---

## VII. QUY TRÌNH THỰC HIỆN

### Phase 0: Chuẩn bị (15-30 phút)
- [x] Survey codebase (đã xong)
- [x] CHECKPOINT.md (đã tạo)
- [ ] Git commit trạng thái hiện tại (`git add -A && git commit -m "checkpoint before restructure"`)
- [ ] Xác nhận số dòng code từng module
- [ ] Check xem module nào đang chạy ổn sau fix AppIndicator

### Phase 1: Xoá module legacy (15 phút)
- [ ] Xoá `alienware-capsnum-indicator@hsx2coder` (rm -rf)
- [ ] Xoá `alienware-touchpad@hsx2coder` (rm -rf)
- [ ] Xoá khỏi modules.js (2 entries)
- [ ] Xoá khỏi extension.js (import + CLASS_REGISTRY)
- [ ] Xoá khỏi prefs.js (import + PREFS_REGISTRY)
- [ ] Suite schema: xoá enable-keys tương ứng
- [ ] Compile suite schema
- [ ] Verify không còn reference đến 2 module

### Phase 2: Tạo alienware-panel@hsx2coder (KHÓ NHẤT — 4-6 giờ)
Step-by-step từ module nhỏ → lớn:

#### Step 2a: Xử lý topbar-clone (1h)
- [ ] Tạo thư mục panel, metadata.json, schemas/
- [ ] Copy code từ topbar-clone vào subsystems/topbar-clone/
- [ ] Tạo schema file mới: `org.gnome.shell.extensions.panel-clone.gschema.xml`
- [ ] Chép 2 keys từ suite schema (`enable-topbar-clone` → rename, `always-show-secondary-monitor`) vào schema panel-clone
- [ ] Tạo extension.js PanelExtension enable() chỉ chạy topbar-clone subsystem
- [ ] Sửa code topbar-clone để dùng settings từ PanelExtension thay vì parent.parent trick
- [ ] Compile schema, test GSETTINGS_SCHEMA_DIR
- [ ] **Kiểm tra:** suite có thể load panel module, topbar-clone chạy được
- [ ] Wire panel module vào suite, xoá topbar-clone khỏi modules.js

#### Step 2b: Thêm capsnum-touchpad (30 phút)
- [ ] Copy code vào subsystems/capsnum-touchpad/
- [ ] Import + enable trong extension.js PanelExtension
- [ ] Pass settings riêng cho capsnum-touchpad
- [ ] Test: indicator + touchpad toggle vẫn chạy

#### Step 2c: Thêm command-menu (30 phút)
- [ ] Copy code vào subsystems/command-menu/
- [ ] Import + enable
- [ ] Pass settings + uuid context
- [ ] Test: menu hiện trên panel

#### Step 2d: Thêm clipboard-indicator (1h)
- [ ] Copy code vào subsystems/clipboard/
- [ ] Import + enable
- [ ] Pass settings + uuid
- [ ] Test: clipboard history panel

#### Step 2e: Thêm appindicator (1h)
- [ ] Copy code vào subsystems/appindicator/
- [ ] Quan trọng: chuyển `interfaces-xml/` vào subsystems/appindicator/
- [ ] Sửa `extension.dir.get_child('interfaces-xml')` → dùng dir context của subsystem
- [ ] Import + enable
- [ ] Test: tray icon xuất hiện (9Router, Telegram, ...)

#### Step 2f: Thêm system-monitor (1h)
- [ ] Copy code vào subsystems/system-monitor/
- [ ] Import + enable
- [ ] Pass settings + path cho debug log
- [ ] Test: CPU/RAM widgets trên panel

#### Step 2g: Thêm dash-to-panel (KHÓ — 2-4h)
- [ ] Copy toàn bộ code vào subsystems/taskbar/
- [ ] Sửa extension.js của dash-to-panel (từ subsystem) để nhận context:
  - Thay `this.path` → `context.path + '/subsystems/taskbar'`
  - Thay `this.getSettings()` → `context.settings.taskbar`
  - Thay `this.dir` → `context.dir.get_child('subsystems/taskbar')`
  - Sửa `this.path + '/media'` → `context.path + '/subsystems/taskbar/media'`
  - Sửa `this.path + '/img/'` → `context.path + '/subsystems/taskbar/img/'`
  - Sửa global `SETTINGS`, `DTP_EXTENSION`, `EXTENSION_PATH` → gắn vào subsystem instance
- [ ] Copy media controller, icons, images
- [ ] Import + enable
- [ ] Test: panel hiển thị, app icons, media controller, preview...

#### Step 2h: Tổng kiểm tra (1h)
- [ ] Restart shell
- [ ] Test từng tính năng Panel module
- [ ] Verify suite wiring
- [ ] Verify dconf data còn nguyên

### Phase 3: Cập nhật suite (30 phút)
- [ ] Suite module.js: panel entry thay cho 7 entries cũ
- [ ] Suite extension.js: import + CLASS_REGISTRY — 5 modules
- [ ] Suite prefs.js: import + PREFS_REGISTRY — 5 modules  
- [ ] Suite schema: 5 enable-keys, xoá topbar-clone keys
- [ ] Compile suite schema
- [ ] Wire panel module: key='panel', enableKey='enable-panel', uuid='alienware-panel@hsx2coder'

### Phase 4: Kiểm tra tổng thể (1h)
- [ ] Verify: gnome-extensions list ra 5 modules mới
- [ ] Suite enable-panel=true → panel module chạy
- [ ] Test từng tính năng: dashboard, widgets, tray, clipboard...
- [ ] Kiểm tra log: `journalctl --user -u gnome-shell | grep -i error`
- [ ] UPDATE CHECKPOINT.md

---

## VIII. TỔNG THỜI GIAN

| Phase | Thời gian ước tính | Thực tế |
|-------|-------------------|---------|
| Phase 0: Chuẩn bị | 15-30 phút | |
| Phase 1: Xoá legacy | 15 phút | |
| Phase 2a-g: Panel module | 6-10 giờ | |
| Phase 3: Suite cập nhật | 30 phút | |
| Phase 4: Kiểm tra | 1 giờ | |
| **Tổng** | **8-12 giờ** | |

### Rủi ro TIME:
- Dash-to-panel có nhiều hardcode path nhất → dễ miss, dễ regression
- Appindicator có DBus watcher → nếu sai path, tray icons không hiện
- Topbar-clone parent.parent trick → cần fix đúng

---

## IX. ROLLBACK PLAN

Nếu bất kỳ phase nào fail:
```
git checkout -- .
```
Sau đó:
```
cd modules && mkdir -p temp && mv alienware-panel@hsx2coder temp/  # hoặc rm -rf
```
Khôi phục modules.js, extension.js, prefs.js từ git.

---

## X. VERIFICATION CHECKLIST (post-merge)

- [ ] `gsettings list-schemas` → 7 panel schemas đều hiện
- [ ] `dconf dump /org/gnome/shell/extensions/` → data user không mất
- [ ] GNOME Shell load không lỗi
- [ ] Panel taskbar hiển thị đúng
- [ ] App launcher, window preview hoạt động
- [ ] System monitor widgets đúng thông số
- [ ] Clipboard history panel menu hoạt động
- [ ] AppIndicator tray icons hiện (test: Telegram, 9Router)
- [ ] Command menu custom entries hoạt động
- [ ] Caps/Num lock indicator trên panel
- [ ] Touchpad toggle on/off
- [ ] Topbar clone trên multi-monitor
- [ ] Alt+Tab switcher (AATWS) vẫn chạy
- [ ] Just Perfection settings vẫn apply
- [ ] Desktop icons (DING) hiển thị
- [ ] Notification configurator vẫn filter notification
- [ ] Suite enable-panel = false → tắt hết panel module
