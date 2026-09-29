# WORKLIST — Gộp module theo chức năng, dẹp conflict cấu hình

> Ngày: 2026-09-29 · Trạng thái: đã audit xong toàn bộ 10 module, chưa sửa code (trừ 1 fix dconf khẩn)
> Nguồn audit: `/tmp/opencode/audit/{A-suite-core,B-topbar-modules,C-gcm-monitor,D-other-modules}.md`

---

## 0. Kết luận audit (đọc phần này trước khi code)

### 0.1 Phát hiện chí mạng

| # | Phát hiện | Bằng chứng | Ảnh hưởng |
|---|---|---|---|
| F1 | **`topbar-panel-controls` chết hoàn toàn.** Nó làm `Extension.lookupByUUID('alienware-gnome-customizer-manager@hsx2coder')` nhưng GCM nằm *trong cùng suite*, chỉ có suite root được `gnome-extensions enable`. Lookup luôn trả về object rỗng → cả **26 tính năng** không bao giờ chạy. | `modules/alienware-topbar-panel-controls@hsx2coder/extension.js:85`; `extension.js:14,20` (root) | Không phải "gộp cho gọn" — phải **viết lại 26 tính năng từ đầu** bên trong module topbar mới |
| F2 | **119 tên key trùng giữa các schema id** (không cùng schema id nên GSettings không cảnh báo, chỉ dconf loãng). **46 key đang bị ≥2 module đọc/ghi.** Ví dụ `app-button`, `type-to-search`, `weather`, `world-clock`, `top-panel-position` vừa là của GCM vừa là của topbar-panel-controls — **hai ý nghĩa khác nhau, cùng tên**. | `/tmp/opencode/audit/A-suite-core.md` §A5.1/A5.4 | Đúng loại "config conflict" user than phiền. Không tự thấy được vì không ai validate |
| F3 | **5 chỗ gọi `lookupByUUID` vào GCM**: TPC:85, workspace-control:55, advanced-alt-tab:338, dash-to-panel:294, notification-configurator:41 | `C-gcm-monitor.md` §C8 | Đây là ẩn số của conflict: GCM vừa là host vừa là thư viện. Xoá GCM = vỡ 5 chỗ |
| F4 | `Main.panel`, `_leftBox`, `_centerBox`, `_rightBox`, `statusArea` bị **3 chủ sở hữu cùng lúc**: GCM (`lib/API.js:1378-1472`), dash-to-panel (`panel.js:119-230`), indicators (`extension.js:337` + `addToStatusArea` bị dash-to-panel reroute âm thầm) | `D-other-modules.md` §D7 | Không module nào được độc quyền panel → race khi enable/disable |
| F5 | **39 tính năng thuộc domain topbar nhưng đang nằm ở GCM (30) và Monitor (8)**, kể cả clock show/hide, panel position, panel size, icon size, quick settings, activities, search, show-apps | `C-gcm-monitor.md` §C7 (R1–R39) | Đây chính là phần user muốn dọn về topbar |
| F6 | `move-clock` (Monitor, key 360) và clock-position (GCM, R12) **cùng reparent `statusArea.dateMenu` lần 2** | R12 vs R31 | Double-reparent, trực tiếp gây clone topbar lỗi (B4/C5) |
| F7 | **Bug topbar clone đã báo**: `enable-topbar-clone=false` nằm cứng trong dconf, **không có UI toggle nào bind key đó** | `subsystems/topbar-clone/main.js:34`; grep toàn repo chỉ 2 hit | Đã set tạm `dconf write ... true`. Fix lâu dài ở Phase 2 |
| F8 | Dead code: `hasStylesheet` (10 chỗ khai báo, 0 chỗ đọc), `sessionMode` trong modules.js, `moduleEntryURL()` không ai gọi, `bt-panel-width` orphan, `topbar-clone-show-tray` orphan (có trong suite schema, không có trong schema dùng thật, code không đọc), `battery-hidesystem` (đã chết), key của notification-configurator đọc ở `extension.js:46,62` không tồn tại trong schema của nó | `A-suite-core.md` §A8 | Dọn ở Phase 1 |
| F9 | `top-panel-position` bind kiểu `int` vào property `active` kiểu `gboolean` của `AdwSwitchRow` → warning mỗi lần mở prefs | journal | Fix ở Phase 1 |
| F10 | `dash-to-panel` chứa **12216 LOC `media/` — một sản phẩm thứ hai** (advanced-media-controller) nằm nhầm module | `D-other-modules.md` §D1/§D7 | Tách ra module riêng |

### 0.2 Kiến trúc mục tiêu — 8 module, mỗi module một chức năng

Quy tắc bất di bất dịch sau khi gộp:
1. **Chỉ `alienware-topbar@hsx2coder` được ghi vào `Main.panel`, `_leftBox`, `_centerBox`, `_rightBox`, `statusArea`, `panelBox`.** Không ai khác được chạm panel trực tiếp.
2. **Không tên GSettings key nào được xuất hiện ở >1 schema id.** Có lint script chặn.
3. **Không ai gọi `lookupByUUID` cho module nằm trong suite.** Thay bằng singleton `PanelHost` export từ topbar.
4. Mỗi schema id có đúng một file xml, được compile, và có 1 entry duy nhất trong `MODULES`.

| # | Module UUID | Chức năng sau gộp | Nguồn gộp |
|---|---|---|---|
| 1 | `alienware-topbar@hsx2coder` **(MỚI)** | Toàn bộ panel: geometry, visibility, position, 3 box, clock/calendar, quick settings, activities, search, show-apps, ẩn/hiện indicator, panel icon size, topbar clone, widget inject (clipboard, command menu) | topbar-widgets + topbar-panel-controls + R1–R30 (GCM) + R31–R38 (Monitor) |
| 2 | `alienware-gnome-customizer-manager@hsx2coder` | Theme/accent/dark-mode/night-light/font/cursor/controls-manager/next-applet workspace layout — **không còn chạm panel** | GCM (cắt panel) + workspace-control + notification-configurator |
| 3 | `alienware-monitor@hsx2coder` | Đồ thị hệ thống, tooltip, graph — **mất hết key panel** | Monitor (cắt R31–R38) |
| 4 | `alienware-dash-to-panel@hsx2coder` | Panel surgery core (clone panel, 3 box, statusArea) | giữ nguyên |
| 5 | `alienware-advanced-media-controller@hsx2coder` **(TÁCH MỚI)** | Media controller | `dash-to-panel/media/` 12216 LOC |
| 6 | `alienware-indicators@hsx2coder` | Tray icon, capsnum, touchpad | giữ, đổi sang gọi `PanelHost` |
| 7 | `alienware-advanced-alt-tab@hsx2coder` | Switcher UI | giữ, repoint lookup |
| 8 | `alienware-desktop-enable-gnome@hsx2coder` | Desktop icon grid | giữ nguyên |

### 0.3 Schema sau gộp

| Schema id mới | Keys migrate từ | Số key |
|---|---|---|
| `org.gnome.shell.extensions.alienware-topbar` | `…panel-clone` + `…topbar-panel-controls` + GCM 9 key (R1–R9) + Monitor 8 key (R31–R38) | ~43 |
| `org.gnome.shell.extensions.alienware-widgets` | `…clipboard-indicator` + `…commandmenu2` | ~48 |
| `org.gnome.shell.extensions.alienware-monitor` | `…monitor` (chỉ phần đồ thị) | ~40 |
| `org.gnome.shell.extensions.alienware-customizer` | `…gnome-customizer-manager` (chỉ phần theme) + `…workspace-control` + `…notification-configurator` | ~50 |

Mỗi key đổi tên sẽ lấy lại **cùng tên** trong schema mới (giữ `topbar-clone-show-clock` v.v.), chỉ đổi schema id → giảm rủi ro migration.

### 0.4 Cơ chế migration (GNOME 45+ không có gsettings migration cho extension)

`extensions/alienware-hsx2coder…/migrations.js`:
- Đọc `migration-done-<step>` trong suite schema, chạy 1 lần/step, idempotent
- Copy giá trị qua `Gio.Settings` (đọc schema cũ, ghi schema mới), chỉ copy key có giá trị khác default
- Bọc try/catch từng key, log key fail, không chặn enable
- Có script dry-run: `GSETTINGS_BACKEND=memory ./migrations.js --dry-run`

---

## Phase 0 — Đóng băng baseline (20 phút)

- [ ] 0.1 `git add -A && git commit -m "checkpoint before topbar consolidation"` — có 2 file `.bak-20260614-190345` và `CHECKPOINT.md` stale, dọn hoặc move vào `.bak/` trước
- [ ] 0.2 Backup dconf: `dconf dump /org/gnome/shell/extensions/ > /tmp/aw-dconf-before.txt`
- [ ] 0.3 `glib-compile-schemas --strict schemas/` + từng `modules/*/schemas/` → xác nhận 0 lỗi, commit `gschemas.compiled`
- [ ] 0.4 Ghi lại journal baseline: `journalctl -b -o cat | grep -aE "alienware|topbar|TPC|GCM" > /tmp/aw-journal-before.txt`
- [ ] 0.5 Chụp ảnh 2 màn hình (primary + secondary) làm mốc so sánh
- [ ] 0.6 Ghi lại `gsettings list-recursively` của cả 6 schema id sắp migrate

**Verify:** shell reload sạch, journal không có JS error.

---

## Phase 1 — Dọn dead code + dựng lint (1.5 giờ)

Không đụng chức năng. Làm trước để mỗi phase sau có baseline sạch.

- [ ] 1.1 Xoá `hasStylesheet` khỏi 10 chỗ trong `modules.js:17,28,39,50,61,72,83,94,105,116`; thay bằng đọc `stylesheet.css` tự động nếu file tồn tại
- [ ] 1.2 Xoá `sessionMode` khỏi entries có nó (`modules.js:28,50,71,82,93,104`); bỏ `sessionMode` khỏi metadata vì `metadata.json` root không khai báo `session-modes`
- [ ] 1.3 Xoá hàm `moduleEntryURL()` (`modules.js`, không ai gọi)
- [ ] 1.4 Fix `top-panel-position`: đổi kiểu schema `i` → `b`, hoặc đổi widget sang `AdwComboRow`. Sau Phase 4 key này bị xoá hẳn → nếu làm luôn ở Phase 3 cho nhanh
- [ ] 1.5 Xoá orphan key `bt-panel-width` (suite schema), `topbar-clone-show-tray` (suite schema)
- [ ] 1.6 Xoá dead key trong notification-configurator mà `extension.js:46,62` đọc
- [ ] 1.7 Tạo `tools/check-schema-collisions.sh`:
  ```bash
  # fail nếu 1 tên key xuất hiện ở >1 schema id
  grep -ho 'key name="[^"]*"' $(find . -name '*.gschema.xml') | sort | uniq -d
  ```
  Exit 1 nếu có output. Chạy trong CI hoặc `prefs.js` debug.
- [ ] 1.8 Tạo `tools/check-dead-keys.sh`: liệt kê key trong xml mà grep toàn repo không thấy lần đọc nào
- [ ] 1.9 Thêm 2 script trên vào `AGENT.md` mục "verify"

**Verify:** `./tools/check-schema-collisions.sh` in ra 119 dòng hiện tại → sau Phase 4 phải về 0. Ghi lại con số baseline.

---

## Phase 2 — Dựng khung `alienware-topbar@hsx2coder` (2 giờ)

Tạo module mới, **chưa gộp gì**. Mục tiêu: load được, enable/disable sạch.

- [ ] 2.1 `modules/alienware-topbar@hsx2coder/metadata.json` — uuid mới, `settings-schema: org.gnome.shell.extensions.alienware-topbar`, `shell-version ["46","47","48","49","50","51","52","53","54"]` (bỏ 45, shell 45 đã EOL và root metadata cũngngừng ở 46)
- [ ] 2.2 `schemas/org.gnome.shell.extensions.alienware-topbar.gschema.xml` — 43 key, gồm 3 block: `panel-*`, `clock-*`, `indicator-*`
- [ ] 2.3 `subsystems/` layout:
  ```
  subsystems/
    panel/extension.js      ← quyền sở hữu Main.panel + 3 box + statusArea
    panel/host.js           ← singleton PanelHost (export API cho module khác)
    clock/extension.js
    quick-settings/extension.js
    activities/extension.js
    search/extension.js
    indicators/extension.js  ← ẩn/hiện kbd/a11y/power/notif/screen-share/record
    topbar-clone/main.js     ← chuyển từ module cũ
    widgets/clipboard/       ← chuyển từ module cũ
    widgets/command-menu/    ← chuyển từ module cũ
  ```
- [ ] 2.4 `extension.js` — giữ đúng pattern `baseMeta` của module cũ (`topbar-widgets/extension.js:11-25`): mỗi subsystem cần `settings-schema` riêng qua `getSettings()`
- [ ] 2.5 `prefs.js` — 1 trang, dùng `Adw.PreferencesPage` + `Adw.PreferencesGroup`, 1 group cho mỗi subsystem domain
- [ ] 2.6 Thêm entry vào `modules.js` (giữ vị trí cũ của `topbarPanelControls`, key `topbar`, enableKey `enable-topbar`)
- [ ] 2.7 Thêm import + `CLASS_REGISTRY` ở root `extension.js`
- [ ] 2.8 Thêm import + `PREFS_REGISTRY` ở root `prefs.js`
- [ ] 2.9 Thêm `enable-topbar` vào suite schema, tạm giữ `enable-topbar-widgets` + `enable-topbar-panel-controls` (migration sẽ xoá ở Phase 5)
- [ ] 2.10 `glib-compile-schemas --strict` cả 2 thư mục schema
- [ ] 2.11 Copy `stylesheet.css` của topbar-widgets + icons/ sang module mới

**Verify:** bật/tắt module mới qua `gnome-extensions`, journal sạch, prefs mở được, `topbar-clone` vẫn chạy (đã bật qua dconf ở F7).

---

## Phase 3 — Chuyển 3 subsystem có sẵn (1.5 giờ)

`git mv` để giữ history, không copy-dán.

- [ ] 3.1 `git mv modules/alienware-topbar-widgets@hsx2coder/subsystems/clipboard modules/alienware-topbar@hsx2coder/subsystems/widgets/clipboard`
- [ ] 3.2 `git mv …/subsystems/command-menu → subsystems/widgets/command-menu`
- [ ] 3.3 `git mv …/subsystems/topbar-clone → subsystems/topbar-clone`
- [ ] 3.4 Sửa import trong `extension.js` của module mới cho khớp đường dẫn mới
- [ ] 3.5 Sửa path nội bộ trong 3 subsystem (`./schemas/...`, `SUBSYS_DIR`, `moduleDir`) — grep `topbar-clone/`, `clipboard/`, `command-menu/` trong các file đã move
- [ ] 3.6 Copy schema `clipboard-indicator` + `commandmenu2` sang `alienware-topbar/schemas/` **giữ nguyên schema id** (chưa đổi tên, để Phase 5 migrate sau)
- [ ] 3.7 **Fix bug F7 triệt để**: thêm `Adw.SwitchRow` bind vào `enable-topbar-clone` trong prefs, và bắt buộc 2 action trong `TopbarCloneSubsystem.enable()`:
  - Nếu key false → không `return` im lặng, mà vẫn connect `changed::enable-topbar-clone` để bật/tắt nóng
  - Tách `_onEnabledChanged()` để toggle không cần restart shell
- [ ] 3.8 Gỡ `extension.js:14-15` của topbar-widgets cũ, xoá entry `topbarWidgets` khỏi `modules.js` + registry (giữ `topbarPanelControls` tạm tới Phase 6 vì 26 feature của nó đang chết, không mất gì khi xoá sớm → **xoá luôn ở đây**)

**Verify:** clipboard indicator + command menu + topbar clone hoạt động như cũ trong module mới. Journal không có `[TPC]` nữa.

---

## Phase 4 — Viết lại 26 tính năng chết của topbar-panel-controls (4 giờ)

Đây là phần nặng nhất. Trước đây cả 26 đều là `gcmApi.xxx()` với `gcmApi` = `{}`. Giờ gọi thẳng subsystem nội bộ.

Nguồn logic: `modules/alienware-topbar-panel-controls@hsx2coder/extension.js:120-213` (bảng key → API method) + `modules/alienware-gnome-customizer-manager@hsx2coder/lib/API.js` (thân hành động thật).

| nhóm tính năng | key hiện tại (`topbar-panel-controls`) | API cũ | viết vào subsystem |
|---|---|---|---|
| panel show/hide | `top-panel-visible` | `panelShow:369`, `panelHide:425`, `isPanelVisible:513` | `panel` |
| panel size | `top-panel-size` | `panelSetSize:312`, `panelSetDefaultSize:294` | `panel` |
| panel position | `top-panel-position` | `panelSetPosition:1299` | `panel` |
| padding / icon size | `top-panel-button-hpadding*`, `top-panel-indicator-hpadding*`, `top-panel-icon-size` | `:2164`, `:2204`, `:2845` | `panel` |
| clock show/hide | `top-panel-clock-visible` | `dateMenuShow:1122`, `dateMenuHide:1134` | `clock` |
| quick settings | `top-panel-quick-settings-visible` | `:1184`,`:1194` | `quick-settings` |
| activities | `top-panel-activities-visible` | `:1094`,`:1108` | `activities` |
| search | `top-panel-search-visible` | `searchEntryShow:673`, `searchEntryHide:716` | `search` |
| show apps | `top-panel-show-apps-visible` | `:1527`,`:1537` | `panel` |
| kbd layout | `top-panel-keyboard-layout-visible` | `:1144`,`:1154` | `indicators` |
| a11y menu | `top-panel-a11y-visible` | `:1164`,`:1174` | `indicators` |
| power | `top-panel-power-visible` | `:1234`,`:1244` | `indicators` |
| notification | `top-panel-notification-visible` | `:1410`,`:1420` | `indicators` |
| screen share | `top-panel-screen-share-visible` | `:3270`,`:3280` | `indicators` |
| screen record | `top-panel-screen-record-visible` | `:3290`,`:3300` | `indicators` |

- [ ] 4.1 `subsystems/panel/extension.js`: `_applyHeight()`, `_applyPosition()`, `_applyPadding()`, `_applyIconScale()` — dùng `St.ThemeContext`/`Main.panel.set_height` thay vì gọi API
- [ ] 4.2 **Chốt F6**: chỉ subsystem `clock` được reparent `Main.panel.statusArea.dateMenu`. Xoá mọi reparent khác. `topbar-clone/main.js:380` chỉ được **clone** `_rightBox`, không được move node thật.
- [ ] 4.3 `subsystems/clock`: `dateMenuShow/Hide` → `this._dateMenu.visible = bool` + `set_position` theo 1 enum duy nhất `clock-position ∈ {left,center,right}` (thay cho cả `move-clock` của Monitor và clock-position của GCM)
- [ ] 4.4 `subsystems/quick-settings`: `Main.panel.statusArea.quickSettings`
- [ ] 4.5 `subsystems/activities`: `Main.panel.statusArea.activities`
- [ ] 4.6 `subsystems/search`: `Main.panel._rightBox` chứa `searchEntry`; phải chịu được dash-to-panel reroute
- [ ] 4.7 `subsystems/indicators`: generic — nhận danh sách `role` và `visible`, không hardcode actor. Ánh xạ `role → statusArea key` bằng `Main.panel.statusArea[role]`, fallback `Main.panel.statusArea._getIndicator?` không có → dùng `Panel._indicatorManager`. **Bắt buộc dùng `Panel.PANEL_ITEM_IMPLEMENTATIONS`** để không phụ thuộc tên actor (xem `alienware-monitor/extension.js:1467` làm mẫu)
- [ ] 4.8 `subsystems/panel/host.js` — `PanelHost` singleton:
  ```js
  export const PanelHost = {
      get panel() {},
      addStatusItem(role, indicator) {},   // thay cho Main.panel.addToStatusArea
      removeStatusItem(role) {},
      getBox(side) {},                     // left|center|right
      onPanelChanged(cb) {},
  };
  ```
  Không ai ngoài topbar được import trực tiếp `Main.panel`
- [ ] 4.9 Xoá `modules/alienware-topbar-panel-controls@hsx2coder/` (toàn bộ 4 file)
- [ ] 4.10 Gỡ `enable-topbar-panel-controls` khỏi suite schema + `modules.js` + `extension.js:13,28` + `prefs.js:16,31`

**Verify:** mở prefs, toggle từng feature, xác nhận panel đổi ngay không cần restart shell. Đây là lần đầu 26 feature này thực sự hoạt động.

---

## Phase 5 — Dọn 39 tính năng từ GCM + Monitor (5 giờ)

Chi tiết đầy đủ: `/tmp/opencode/audit/C-gcm-monitor.md` §C7 (bảng R1–R39, mỗi dòng có key + ext.js line + API.js line + "change if moved").

### 5.1 Nhóm A — GCM có schema key (R1–R9), key `S1` = schema GCM
| R | key |
|---|---|
| R1 | `quick-settings` |
| R2 | `quick-settings-dark-mode` |
| R3 | `quick-settings-night-light` |
| R4 | `quick-settings-do-not-disturb` |
| R5–R9 | (xem `C-gcm-monitor.md` §C7 nhóm A) |

- [ ] 5.1.1 Copy 9 key vào schema `alienware-topbar`
- [ ] 5.1.2 Xoá 9 key khỏi schema GCM + xoá `#applyQS*` khỏi `GCM/extension.js:280-299`
- [ ] 5.1.3 Chuyển 9 row trong `GCM/prefs.js:83,87,91,95,…` sang `topbar/prefs.js`

### 5.2 Nhóm B — GCM API-only (R10–R30, 21 feature)
- [ ] 5.2.1 `panel`: R10 (show/hide/size/visibility), R11 (position + menu side)
- [ ] 5.2.2 `clock`: R12 (clock position — thay cho R31), R14 (date menu show/hide), R20 (weather), R21 (world clocks), R22 (events button), R23 (calendar show/hide)
- [ ] 5.2.3 `panel`: R13 (activities), R19 (show-apps), R24 (panel icon size), R25–R30 (spacing/control-center/search entry — xem bảng)
- [ ] 5.2.4 `indicators`: R15 (kbd), R16 (a11y), R17 (power — **Monitor đang mượn power proxy tại `Monitor/extension.js:1364`, phải sửa cả 2 chiều**), R18 (notification)
- [ ] 5.2.5 Xoá 21 method khỏi `GCM/lib/API.js` sau khi mọi thân hành động đã chuyển
- [ ] 5.2.6 **4 module giữ `gcm._api` phải repoint**: WC:55, AAT:338, DTP:294, NC:41. WC và NC sẽ bị hủy ở Phase 7 → chỉ còn AAT:338 và DTP:294 cần sửa thành `import {PanelHost} from '…/alienware-topbar@hsx2coder/subsystems/panel/host.js'`

### 5.3 Nhóm C — Monitor schema key (R31–R38, 8 feature), schema `S2`
- [ ] 5.3.1 R31 `move-clock` → bỏ, thay bằng `clock-position` của Phase 4.3. Xoá `Monitor/extension.js:3110-3115`, `:3208-3213`, `tray.clockMoved`
- [ ] 5.3.2 R32 `center-display`, R33 `left-display` → Monitor đọc target box qua `PanelHost.getBox()` thay vì hardcode
- [ ] 5.3.3 R34 `compact-display` — tách phần panel spacing/icon scale (→ topbar) khỏi phần `-compact` của Monitor
- [ ] 5.3.4 R35 `icon-display` → topbar
- [ ] 5.3.5 R36 `show-tooltip` + `tooltip-delay-ms` → **ở lại Monitor** (tooltip của chính nó, không phải topbar)
- [ ] 5.3.6 R37 `battery-hidesystem` — đã chết (`Monitor/extension.js:1453-1471`) → xoá hẳn
- [ ] 5.3.7 R38 10 key `*-position` (515–551) → topbar
- [ ] 5.3.8 Xoá các key đã chuyển khỏi schema Monitor + `Monitor/prefs.js:69,676`

**Verify:** `./tools/check-schema-collisions.sh` → 0 dòng. Enable lại toàn suite, đối chiếu journal không có `Warning`/`ERROR`.

---

## Phase 6 — `migrations.js` + dconf migration (2 giờ)

- [ ] 6.1 Tạo `migrations.js` ở root: `runStep(name, fn)`, guard bằng key `migration-<name>` trong suite schema
- [ ] 6.2 Step `topbar-consolidation-1`: cho từng cặp (schema cũ, key) → (schema mới, key), copy nếu `get_user_value() !== null`
- [ ] 6.3 Bảng mapping đầy đủ: `/tmp/opencode/audit/C-gcm-monitor.md` §C7 cột "change if moved" + Phase 4 bảng key + Phase 3.6 (giữ nguyên id nên không cần map)
- [ ] 6.4 Map `enable-*` của suite: `enable-topbar-widgets` OR `enable-topbar-panel-controls` → `enable-topbar`; sau đó xoá 2 key cũ
- [ ] 6.5 Dry-run: `Gio.Settings` với `memory` backend, in ra bảng dự kiến, không ghi
- [ ] 6.6 Chạy thật, xác nhận bằng `gsettings list-recursively` so với `/tmp/aw-dconf-before.txt`
- [ ] 6.7 Xoá 2 key `enable-topbar-widgets` + `enable-topbar-panel-controls` khỏi suite schema, compile lại

**Verify:** mọi giá trị user đã set trước đó vẫn còn sau reload. Đây là bước duy nhất không đảo ngược được dễ dàng → commit trước, backup dconf trước.

---

## Phase 7 — GCM gọn + nuốt workspace-control + notification-configurator (2.5 giờ)

- [ ] 7.1 GCM còn lại: theme, accent, dark-mode, night-light, font, cursor, controls-manager, next-applet workspace layout
- [ ] 7.2 `git mv modules/alienware-workspace-control@hsx2coder/subsystems/* → modules/alienware-gnome-customizer-manager@hsx2coder/subsystems/workspace-control/`
  - **Đây là module thuần front-end** (438 LOC, 14 key, 0 shell call, mọi `#apply*` là `this.#api().workspaceX()` tại `extension.js:55-57,174-300`) → gộp gần như cắm đầu, không cần `lookupByUUID` nữa
- [ ] 7.3 Gộp 14 key workspace-control vào schema GCM
- [ ] 7.4 `git mv modules/alienware-notification-configurator@hsx2coder/* → modules/alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/`
  - Nó sở hữu MessageTray interception tại `shell/notifications.js:143` + 13 key
  - Xoá dead key đọc ở `extension.js:46,62`
- [ ] 7.5 Gộp 13 key notification-configurator vào schema GCM
- [ ] 7.6 Xoá 2 module dir, 2 entry `modules.js`, 4 dòng registry (`extension.js`, `prefs.js`), 2 enable-key suite schema
- [ ] 7.7 Prefs: 2 tab con trong trang GCM thay vì 2 trang riêng

**Verify:** 14 + 13 = 27 key còn giá trị sau migration. Không còn `lookupByUUID` nào trong repo.

---

## Phase 8 — Monitor gọn (1 giờ)

- [ ] 8.1 Xoá 8 key panel đã sang topbar (Phase 5.3)
- [ ] 8.2 Sửa `Monitor/extension.js:1364` (mượn power proxy) → dùng `PanelHost`
- [ ] 8.3 Sửa `Monitor/extension.js:3110-3137` sau khi R31–R34 đã bỏ
- [ ] 8.4 Giữ nguyên: đồ thị, `show-tooltip`, `tooltip-delay-ms`, mọi key monitor thật

---

## Phase 9 — Tách `advanced-media-controller` ra khỏi dash-to-panel (2 giờ)

- [ ] 9.1 `git mv modules/alienware-dash-to-panel@hsx2coder/media → modules/alienware-advanced-media-controller@hsx2coder/`
- [ ] 9.2 Viết `metadata.json` riêng (uuid mới, `shell-version` khớp root)
- [ ] 9.3 Tách schema `advanced-media-controller` khỏi schema dash-to-panel (giữ nguyên schema id nếu đã riêng, kiểm tra trước)
- [ ] 9.4 Thêm entry `modules.js` + registry `extension.js` + `prefs.js`, enable-key `enable-advanced-media-controller` (đã có sẵn trong suite schema — dconf có `enable-advanced-media-controller=false`)
- [ ] 9.5 Xoá import chéo trong dash-to-panel sau khi tách
- [ ] 9.6 Rà lại `dash-to-panel` còn lại: chỉ panel surgery core

**Verify:** `./tools/check-schema-collisions.sh` vẫn 0. Media controller bật/tắt độc lập dash-to-panel.

---

## Phase 10 — Repoint consumer còn lại (1.5 giờ)

- [ ] 10.1 `advanced-alt-tab/src/inputHandler.js:54,63` — ghi `org.gnome.mutter:overlay-key`. Xác minh đây là binding của chính switcher thì giữ nguyên; nếu không thì chuyển quyền sở hữu
- [ ] 10.2 `dash-to-panel` `:294` `lookupByUUID` → `import {PanelHost}`
- [ ] 10.3 `indicators/extension.js:337,446,465` + `indicatorStatusIcon.js:42,50` — `Main.panel.addToStatusArea` trực tiếp (đang bị dash-to-panel reroute âm thầm tại `panel.js:123`) → `PanelHost.addStatusItem()`
- [ ] 10.4 `dash-to-panel` `desktopIconsIntegration.js:167` (`DesktopIconsUsableArea`) giữ nguyên
- [ ] 10.5 Grep toàn repo: `grep -rn "Main\.panel\._\(left\|center\|right\)Box\|Main\.panel\.statusArea\|Main\.panel\.addToStatusArea\|lookupByUUID" modules/` → mọi hit phải nằm trong `alienware-topbar@hsx2coder` (trừ 1 adapter được document trong `PanelHost`)

**Verify:** lệnh grep trên chỉ còn hit trong module topbar. Đây là tiêu chí nghiệm thu chính của cả dự án.

---

## Phase 11 — Verify tổng thể (2 giờ)

- [ ] 11.1 `Alt+F2` → `r` (X) hoặc logout/login (Wayland). Journal không có JS error
- [ ] 11.2 `./tools/check-schema-collisions.sh` → 0 dòng
- [ ] 11.3 `./tools/check-dead-keys.sh` → 0 dòng
- [ ] 11.4 `glib-compile-schemas --strict` sạch mọi thư mục
- [ ] 11.5 Mở prefs suite, click hết toggle, không warning GTK trong journal
- [ ] 11.6 Tắt/bật từng module 2 lần liên tiếp → không rò actor (`journal` không có `actor already has a parent`)
- [ ] 11.7 2 màn hình: topbar clone hiện trên cả 2, đổi layout màn hình (chính/phụ) → clone bám theo
- [ ] 11.8 Xoá toàn bộ key mới → tất cả về default, không crash
- [ ] 11.9 So sánh ảnh chụp với baseline Phase 0
- [ ] 11.10 Reboot sạch, kiểm tra lại 11.1–11.8

---

## Phase 12 — Docs (1 giờ)

- [ ] 12.1 `AGENT.md` — kiến trúc 8 module mới, bảng schema, quy tắc 4 điều khoản ở §0.2
- [ ] 12.2 `docs/topbar.md` — thay `docs/topbar-clone.md`, gộp 3 nhánh clock/panel/clone
- [ ] 12.3 `CHECKPOINT.md` — ghi lại trạng thái sau Phase 12
- [ ] 12.4 `PLAN.md` — đánh dấu phase cũ đã superseded
- [ ] 12.5 Ghi changelog dconf migration vào `AGENT.md` (user cần biết chạy gì nếu muốn rollback)

---

## Ưu tiên nếu phải chia nhiều lần commit

| Đợt | Phase | Kết quả nhìn thấy được |
|---|---|---|
| 1 | 1 | Dọn sạch, có lint chặn conflict quay lại |
| 2 | 2, 3 | Module `alienware-topbar` tồn tại, topbar clone hoạt động, có UI toggle |
| 3 | 4, 6 | **26 tính năng panel chết sống lại** — thay đổi nhìn thấy rõ nhất |
| 4 | 5 | Xong dọn GCM/Monitor, 0 key trùng |
| 5 | 7, 8, 9 | 10 module → 8 module |
| 6 | 10, 11, 12 | Nghiệm thu |

---

## Ước lượng

| Phase | Giờ |
|---|---|
| 0 | 0.3 |
| 1 | 1.5 |
| 2 | 2 |
| 3 | 1.5 |
| 4 | 4 |
| 5 | 5 |
| 6 | 2 |
| 7 | 2.5 |
| 8 | 1 |
| 9 | 2 |
| 10 | 1.5 |
| 11 | 2 |
| 12 | 1 |
| **Tổng** | **~26.3 giờ** |

Rủi ro cao nhất: **Phase 6** (mất dconf nếu sai). Phase 4 và 5 (viết lại hành vi).
