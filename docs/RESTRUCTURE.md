# Phân tích Restructure Module — Chi tiết

> **LƯU Ý (2026-09-29):** tài liệu này mô tả trạng thái **trước** đợt gộp theo chức năng.
> Bốn module trong đây không còn tồn tại: `topbar-widgets`, `topbar-panel-controls`
> và `workspace-control` đã gộp, còn `dash-to-panel/media/` đã tách thành
> `alienware-advanced-media-controller`. Layout hiện hành: `AGENT.md` mục 1,
> `docs/ARCHITECTURE.md` mục 0, `CHECKPOINT.md`.


> Dựa trên khảo sát codebase thực tế. Số LOC = total JS lines (includes imports, blank).

---

## I. INVENTORY THỰC TẾ

| Module | Files | LOC | Ghi chú |
|--------|------|-----|---------|
| dash-to-panel | 48 | 21,839 | Khối code lớn nhất |
| monitor | 10 | 8,265 | Widget |
| clipboard-indicator | 6 | 5,861 | Widget |
| appindicatorsupport | 17 | 5,183 | System tray |
| **Tổng Panel Group** | **~85** | **~42,000** | |

| advanced-alt-tab | 14 | 3,970 | Switcher |
| just-perfection-desktop | 7 | 380 | Shell tweaker (siêu nhỏ?!?) |

| desktop-enable-gnome (DING) | 30 | 2,149 | Desktop icons |
| notification-configurator | 21 | 1,662 | Notifications |
| command-menu2 | 6 | 2,037 | Panel widget |
| topbar-clone | 2 | 1,698 | Panel cloner |
| capsnum-touchpad | 2 | 1,112 | Lock + touchpad |
| capsnum-indicator | 2 | 724 | Legacy lock (thừa?) |
| touchpad | 5 | 956 | Legacy touchpad (thừa?) |

> **Lưu ý:** `monitor` là system monitor đã chạy riêng. `just-perfection-desktop` (7 files, 380 LOC) là JS wrapper thuần wrapper cho `org.gnome.shell.extensions.just-perfection` GSettings — không phải code gốc!

---

## II. JUST PERFECTION — ĐẶC BIỆT

`just-perfection-desktop` không phải code gốc của Just Perfection extension. Nó là **wrapper** nhỏ (380 LOC):
- 7 files: 5 file schema/theme, 2 file JS chính
- Đọc/ghi GSettings key của `org.gnome.shell.extensions.just-perfection`
- Không có UI rendering code thật sự

**Kết luận:** Just Perfection KHÔNG thể tách ra module con vì không có source ở đây. Nó chỉ là proxy settings.

---

## III. CAPSNUM (module thừa?)

| Module | LOC | Chức năng | Ghi chú |
|--------|-----|-----------|---------|
| capsnum-indicator | 724 | Caps/Num lock indicator | Legacy |
| capsnum-touchpad | 1,112 | Caps/Num + Touchpad toggle | Mới, gộp cả 2 |
| touchpad | 956 | Touchpad toggle only | Legacy |

**Kết luận:** `capsnum-indicator` và `touchpad` có thể xoá. `capsnum-touchpad` là bản gộp.

---

## IV. ĐỀ XUẤT MERGE

### Panel Module (khả thi CAO)
Gộp 7 module panel lại. Sau đây là architecture thực tế:

```
alienware-panel@hsx2coder/
├── extension.js          ← enable() từng subsystem
├── prefs.js              ← Settings với tabbed UI
├── schemas/              ← Giữ nguyên 7 schema files riêng
│   ├── dash-to-panel.gschema.xml
│   ├── monitor.gschema.xml
│   ├── clipboard.gschema.xml
│   ├── appindicator.gschema.xml
│   ├── command-menu.gschema.xml
│   ├── capsnum-touchpad.gschema.xml
│   └── topbar-clone.gschema.xml
├── subsystems/           ← Mỗi thư mục là 1 module cũ
│   ├── dash-to-panel/            (48 files, 22K LOC)
│   ├── system-monitor/           (10 files, 8K LOC)
│   ├── clipboard/                (6 files, 6K LOC)
│   ├── appindicator/             (17 files, 5K LOC)
│   ├── command-menu/             (6 files, 2K LOC)
│   ├── capsnum-touchpad/         (2 files, 1K LOC)
│   └── topbar-clone/             (2 files, 2K LOC)
├── stylesheet.css
└── icons/
```

**extension.js pattern:**
```js
import { DashToPanel } from './subsystems/dash-to-panel/extension.js';
import { SystemMonitor } from './subsystems/system-monitor/extension.js';
// ...
const SUBSYSTEMS = [DashToPanel, SystemMonitor, ClipboardIndicator, /*...*/];

export default class PanelExtension extends Extension {
    enable() {
        this._subs = SUBSYSTEMS.map(S => new S(this));
        this._subs.forEach(s => s.enable());
    }
    disable() {
        this._subs.forEach(s => s.disable());
    }
}
```

**Prefs:**
```js
// Mỗi subsystem cung cấp 1 page riêng
const PAGES = [DashToPanelPage, SystemMonitorPage, ClipboardPage, ...];
fillPreferencesWindow(window) {
    PAGES.forEach(P => window.add(new P(this.getSettings())));
}
```

### Vấn đề với architecture này:
1. **Dash-to-panel extension.js** khởi tạo PanelManager, AppIcons, Intellihide, WindowPreview, MediaController — cần gọi `this.name`, `this.path`, `this.getSettings()`. Khi nằm trong subsystem, các `gọi` này sẽ lấy từ module mới.
2. **getSettings()** — mỗi module dùng `.metadata['settings-schema']` để tìm schema. Trong module mới, `this.metadata` không trỏ đúng schema cũ. Cần pass settings riêng hoặc override bằng `this.getSettings(schema)`.
3. **path references** — `extension.dir.get_child()`, `extension.path`, `extension.uuid` đều sai nếu code hardcode.

### Giải pháp cho vấn đề trên:
Mỗi subsystem nhận context object khi khởi tạo:
```js
class DashToPanelSubsystem {
    constructor(ext) {
        this._settings = ext.getSettings('org.gnome.shell.extensions.dash-to-panel');
        this._dir = ext.dir.get_child('subsystems/dash-to-panel');
        // ...
    }
}
```

---

## V. PHẢN TÍCH KHẢ THI THEO TỪNG NHÓM

### Nhóm Panel (7 → 1) — CÓ THỂ, nhưng:
- **Khối lượng:** ~85 files, ~42K LOC
- **Thời gian:** ~3-5 ngày nếu copy nguyên → wrapper. ~7-10 ngày nếu tái cấu trúc clean.
- **Rủi ro:** Dash-to-panel là 21K LOC, codebase có nhiều hardcode path và metadata reference. Nếu wrapper không kỹ, nhiều tính năng hỏng.
- **Cần test kỹ** sau mỗi subsystem migrate

### Nhóm Just Perfection tách — KHÔNG CẦN
Chỉ 380 LOC wrapper settings. Không có code để tách vào module khác.

### Nhóm Notification — GIỮ NGUYÊN
Notification Configurator 1,662 LOC standalone tốt. Không có module nào khác cùng category.

### Nhóm Desktop Icons — GIỮ NGUYÊN
DING 2,149 LOC, 30 files. Quá đặc thù để gộp.

### Nhóm Capsnum — CẮT BỚT
Xoá `capsnum-indicator` (724 LOC) và `touchpad` (956 LOC) vì đã có `capsnum-touchpad` gộp cả 2.

---

## VI. RECOMMENDATION

**Nên làm:**

1. **Xoá module thừa:** `capsnum-indicator`, `touchpad` (đã có `capsnum-touchpad` thay thế)
2. **Merge Panel group** — đây là nhóm có lợi ích rõ nhất vì các module đều tác động panel và có interaction pattern chung
3. **Hậu merge:** Suite còn 5 enable-keys: `enable-panel`, `enable-window-switcher`, `enable-desktop-icons`, `enable-notifications`, `enable-just-perfection`

**Không nên làm lúc này:**
- Merge AATWS + Just Perfection — JP không có code thật
- Merge Notifications với module khác — standalone
- Tách Just Perfection — không có code để tách

**Muốn làm ngay không?** Nếu ok, tao sẽ bắt đầu Phase 1 (Panel merge) từ những module nhỏ trước: topbar-clone (2 files, 1.6K LOC) → capsnum-touchpad (2 files, 1.1K) → command-menu (6 files, 2K) → clipboard (6 files, 5.8K) → appindicator (17 files, 5K) → system-monitor (10 files, 8.2K) → dash-to-panel (48 files, 21K). Làm từ dễ đến khó.
