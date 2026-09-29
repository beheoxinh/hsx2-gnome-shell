# AGENT.md — Alienware Suite GNOME Shell Extension

> Hướng dẫn cho AI Agent về cấu trúc, quy tắc và cách đọc tài liệu của dự án này.
> Mọi file trong `docs/` là tài liệu nghiệp vụ chi tiết của từng module.

---

## 1. Tổng quan kiến trúc

Suite (container) load/unload các **module theo chức năng**. Mỗi module = một
chức năng, một schema, một trang prefs, một `enable-*` key.

```
alienware-hsx2coder-gnome@hsx2coder.github.com/
├── extension.js          ← AlienwareSuiteExtension: stylesheets, migrations, load/unload
├── prefs.js              ← AlienwareSuitePreferences: mở prefs theo module
├── modules.js            ← MODULES[] (thứ tự có ý nghĩa) + buildSubMetadata()
├── migrations.js         ← chuyển dconf một lần sang schema mới
├── lib/
│   └── workspacesBoxLayout.js  ← patch _computeWorkspacesBoxForState dùng chung
├── migrations/schemas/   ← schema "đông lạnh" chỉ để migrations.js đọc
├── schemas/              ← suite schema: 9 enable-* + migration flag
├── stylesheet.css        ← aggregated, tự động nạp
├── tools/                ← 8 static checks, xem mục 7
└── modules/              ← 9 module
```

### 1.1 Module và domain

| Module (uuid) | Chức năng | Schema id chính |
|---|---|---|
| `alienware-dash-to-panel@hsx2coder` | panel surgery core (clone panel, 3 box, statusArea) | `…extensions.dash-to-panel` |
| `alienware-topbar@hsx2coder` | **top bar & panel**: layout, clock, quick settings, panel items, multi-monitor clone, clipboard + command menu widgets | `…extensions.alienware-topbar` |
| `alienware-system-monitor@hsx2coder` *(thư mục: `alienware-monitor`)* | đồ thị hệ thống trong panel | `…extensions.system-monitor-next-applet` |
| `alienware-indicators@hsx2coder` | tray icons, capsnum, touchpad | `…extensions.indicators-appindicator`, `…capsnum-touchpad` |
| `alienware-gnome-customizer-manager@hsx2coder` | theme, workspace, overview, OSD, window preview | `…extensions.gnome-customizer-manager` |
| `alienware-advanced-media-controller@hsx2coder` | MPRIS now-playing | `…extensions.advanced-media-controller` |
| `alienware-advanced-alt-tab@hsx2coder` | window switcher | `…extensions.advanced-alt-tab-window-switcher` |
| `alienware-notification-configurator@hsx2coder` | MessageTray + notification daemon | `…extensions.notification-configurator` |
| `alienware-desktop-enable-gnome@hsx2coder` | desktop icon grid | `…extensions.ding` |

### 1.2 Bốn luật bất di bất dịch

1. **Chỉ `alienware-topbar` được ghi vào panel.** `Main.panel`, `_leftBox`,
   `_centerBox`, `_rightBox`, `statusArea`, `panelBox`. Module khác dùng
   `PanelHost` (`modules/alienware-topbar@hsx2coder/subsystems/panel/host.js`).
   Đọc thì được phép (ví dụ `Main.panel.statusArea.dateMenu._messageList`).
   `tools/check-wiring.py` chặn viết.
2. **Không tên GSettings key nào nằm ở 2 schema id** trừ khi được khai trong
   `tools/schema-collision-allow.txt` (chỉ in-house vs upstream port).
3. **Không ai gọi `lookupByUUID` trong suite.** Chạm panel qua `PanelHost`,
   chạm tweak API qua import trực tiếp.
4. **Mỗi module tự sở hữu file CSS của nó** (`stylesheet.css`); suite tự dò và
   nạp, không có cờ `hasStylesheet` nữa.

### 1.3 Thứ tự enable trong `modules.js`

```
dashToPanel → topbar → advancedMediaController → systemMonitor → indicators
→ gnomeCustomizerManager → notificationConfigurator → advancedAltTab → desktopIcons
```

- `dashToPanel` trước `topbar`: dash thay thế 3 box của panel, topbar phải nắm
  cấu trúc sau khi thay.
- `topbar` trước mọi consumer: mọi thứ lấy `PanelHost` từ đây.

### 1.4 API theo domain

`lib/API.js` cũ (Just Perfection reimplementation, 149 method) đã **tách theo
domain**, thân hành động giữ nguyên từng dòng:

| Class | Nơi ở | Chủ sở hữu |
|---|---|---|
| `PanelApi` | `alienware-topbar/subsystems/panel/api.js` | top bar & panel |
| `DashApi` | `alienware-dash-to-panel/lib/api.js` | dash |
| `AltTabApi` | `alienware-advanced-alt-tab/lib/api.js` | alt-tab |
| `API` | `alienware-gnome-customizer-manager/lib/API.js` | theme/workspace/overview/OSD |

Mỗi class có `open()`/`close()` riêng để hoàn tác đúng patch của nó.

### 1.5 Patch dùng chung

`_computeWorkspacesBoxForState` bị hai domain sửa (search entry của topbar,
app-grid height của customizer). `lib/workspacesBoxLayout.js` sở hữu patch,
refcount theo record, nên module nào tắt trước cũng không rò wrapper của
module kia. **Không được tự patch lại hàm này ở nơi khác.**

---

## 2. Vòng đời module

```
suite.enable()
  ├─ _loadStylesheets()          nạp mọi stylesheet.css tìm thấy
  ├─ getSettings(SUITE_SCHEMA)
  ├─ runMigrations()             1 lần, trước khi module đọc schema
  └─ for def of MODULES: if suite[def.enableKey] → _enableModule(def)
        new CLASS(buildSubMetadata(this, def)) → .enable()
```

`buildSubMetadata()` chỉ gắn `dir`/`path`/`uuid` của thư mục module vào
metadata gốc. `settings-schema` lấy từ `metadata.json` của chính module đó, và
`Extension.getSettings(id)` tự tìm `<dir>/schemas`.

---

## 3. Viết module mới

1. `modules/alienware-<tên>@hsx2coder/` với `metadata.json`, `extension.js`,
   `prefs.js` (`prefsEntry` có thể bỏ nếu không có UI).
2. Thêm schema vào `modules/alienware-<tên>@hsx2coder/schemas/`, rồi
   `glib-compile-schemas --strict` (CI kiểm tra `gschemas.compiled` có mới hơn
   xml không).
3. Thêm `enable-<tên>` vào `schemas/…alienware-suite.gschema.xml`.
4. Thêm entry vào `MODULES` trong `modules.js` — đúng thứ tự mục 1.3.
5. Import + `CLASS_REGISTRY` ở `extension.js`, import + `PREFS_REGISTRY` ở
   `prefs.js`.
6. Nếu cần đọc/ghi panel: `import {PanelHost} from
   '../alienware-topbar@hsx2coder/subsystems/panel/host.js'` (số `../` tuỳ
   độ sâu, `./tools/check-wiring.py` bắt lỗi import không resolve).
7. `./tools/check-all.sh` phải xanh.

---

## 4. Di chuyển key giữa các schema

GNOME 45 bỏ cơ chế migration per-extension, nên:

1. Thêm `[fromId, fromKey, toId, toKey, asEnum?]` vào `KEY_MOVES` trong
   `migrations.js`.
2. Nếu schema cũ **không còn được ship**, copy nó (chỉ phần key liên quan) vào
   `migrations/schemas/` và `glib-compile-schemas --strict` thư mục đó —
   không có schema cũ thì migration sẽ âm thầm bỏ qua key.
3. Nếu giá trị cũ là `int` còn giá trị mới là `enum`: thêm `asEnum = true` và
   liệt kê nick trong `ENUM_NICKS`.
4. `gjs -m tools/migration-dry-run.js` để chứng minh map không gãy.
5. Xoá key cũ khỏi schema cũ. `check-dead-keys.sh` sẽ báo nếu còn key không
   ai đọc.

---

## 5. Quy ước code

- Không comment giải thích *cái gì*, chỉ giải thích *vì sao*.
- Comment phải ghi lại lý do tồn tại khi một cách làm trông thừa (ví dụ
  `#corner()` giải thích vì sao không dùng `panelButtonHpadding*` như bản
  cũ).
- Method `#private` của JS dùng khi thật sự cần; nếu một helper phải nằm ở
  hai class thì đó là dấu hiệu nên lên `lib/`.
- Không thêm abstraction cho một implementation. Không thêm config cho giá trị
  không đổi.

---

## 6. Tài liệu

| File | Nội dung |
|---|---|
| `docs/topbar.md` | top bar & panel: layout, clock, quick settings, clone |
| `docs/ARCHITECTURE.md` | luồng enable/disable, ownership của panel |
| `docs/<module>.md` | nghiệp vụ chi tiết từng module |
| `CHECKPOINT.md` | trạng thái công việc hiện tại |
| `WORKLIST.md` | kế hoạch consolidation đã thực hiện + phát hiện |

---

## 7. Kiểm tra

```bash
./tools/check-all.sh
```

| Check | Bắt được gì |
|---|---|
| `check-syntax.sh` | JS không parse **dưới ngữ pháp ES module** (copy sang `.mjs` rồi `node --check`; `node --check foo.js` parse như script và bỏ sót lỗi) |
| `check-schema-collisions.sh` | key trùng tên giữa 2 schema id |
| `check-dead-keys.sh` | key khai báo mà không ai đọc; schema stale |
| `check-key-usage.py` | code đọc key mà không schema nào khai báo |
| `check-prefs-keys.py` | prefs bind key của **schema khác** (ràng hơn `check-key-usage`) |
| `check-unused-imports.py` | import còn lại sau khi di chuyển code |
| `check-imports.py` | named import không tồn tại ở module đích — **link-time error**, module fail lúc load |
| `check-shell-api.py` | `St`/`Clutter`/`Meta`/`Shell` class + method không tồn tại trong typelib đang cài (decompile `St-18.typelib` rồi so) |
| `check-wiring.py` | registry lệch, import gãy, viết panel ngoài PanelHost |
| `check-schemas.js` | mọi schema load và round-trip được |
| `migration-dry-run.js` | map migration không gãy |

Cả hai lỗi trên đều **không** bị syntax check thấy và đều làm module không
load được — `prefs.js` import một tên đã bị xoá, và `new St.CssProvider()` trong
khi St typelib của GNOME 50 không có class đó (GNOME sẽ disable cả extension).

Các allowlist có chủ đích, sửa khi thêm ngoại lệ mới:
`tools/schema-collision-allow.txt`, `tools/dead-keys-allow.txt`,
`tools/key-usage-allow.txt`.

`tools/check-lifecycle.py` và `tools/split-api.py` là công cụ báo cáo / lịch sử,
không nằm trong `check-all.sh`.
