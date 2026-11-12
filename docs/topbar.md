# Topbar & Panel — `alienware-topbar@hsx2coder`

Module duy nhất được phép chạm vào panel. Gộp từ `topbar-widgets`,
`topbar-panel-controls`, và phần panel của `gnome-customizer-manager` +
`system-monitor`.

## Schema

`org.gnome.shell.extensions.alienware-topbar` — 26 key.

| Nhóm | Key |
|---|---|
| Hình học | `panel-visible`, `panel-in-overview`, `panel-height`, `panel-position` *(enum top/bottom)*, `panel-corner-size`, `panel-button-padding`, `panel-indicator-padding`, `panel-icon-size` |
| Item panel | `background-menu`, `activities-button`, `show-apps-button`, `search-entry`, `start-search`, `max-search-results`, `notification-icon`, `keyboard-layout-indicator`, `accessibility-menu`, `power-icon`, `screen-sharing-indicator`, `screen-recording-indicator` |
| Accent | `accent-color-icon` |
| Clone | `clone-topbar`, `clone-show-clock`, `clone-show-tray` |

`panel-position` dùng GSettings enum thay cho `i` — đây là thay đổi cố ý: bản cũ
bind `int` vào `Adw.SwitchRow.active` nên warning mỗi lần mở prefs.

Clock & Calendar và Quick Settings là menu mặc định của GNOME, nên đã chuyển sang
`alienware-gnome-customizer-manager` (`subsystems/panel-menus/`). Giá trị cũ của
14 key được migration `migration-gcm-panel-menus-v2` chuyển sang, đọc qua bản
schema đóng băng trong `migrations/schemas-v2/`. System Monitor vẫn chiếm chỗ
đồng hồ, nhưng giờ qua cổng chung `lib/dateMenuVisibility.js` thay vì sửa
`clock-visible`.

Ghi chú migration: giá trị `clock-visible = false` do bản cũ tự ghi khi System
Monitor bật bị bỏ qua (không copy sang GCM), để đồng hồ không biến mất sau khi
nâng cấp. Các key đồng hồ GCM đã được v1 ghi (`clock-position`,
`clock-position-offset`) không bị reset bởi step v2 dù topbar không có giá trị.

## Cấu trúc

```
modules/alienware-topbar@hsx2coder/
├── extension.js                  entry: PanelHost → panel → clone → widgets
├── prefs.js                      5 trang + 2 trang của subsystem
├── schemas/
│   ├── …alienware-topbar.gschema.xml
│   ├── …clipboard-indicator.gschema.xml    (upstream port)
│   └── …commandmenu2.gschema.xml            (upstream port)
└── subsystems/
    ├── panel/host.js             PanelHost: cửa duy nhất vào panel
    ├── panel/api.js              PanelApi (70 method, tách từ GCM API.js)
    ├── panel/extension.js        bảng [key, apply, revert] cho mọi panel key
    ├── topbar-clone/main.js      clone bar lên màn hình phụ
    └── widgets/{clipboard,command-menu}/
```

## PanelHost

```js
PanelHost.enable(shellVersion) / disable()
PanelHost.addStatusItem(role, indicator, position, box)   // 'left'|'center'|'right'
PanelHost.addPanelBoxItem(role, actor, position, box)
PanelHost.getBox(side) / sideForIndex(index)
PanelHost.watch(cb)     // cb() khi engine lên/xuống
```

`addStatusItem` cố tình gọi `Main.panel.addToStatusArea` để override của
dash-to-panel trên panel object vẫn được giữ.

## Bảng key → hành vi

`subsystems/panel/extension.js` giữ một bảng duy nhất `[key, apply, revert]`.
`#assertEveryKeyHandled()` lúc enable sẽ so mọi key trong schema với bảng và
log lỗi nếu có key không handler — nên không thể thêm key mà quên implement.

Ngoại lệ duy nhất: `panel-corner-size`. API cũ không có method cho nó và
`topbar-panel-controls` gọi nhầm `panelButtonHpadding*` nên bán kính không bao
giờ đổi. Nay áp trực tiếp `border-radius` lên panel actor, nhớ style cũ để
revert đúng.

## Clone đa màn hình

`subsystems/topbar-clone/main.js`:

- `clone-topbar` được watch suốt vòng đời. Bản cũ `return` sớm và không có
  UI toggle, nên tắt là không mở lại được nếu không restart shell.
- Mỗi monitor không phải primary dựng một `ClonePanelBox` qua
  `Main.layoutManager.addChrome()` rồi `set_position(monitor.x, monitor.y)`.
- `monitors-changed` / `workareas-changed` chỉ connect một lần mỗi lần
  `enable()`, không connect lại mỗi lần toggle.
- Ba vùng: trái (workspace switcher), giữa (clock), phải (status area),
  điều khiển bằng `clone-show-clock` / `clone-show-tray`.

## Widgets

`clipboard` và `command-menu` là `Extension` thật, cần `settings-schema` riêng
nên được khởi tạo với metadata con trỏ `dir` về module này. Khi `PanelHost`
enable/disable, cả hai được dựng lại qua `PanelHost.watch()`.
