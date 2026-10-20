# WORKLIST-AUDIT — Rà soát toàn bộ tính năng Alienware Suite

> Deliverable audit: từng module, từng subsystem, từng tính năng (kể cả nhỏ nhất), kiểm tra logic + runtime.
> Người thực hiện: subagent audit (read-only) -> main agent fix -> verify bằng tools/check-all.sh + reload + journal.

## 0. Phạm vi

| Module | JS LOC | Số work unit |
|---|---|---|
| alienware-advanced-alt-tab | 9272 | 15 |
| alienware-dash-to-panel | 30659 | 20 |
| alienware-desktop-enable-gnome | 13315 | 28 |
| alienware-gnome-customizer-manager | 6081 | 4 |
| alienware-topbar | 19320 | 8 |
| **TỔNG** | **78647** | **75** |

Tổng số task kiểm tra: **900** (75 unit x 12 chiều).

## 1. Mười hai chiều kiểm tra

| ID | Chiều | Nội dung bắt buộc kiểm |
|---|---|---|
| D1 | Lifecycle | enable/disable/_init/destroy parity; re-enable sau disable; guard `this._destroyed`; mọi state tạo trong enable phải giải phóng trong disable |
| D2 | Signal hygiene | mỗi `.connect` phải có `.disconnect` (hoặc connectSmart + disconnectSmart); không rò rỉ handler khi enable lại |
| D3 | Timer/source | mỗi `timeout_add`/`idle_add` phải được `source_remove` lúc disable; không chạy sau destroy |
| D4 | Settings parity | key trong schema <-> PrefsFields/constant <-> chỗ đọc trong JS <-> row trong prefs UI <-> default; phát hiện key chết/thiếu |
| D5 | Feature wiring | mỗi tính năng đăng ký phải có đường vào từ UI/keybinding và toggle có hiệu lực ngay khi đổi setting |
| D6 | UI/action | menu item/nút/callback thực sự được bind và chạy đúng (không handler chết, không item trỏ vào hàm rỗng) |
| D7 | API GNOME 50 | API bị bỏ/đổi chữ ký (St/Clutter/Main/PopupMenu/Panel/statusArea); dùng đúng biến thể có trong typelib |
| D8 | Error path | try/catch cho DBus/IO/parse; guard actor đã dispose; race async (await sau khi destroy) |
| D9 | Logic/state | state machine hợp lệ, điều kiện biên (rỗng/1 phần tử/giá trị lạ), persistence/dedupe/round-trip dữ liệu |
| D10 | Panel law & cohesion | luật 1 AGENT.md: chỉ alienware-topbar ghi panel, module khác phải qua PanelHost; thứ tự phụ thuộc giữa module; contract PanelHost |
| D11 | Dead code/orphan | export không ai dùng, file không được import, dir không nằm trong modules.js, key/setting/pref row thừa |
| D12 | Language/i18n | zero phi tiếng Anh trong code/comment/log/UI/docs; gettext dùng đúng; không hardcode chuỗi UI |

## 2. Cổng tự động sẵn có (chạy trước & sau mỗi fix)

```
bash tools/check-all.sh      # syntax, engine-calls, schema-collisions, dead-keys,
                             # key-usage, prefs-keys, imports, lifecycle, wiring, schemas-load, migration
```

## 3. Work units & task

### 3.1 alienware-advanced-alt-tab

| Unit | Path | LOC | Files |
|---|---|---|---|
| U1-01 | `alienware-advanced-alt-tab@hsx2coder/prefs.js` | 1611 | - |
| U1-02 | `alienware-advanced-alt-tab@hsx2coder/src/actions.js` | 453 | - |
| U1-03 | `alienware-advanced-alt-tab@hsx2coder/src/captionLabel.js` | 229 | - |
| U1-04 | `alienware-advanced-alt-tab@hsx2coder/src/enum.js` | 108 | - |
| U1-05 | `alienware-advanced-alt-tab@hsx2coder/src/inputHandler.js` | 918 | - |
| U1-06 | `alienware-advanced-alt-tab@hsx2coder/src/listProvider.js` | 431 | - |
| U1-07 | `alienware-advanced-alt-tab@hsx2coder/src/optionsFactory.js` | 403 | - |
| U1-08 | `alienware-advanced-alt-tab@hsx2coder/src/settings.js` | 373 | - |
| U1-09 | `alienware-advanced-alt-tab@hsx2coder/src/switcherItems.js` | 608 | - |
| U1-10 | `alienware-advanced-alt-tab@hsx2coder/src/switcherList.js` | 541 | - |
| U1-11 | `alienware-advanced-alt-tab@hsx2coder/src/util.js` | 307 | - |
| U1-12 | `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js` | 261 | - |
| U1-13 | `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js` | 2164 | - |
| U1-14 | `alienware-advanced-alt-tab@hsx2coder/{assets}` | 0 | 2 |
| U1-15 | `alienware-advanced-alt-tab@hsx2coder/{small}` | 865 | 2 |

#### U1-01 — `alienware-advanced-alt-tab@hsx2coder/prefs.js` (1611 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0001 | D1 Lifecycle | destroy/dispose sites=1 | |
| T0002 | D2 Signal hygiene | connect=4, disconnect=0 | |
| T0003 | D3 Timer/source | timer/source sites=0 | |
| T0004 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0005 | D5 Feature wiring | subsystem sites=0 | |
| T0006 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0007 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0008 | D8 Error path | try sites=2, async=0 | |
| T0009 | D9 Logic/state | state sites=0 | |
| T0010 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0011 | D11 Dead code/orphan | exports/classes=1, dbus=0 | |
| T0012 | D12 Language/i18n | exports/classes=1, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-01</summary>

- **conn** (4): `alienware-advanced-alt-tab@hsx2coder/prefs.js:120`, `alienware-advanced-alt-tab@hsx2coder/prefs.js:543`, `alienware-advanced-alt-tab@hsx2coder/prefs.js:719`, `alienware-advanced-alt-tab@hsx2coder/prefs.js:932`
- **cls** (1): `alienware-advanced-alt-tab@hsx2coder/prefs.js:51`
- **disp** (1): `alienware-advanced-alt-tab@hsx2coder/prefs.js:121`
- **catch** (2): `alienware-advanced-alt-tab@hsx2coder/prefs.js:112`, `alienware-advanced-alt-tab@hsx2coder/prefs.js:116`

</details>

#### U1-02 — `alienware-advanced-alt-tab@hsx2coder/src/actions.js` (453 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0013 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0014 | D2 Signal hygiene | connect=1, disconnect=0 | |
| T0015 | D3 Timer/source | timer/source sites=1 | |
| T0016 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0017 | D5 Feature wiring | subsystem sites=0 | |
| T0018 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0019 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0020 | D8 Error path | try sites=2, async=0 | |
| T0021 | D9 Logic/state | state sites=0 | |
| T0022 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0023 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0024 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-02</summary>

- **conn** (1): `alienware-advanced-alt-tab@hsx2coder/src/actions.js:369`
- **timer** (1): `alienware-advanced-alt-tab@hsx2coder/src/actions.js:443`
- **catch** (2): `alienware-advanced-alt-tab@hsx2coder/src/actions.js:444`, `alienware-advanced-alt-tab@hsx2coder/src/actions.js:446`

</details>

#### U1-03 — `alienware-advanced-alt-tab@hsx2coder/src/captionLabel.js` (229 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0025 | D1 Lifecycle | destroy/dispose sites=2 | |
| T0026 | D2 Signal hygiene | connect=1, disconnect=0 | |
| T0027 | D3 Timer/source | timer/source sites=0 | |
| T0028 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0029 | D5 Feature wiring | subsystem sites=0 | |
| T0030 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0031 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0032 | D8 Error path | try sites=24, async=0 | |
| T0033 | D9 Logic/state | state sites=0 | |
| T0034 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0035 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0036 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-03</summary>

- **conn** (1): `alienware-advanced-alt-tab@hsx2coder/src/captionLabel.js:103`
- **disp** (2): `alienware-advanced-alt-tab@hsx2coder/src/captionLabel.js:221`, `alienware-advanced-alt-tab@hsx2coder/src/captionLabel.js:224`
- **catch** (24): `alienware-advanced-alt-tab@hsx2coder/src/captionLabel.js:36`, `alienware-advanced-alt-tab@hsx2coder/src/captionLabel.js:43`, `alienware-advanced-alt-tab@hsx2coder/src/captionLabel.js:83`, `alienware-advanced-alt-tab@hsx2coder/src/captionLabel.js:86`

</details>

#### U1-04 — `alienware-advanced-alt-tab@hsx2coder/src/enum.js` (108 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0037 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0038 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0039 | D3 Timer/source | timer/source sites=0 | |
| T0040 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0041 | D5 Feature wiring | subsystem sites=0 | |
| T0042 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0043 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0044 | D8 Error path | try sites=0, async=0 | |
| T0045 | D9 Logic/state | state sites=0 | |
| T0046 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0047 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0048 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-04</summary>


</details>

#### U1-05 — `alienware-advanced-alt-tab@hsx2coder/src/inputHandler.js` (918 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0049 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0050 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0051 | D3 Timer/source | timer/source sites=2 | |
| T0052 | D4 Settings parity | settings reads=1, PrefsFields=0 | |
| T0053 | D5 Feature wiring | subsystem sites=0 | |
| T0054 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0055 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0056 | D8 Error path | try sites=76, async=0 | |
| T0057 | D9 Logic/state | state sites=0 | |
| T0058 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0059 | D11 Dead code/orphan | exports/classes=1, dbus=0 | |
| T0060 | D12 Language/i18n | exports/classes=1, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-05</summary>

- **timer** (2): `alienware-advanced-alt-tab@hsx2coder/src/inputHandler.js:46`, `alienware-advanced-alt-tab@hsx2coder/src/inputHandler.js:753`
- **sett** (1): `alienware-advanced-alt-tab@hsx2coder/src/inputHandler.js:58`
- **cls** (1): `alienware-advanced-alt-tab@hsx2coder/src/inputHandler.js:25`
- **catch** (76): `alienware-advanced-alt-tab@hsx2coder/src/inputHandler.js:27`, `alienware-advanced-alt-tab@hsx2coder/src/inputHandler.js:37`, `alienware-advanced-alt-tab@hsx2coder/src/inputHandler.js:53`, `alienware-advanced-alt-tab@hsx2coder/src/inputHandler.js:63`

</details>

#### U1-06 — `alienware-advanced-alt-tab@hsx2coder/src/listProvider.js` (431 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0061 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0062 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0063 | D3 Timer/source | timer/source sites=0 | |
| T0064 | D4 Settings parity | settings reads=3, PrefsFields=0 | |
| T0065 | D5 Feature wiring | subsystem sites=0 | |
| T0066 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0067 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0068 | D8 Error path | try sites=1, async=0 | |
| T0069 | D9 Logic/state | state sites=0 | |
| T0070 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0071 | D11 Dead code/orphan | exports/classes=1, dbus=0 | |
| T0072 | D12 Language/i18n | exports/classes=1, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-06</summary>

- **sett** (3): `alienware-advanced-alt-tab@hsx2coder/src/listProvider.js:267`, `alienware-advanced-alt-tab@hsx2coder/src/listProvider.js:295`, `alienware-advanced-alt-tab@hsx2coder/src/listProvider.js:296`
- **cls** (1): `alienware-advanced-alt-tab@hsx2coder/src/listProvider.js:19`
- **catch** (1): `alienware-advanced-alt-tab@hsx2coder/src/listProvider.js:276`

</details>

#### U1-07 — `alienware-advanced-alt-tab@hsx2coder/src/optionsFactory.js` (403 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0073 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0074 | D2 Signal hygiene | connect=7, disconnect=0 | |
| T0075 | D3 Timer/source | timer/source sites=0 | |
| T0076 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0077 | D5 Feature wiring | subsystem sites=0 | |
| T0078 | D6 UI/action | menu item sites=0, action-connect=1 | |
| T0079 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0080 | D8 Error path | try sites=0, async=0 | |
| T0081 | D9 Logic/state | state sites=0 | |
| T0082 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0083 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0084 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-07</summary>

- **conn** (7): `alienware-advanced-alt-tab@hsx2coder/src/optionsFactory.js:101`, `alienware-advanced-alt-tab@hsx2coder/src/optionsFactory.js:105`, `alienware-advanced-alt-tab@hsx2coder/src/optionsFactory.js:111`, `alienware-advanced-alt-tab@hsx2coder/src/optionsFactory.js:116`
- **act** (1): `alienware-advanced-alt-tab@hsx2coder/src/optionsFactory.js:285`

</details>

#### U1-08 — `alienware-advanced-alt-tab@hsx2coder/src/settings.js` (373 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0085 | D1 Lifecycle | destroy/dispose sites=1 | |
| T0086 | D2 Signal hygiene | connect=3, disconnect=2 | |
| T0087 | D3 Timer/source | timer/source sites=1 | |
| T0088 | D4 Settings parity | settings reads=3, PrefsFields=0 | |
| T0089 | D5 Feature wiring | subsystem sites=0 | |
| T0090 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0091 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0092 | D8 Error path | try sites=0, async=0 | |
| T0093 | D9 Logic/state | state sites=0 | |
| T0094 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0095 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0096 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-08</summary>

- **conn** (3): `alienware-advanced-alt-tab@hsx2coder/src/settings.js:80`, `alienware-advanced-alt-tab@hsx2coder/src/settings.js:213`, `alienware-advanced-alt-tab@hsx2coder/src/settings.js:290`
- **disc** (2): `alienware-advanced-alt-tab@hsx2coder/src/settings.js:296`, `alienware-advanced-alt-tab@hsx2coder/src/settings.js:302`
- **timer** (1): `alienware-advanced-alt-tab@hsx2coder/src/settings.js:84`
- **sett** (3): `alienware-advanced-alt-tab@hsx2coder/src/settings.js:218`, `alienware-advanced-alt-tab@hsx2coder/src/settings.js:219`, `alienware-advanced-alt-tab@hsx2coder/src/settings.js:263`
- **disp** (1): `alienware-advanced-alt-tab@hsx2coder/src/settings.js:295`

</details>

#### U1-09 — `alienware-advanced-alt-tab@hsx2coder/src/switcherItems.js` (608 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0097 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0098 | D2 Signal hygiene | connect=4, disconnect=1 | |
| T0099 | D3 Timer/source | timer/source sites=0 | |
| T0100 | D4 Settings parity | settings reads=1, PrefsFields=0 | |
| T0101 | D5 Feature wiring | subsystem sites=0 | |
| T0102 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0103 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0104 | D8 Error path | try sites=0, async=0 | |
| T0105 | D9 Logic/state | state sites=0 | |
| T0106 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0107 | D11 Dead code/orphan | exports/classes=1, dbus=0 | |
| T0108 | D12 Language/i18n | exports/classes=1, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-09</summary>

- **conn** (4): `alienware-advanced-alt-tab@hsx2coder/src/switcherItems.js:98`, `alienware-advanced-alt-tab@hsx2coder/src/switcherItems.js:101`, `alienware-advanced-alt-tab@hsx2coder/src/switcherItems.js:416`, `alienware-advanced-alt-tab@hsx2coder/src/switcherItems.js:461`
- **disc** (1): `alienware-advanced-alt-tab@hsx2coder/src/switcherItems.js:331`
- **sett** (1): `alienware-advanced-alt-tab@hsx2coder/src/switcherItems.js:261`
- **cls** (1): `alienware-advanced-alt-tab@hsx2coder/src/switcherItems.js:502`

</details>

#### U1-10 — `alienware-advanced-alt-tab@hsx2coder/src/switcherList.js` (541 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0109 | D1 Lifecycle | destroy/dispose sites=2 | |
| T0110 | D2 Signal hygiene | connect=23, disconnect=0 | |
| T0111 | D3 Timer/source | timer/source sites=0 | |
| T0112 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0113 | D5 Feature wiring | subsystem sites=0 | |
| T0114 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0115 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0116 | D8 Error path | try sites=0, async=0 | |
| T0117 | D9 Logic/state | state sites=0 | |
| T0118 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0119 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0120 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-10</summary>

- **conn** (23): `alienware-advanced-alt-tab@hsx2coder/src/switcherList.js:84`, `alienware-advanced-alt-tab@hsx2coder/src/switcherList.js:125`, `alienware-advanced-alt-tab@hsx2coder/src/switcherList.js:166`, `alienware-advanced-alt-tab@hsx2coder/src/switcherList.js:359`
- **disp** (2): `alienware-advanced-alt-tab@hsx2coder/src/switcherList.js:125`, `alienware-advanced-alt-tab@hsx2coder/src/switcherList.js:181`

</details>

#### U1-11 — `alienware-advanced-alt-tab@hsx2coder/src/util.js` (307 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0121 | D1 Lifecycle | destroy/dispose sites=2 | |
| T0122 | D2 Signal hygiene | connect=1, disconnect=0 | |
| T0123 | D3 Timer/source | timer/source sites=0 | |
| T0124 | D4 Settings parity | settings reads=2, PrefsFields=0 | |
| T0125 | D5 Feature wiring | subsystem sites=0 | |
| T0126 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0127 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0128 | D8 Error path | try sites=2, async=0 | |
| T0129 | D9 Logic/state | state sites=0 | |
| T0130 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0131 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0132 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-11</summary>

- **conn** (1): `alienware-advanced-alt-tab@hsx2coder/src/util.js:263`
- **sett** (2): `alienware-advanced-alt-tab@hsx2coder/src/util.js:109`, `alienware-advanced-alt-tab@hsx2coder/src/util.js:110`
- **disp** (2): `alienware-advanced-alt-tab@hsx2coder/src/util.js:263`, `alienware-advanced-alt-tab@hsx2coder/src/util.js:304`
- **catch** (2): `alienware-advanced-alt-tab@hsx2coder/src/util.js:128`, `alienware-advanced-alt-tab@hsx2coder/src/util.js:131`

</details>

#### U1-12 — `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js` (261 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0133 | D1 Lifecycle | destroy/dispose sites=1 | |
| T0134 | D2 Signal hygiene | connect=3, disconnect=1 | |
| T0135 | D3 Timer/source | timer/source sites=0 | |
| T0136 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0137 | D5 Feature wiring | subsystem sites=0 | |
| T0138 | D6 UI/action | menu item sites=2, action-connect=1 | |
| T0139 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0140 | D8 Error path | try sites=2, async=2 | |
| T0141 | D9 Logic/state | state sites=0 | |
| T0142 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0143 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0144 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-12</summary>

- **conn** (3): `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:242`, `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:245`, `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:251`
- **disc** (1): `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:256`
- **menu** (2): `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:158`, `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:215`
- **act** (1): `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:242`
- **disp** (1): `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:255`
- **async** (2): `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:52`, `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:58`
- **catch** (2): `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:53`, `alienware-advanced-alt-tab@hsx2coder/src/windowMenu.js:59`

</details>

#### U1-13 — `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js` (2164 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0145 | D1 Lifecycle | destroy/dispose sites=12 | |
| T0146 | D2 Signal hygiene | connect=15, disconnect=5 | |
| T0147 | D3 Timer/source | timer/source sites=18 | |
| T0148 | D4 Settings parity | settings reads=1, PrefsFields=0 | |
| T0149 | D5 Feature wiring | subsystem sites=0 | |
| T0150 | D6 UI/action | menu item sites=3, action-connect=1 | |
| T0151 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0152 | D8 Error path | try sites=10, async=0 | |
| T0153 | D9 Logic/state | state sites=0 | |
| T0154 | D10 Panel law & cohesion | panel-write refs=15 | |
| T0155 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0156 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-13</summary>

- **conn** (15): `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:256`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:674`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:675`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:676`
- **disc** (5): `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:252`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:258`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:688`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:747`
- **timer** (18): `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:222`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:224`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:342`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:465`
- **sett** (1): `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:1861`
- **menu** (3): `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:2006`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:2008`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:2009`
- **act** (1): `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:2010`
- **disp** (12): `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:350`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:663`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:741`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:784`
- **panelwrite** (15): `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:205`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:205`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:206`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:206`
- **catch** (10): `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:268`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:321`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:782`, `alienware-advanced-alt-tab@hsx2coder/src/windowSwitcherPopup.js:785`

</details>

#### U1-14 — `alienware-advanced-alt-tab@hsx2coder/{assets}` (0 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0157 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0158 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0159 | D3 Timer/source | timer/source sites=0 | |
| T0160 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0161 | D5 Feature wiring | subsystem sites=0 | |
| T0162 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0163 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0164 | D8 Error path | try sites=0, async=0 | |
| T0165 | D9 Logic/state | state sites=0 | |
| T0166 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0167 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0168 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-14</summary>


</details>

#### U1-15 — `alienware-advanced-alt-tab@hsx2coder/{small}` (865 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0169 | D1 Lifecycle | destroy/dispose sites=4 | |
| T0170 | D2 Signal hygiene | connect=4, disconnect=3 | |
| T0171 | D3 Timer/source | timer/source sites=2 | |
| T0172 | D4 Settings parity | settings reads=6, PrefsFields=0 | |
| T0173 | D5 Feature wiring | subsystem sites=0 | |
| T0174 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0175 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0176 | D8 Error path | try sites=11, async=0 | |
| T0177 | D9 Logic/state | state sites=0 | |
| T0178 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0179 | D11 Dead code/orphan | exports/classes=2, dbus=0 | |
| T0180 | D12 Language/i18n | exports/classes=2, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U1-15</summary>

- **conn** (4): `alienware-advanced-alt-tab@hsx2coder/extension.js:84`, `alienware-advanced-alt-tab@hsx2coder/extension.js:178`, `alienware-advanced-alt-tab@hsx2coder/extension.js:294`, `alienware-advanced-alt-tab@hsx2coder/extension.js:299`
- **disc** (3): `alienware-advanced-alt-tab@hsx2coder/extension.js:100`, `alienware-advanced-alt-tab@hsx2coder/extension.js:188`, `alienware-advanced-alt-tab@hsx2coder/extension.js:335`
- **timer** (2): `alienware-advanced-alt-tab@hsx2coder/extension.js:302`, `alienware-advanced-alt-tab@hsx2coder/extension.js:339`
- **sett** (6): `alienware-advanced-alt-tab@hsx2coder/extension.js:179`, `alienware-advanced-alt-tab@hsx2coder/extension.js:404`, `alienware-advanced-alt-tab@hsx2coder/extension.js:413`, `alienware-advanced-alt-tab@hsx2coder/extension.js:423`
- **cls** (2): `alienware-advanced-alt-tab@hsx2coder/extension.js:41`, `alienware-advanced-alt-tab@hsx2coder/extension.js:362`
- **disp** (4): `alienware-advanced-alt-tab@hsx2coder/extension.js:102`, `alienware-advanced-alt-tab@hsx2coder/extension.js:120`, `alienware-advanced-alt-tab@hsx2coder/extension.js:327`, `alienware-advanced-alt-tab@hsx2coder/extension.js:328`
- **catch** (11): `alienware-advanced-alt-tab@hsx2coder/extension.js:55`, `alienware-advanced-alt-tab@hsx2coder/extension.js:91`, `alienware-advanced-alt-tab@hsx2coder/extension.js:98`, `alienware-advanced-alt-tab@hsx2coder/extension.js:128`

</details>

### 3.2 alienware-dash-to-panel

| Unit | Path | LOC | Files |
|---|---|---|---|
| U2-01 | `alienware-dash-to-panel@hsx2coder/appIcons.js` | 2725 | - |
| U2-02 | `alienware-dash-to-panel@hsx2coder/media/Lyrics` | 1011 | - |
| U2-03 | `alienware-dash-to-panel@hsx2coder/media/MediaController.js` | 254 | - |
| U2-04 | `alienware-dash-to-panel@hsx2coder/media/extension.js` | 34 | - |
| U2-05 | `alienware-dash-to-panel@hsx2coder/media/lib` | 87 | - |
| U2-06 | `alienware-dash-to-panel@hsx2coder/media/prefs.js` | 34 | - |
| U2-07 | `alienware-dash-to-panel@hsx2coder/media/ui` | 2307 | - |
| U2-08 | `alienware-dash-to-panel@hsx2coder/media/utils/icon` | 394 | - |
| U2-09 | `alienware-dash-to-panel@hsx2coder/media/utils/indicator` | 1948 | - |
| U2-10 | `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js` | 317 | - |
| U2-11 | `alienware-dash-to-panel@hsx2coder/media/utils/mpris` | 1080 | - |
| U2-12 | `alienware-dash-to-panel@hsx2coder/media/utils/ui` | 4373 | - |
| U2-13 | `alienware-dash-to-panel@hsx2coder/panel.js` | 1721 | - |
| U2-14 | `alienware-dash-to-panel@hsx2coder/panelManager.js` | 1183 | - |
| U2-15 | `alienware-dash-to-panel@hsx2coder/prefs.js` | 4463 | - |
| U2-16 | `alienware-dash-to-panel@hsx2coder/taskbar.js` | 1839 | - |
| U2-17 | `alienware-dash-to-panel@hsx2coder/utils.js` | 987 | - |
| U2-18 | `alienware-dash-to-panel@hsx2coder/windowPreview.js` | 1431 | - |
| U2-19 | `alienware-dash-to-panel@hsx2coder/{assets}` | 0 | 3 |
| U2-20 | `alienware-dash-to-panel@hsx2coder/{small}` | 4471 | 13 |

#### U2-01 — `alienware-dash-to-panel@hsx2coder/appIcons.js` (2725 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0181 | D1 Lifecycle | destroy/dispose sites=7 | |
| T0182 | D2 Signal hygiene | connect=24, disconnect=8 | |
| T0183 | D3 Timer/source | timer/source sites=4 | |
| T0184 | D4 Settings parity | settings reads=73, PrefsFields=0 | |
| T0185 | D5 Feature wiring | subsystem sites=0 | |
| T0186 | D6 UI/action | menu item sites=3, action-connect=8 | |
| T0187 | D7 API GNOME 50 | theme/stylesheet refs=1 | |
| T0188 | D8 Error path | try sites=32, async=0 | |
| T0189 | D9 Logic/state | state sites=0 | |
| T0190 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0191 | D11 Dead code/orphan | exports/classes=1, dbus=0 | |
| T0192 | D12 Language/i18n | exports/classes=1, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-01</summary>

- **conn** (24): `alienware-dash-to-panel@hsx2coder/appIcons.js:516`, `alienware-dash-to-panel@hsx2coder/appIcons.js:524`, `alienware-dash-to-panel@hsx2coder/appIcons.js:640`, `alienware-dash-to-panel@hsx2coder/appIcons.js:648`
- **disc** (8): `alienware-dash-to-panel@hsx2coder/appIcons.js:213`, `alienware-dash-to-panel@hsx2coder/appIcons.js:528`, `alienware-dash-to-panel@hsx2coder/appIcons.js:540`, `alienware-dash-to-panel@hsx2coder/appIcons.js:642`
- **timer** (4): `alienware-dash-to-panel@hsx2coder/appIcons.js:452`, `alienware-dash-to-panel@hsx2coder/appIcons.js:488`, `alienware-dash-to-panel@hsx2coder/appIcons.js:1803`, `alienware-dash-to-panel@hsx2coder/appIcons.js:2068`
- **sett** (73): `alienware-dash-to-panel@hsx2coder/appIcons.js:163`, `alienware-dash-to-panel@hsx2coder/appIcons.js:247`, `alienware-dash-to-panel@hsx2coder/appIcons.js:417`, `alienware-dash-to-panel@hsx2coder/appIcons.js:419`
- **menu** (3): `alienware-dash-to-panel@hsx2coder/appIcons.js:2652`, `alienware-dash-to-panel@hsx2coder/appIcons.js:2657`, `alienware-dash-to-panel@hsx2coder/appIcons.js:2658`
- **act** (8): `alienware-dash-to-panel@hsx2coder/appIcons.js:2065`, `alienware-dash-to-panel@hsx2coder/appIcons.js:2107`, `alienware-dash-to-panel@hsx2coder/appIcons.js:2353`, `alienware-dash-to-panel@hsx2coder/appIcons.js:2550`
- **cls** (1): `alienware-dash-to-panel@hsx2coder/appIcons.js:1915`
- **disp** (7): `alienware-dash-to-panel@hsx2coder/appIcons.js:448`, `alienware-dash-to-panel@hsx2coder/appIcons.js:449`, `alienware-dash-to-panel@hsx2coder/appIcons.js:456`, `alienware-dash-to-panel@hsx2coder/appIcons.js:457`
- **theme** (1): `alienware-dash-to-panel@hsx2coder/appIcons.js:67`
- **catch** (32): `alienware-dash-to-panel@hsx2coder/appIcons.js:1958`, `alienware-dash-to-panel@hsx2coder/appIcons.js:2002`, `alienware-dash-to-panel@hsx2coder/appIcons.js:2005`, `alienware-dash-to-panel@hsx2coder/appIcons.js:2010`

</details>

#### U2-02 — `alienware-dash-to-panel@hsx2coder/media/Lyrics` (1011 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0193 | D1 Lifecycle | destroy/dispose sites=3 | |
| T0194 | D2 Signal hygiene | connect=1, disconnect=1 | |
| T0195 | D3 Timer/source | timer/source sites=8 | |
| T0196 | D4 Settings parity | settings reads=2, PrefsFields=0 | |
| T0197 | D5 Feature wiring | subsystem sites=0 | |
| T0198 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0199 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0200 | D8 Error path | try sites=5, async=12 | |
| T0201 | D9 Logic/state | state sites=9 | |
| T0202 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0203 | D11 Dead code/orphan | exports/classes=1, dbus=0 | |
| T0204 | D12 Language/i18n | exports/classes=1, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-02</summary>

- **conn** (1): `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:146`
- **disc** (1): `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:784`
- **timer** (8): `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:249`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:267`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:275`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:280`
- **sett** (2): `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:157`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:211`
- **cls** (1): `alienware-dash-to-panel@hsx2coder/media/Lyrics/client/_LyricsClient.js:9`
- **state** (9): `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:111`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:253`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:300`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:310`
- **disp** (3): `alienware-dash-to-panel@hsx2coder/media/Lyrics/client/_LyricsClient.js:51`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:772`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:797`
- **async** (12): `alienware-dash-to-panel@hsx2coder/media/Lyrics/client/_LyricsClient.js:24`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/client/_LyricsClient.js:37`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/client/_LyricsClient.js:78`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/client/_LyricsClient.js:93`
- **catch** (5): `alienware-dash-to-panel@hsx2coder/media/Lyrics/client/_LyricsClient.js:36`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:191`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:193`, `alienware-dash-to-panel@hsx2coder/media/Lyrics/widgets/_LyricsWidget.js:215`

</details>

#### U2-03 — `alienware-dash-to-panel@hsx2coder/media/MediaController.js` (254 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0205 | D1 Lifecycle | destroy/dispose sites=1 | |
| T0206 | D2 Signal hygiene | connect=6, disconnect=5 | |
| T0207 | D3 Timer/source | timer/source sites=0 | |
| T0208 | D4 Settings parity | settings reads=6, PrefsFields=0 | |
| T0209 | D5 Feature wiring | subsystem sites=0 | |
| T0210 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0211 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0212 | D8 Error path | try sites=4, async=0 | |
| T0213 | D9 Logic/state | state sites=0 | |
| T0214 | D10 Panel law & cohesion | panel-write refs=9 | |
| T0215 | D11 Dead code/orphan | exports/classes=1, dbus=0 | |
| T0216 | D12 Language/i18n | exports/classes=1, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-03</summary>

- **conn** (6): `alienware-dash-to-panel@hsx2coder/media/MediaController.js:61`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:72`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:85`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:95`
- **disc** (5): `alienware-dash-to-panel@hsx2coder/media/MediaController.js:108`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:113`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:120`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:124`
- **sett** (6): `alienware-dash-to-panel@hsx2coder/media/MediaController.js:69`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:76`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:97`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:157`
- **cls** (1): `alienware-dash-to-panel@hsx2coder/media/MediaController.js:11`
- **disp** (1): `alienware-dash-to-panel@hsx2coder/media/MediaController.js:134`
- **panelwrite** (9): `alienware-dash-to-panel@hsx2coder/media/MediaController.js:181`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:181`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:182`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:182`
- **catch** (4): `alienware-dash-to-panel@hsx2coder/media/MediaController.js:25`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:44`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:134`, `alienware-dash-to-panel@hsx2coder/media/MediaController.js:134`

</details>

#### U2-04 — `alienware-dash-to-panel@hsx2coder/media/extension.js` (34 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0217 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0218 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0219 | D3 Timer/source | timer/source sites=0 | |
| T0220 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0221 | D5 Feature wiring | subsystem sites=0 | |
| T0222 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0223 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0224 | D8 Error path | try sites=0, async=0 | |
| T0225 | D9 Logic/state | state sites=0 | |
| T0226 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0227 | D11 Dead code/orphan | exports/classes=1, dbus=0 | |
| T0228 | D12 Language/i18n | exports/classes=1, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-04</summary>

- **cls** (1): `alienware-dash-to-panel@hsx2coder/media/extension.js:19`

</details>

#### U2-05 — `alienware-dash-to-panel@hsx2coder/media/lib` (87 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0229 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0230 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0231 | D3 Timer/source | timer/source sites=0 | |
| T0232 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0233 | D5 Feature wiring | subsystem sites=0 | |
| T0234 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0235 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0236 | D8 Error path | try sites=0, async=0 | |
| T0237 | D9 Logic/state | state sites=0 | |
| T0238 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0239 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0240 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-05</summary>


</details>

#### U2-06 — `alienware-dash-to-panel@hsx2coder/media/prefs.js` (34 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0241 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0242 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0243 | D3 Timer/source | timer/source sites=0 | |
| T0244 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0245 | D5 Feature wiring | subsystem sites=0 | |
| T0246 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0247 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0248 | D8 Error path | try sites=0, async=0 | |
| T0249 | D9 Logic/state | state sites=0 | |
| T0250 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0251 | D11 Dead code/orphan | exports/classes=1, dbus=0 | |
| T0252 | D12 Language/i18n | exports/classes=1, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-06</summary>

- **cls** (1): `alienware-dash-to-panel@hsx2coder/media/prefs.js:17`

</details>

#### U2-07 — `alienware-dash-to-panel@hsx2coder/media/ui` (2307 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0253 | D1 Lifecycle | destroy/dispose sites=1 | |
| T0254 | D2 Signal hygiene | connect=34, disconnect=6 | |
| T0255 | D3 Timer/source | timer/source sites=6 | |
| T0256 | D4 Settings parity | settings reads=36, PrefsFields=0 | |
| T0257 | D5 Feature wiring | subsystem sites=0 | |
| T0258 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0259 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0260 | D8 Error path | try sites=34, async=1 | |
| T0261 | D9 Logic/state | state sites=0 | |
| T0262 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0263 | D11 Dead code/orphan | exports/classes=0, dbus=8 | |
| T0264 | D12 Language/i18n | exports/classes=0, dbus=8 | |

<details><summary>Vị trí quét tĩnh của U2-07</summary>

- **conn** (34): `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:81`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:91`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:232`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:245`
- **disc** (6): `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:271`, `alienware-dash-to-panel@hsx2coder/media/ui/generalPage.js:252`, `alienware-dash-to-panel@hsx2coder/media/ui/lyricsPage.js:241`, `alienware-dash-to-panel@hsx2coder/media/ui/lyricsPage.js:242`
- **timer** (6): `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:218`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:234`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:238`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:268`
- **sett** (36): `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:66`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:122`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:206`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:262`
- **dbus** (8): `alienware-dash-to-panel@hsx2coder/media/ui/playerFilterPage.js:169`, `alienware-dash-to-panel@hsx2coder/media/ui/playerFilterPage.js:169`, `alienware-dash-to-panel@hsx2coder/media/ui/playerFilterPage.js:176`, `alienware-dash-to-panel@hsx2coder/media/ui/playerFilterPage.js:184`
- **disp** (1): `alienware-dash-to-panel@hsx2coder/media/ui/playerFilterPage.js:405`
- **async** (1): `alienware-dash-to-panel@hsx2coder/media/ui/playerFilterPage.js:7`
- **catch** (34): `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:19`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:29`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:271`, `alienware-dash-to-panel@hsx2coder/media/ui/appearancePage.js:271`

</details>

#### U2-08 — `alienware-dash-to-panel@hsx2coder/media/utils/icon` (394 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0265 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0266 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0267 | D3 Timer/source | timer/source sites=0 | |
| T0268 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0269 | D5 Feature wiring | subsystem sites=0 | |
| T0270 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0271 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0272 | D8 Error path | try sites=18, async=0 | |
| T0273 | D9 Logic/state | state sites=0 | |
| T0274 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0275 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0276 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-08</summary>

- **catch** (18): `alienware-dash-to-panel@hsx2coder/media/utils/icon/IconResolver.js:42`, `alienware-dash-to-panel@hsx2coder/media/utils/icon/IconResolver.js:45`, `alienware-dash-to-panel@hsx2coder/media/utils/icon/IconResolver.js:62`, `alienware-dash-to-panel@hsx2coder/media/utils/icon/IconResolver.js:93`

</details>

#### U2-09 — `alienware-dash-to-panel@hsx2coder/media/utils/indicator` (1948 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0277 | D1 Lifecycle | destroy/dispose sites=8 | |
| T0278 | D2 Signal hygiene | connect=5, disconnect=5 | |
| T0279 | D3 Timer/source | timer/source sites=30 | |
| T0280 | D4 Settings parity | settings reads=17, PrefsFields=0 | |
| T0281 | D5 Feature wiring | subsystem sites=0 | |
| T0282 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0283 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0284 | D8 Error path | try sites=50, async=0 | |
| T0285 | D9 Logic/state | state sites=0 | |
| T0286 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0287 | D11 Dead code/orphan | exports/classes=5, dbus=0 | |
| T0288 | D12 Language/i18n | exports/classes=5, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-09</summary>

- **conn** (5): `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorEventHandlers.js:244`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/PanelUI.js:131`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/PanelUI.js:137`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/PanelUI.js:148`
- **disc** (5): `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorEventHandlers.js:454`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/PanelUI.js:582`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/PanelUI.js:587`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/PanelUI.js:593`
- **timer** (30): `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorEventHandlers.js:183`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorEventHandlers.js:198`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorEventHandlers.js:234`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorEventHandlers.js:238`
- **sett** (17): `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorEventHandlers.js:570`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorUIUpdater.js:228`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorUIUpdater.js:247`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorUIUpdater.js:249`
- **cls** (5): `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorEventHandlers.js:5`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorPlayerHandlers.js:3`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorState.js:3`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorUIUpdater.js:20`
- **disp** (8): `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorEventHandlers.js:586`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorPlayerHandlers.js:235`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorState.js:135`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/PanelUI.js:364`
- **catch** (50): `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorState.js:95`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorState.js:98`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorUIUpdater.js:33`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator/IndicatorUIUpdater.js:39`

</details>

#### U2-10 — `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js` (317 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0289 | D1 Lifecycle | destroy/dispose sites=9 | |
| T0290 | D2 Signal hygiene | connect=2, disconnect=2 | |
| T0291 | D3 Timer/source | timer/source sites=4 | |
| T0292 | D4 Settings parity | settings reads=1, PrefsFields=0 | |
| T0293 | D5 Feature wiring | subsystem sites=0 | |
| T0294 | D6 UI/action | menu item sites=1, action-connect=0 | |
| T0295 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0296 | D8 Error path | try sites=4, async=2 | |
| T0297 | D9 Logic/state | state sites=34 | |
| T0298 | D10 Panel law & cohesion | panel-write refs=2 | |
| T0299 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0300 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-10</summary>

- **conn** (2): `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:43`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:71`
- **disc** (2): `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:276`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:281`
- **timer** (4): `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:97`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:106`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:158`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:180`
- **sett** (1): `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:114`
- **menu** (1): `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:39`
- **state** (34): `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:25`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:47`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:54`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:71`
- **disp** (9): `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:168`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:246`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:286`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:291`
- **panelwrite** (2): `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:119`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:119`
- **async** (2): `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:195`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:200`
- **catch** (4): `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:196`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:240`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:247`, `alienware-dash-to-panel@hsx2coder/media/utils/indicator.js:249`

</details>

#### U2-11 — `alienware-dash-to-panel@hsx2coder/media/utils/mpris` (1080 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0301 | D1 Lifecycle | destroy/dispose sites=3 | |
| T0302 | D2 Signal hygiene | connect=1, disconnect=1 | |
| T0303 | D3 Timer/source | timer/source sites=18 | |
| T0304 | D4 Settings parity | settings reads=3, PrefsFields=0 | |
| T0305 | D5 Feature wiring | subsystem sites=0 | |
| T0306 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0307 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0308 | D8 Error path | try sites=34, async=15 | |
| T0309 | D9 Logic/state | state sites=0 | |
| T0310 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0311 | D11 Dead code/orphan | exports/classes=3, dbus=14 | |
| T0312 | D12 Language/i18n | exports/classes=3, dbus=14 | |

<details><summary>Vị trí quét tĩnh của U2-11</summary>

- **conn** (1): `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisPlayer.js:45`
- **disc** (1): `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisPlayer.js:281`
- **timer** (18): `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:116`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:134`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:185`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:189`
- **sett** (3): `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:64`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:73`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisUtils.js:9`
- **dbus** (14): `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:157`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:197`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:209`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:226`
- **cls** (3): `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:7`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisPlayer.js:6`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisUtils.js:5`
- **disp** (3): `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:450`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:488`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisPlayer.js:472`
- **async** (15): `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:196`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:214`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:217`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:229`
- **catch** (34): `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:63`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:65`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:72`, `alienware-dash-to-panel@hsx2coder/media/utils/mpris/MprisManager.js:74`

</details>

#### U2-12 — `alienware-dash-to-panel@hsx2coder/media/utils/ui` (4373 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0313 | D1 Lifecycle | destroy/dispose sites=22 | |
| T0314 | D2 Signal hygiene | connect=48, disconnect=21 | |
| T0315 | D3 Timer/source | timer/source sites=26 | |
| T0316 | D4 Settings parity | settings reads=34, PrefsFields=0 | |
| T0317 | D5 Feature wiring | subsystem sites=0 | |
| T0318 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0319 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0320 | D8 Error path | try sites=86, async=2 | |
| T0321 | D9 Logic/state | state sites=0 | |
| T0322 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0323 | D11 Dead code/orphan | exports/classes=0, dbus=2 | |
| T0324 | D12 Language/i18n | exports/classes=0, dbus=2 | |

<details><summary>Vị trí quét tĩnh của U2-12</summary>

- **conn** (48): `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:63`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:71`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/ControlButtons.js:101`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/ControlButtons.js:105`
- **disc** (21): `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:890`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:894`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/ControlButtons.js:309`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/ControlButtons.js:313`
- **timer** (26): `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:595`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:826`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/MediaControls.js:613`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/MediaControls.js:630`
- **sett** (34): `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:23`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:191`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:277`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:324`
- **dbus** (2): `alienware-dash-to-panel@hsx2coder/media/utils/ui/ProgressSlider.js:257`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/ProgressSlider.js:264`
- **disp** (22): `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:877`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:904`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:909`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/ControlButtons.js:307`
- **async** (2): `alienware-dash-to-panel@hsx2coder/media/utils/ui/MediaControls.js:705`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/MediaControls.js:728`
- **catch** (86): `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:22`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:24`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:139`, `alienware-dash-to-panel@hsx2coder/media/utils/ui/AlbumArt.js:181`

</details>

#### U2-13 — `alienware-dash-to-panel@hsx2coder/panel.js` (1721 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0325 | D1 Lifecycle | destroy/dispose sites=10 | |
| T0326 | D2 Signal hygiene | connect=6, disconnect=2 | |
| T0327 | D3 Timer/source | timer/source sites=2 | |
| T0328 | D4 Settings parity | settings reads=20, PrefsFields=0 | |
| T0329 | D5 Feature wiring | subsystem sites=0 | |
| T0330 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0331 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0332 | D8 Error path | try sites=0, async=0 | |
| T0333 | D9 Logic/state | state sites=0 | |
| T0334 | D10 Panel law & cohesion | panel-write refs=111 | |
| T0335 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0336 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-13</summary>

- **conn** (6): `alienware-dash-to-panel@hsx2coder/panel.js:1376`, `alienware-dash-to-panel@hsx2coder/panel.js:1380`, `alienware-dash-to-panel@hsx2coder/panel.js:1483`, `alienware-dash-to-panel@hsx2coder/panel.js:1488`
- **disc** (2): `alienware-dash-to-panel@hsx2coder/panel.js:1406`, `alienware-dash-to-panel@hsx2coder/panel.js:1407`
- **timer** (2): `alienware-dash-to-panel@hsx2coder/panel.js:427`, `alienware-dash-to-panel@hsx2coder/panel.js:451`
- **sett** (20): `alienware-dash-to-panel@hsx2coder/panel.js:109`, `alienware-dash-to-panel@hsx2coder/panel.js:306`, `alienware-dash-to-panel@hsx2coder/panel.js:801`, `alienware-dash-to-panel@hsx2coder/panel.js:802`
- **disp** (10): `alienware-dash-to-panel@hsx2coder/panel.js:439`, `alienware-dash-to-panel@hsx2coder/panel.js:443`, `alienware-dash-to-panel@hsx2coder/panel.js:447`, `alienware-dash-to-panel@hsx2coder/panel.js:448`
- **panelwrite** (111): `alienware-dash-to-panel@hsx2coder/panel.js:71`, `alienware-dash-to-panel@hsx2coder/panel.js:71`, `alienware-dash-to-panel@hsx2coder/panel.js:71`, `alienware-dash-to-panel@hsx2coder/panel.js:71`

</details>

#### U2-14 — `alienware-dash-to-panel@hsx2coder/panelManager.js` (1183 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0337 | D1 Lifecycle | destroy/dispose sites=12 | |
| T0338 | D2 Signal hygiene | connect=5, disconnect=5 | |
| T0339 | D3 Timer/source | timer/source sites=6 | |
| T0340 | D4 Settings parity | settings reads=12, PrefsFields=0 | |
| T0341 | D5 Feature wiring | subsystem sites=0 | |
| T0342 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0343 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0344 | D8 Error path | try sites=0, async=4 | |
| T0345 | D9 Logic/state | state sites=0 | |
| T0346 | D10 Panel law & cohesion | panel-write refs=39 | |
| T0347 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0348 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-14</summary>

- **conn** (5): `alienware-dash-to-panel@hsx2coder/panelManager.js:145`, `alienware-dash-to-panel@hsx2coder/panelManager.js:151`, `alienware-dash-to-panel@hsx2coder/panelManager.js:780`, `alienware-dash-to-panel@hsx2coder/panelManager.js:883`
- **disc** (5): `alienware-dash-to-panel@hsx2coder/panelManager.js:354`, `alienware-dash-to-panel@hsx2coder/panelManager.js:418`, `alienware-dash-to-panel@hsx2coder/panelManager.js:421`, `alienware-dash-to-panel@hsx2coder/panelManager.js:901`
- **timer** (6): `alienware-dash-to-panel@hsx2coder/panelManager.js:123`, `alienware-dash-to-panel@hsx2coder/panelManager.js:278`, `alienware-dash-to-panel@hsx2coder/panelManager.js:338`, `alienware-dash-to-panel@hsx2coder/panelManager.js:446`
- **sett** (12): `alienware-dash-to-panel@hsx2coder/panelManager.js:67`, `alienware-dash-to-panel@hsx2coder/panelManager.js:92`, `alienware-dash-to-panel@hsx2coder/panelManager.js:100`, `alienware-dash-to-panel@hsx2coder/panelManager.js:329`
- **keyb** (2): `alienware-dash-to-panel@hsx2coder/panelManager.js:857`, `alienware-dash-to-panel@hsx2coder/panelManager.js:860`
- **disp** (12): `alienware-dash-to-panel@hsx2coder/panelManager.js:342`, `alienware-dash-to-panel@hsx2coder/panelManager.js:372`, `alienware-dash-to-panel@hsx2coder/panelManager.js:409`, `alienware-dash-to-panel@hsx2coder/panelManager.js:411`
- **panelwrite** (39): `alienware-dash-to-panel@hsx2coder/panelManager.js:186`, `alienware-dash-to-panel@hsx2coder/panelManager.js:186`, `alienware-dash-to-panel@hsx2coder/panelManager.js:204`, `alienware-dash-to-panel@hsx2coder/panelManager.js:204`
- **async** (4): `alienware-dash-to-panel@hsx2coder/panelManager.js:287`, `alienware-dash-to-panel@hsx2coder/panelManager.js:289`, `alienware-dash-to-panel@hsx2coder/panelManager.js:299`, `alienware-dash-to-panel@hsx2coder/panelManager.js:301`

</details>

#### U2-15 — `alienware-dash-to-panel@hsx2coder/prefs.js` (4463 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0349 | D1 Lifecycle | destroy/dispose sites=2 | |
| T0350 | D2 Signal hygiene | connect=126, disconnect=2 | |
| T0351 | D3 Timer/source | timer/source sites=1 | |
| T0352 | D4 Settings parity | settings reads=178, PrefsFields=0 | |
| T0353 | D5 Feature wiring | subsystem sites=0 | |
| T0354 | D6 UI/action | menu item sites=0, action-connect=28 | |
| T0355 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0356 | D8 Error path | try sites=21, async=3 | |
| T0357 | D9 Logic/state | state sites=0 | |
| T0358 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0359 | D11 Dead code/orphan | exports/classes=1, dbus=0 | |
| T0360 | D12 Language/i18n | exports/classes=1, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-15</summary>

- **conn** (126): `alienware-dash-to-panel@hsx2coder/prefs.js:386`, `alienware-dash-to-panel@hsx2coder/prefs.js:397`, `alienware-dash-to-panel@hsx2coder/prefs.js:698`, `alienware-dash-to-panel@hsx2coder/prefs.js:699`
- **disc** (2): `alienware-dash-to-panel@hsx2coder/prefs.js:1439`, `alienware-dash-to-panel@hsx2coder/prefs.js:4458`
- **timer** (1): `alienware-dash-to-panel@hsx2coder/prefs.js:3726`
- **sett** (178): `alienware-dash-to-panel@hsx2coder/prefs.js:110`, `alienware-dash-to-panel@hsx2coder/prefs.js:124`, `alienware-dash-to-panel@hsx2coder/prefs.js:375`, `alienware-dash-to-panel@hsx2coder/prefs.js:424`
- **act** (28): `alienware-dash-to-panel@hsx2coder/prefs.js:698`, `alienware-dash-to-panel@hsx2coder/prefs.js:699`, `alienware-dash-to-panel@hsx2coder/prefs.js:702`, `alienware-dash-to-panel@hsx2coder/prefs.js:728`
- **cls** (1): `alienware-dash-to-panel@hsx2coder/prefs.js:4444`
- **disp** (2): `alienware-dash-to-panel@hsx2coder/prefs.js:771`, `alienware-dash-to-panel@hsx2coder/prefs.js:4291`
- **async** (3): `alienware-dash-to-panel@hsx2coder/prefs.js:368`, `alienware-dash-to-panel@hsx2coder/prefs.js:369`, `alienware-dash-to-panel@hsx2coder/prefs.js:4350`
- **catch** (21): `alienware-dash-to-panel@hsx2coder/prefs.js:32`, `alienware-dash-to-panel@hsx2coder/prefs.js:36`, `alienware-dash-to-panel@hsx2coder/prefs.js:53`, `alienware-dash-to-panel@hsx2coder/prefs.js:55`

</details>

#### U2-16 — `alienware-dash-to-panel@hsx2coder/taskbar.js` (1839 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0361 | D1 Lifecycle | destroy/dispose sites=14 | |
| T0362 | D2 Signal hygiene | connect=19, disconnect=5 | |
| T0363 | D3 Timer/source | timer/source sites=3 | |
| T0364 | D4 Settings parity | settings reads=20, PrefsFields=0 | |
| T0365 | D5 Feature wiring | subsystem sites=0 | |
| T0366 | D6 UI/action | menu item sites=0, action-connect=1 | |
| T0367 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0368 | D8 Error path | try sites=2, async=0 | |
| T0369 | D9 Logic/state | state sites=0 | |
| T0370 | D10 Panel law & cohesion | panel-write refs=2 | |
| T0371 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0372 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-16</summary>

- **conn** (19): `alienware-dash-to-panel@hsx2coder/taskbar.js:278`, `alienware-dash-to-panel@hsx2coder/taskbar.js:279`, `alienware-dash-to-panel@hsx2coder/taskbar.js:280`, `alienware-dash-to-panel@hsx2coder/taskbar.js:284`
- **disc** (5): `alienware-dash-to-panel@hsx2coder/taskbar.js:748`, `alienware-dash-to-panel@hsx2coder/taskbar.js:749`, `alienware-dash-to-panel@hsx2coder/taskbar.js:1515`, `alienware-dash-to-panel@hsx2coder/taskbar.js:1681`
- **timer** (3): `alienware-dash-to-panel@hsx2coder/taskbar.js:464`, `alienware-dash-to-panel@hsx2coder/taskbar.js:632`, `alienware-dash-to-panel@hsx2coder/taskbar.js:1683`
- **sett** (20): `alienware-dash-to-panel@hsx2coder/taskbar.js:85`, `alienware-dash-to-panel@hsx2coder/taskbar.js:86`, `alienware-dash-to-panel@hsx2coder/taskbar.js:90`, `alienware-dash-to-panel@hsx2coder/taskbar.js:92`
- **act** (1): `alienware-dash-to-panel@hsx2coder/taskbar.js:844`
- **disp** (14): `alienware-dash-to-panel@hsx2coder/taskbar.js:462`, `alienware-dash-to-panel@hsx2coder/taskbar.js:468`, `alienware-dash-to-panel@hsx2coder/taskbar.js:469`, `alienware-dash-to-panel@hsx2coder/taskbar.js:471`
- **panelwrite** (2): `alienware-dash-to-panel@hsx2coder/taskbar.js:1630`, `alienware-dash-to-panel@hsx2coder/taskbar.js:1631`
- **catch** (2): `alienware-dash-to-panel@hsx2coder/taskbar.js:48`, `alienware-dash-to-panel@hsx2coder/taskbar.js:53`

</details>

#### U2-17 — `alienware-dash-to-panel@hsx2coder/utils.js` (987 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0373 | D1 Lifecycle | destroy/dispose sites=1 | |
| T0374 | D2 Signal hygiene | connect=1, disconnect=1 | |
| T0375 | D3 Timer/source | timer/source sites=1 | |
| T0376 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0377 | D5 Feature wiring | subsystem sites=0 | |
| T0378 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0379 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0380 | D8 Error path | try sites=2, async=0 | |
| T0381 | D9 Logic/state | state sites=0 | |
| T0382 | D10 Panel law & cohesion | panel-write refs=2 | |
| T0383 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0384 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-17</summary>

- **conn** (1): `alienware-dash-to-panel@hsx2coder/utils.js:110`
- **disc** (1): `alienware-dash-to-panel@hsx2coder/utils.js:122`
- **timer** (1): `alienware-dash-to-panel@hsx2coder/utils.js:160`
- **keyb** (6): `alienware-dash-to-panel@hsx2coder/utils.js:359`, `alienware-dash-to-panel@hsx2coder/utils.js:360`, `alienware-dash-to-panel@hsx2coder/utils.js:361`, `alienware-dash-to-panel@hsx2coder/utils.js:371`
- **disp** (1): `alienware-dash-to-panel@hsx2coder/utils.js:54`
- **panelwrite** (2): `alienware-dash-to-panel@hsx2coder/utils.js:249`, `alienware-dash-to-panel@hsx2coder/utils.js:249`
- **catch** (2): `alienware-dash-to-panel@hsx2coder/utils.js:109`, `alienware-dash-to-panel@hsx2coder/utils.js:113`

</details>

#### U2-18 — `alienware-dash-to-panel@hsx2coder/windowPreview.js` (1431 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0385 | D1 Lifecycle | destroy/dispose sites=9 | |
| T0386 | D2 Signal hygiene | connect=7, disconnect=1 | |
| T0387 | D3 Timer/source | timer/source sites=2 | |
| T0388 | D4 Settings parity | settings reads=29, PrefsFields=0 | |
| T0389 | D5 Feature wiring | subsystem sites=0 | |
| T0390 | D6 UI/action | menu item sites=2, action-connect=2 | |
| T0391 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0392 | D8 Error path | try sites=0, async=0 | |
| T0393 | D9 Logic/state | state sites=0 | |
| T0394 | D10 Panel law & cohesion | panel-write refs=7 | |
| T0395 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0396 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-18</summary>

- **conn** (7): `alienware-dash-to-panel@hsx2coder/windowPreview.js:936`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:937`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:938`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:941`
- **disc** (1): `alienware-dash-to-panel@hsx2coder/windowPreview.js:1176`
- **timer** (2): `alienware-dash-to-panel@hsx2coder/windowPreview.js:992`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:1067`
- **sett** (29): `alienware-dash-to-panel@hsx2coder/windowPreview.js:168`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:271`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:275`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:398`
- **menu** (2): `alienware-dash-to-panel@hsx2coder/windowPreview.js:1154`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:1167`
- **act** (2): `alienware-dash-to-panel@hsx2coder/windowPreview.js:936`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:1168`
- **disp** (9): `alienware-dash-to-panel@hsx2coder/windowPreview.js:158`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:159`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:329`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:608`
- **panelwrite** (7): `alienware-dash-to-panel@hsx2coder/windowPreview.js:124`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:490`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:490`, `alienware-dash-to-panel@hsx2coder/windowPreview.js:510`

</details>

#### U2-19 — `alienware-dash-to-panel@hsx2coder/{assets}` (0 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0397 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0398 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0399 | D3 Timer/source | timer/source sites=0 | |
| T0400 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0401 | D5 Feature wiring | subsystem sites=0 | |
| T0402 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0403 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0404 | D8 Error path | try sites=0, async=0 | |
| T0405 | D9 Logic/state | state sites=0 | |
| T0406 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0407 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0408 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U2-19</summary>


</details>

#### U2-20 — `alienware-dash-to-panel@hsx2coder/{small}` (4471 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0409 | D1 Lifecycle | destroy/dispose sites=26 | |
| T0410 | D2 Signal hygiene | connect=21, disconnect=16 | |
| T0411 | D3 Timer/source | timer/source sites=18 | |
| T0412 | D4 Settings parity | settings reads=81, PrefsFields=0 | |
| T0413 | D5 Feature wiring | subsystem sites=0 | |
| T0414 | D6 UI/action | menu item sites=28, action-connect=2 | |
| T0415 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0416 | D8 Error path | try sites=78, async=5 | |
| T0417 | D9 Logic/state | state sites=18 | |
| T0418 | D10 Panel law & cohesion | panel-write refs=79 | |
| T0419 | D11 Dead code/orphan | exports/classes=5, dbus=12 | |
| T0420 | D12 Language/i18n | exports/classes=5, dbus=12 | |

<details><summary>Vị trí quét tĩnh của U2-20</summary>

- **conn** (21): `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:132`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:176`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:232`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:433`
- **disc** (16): `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:233`, `alienware-dash-to-panel@hsx2coder/desktopIconsIntegration.js:132`, `alienware-dash-to-panel@hsx2coder/extension.js:216`, `alienware-dash-to-panel@hsx2coder/intellihide.js:164`
- **timer** (18): `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:126`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:146`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:196`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:379`
- **sett** (81): `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:306`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:376`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:435`, `alienware-dash-to-panel@hsx2coder/extension.js:109`
- **menu** (28): `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:162`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:166`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:167`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:168`
- **act** (2): `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:176`, `alienware-dash-to-panel@hsx2coder/weather.js:145`
- **keyb** (8): `alienware-dash-to-panel@hsx2coder/overview.js:337`, `alienware-dash-to-panel@hsx2coder/overview.js:340`, `alienware-dash-to-panel@hsx2coder/overview.js:368`, `alienware-dash-to-panel@hsx2coder/overview.js:395`
- **dbus** (12): `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:191`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:192`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:259`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:261`
- **cls** (5): `alienware-dash-to-panel@hsx2coder/desktopIconsIntegration.js:65`, `alienware-dash-to-panel@hsx2coder/extension.js:57`, `alienware-dash-to-panel@hsx2coder/extension.js:298`, `alienware-dash-to-panel@hsx2coder/proximity.js:37`
- **state** (18): `alienware-dash-to-panel@hsx2coder/notificationsMonitor.js:35`, `alienware-dash-to-panel@hsx2coder/notificationsMonitor.js:63`, `alienware-dash-to-panel@hsx2coder/notificationsMonitor.js:94`, `alienware-dash-to-panel@hsx2coder/notificationsMonitor.js:94`
- **disp** (26): `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:472`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:478`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:479`, `alienware-dash-to-panel@hsx2coder/desktopIconsIntegration.js:43`
- **panelwrite** (79): `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:241`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:241`, `alienware-dash-to-panel@hsx2coder/intellihide.js:59`, `alienware-dash-to-panel@hsx2coder/intellihide.js:59`
- **async** (5): `alienware-dash-to-panel@hsx2coder/extension.js:67`, `alienware-dash-to-panel@hsx2coder/extension.js:103`, `alienware-dash-to-panel@hsx2coder/panelSettings.js:47`, `alienware-dash-to-panel@hsx2coder/panelSettings.js:55`
- **catch** (78): `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:80`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:121`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:125`, `alienware-dash-to-panel@hsx2coder/bluetoothStatus.js:128`

</details>

### 3.3 alienware-desktop-enable-gnome

| Unit | Path | LOC | Files |
|---|---|---|---|
| U3-01 | `alienware-desktop-enable-gnome@hsx2coder/app/askRenamePopup.js` | 125 | - |
| U3-02 | `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js` | 901 | - |
| U3-03 | `alienware-desktop-enable-gnome@hsx2coder/app/createThumbnail.js` | 65 | - |
| U3-04 | `alienware-desktop-enable-gnome@hsx2coder/app/dbusInterfaces.js` | 225 | - |
| U3-05 | `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js` | 1013 | - |
| U3-06 | `alienware-desktop-enable-gnome@hsx2coder/app/desktopGrid.js` | 597 | - |
| U3-07 | `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js` | 815 | - |
| U3-08 | `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js` | 425 | - |
| U3-09 | `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js` | 2752 | - |
| U3-10 | `alienware-desktop-enable-gnome@hsx2coder/app/ding.js` | 213 | - |
| U3-11 | `alienware-desktop-enable-gnome@hsx2coder/app/enums.js` | 117 | - |
| U3-12 | `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js` | 916 | - |
| U3-13 | `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js` | 696 | - |
| U3-14 | `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js` | 1057 | - |
| U3-15 | `alienware-desktop-enable-gnome@hsx2coder/app/fileUtils.js` | 106 | - |
| U3-16 | `alienware-desktop-enable-gnome@hsx2coder/app/localFileOps.js` | 370 | - |
| U3-17 | `alienware-desktop-enable-gnome@hsx2coder/app/notifyX11UnderWayland.js` | 58 | - |
| U3-18 | `alienware-desktop-enable-gnome@hsx2coder/app/preferences.js` | 198 | - |
| U3-19 | `alienware-desktop-enable-gnome@hsx2coder/app/prefswindow.js` | 255 | - |
| U3-20 | `alienware-desktop-enable-gnome@hsx2coder/app/promiseUtils.js` | 80 | - |
| U3-21 | `alienware-desktop-enable-gnome@hsx2coder/app/showErrorPopup.js` | 65 | - |
| U3-22 | `alienware-desktop-enable-gnome@hsx2coder/app/signalManager.js` | 57 | - |
| U3-23 | `alienware-desktop-enable-gnome@hsx2coder/app/stackItem.js` | 124 | - |
| U3-24 | `alienware-desktop-enable-gnome@hsx2coder/app/templatesScriptsManager.js` | 229 | - |
| U3-25 | `alienware-desktop-enable-gnome@hsx2coder/app/thumbnails.js` | 193 | - |
| U3-26 | `alienware-desktop-enable-gnome@hsx2coder/extension.js` | 680 | - |
| U3-27 | `alienware-desktop-enable-gnome@hsx2coder/{assets}` | 0 | 1 |
| U3-28 | `alienware-desktop-enable-gnome@hsx2coder/{small}` | 983 | 4 |

#### U3-01 — `alienware-desktop-enable-gnome@hsx2coder/app/askRenamePopup.js` (125 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0421 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0422 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0423 | D3 Timer/source | timer/source sites=0 | |
| T0424 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0425 | D5 Feature wiring | subsystem sites=0 | |
| T0426 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0427 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0428 | D8 Error path | try sites=0, async=0 | |
| T0429 | D9 Logic/state | state sites=0 | |
| T0430 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0431 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0432 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-01</summary>


</details>

#### U3-02 — `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js` (901 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0433 | D1 Lifecycle | destroy/dispose sites=5 | |
| T0434 | D2 Signal hygiene | connect=21, disconnect=6 | |
| T0435 | D3 Timer/source | timer/source sites=3 | |
| T0436 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0437 | D5 Feature wiring | subsystem sites=0 | |
| T0438 | D6 UI/action | menu item sites=0, action-connect=7 | |
| T0439 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0440 | D8 Error path | try sites=36, async=14 | |
| T0441 | D9 Logic/state | state sites=0 | |
| T0442 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0443 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0444 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-02</summary>

- **conn** (21): `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:47`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:60`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:193`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:200`
- **disc** (6): `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:194`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:201`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:206`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:517`
- **timer** (3): `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:406`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:464`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:584`
- **act** (7): `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:332`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:352`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:371`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:764`
- **disp** (5): `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:440`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:519`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:578`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:653`
- **async** (14): `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:397`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:412`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:420`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:425`
- **catch** (36): `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:22`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:24`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:105`, `alienware-desktop-enable-gnome@hsx2coder/app/autoAr.js:109`

</details>

#### U3-03 — `alienware-desktop-enable-gnome@hsx2coder/app/createThumbnail.js` (65 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0445 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0446 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0447 | D3 Timer/source | timer/source sites=0 | |
| T0448 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0449 | D5 Feature wiring | subsystem sites=0 | |
| T0450 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0451 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0452 | D8 Error path | try sites=0, async=0 | |
| T0453 | D9 Logic/state | state sites=0 | |
| T0454 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0455 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0456 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-03</summary>


</details>

#### U3-04 — `alienware-desktop-enable-gnome@hsx2coder/app/dbusInterfaces.js` (225 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0457 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0458 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0459 | D3 Timer/source | timer/source sites=0 | |
| T0460 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0461 | D5 Feature wiring | subsystem sites=0 | |
| T0462 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0463 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0464 | D8 Error path | try sites=0, async=0 | |
| T0465 | D9 Logic/state | state sites=0 | |
| T0466 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0467 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0468 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-04</summary>


</details>

#### U3-05 — `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js` (1013 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0469 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0470 | D2 Signal hygiene | connect=4, disconnect=1 | |
| T0471 | D3 Timer/source | timer/source sites=4 | |
| T0472 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0473 | D5 Feature wiring | subsystem sites=0 | |
| T0474 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0475 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0476 | D8 Error path | try sites=6, async=2 | |
| T0477 | D9 Logic/state | state sites=0 | |
| T0478 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0479 | D11 Dead code/orphan | exports/classes=5, dbus=21 | |
| T0480 | D12 Language/i18n | exports/classes=5, dbus=21 | |

<details><summary>Vị trí quét tĩnh của U3-05</summary>

- **conn** (4): `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:83`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:107`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:151`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:996`
- **disc** (1): `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:114`
- **timer** (4): `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:188`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:291`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:293`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:452`
- **dbus** (21): `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:44`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:143`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:143`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:144`
- **cls** (5): `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:42`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:204`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:443`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:562`
- **async** (2): `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:129`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:131`
- **catch** (6): `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:142`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:166`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:412`, `alienware-desktop-enable-gnome@hsx2coder/app/dbusUtils.js:420`

</details>

#### U3-06 — `alienware-desktop-enable-gnome@hsx2coder/app/desktopGrid.js` (597 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0481 | D1 Lifecycle | destroy/dispose sites=2 | |
| T0482 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0483 | D3 Timer/source | timer/source sites=0 | |
| T0484 | D4 Settings parity | settings reads=1, PrefsFields=0 | |
| T0485 | D5 Feature wiring | subsystem sites=0 | |
| T0486 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0487 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0488 | D8 Error path | try sites=0, async=0 | |
| T0489 | D9 Logic/state | state sites=0 | |
| T0490 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0491 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0492 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-06</summary>

- **sett** (1): `alienware-desktop-enable-gnome@hsx2coder/app/desktopGrid.js:503`
- **disp** (2): `alienware-desktop-enable-gnome@hsx2coder/app/desktopGrid.js:232`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopGrid.js:235`

</details>

#### U3-07 — `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js` (815 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0493 | D1 Lifecycle | destroy/dispose sites=5 | |
| T0494 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0495 | D3 Timer/source | timer/source sites=0 | |
| T0496 | D4 Settings parity | settings reads=2, PrefsFields=0 | |
| T0497 | D5 Feature wiring | subsystem sites=0 | |
| T0498 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0499 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0500 | D8 Error path | try sites=8, async=3 | |
| T0501 | D9 Logic/state | state sites=3 | |
| T0502 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0503 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0504 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-07</summary>

- **sett** (2): `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:598`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:614`
- **state** (3): `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:771`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:775`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:779`
- **disp** (5): `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:75`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:79`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:94`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:115`
- **async** (3): `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:569`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:580`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:602`
- **catch** (8): `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:575`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:586`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:640`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconItem.js:665`

</details>

#### U3-08 — `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js` (425 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0505 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0506 | D2 Signal hygiene | connect=2, disconnect=0 | |
| T0507 | D3 Timer/source | timer/source sites=1 | |
| T0508 | D4 Settings parity | settings reads=6, PrefsFields=0 | |
| T0509 | D5 Feature wiring | subsystem sites=0 | |
| T0510 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0511 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0512 | D8 Error path | try sites=14, async=0 | |
| T0513 | D9 Logic/state | state sites=0 | |
| T0514 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0515 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0516 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-08</summary>

- **conn** (2): `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js:376`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js:420`
- **timer** (1): `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js:391`
- **sett** (6): `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js:105`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js:123`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js:233`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js:236`
- **catch** (14): `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js:91`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js:94`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js:114`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopIconsUtil.js:117`

</details>

#### U3-09 — `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js` (2752 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0517 | D1 Lifecycle | destroy/dispose sites=6 | |
| T0518 | D2 Signal hygiene | connect=30, disconnect=0 | |
| T0519 | D3 Timer/source | timer/source sites=5 | |
| T0520 | D4 Settings parity | settings reads=23, PrefsFields=0 | |
| T0521 | D5 Feature wiring | subsystem sites=0 | |
| T0522 | D6 UI/action | menu item sites=0, action-connect=16 | |
| T0523 | D7 API GNOME 50 | theme/stylesheet refs=1 | |
| T0524 | D8 Error path | try sites=30, async=7 | |
| T0525 | D9 Logic/state | state sites=0 | |
| T0526 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0527 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0528 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-09</summary>

- **conn** (30): `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:113`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:118`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:130`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:194`
- **timer** (5): `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:270`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1079`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1100`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1353`
- **sett** (23): `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:64`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:125`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:126`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:127`
- **act** (16): `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:290`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1189`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1199`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1208`
- **disp** (6): `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:272`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:395`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1164`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1387`
- **theme** (1): `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:237`
- **async** (7): `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1301`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1331`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1344`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:1347`
- **catch** (30): `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:259`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:261`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:441`, `alienware-desktop-enable-gnome@hsx2coder/app/desktopManager.js:445`

</details>

#### U3-10 — `alienware-desktop-enable-gnome@hsx2coder/app/ding.js` (213 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0529 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0530 | D2 Signal hygiene | connect=3, disconnect=0 | |
| T0531 | D3 Timer/source | timer/source sites=0 | |
| T0532 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0533 | D5 Feature wiring | subsystem sites=0 | |
| T0534 | D6 UI/action | menu item sites=0, action-connect=1 | |
| T0535 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0536 | D8 Error path | try sites=0, async=0 | |
| T0537 | D9 Logic/state | state sites=0 | |
| T0538 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0539 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0540 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-10</summary>

- **conn** (3): `alienware-desktop-enable-gnome@hsx2coder/app/ding.js:173`, `alienware-desktop-enable-gnome@hsx2coder/app/ding.js:178`, `alienware-desktop-enable-gnome@hsx2coder/app/ding.js:189`
- **act** (1): `alienware-desktop-enable-gnome@hsx2coder/app/ding.js:178`

</details>

#### U3-11 — `alienware-desktop-enable-gnome@hsx2coder/app/enums.js` (117 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0541 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0542 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0543 | D3 Timer/source | timer/source sites=0 | |
| T0544 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0545 | D5 Feature wiring | subsystem sites=0 | |
| T0546 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0547 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0548 | D8 Error path | try sites=0, async=0 | |
| T0549 | D9 Logic/state | state sites=0 | |
| T0550 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0551 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0552 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-11</summary>


</details>

#### U3-12 — `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js` (916 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0553 | D1 Lifecycle | destroy/dispose sites=2 | |
| T0554 | D2 Signal hygiene | connect=0, disconnect=3 | |
| T0555 | D3 Timer/source | timer/source sites=4 | |
| T0556 | D4 Settings parity | settings reads=2, PrefsFields=0 | |
| T0557 | D5 Feature wiring | subsystem sites=0 | |
| T0558 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0559 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0560 | D8 Error path | try sites=18, async=0 | |
| T0561 | D9 Logic/state | state sites=0 | |
| T0562 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0563 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0564 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-12</summary>

- **disc** (3): `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:195`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:199`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:223`
- **timer** (4): `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:82`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:88`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:96`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:214`
- **sett** (2): `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:709`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:718`
- **disp** (2): `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:208`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:228`
- **catch** (18): `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:296`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:307`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:334`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItem.js:342`

</details>

#### U3-13 — `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js` (696 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0565 | D1 Lifecycle | destroy/dispose sites=4 | |
| T0566 | D2 Signal hygiene | connect=3, disconnect=0 | |
| T0567 | D3 Timer/source | timer/source sites=1 | |
| T0568 | D4 Settings parity | settings reads=5, PrefsFields=0 | |
| T0569 | D5 Feature wiring | subsystem sites=0 | |
| T0570 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0571 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0572 | D8 Error path | try sites=6, async=0 | |
| T0573 | D9 Logic/state | state sites=0 | |
| T0574 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0575 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0576 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-13</summary>

- **conn** (3): `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:40`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:528`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:531`
- **timer** (1): `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:42`
- **sett** (5): `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:151`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:231`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:378`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:379`
- **disp** (4): `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:105`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:133`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:147`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:540`
- **catch** (6): `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:56`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:73`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:434`, `alienware-desktop-enable-gnome@hsx2coder/app/fileItemMenu.js:439`

</details>

#### U3-14 — `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js` (1057 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0577 | D1 Lifecycle | destroy/dispose sites=5 | |
| T0578 | D2 Signal hygiene | connect=4, disconnect=0 | |
| T0579 | D3 Timer/source | timer/source sites=7 | |
| T0580 | D4 Settings parity | settings reads=3, PrefsFields=0 | |
| T0581 | D5 Feature wiring | subsystem sites=0 | |
| T0582 | D6 UI/action | menu item sites=0, action-connect=2 | |
| T0583 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0584 | D8 Error path | try sites=78, async=1 | |
| T0585 | D9 Logic/state | state sites=0 | |
| T0586 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0587 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0588 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-14</summary>

- **conn** (4): `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:660`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:695`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:712`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:717`
- **timer** (7): `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:395`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:405`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:419`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:466`
- **sett** (3): `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:86`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:88`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:89`
- **act** (2): `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:660`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:695`
- **disp** (5): `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:169`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:239`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:442`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:517`
- **async** (1): `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:982`
- **catch** (78): `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:71`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:75`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:83`, `alienware-desktop-enable-gnome@hsx2coder/app/fileProgressManager.js:90`

</details>

#### U3-15 — `alienware-desktop-enable-gnome@hsx2coder/app/fileUtils.js` (106 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0589 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0590 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0591 | D3 Timer/source | timer/source sites=0 | |
| T0592 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0593 | D5 Feature wiring | subsystem sites=0 | |
| T0594 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0595 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0596 | D8 Error path | try sites=1, async=14 | |
| T0597 | D9 Logic/state | state sites=0 | |
| T0598 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0599 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0600 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-15</summary>

- **async** (14): `alienware-desktop-enable-gnome@hsx2coder/app/fileUtils.js:33`, `alienware-desktop-enable-gnome@hsx2coder/app/fileUtils.js:35`, `alienware-desktop-enable-gnome@hsx2coder/app/fileUtils.js:41`, `alienware-desktop-enable-gnome@hsx2coder/app/fileUtils.js:43`
- **catch** (1): `alienware-desktop-enable-gnome@hsx2coder/app/fileUtils.js:38`

</details>

#### U3-16 — `alienware-desktop-enable-gnome@hsx2coder/app/localFileOps.js` (370 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0601 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0602 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0603 | D3 Timer/source | timer/source sites=0 | |
| T0604 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0605 | D5 Feature wiring | subsystem sites=0 | |
| T0606 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0607 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0608 | D8 Error path | try sites=22, async=32 | |
| T0609 | D9 Logic/state | state sites=0 | |
| T0610 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0611 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0612 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-16</summary>

- **async** (32): `alienware-desktop-enable-gnome@hsx2coder/app/localFileOps.js:29`, `alienware-desktop-enable-gnome@hsx2coder/app/localFileOps.js:36`, `alienware-desktop-enable-gnome@hsx2coder/app/localFileOps.js:40`, `alienware-desktop-enable-gnome@hsx2coder/app/localFileOps.js:56`
- **catch** (22): `alienware-desktop-enable-gnome@hsx2coder/app/localFileOps.js:35`, `alienware-desktop-enable-gnome@hsx2coder/app/localFileOps.js:47`, `alienware-desktop-enable-gnome@hsx2coder/app/localFileOps.js:58`, `alienware-desktop-enable-gnome@hsx2coder/app/localFileOps.js:73`

</details>

#### U3-17 — `alienware-desktop-enable-gnome@hsx2coder/app/notifyX11UnderWayland.js` (58 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0613 | D1 Lifecycle | destroy/dispose sites=4 | |
| T0614 | D2 Signal hygiene | connect=2, disconnect=0 | |
| T0615 | D3 Timer/source | timer/source sites=0 | |
| T0616 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0617 | D5 Feature wiring | subsystem sites=0 | |
| T0618 | D6 UI/action | menu item sites=0, action-connect=1 | |
| T0619 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0620 | D8 Error path | try sites=0, async=0 | |
| T0621 | D9 Logic/state | state sites=0 | |
| T0622 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0623 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0624 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-17</summary>

- **conn** (2): `alienware-desktop-enable-gnome@hsx2coder/app/notifyX11UnderWayland.js:40`, `alienware-desktop-enable-gnome@hsx2coder/app/notifyX11UnderWayland.js:43`
- **act** (1): `alienware-desktop-enable-gnome@hsx2coder/app/notifyX11UnderWayland.js:40`
- **disp** (4): `alienware-desktop-enable-gnome@hsx2coder/app/notifyX11UnderWayland.js:41`, `alienware-desktop-enable-gnome@hsx2coder/app/notifyX11UnderWayland.js:44`, `alienware-desktop-enable-gnome@hsx2coder/app/notifyX11UnderWayland.js:52`, `alienware-desktop-enable-gnome@hsx2coder/app/notifyX11UnderWayland.js:54`

</details>

#### U3-18 — `alienware-desktop-enable-gnome@hsx2coder/app/preferences.js` (198 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0625 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0626 | D2 Signal hygiene | connect=2, disconnect=0 | |
| T0627 | D3 Timer/source | timer/source sites=0 | |
| T0628 | D4 Settings parity | settings reads=7, PrefsFields=0 | |
| T0629 | D5 Feature wiring | subsystem sites=0 | |
| T0630 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0631 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0632 | D8 Error path | try sites=0, async=0 | |
| T0633 | D9 Logic/state | state sites=0 | |
| T0634 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0635 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0636 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-18</summary>

- **conn** (2): `alienware-desktop-enable-gnome@hsx2coder/app/preferences.js:56`, `alienware-desktop-enable-gnome@hsx2coder/app/preferences.js:96`
- **sett** (7): `alienware-desktop-enable-gnome@hsx2coder/app/preferences.js:110`, `alienware-desktop-enable-gnome@hsx2coder/app/preferences.js:117`, `alienware-desktop-enable-gnome@hsx2coder/app/preferences.js:124`, `alienware-desktop-enable-gnome@hsx2coder/app/preferences.js:131`

</details>

#### U3-19 — `alienware-desktop-enable-gnome@hsx2coder/app/prefswindow.js` (255 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0637 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0638 | D2 Signal hygiene | connect=1, disconnect=0 | |
| T0639 | D3 Timer/source | timer/source sites=0 | |
| T0640 | D4 Settings parity | settings reads=3, PrefsFields=0 | |
| T0641 | D5 Feature wiring | subsystem sites=0 | |
| T0642 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0643 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0644 | D8 Error path | try sites=2, async=0 | |
| T0645 | D9 Logic/state | state sites=0 | |
| T0646 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0647 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0648 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-19</summary>

- **conn** (1): `alienware-desktop-enable-gnome@hsx2coder/app/prefswindow.js:238`
- **sett** (3): `alienware-desktop-enable-gnome@hsx2coder/app/prefswindow.js:156`, `alienware-desktop-enable-gnome@hsx2coder/app/prefswindow.js:191`, `alienware-desktop-enable-gnome@hsx2coder/app/prefswindow.js:237`
- **catch** (2): `alienware-desktop-enable-gnome@hsx2coder/app/prefswindow.js:126`, `alienware-desktop-enable-gnome@hsx2coder/app/prefswindow.js:134`

</details>

#### U3-20 — `alienware-desktop-enable-gnome@hsx2coder/app/promiseUtils.js` (80 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0649 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0650 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0651 | D3 Timer/source | timer/source sites=0 | |
| T0652 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0653 | D5 Feature wiring | subsystem sites=0 | |
| T0654 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0655 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0656 | D8 Error path | try sites=2, async=2 | |
| T0657 | D9 Logic/state | state sites=0 | |
| T0658 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0659 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0660 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-20</summary>

- **async** (2): `alienware-desktop-enable-gnome@hsx2coder/app/promiseUtils.js:19`, `alienware-desktop-enable-gnome@hsx2coder/app/promiseUtils.js:29`
- **catch** (2): `alienware-desktop-enable-gnome@hsx2coder/app/promiseUtils.js:57`, `alienware-desktop-enable-gnome@hsx2coder/app/promiseUtils.js:65`

</details>

#### U3-21 — `alienware-desktop-enable-gnome@hsx2coder/app/showErrorPopup.js` (65 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0661 | D1 Lifecycle | destroy/dispose sites=2 | |
| T0662 | D2 Signal hygiene | connect=2, disconnect=0 | |
| T0663 | D3 Timer/source | timer/source sites=0 | |
| T0664 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0665 | D5 Feature wiring | subsystem sites=0 | |
| T0666 | D6 UI/action | menu item sites=0, action-connect=1 | |
| T0667 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0668 | D8 Error path | try sites=0, async=2 | |
| T0669 | D9 Logic/state | state sites=0 | |
| T0670 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0671 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0672 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-21</summary>

- **conn** (2): `alienware-desktop-enable-gnome@hsx2coder/app/showErrorPopup.js:40`, `alienware-desktop-enable-gnome@hsx2coder/app/showErrorPopup.js:45`
- **act** (1): `alienware-desktop-enable-gnome@hsx2coder/app/showErrorPopup.js:40`
- **disp** (2): `alienware-desktop-enable-gnome@hsx2coder/app/showErrorPopup.js:42`, `alienware-desktop-enable-gnome@hsx2coder/app/showErrorPopup.js:46`
- **async** (2): `alienware-desktop-enable-gnome@hsx2coder/app/showErrorPopup.js:59`, `alienware-desktop-enable-gnome@hsx2coder/app/showErrorPopup.js:60`

</details>

#### U3-22 — `alienware-desktop-enable-gnome@hsx2coder/app/signalManager.js` (57 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0673 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0674 | D2 Signal hygiene | connect=1, disconnect=2 | |
| T0675 | D3 Timer/source | timer/source sites=0 | |
| T0676 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0677 | D5 Feature wiring | subsystem sites=0 | |
| T0678 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0679 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0680 | D8 Error path | try sites=0, async=0 | |
| T0681 | D9 Logic/state | state sites=0 | |
| T0682 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0683 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0684 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-22</summary>

- **conn** (1): `alienware-desktop-enable-gnome@hsx2coder/app/signalManager.js:29`
- **disc** (2): `alienware-desktop-enable-gnome@hsx2coder/app/signalManager.js:41`, `alienware-desktop-enable-gnome@hsx2coder/app/signalManager.js:53`

</details>

#### U3-23 — `alienware-desktop-enable-gnome@hsx2coder/app/stackItem.js` (124 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0685 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0686 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0687 | D3 Timer/source | timer/source sites=0 | |
| T0688 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0689 | D5 Feature wiring | subsystem sites=0 | |
| T0690 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0691 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0692 | D8 Error path | try sites=0, async=0 | |
| T0693 | D9 Logic/state | state sites=0 | |
| T0694 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0695 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0696 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-23</summary>


</details>

#### U3-24 — `alienware-desktop-enable-gnome@hsx2coder/app/templatesScriptsManager.js` (229 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0697 | D1 Lifecycle | destroy/dispose sites=1 | |
| T0698 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0699 | D3 Timer/source | timer/source sites=0 | |
| T0700 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0701 | D5 Feature wiring | subsystem sites=0 | |
| T0702 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0703 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0704 | D8 Error path | try sites=4, async=5 | |
| T0705 | D9 Logic/state | state sites=0 | |
| T0706 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0707 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0708 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-24</summary>

- **disp** (1): `alienware-desktop-enable-gnome@hsx2coder/app/templatesScriptsManager.js:65`
- **async** (5): `alienware-desktop-enable-gnome@hsx2coder/app/templatesScriptsManager.js:70`, `alienware-desktop-enable-gnome@hsx2coder/app/templatesScriptsManager.js:91`, `alienware-desktop-enable-gnome@hsx2coder/app/templatesScriptsManager.js:98`, `alienware-desktop-enable-gnome@hsx2coder/app/templatesScriptsManager.js:112`
- **catch** (4): `alienware-desktop-enable-gnome@hsx2coder/app/templatesScriptsManager.js:111`, `alienware-desktop-enable-gnome@hsx2coder/app/templatesScriptsManager.js:113`, `alienware-desktop-enable-gnome@hsx2coder/app/templatesScriptsManager.js:151`, `alienware-desktop-enable-gnome@hsx2coder/app/templatesScriptsManager.js:172`

</details>

#### U3-25 — `alienware-desktop-enable-gnome@hsx2coder/app/thumbnails.js` (193 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0709 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0710 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0711 | D3 Timer/source | timer/source sites=3 | |
| T0712 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0713 | D5 Feature wiring | subsystem sites=0 | |
| T0714 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0715 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0716 | D8 Error path | try sites=9, async=2 | |
| T0717 | D9 Logic/state | state sites=0 | |
| T0718 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0719 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0720 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-25</summary>

- **timer** (3): `alienware-desktop-enable-gnome@hsx2coder/app/thumbnails.js:108`, `alienware-desktop-enable-gnome@hsx2coder/app/thumbnails.js:157`, `alienware-desktop-enable-gnome@hsx2coder/app/thumbnails.js:168`
- **async** (2): `alienware-desktop-enable-gnome@hsx2coder/app/thumbnails.js:45`, `alienware-desktop-enable-gnome@hsx2coder/app/thumbnails.js:48`
- **catch** (9): `alienware-desktop-enable-gnome@hsx2coder/app/thumbnails.js:20`, `alienware-desktop-enable-gnome@hsx2coder/app/thumbnails.js:94`, `alienware-desktop-enable-gnome@hsx2coder/app/thumbnails.js:103`, `alienware-desktop-enable-gnome@hsx2coder/app/thumbnails.js:120`

</details>

#### U3-26 — `alienware-desktop-enable-gnome@hsx2coder/extension.js` (680 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0721 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0722 | D2 Signal hygiene | connect=9, disconnect=11 | |
| T0723 | D3 Timer/source | timer/source sites=12 | |
| T0724 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0725 | D5 Feature wiring | subsystem sites=0 | |
| T0726 | D6 UI/action | menu item sites=0, action-connect=3 | |
| T0727 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0728 | D8 Error path | try sites=14, async=0 | |
| T0729 | D9 Logic/state | state sites=0 | |
| T0730 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0731 | D11 Dead code/orphan | exports/classes=2, dbus=0 | |
| T0732 | D12 Language/i18n | exports/classes=2, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-26</summary>

- **conn** (9): `alienware-desktop-enable-gnome@hsx2coder/extension.js:87`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:188`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:203`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:208`
- **disc** (11): `alienware-desktop-enable-gnome@hsx2coder/extension.js:103`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:109`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:113`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:119`
- **timer** (12): `alienware-desktop-enable-gnome@hsx2coder/extension.js:124`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:168`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:223`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:321`
- **act** (3): `alienware-desktop-enable-gnome@hsx2coder/extension.js:254`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:255`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:256`
- **cls** (2): `alienware-desktop-enable-gnome@hsx2coder/extension.js:41`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:524`
- **catch** (14): `alienware-desktop-enable-gnome@hsx2coder/extension.js:340`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:352`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:362`, `alienware-desktop-enable-gnome@hsx2coder/extension.js:388`

</details>

#### U3-27 — `alienware-desktop-enable-gnome@hsx2coder/{assets}` (0 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0733 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0734 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0735 | D3 Timer/source | timer/source sites=0 | |
| T0736 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0737 | D5 Feature wiring | subsystem sites=0 | |
| T0738 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0739 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0740 | D8 Error path | try sites=0, async=0 | |
| T0741 | D9 Logic/state | state sites=0 | |
| T0742 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0743 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0744 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-27</summary>


</details>

#### U3-28 — `alienware-desktop-enable-gnome@hsx2coder/{small}` (983 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0745 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0746 | D2 Signal hygiene | connect=15, disconnect=8 | |
| T0747 | D3 Timer/source | timer/source sites=8 | |
| T0748 | D4 Settings parity | settings reads=4, PrefsFields=0 | |
| T0749 | D5 Feature wiring | subsystem sites=0 | |
| T0750 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0751 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0752 | D8 Error path | try sites=8, async=0 | |
| T0753 | D9 Logic/state | state sites=0 | |
| T0754 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0755 | D11 Dead code/orphan | exports/classes=6, dbus=0 | |
| T0756 | D12 Language/i18n | exports/classes=6, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U3-28</summary>

- **conn** (15): `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:56`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:61`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:64`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:69`
- **disc** (8): `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:122`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:349`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:353`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:357`
- **timer** (8): `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:105`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:107`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:125`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:339`
- **sett** (4): `alienware-desktop-enable-gnome@hsx2coder/prefs.js:197`, `alienware-desktop-enable-gnome@hsx2coder/prefs.js:201`, `alienware-desktop-enable-gnome@hsx2coder/prefs.js:205`, `alienware-desktop-enable-gnome@hsx2coder/prefs.js:214`
- **cls** (6): `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:24`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:259`, `alienware-desktop-enable-gnome@hsx2coder/gnomeShellOverride.js:35`, `alienware-desktop-enable-gnome@hsx2coder/prefs.js:8`
- **catch** (8): `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:165`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:168`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:171`, `alienware-desktop-enable-gnome@hsx2coder/emulateX11WindowType.js:194`

</details>

### 3.4 alienware-gnome-customizer-manager

| Unit | Path | LOC | Files |
|---|---|---|---|
| U4-01 | `alienware-gnome-customizer-manager@hsx2coder/lib` | 2155 | - |
| U4-02 | `alienware-gnome-customizer-manager@hsx2coder/subsystems` | 3367 | - |
| U4-03 | `alienware-gnome-customizer-manager@hsx2coder/{assets}` | 0 | 1 |
| U4-04 | `alienware-gnome-customizer-manager@hsx2coder/{small}` | 559 | 2 |

#### U4-01 — `alienware-gnome-customizer-manager@hsx2coder/lib` (2155 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0757 | D1 Lifecycle | destroy/dispose sites=2 | |
| T0758 | D2 Signal hygiene | connect=10, disconnect=13 | |
| T0759 | D3 Timer/source | timer/source sites=9 | |
| T0760 | D4 Settings parity | settings reads=2, PrefsFields=0 | |
| T0761 | D5 Feature wiring | subsystem sites=0 | |
| T0762 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0763 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0764 | D8 Error path | try sites=68, async=3 | |
| T0765 | D9 Logic/state | state sites=0 | |
| T0766 | D10 Panel law & cohesion | panel-write refs=6 | |
| T0767 | D11 Dead code/orphan | exports/classes=2, dbus=0 | |
| T0768 | D12 Language/i18n | exports/classes=2, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U4-01</summary>

- **conn** (10): `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:590`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:592`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:629`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:633`
- **disc** (13): `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:598`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:599`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:623`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:624`
- **timer** (9): `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:150`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:181`, `alienware-gnome-customizer-manager@hsx2coder/lib/ScreenshotBox.js:79`, `alienware-gnome-customizer-manager@hsx2coder/lib/ScreenshotBox.js:84`
- **sett** (2): `alienware-gnome-customizer-manager@hsx2coder/lib/ScreenshotBox.js:110`, `alienware-gnome-customizer-manager@hsx2coder/lib/ScreenshotBox.js:116`
- **cls** (2): `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:43`, `alienware-gnome-customizer-manager@hsx2coder/lib/ScreenshotBox.js:7`
- **disp** (2): `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:344`, `alienware-gnome-customizer-manager@hsx2coder/lib/ScreenshotBox.js:94`
- **panelwrite** (6): `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:1393`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:1393`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:1394`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:1394`
- **async** (3): `alienware-gnome-customizer-manager@hsx2coder/lib/ScreenshotBox.js:457`, `alienware-gnome-customizer-manager@hsx2coder/lib/ScreenshotBox.js:481`, `alienware-gnome-customizer-manager@hsx2coder/lib/ScreenshotBox.js:483`
- **catch** (68): `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:143`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:167`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:271`, `alienware-gnome-customizer-manager@hsx2coder/lib/API.js:279`

</details>

#### U4-02 — `alienware-gnome-customizer-manager@hsx2coder/subsystems` (3367 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0769 | D1 Lifecycle | destroy/dispose sites=1 | |
| T0770 | D2 Signal hygiene | connect=48, disconnect=6 | |
| T0771 | D3 Timer/source | timer/source sites=1 | |
| T0772 | D4 Settings parity | settings reads=42, PrefsFields=0 | |
| T0773 | D5 Feature wiring | subsystem sites=2 | |
| T0774 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0775 | D7 API GNOME 50 | theme/stylesheet refs=13 | |
| T0776 | D8 Error path | try sites=94, async=0 | |
| T0777 | D9 Logic/state | state sites=0 | |
| T0778 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0779 | D11 Dead code/orphan | exports/classes=21, dbus=0 | |
| T0780 | D12 Language/i18n | exports/classes=21, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U4-02</summary>

- **conn** (48): `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/prefs.js:98`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/prefs.js:132`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/prefs.js:160`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/prefs.js:187`
- **disc** (6): `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/managers/window-attention/manager.js:54`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/managers/window-attention/manager.js:57`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/shell/notifications.js:182`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/utils/settings.js:113`
- **timer** (1): `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/shell/notifications.js:159`
- **sett** (42): `alienware-gnome-customizer-manager@hsx2coder/subsystems/workspace-control.js:145`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/workspace-control.js:154`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/workspace-control.js:163`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/workspace-control.js:173`
- **cls** (21): `alienware-gnome-customizer-manager@hsx2coder/subsystems/workspace-control.js:10`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/workspace-prefs.js:12`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/extension.js:6`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/prefs.js:49`
- **sub** (2): `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/subsystem.js:6`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/user-shell-theme/subsystem.js:10`
- **disp** (1): `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/managers/source/manager.js:93`
- **theme** (13): `alienware-gnome-customizer-manager@hsx2coder/subsystems/user-shell-theme/subsystem.js:63`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/user-shell-theme/subsystem.js:69`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/user-shell-theme/subsystem.js:71`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/user-shell-theme/subsystem.js:74`
- **catch** (94): `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/prefs.js:99`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/prefs.js:101`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/prefs.js:811`, `alienware-gnome-customizer-manager@hsx2coder/subsystems/notification-configurator/prefs.js:855`

</details>

#### U4-03 — `alienware-gnome-customizer-manager@hsx2coder/{assets}` (0 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0781 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0782 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0783 | D3 Timer/source | timer/source sites=0 | |
| T0784 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0785 | D5 Feature wiring | subsystem sites=0 | |
| T0786 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0787 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0788 | D8 Error path | try sites=0, async=0 | |
| T0789 | D9 Logic/state | state sites=0 | |
| T0790 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0791 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0792 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U4-03</summary>


</details>

#### U4-04 — `alienware-gnome-customizer-manager@hsx2coder/{small}` (559 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0793 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0794 | D2 Signal hygiene | connect=1, disconnect=0 | |
| T0795 | D3 Timer/source | timer/source sites=0 | |
| T0796 | D4 Settings parity | settings reads=12, PrefsFields=0 | |
| T0797 | D5 Feature wiring | subsystem sites=4 | |
| T0798 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0799 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0800 | D8 Error path | try sites=8, async=0 | |
| T0801 | D9 Logic/state | state sites=0 | |
| T0802 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0803 | D11 Dead code/orphan | exports/classes=4, dbus=0 | |
| T0804 | D12 Language/i18n | exports/classes=4, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U4-04</summary>

- **conn** (1): `alienware-gnome-customizer-manager@hsx2coder/prefs.js:37`
- **sett** (12): `alienware-gnome-customizer-manager@hsx2coder/extension.js:215`, `alienware-gnome-customizer-manager@hsx2coder/extension.js:218`, `alienware-gnome-customizer-manager@hsx2coder/extension.js:224`, `alienware-gnome-customizer-manager@hsx2coder/extension.js:229`
- **cls** (4): `alienware-gnome-customizer-manager@hsx2coder/extension.js:47`, `alienware-gnome-customizer-manager@hsx2coder/extension.js:129`, `alienware-gnome-customizer-manager@hsx2coder/prefs.js:11`, `alienware-gnome-customizer-manager@hsx2coder/prefs.js:149`
- **sub** (4): `alienware-gnome-customizer-manager@hsx2coder/extension.js:44`, `alienware-gnome-customizer-manager@hsx2coder/extension.js:45`, `alienware-gnome-customizer-manager@hsx2coder/extension.js:100`, `alienware-gnome-customizer-manager@hsx2coder/extension.js:102`
- **catch** (8): `alienware-gnome-customizer-manager@hsx2coder/extension.js:98`, `alienware-gnome-customizer-manager@hsx2coder/extension.js:104`, `alienware-gnome-customizer-manager@hsx2coder/extension.js:112`, `alienware-gnome-customizer-manager@hsx2coder/extension.js:116`

</details>

### 3.5 alienware-topbar

| Unit | Path | LOC | Files |
|---|---|---|---|
| U5-01 | `alienware-topbar@hsx2coder/subsystems/appindicator` | 5462 | - |
| U5-02 | `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad` | 566 | - |
| U5-03 | `alienware-topbar@hsx2coder/subsystems/panel` | 2824 | - |
| U5-04 | `alienware-topbar@hsx2coder/subsystems/system-monitor` | 4290 | - |
| U5-05 | `alienware-topbar@hsx2coder/subsystems/topbar-clone` | 669 | - |
| U5-06 | `alienware-topbar@hsx2coder/subsystems/widgets` | 4777 | - |
| U5-07 | `alienware-topbar@hsx2coder/{assets}` | 0 | 2 |
| U5-08 | `alienware-topbar@hsx2coder/{small}` | 732 | 2 |

#### U5-01 — `alienware-topbar@hsx2coder/subsystems/appindicator` (5462 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0805 | D1 Lifecycle | destroy/dispose sites=61 | |
| T0806 | D2 Signal hygiene | connect=85, disconnect=17 | |
| T0807 | D3 Timer/source | timer/source sites=2 | |
| T0808 | D4 Settings parity | settings reads=20, PrefsFields=0 | |
| T0809 | D5 Feature wiring | subsystem sites=0 | |
| T0810 | D6 UI/action | menu item sites=11, action-connect=0 | |
| T0811 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0812 | D8 Error path | try sites=100, async=124 | |
| T0813 | D9 Logic/state | state sites=0 | |
| T0814 | D10 Panel law & cohesion | panel-write refs=19 | |
| T0815 | D11 Dead code/orphan | exports/classes=27, dbus=70 | |
| T0816 | D12 Language/i18n | exports/classes=27, dbus=70 | |

<details><summary>Vị trí quét tĩnh của U5-01</summary>

- **conn** (85): `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:425`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:426`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:430`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:939`
- **disc** (17): `alienware-topbar@hsx2coder/subsystems/appindicator/dbusProxy.js:64`, `alienware-topbar@hsx2coder/subsystems/appindicator/indicatorStatusIcon.js:103`, `alienware-topbar@hsx2coder/subsystems/appindicator/indicatorStatusIcon.js:281`, `alienware-topbar@hsx2coder/subsystems/appindicator/indicatorStatusIcon.js:330`
- **timer** (2): `alienware-topbar@hsx2coder/subsystems/appindicator/promiseUtils.js:55`, `alienware-topbar@hsx2coder/subsystems/appindicator/util.js:251`
- **sett** (20): `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:891`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:1568`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:1601`, `alienware-topbar@hsx2coder/subsystems/appindicator/dbusMenu.js:110`
- **menu** (11): `alienware-topbar@hsx2coder/subsystems/appindicator/dbusMenu.js:591`, `alienware-topbar@hsx2coder/subsystems/appindicator/dbusMenu.js:595`, `alienware-topbar@hsx2coder/subsystems/appindicator/dbusMenu.js:600`, `alienware-topbar@hsx2coder/subsystems/appindicator/dbusMenu.js:617`
- **dbus** (70): `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:34`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:41`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:78`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:81`
- **cls** (27): `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:78`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:408`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:888`, `alienware-topbar@hsx2coder/subsystems/appindicator/dbusMenu.js:42`
- **disp** (61): `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:104`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:130`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:137`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:444`
- **panelwrite** (19): `alienware-topbar@hsx2coder/subsystems/appindicator/indicatorStatusIcon.js:43`, `alienware-topbar@hsx2coder/subsystems/appindicator/indicatorStatusIcon.js:59`, `alienware-topbar@hsx2coder/subsystems/appindicator/indicatorStatusIcon.js:59`, `alienware-topbar@hsx2coder/subsystems/appindicator/indicatorStatusIcon.js:64`
- **async** (124): `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:124`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:125`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:188`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:189`
- **catch** (100): `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:192`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:196`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:229`, `alienware-topbar@hsx2coder/subsystems/appindicator/appIndicator.js:231`

</details>

#### U5-02 — `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad` (566 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0817 | D1 Lifecycle | destroy/dispose sites=13 | |
| T0818 | D2 Signal hygiene | connect=11, disconnect=5 | |
| T0819 | D3 Timer/source | timer/source sites=5 | |
| T0820 | D4 Settings parity | settings reads=11, PrefsFields=0 | |
| T0821 | D5 Feature wiring | subsystem sites=0 | |
| T0822 | D6 UI/action | menu item sites=3, action-connect=4 | |
| T0823 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0824 | D8 Error path | try sites=8, async=0 | |
| T0825 | D9 Logic/state | state sites=0 | |
| T0826 | D10 Panel law & cohesion | panel-write refs=5 | |
| T0827 | D11 Dead code/orphan | exports/classes=2, dbus=0 | |
| T0828 | D12 Language/i18n | exports/classes=2, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U5-02</summary>

- **conn** (11): `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:127`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:128`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:265`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:269`
- **disc** (5): `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:211`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:215`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:388`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:394`
- **timer** (5): `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:61`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:69`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:81`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:84`
- **sett** (11): `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:157`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:158`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:159`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:194`
- **menu** (3): `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:275`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:276`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:277`
- **act** (4): `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:265`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:269`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:271`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:273`
- **keyb** (2): `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:340`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:366`
- **cls** (2): `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:332`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/prefs.js:6`
- **disp** (13): `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:100`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:106`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:133`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:134`
- **panelwrite** (5): `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:72`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:456`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:456`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:475`
- **catch** (8): `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:369`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:372`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:376`, `alienware-topbar@hsx2coder/subsystems/capsnum-touchpad/extension.js:379`

</details>

#### U5-03 — `alienware-topbar@hsx2coder/subsystems/panel` (2824 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0829 | D1 Lifecycle | destroy/dispose sites=5 | |
| T0830 | D2 Signal hygiene | connect=11, disconnect=13 | |
| T0831 | D3 Timer/source | timer/source sites=2 | |
| T0832 | D4 Settings parity | settings reads=38, PrefsFields=0 | |
| T0833 | D5 Feature wiring | subsystem sites=0 | |
| T0834 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0835 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0836 | D8 Error path | try sites=26, async=2 | |
| T0837 | D9 Logic/state | state sites=0 | |
| T0838 | D10 Panel law & cohesion | panel-write refs=89 | |
| T0839 | D11 Dead code/orphan | exports/classes=3, dbus=0 | |
| T0840 | D12 Language/i18n | exports/classes=3, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U5-03</summary>

- **conn** (11): `alienware-topbar@hsx2coder/subsystems/panel/api.js:215`, `alienware-topbar@hsx2coder/subsystems/panel/api.js:373`, `alienware-topbar@hsx2coder/subsystems/panel/api.js:590`, `alienware-topbar@hsx2coder/subsystems/panel/api.js:598`
- **disc** (13): `alienware-topbar@hsx2coder/subsystems/panel/api.js:152`, `alienware-topbar@hsx2coder/subsystems/panel/api.js:204`, `alienware-topbar@hsx2coder/subsystems/panel/api.js:370`, `alienware-topbar@hsx2coder/subsystems/panel/api.js:381`
- **timer** (2): `alienware-topbar@hsx2coder/subsystems/panel/api.js:527`, `alienware-topbar@hsx2coder/subsystems/panel/api.js:619`
- **sett** (38): `alienware-topbar@hsx2coder/subsystems/panel/extension.js:83`, `alienware-topbar@hsx2coder/subsystems/panel/extension.js:93`, `alienware-topbar@hsx2coder/subsystems/panel/extension.js:99`, `alienware-topbar@hsx2coder/subsystems/panel/extension.js:104`
- **cls** (3): `alienware-topbar@hsx2coder/subsystems/panel/api.js:26`, `alienware-topbar@hsx2coder/subsystems/panel/extension.js:21`, `alienware-topbar@hsx2coder/subsystems/panel/host.js:47`
- **disp** (5): `alienware-topbar@hsx2coder/subsystems/panel/host.js:105`, `alienware-topbar@hsx2coder/subsystems/panel/host.js:134`, `alienware-topbar@hsx2coder/subsystems/panel/host.js:141`, `alienware-topbar@hsx2coder/subsystems/panel/host.js:166`
- **panelwrite** (89): `alienware-topbar@hsx2coder/subsystems/panel/api.js:144`, `alienware-topbar@hsx2coder/subsystems/panel/api.js:145`, `alienware-topbar@hsx2coder/subsystems/panel/api.js:146`, `alienware-topbar@hsx2coder/subsystems/panel/api.js:147`
- **async** (2): `alienware-topbar@hsx2coder/subsystems/panel/api.js:348`, `alienware-topbar@hsx2coder/subsystems/panel/api.js:2122`
- **catch** (26): `alienware-topbar@hsx2coder/subsystems/panel/extension.js:48`, `alienware-topbar@hsx2coder/subsystems/panel/extension.js:50`, `alienware-topbar@hsx2coder/subsystems/panel/extension.js:58`, `alienware-topbar@hsx2coder/subsystems/panel/extension.js:60`

</details>

#### U5-04 — `alienware-topbar@hsx2coder/subsystems/system-monitor` (4290 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0841 | D1 Lifecycle | destroy/dispose sites=10 | |
| T0842 | D2 Signal hygiene | connect=58, disconnect=6 | |
| T0843 | D3 Timer/source | timer/source sites=7 | |
| T0844 | D4 Settings parity | settings reads=70, PrefsFields=0 | |
| T0845 | D5 Feature wiring | subsystem sites=0 | |
| T0846 | D6 UI/action | menu item sites=11, action-connect=2 | |
| T0847 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0848 | D8 Error path | try sites=56, async=0 | |
| T0849 | D9 Logic/state | state sites=0 | |
| T0850 | D10 Panel law & cohesion | panel-write refs=13 | |
| T0851 | D11 Dead code/orphan | exports/classes=2, dbus=0 | |
| T0852 | D12 Language/i18n | exports/classes=2, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U5-04</summary>

- **conn** (58): `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:328`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:329`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:437`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:534`
- **disc** (6): `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:548`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:549`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:553`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:1568`
- **timer** (7): `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:618`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:725`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:1022`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:1037`
- **sett** (70): `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:76`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:80`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:164`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:169`
- **menu** (11): `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:592`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:1296`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:3161`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:3165`
- **act** (2): `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:3229`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:3235`
- **cls** (2): `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:3016`, `alienware-topbar@hsx2coder/subsystems/system-monitor/prefs.js:723`
- **disp** (10): `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:552`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:712`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:875`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:985`
- **panelwrite** (13): `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:1376`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:1376`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:1379`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:1379`
- **catch** (56): `alienware-topbar@hsx2coder/subsystems/system-monitor/common.js:21`, `alienware-topbar@hsx2coder/subsystems/system-monitor/common.js:27`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:441`, `alienware-topbar@hsx2coder/subsystems/system-monitor/extension.js:446`

</details>

#### U5-05 — `alienware-topbar@hsx2coder/subsystems/topbar-clone` (669 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0853 | D1 Lifecycle | destroy/dispose sites=12 | |
| T0854 | D2 Signal hygiene | connect=16, disconnect=9 | |
| T0855 | D3 Timer/source | timer/source sites=7 | |
| T0856 | D4 Settings parity | settings reads=2, PrefsFields=0 | |
| T0857 | D5 Feature wiring | subsystem sites=1 | |
| T0858 | D6 UI/action | menu item sites=0, action-connect=2 | |
| T0859 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0860 | D8 Error path | try sites=28, async=0 | |
| T0861 | D9 Logic/state | state sites=0 | |
| T0862 | D10 Panel law & cohesion | panel-write refs=37 | |
| T0863 | D11 Dead code/orphan | exports/classes=5, dbus=0 | |
| T0864 | D12 Language/i18n | exports/classes=5, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U5-05</summary>

- **conn** (16): `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:35`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:40`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:42`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:54`
- **disc** (9): `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:93`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:97`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:105`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:359`
- **timer** (7): `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:85`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:89`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:150`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:153`
- **sett** (2): `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:65`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:477`
- **act** (2): `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:411`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:439`
- **cls** (5): `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:16`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:259`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:321`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:368`
- **sub** (1): `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:16`
- **disp** (12): `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:141`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:249`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:311`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:316`
- **panelwrite** (37): `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:399`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:399`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:400`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:400`
- **catch** (28): `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:128`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:131`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:140`, `alienware-topbar@hsx2coder/subsystems/topbar-clone/main.js:142`

</details>

#### U5-06 — `alienware-topbar@hsx2coder/subsystems/widgets` (4777 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0865 | D1 Lifecycle | destroy/dispose sites=26 | |
| T0866 | D2 Signal hygiene | connect=86, disconnect=14 | |
| T0867 | D3 Timer/source | timer/source sites=2 | |
| T0868 | D4 Settings parity | settings reads=58, PrefsFields=91 | |
| T0869 | D5 Feature wiring | subsystem sites=0 | |
| T0870 | D6 UI/action | menu item sites=19, action-connect=37 | |
| T0871 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0872 | D8 Error path | try sites=36, async=20 | |
| T0873 | D9 Logic/state | state sites=0 | |
| T0874 | D10 Panel law & cohesion | panel-write refs=28 | |
| T0875 | D11 Dead code/orphan | exports/classes=13, dbus=0 | |
| T0876 | D12 Language/i18n | exports/classes=13, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U5-06</summary>

- **conn** (86): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:82`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:141`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:274`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:281`
- **disc** (14): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1092`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1096`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1519`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1523`
- **timer** (2): `alienware-topbar@hsx2coder/subsystems/widgets/command-menu/prefsCommandsUI.js:591`, `alienware-topbar@hsx2coder/subsystems/widgets/command-menu/prefsCommandsUI.js:642`
- **sett** (58): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1276`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1374`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1375`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1376`
- **prefsf** (91): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1105`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1109`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1151`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1154`
- **menu** (19): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:303`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:305`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:316`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:318`
- **act** (37): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:343`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:391`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:399`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:618`
- **keyb** (2): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1468`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1475`
- **cls** (13): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/confirmDialog.js:6`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:66`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/keyboard.js:4`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/prefs.js:8`
- **disp** (26): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/confirmDialog.js:17`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:70`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:100`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:104`
- **panelwrite** (28): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:68`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:68`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:71`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:71`
- **async** (20): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:247`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:248`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1000`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:1006`
- **catch** (36): `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:70`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:70`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:74`, `alienware-topbar@hsx2coder/subsystems/widgets/clipboard/extension.js:93`

</details>

#### U5-07 — `alienware-topbar@hsx2coder/{assets}` (0 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0877 | D1 Lifecycle | destroy/dispose sites=0 | |
| T0878 | D2 Signal hygiene | connect=0, disconnect=0 | |
| T0879 | D3 Timer/source | timer/source sites=0 | |
| T0880 | D4 Settings parity | settings reads=0, PrefsFields=0 | |
| T0881 | D5 Feature wiring | subsystem sites=0 | |
| T0882 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0883 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0884 | D8 Error path | try sites=0, async=0 | |
| T0885 | D9 Logic/state | state sites=0 | |
| T0886 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0887 | D11 Dead code/orphan | exports/classes=0, dbus=0 | |
| T0888 | D12 Language/i18n | exports/classes=0, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U5-07</summary>


</details>

#### U5-08 — `alienware-topbar@hsx2coder/{small}` (732 LOC)

| Task | Dim | Nội dung kiểm tra (số liệu quét tĩnh) | Kết quả |
|---|---|---|---|
| T0889 | D1 Lifecycle | destroy/dispose sites=5 | |
| T0890 | D2 Signal hygiene | connect=7, disconnect=2 | |
| T0891 | D3 Timer/source | timer/source sites=0 | |
| T0892 | D4 Settings parity | settings reads=8, PrefsFields=0 | |
| T0893 | D5 Feature wiring | subsystem sites=2 | |
| T0894 | D6 UI/action | menu item sites=0, action-connect=0 | |
| T0895 | D7 API GNOME 50 | theme/stylesheet refs=0 | |
| T0896 | D8 Error path | try sites=26, async=0 | |
| T0897 | D9 Logic/state | state sites=0 | |
| T0898 | D10 Panel law & cohesion | panel-write refs=0 | |
| T0899 | D11 Dead code/orphan | exports/classes=2, dbus=0 | |
| T0900 | D12 Language/i18n | exports/classes=2, dbus=0 | |

<details><summary>Vị trí quét tĩnh của U5-08</summary>

- **conn** (7): `alienware-topbar@hsx2coder/extension.js:60`, `alienware-topbar@hsx2coder/extension.js:71`, `alienware-topbar@hsx2coder/prefs.js:180`, `alienware-topbar@hsx2coder/prefs.js:181`
- **disc** (2): `alienware-topbar@hsx2coder/extension.js:78`, `alienware-topbar@hsx2coder/prefs.js:186`
- **sett** (8): `alienware-topbar@hsx2coder/extension.js:61`, `alienware-topbar@hsx2coder/extension.js:63`, `alienware-topbar@hsx2coder/extension.js:172`, `alienware-topbar@hsx2coder/extension.js:185`
- **cls** (2): `alienware-topbar@hsx2coder/extension.js:34`, `alienware-topbar@hsx2coder/prefs.js:265`
- **sub** (2): `alienware-topbar@hsx2coder/extension.js:19`, `alienware-topbar@hsx2coder/extension.js:57`
- **disp** (5): `alienware-topbar@hsx2coder/prefs.js:343`, `alienware-topbar@hsx2coder/prefs.js:400`, `alienware-topbar@hsx2coder/prefs.js:459`, `alienware-topbar@hsx2coder/prefs.js:483`
- **catch** (26): `alienware-topbar@hsx2coder/extension.js:78`, `alienware-topbar@hsx2coder/extension.js:78`, `alienware-topbar@hsx2coder/extension.js:101`, `alienware-topbar@hsx2coder/extension.js:103`

</details>

## 4. Findings registry (audit điền vào đây)

| ID | Task | Unit | Chiều | Mức | Bằng chứng (file:line) | Kết luận | Fix |
|---|---|---|---|---|---|---|---|
| F000 | | | | | | | |

Mức: BLOCKER / BUG / GAP / DEAD / RISK / OK.

## 5. Quy trình fix & verify

1. Audit read-only, ghi findings kèm `file:line` + trích code 3-5 dòng làm bằng chứng.
2. Mỗi finding phải có 1 test/phép thử tái hiện hoặc lý do không tái hiện được.
3. Fix tối thiểu, đúng 1 finding; chạy `bash tools/check-all.sh` sau mỗi nhóm fix.
4. Sau khi fix xong 1 module: reload extension + quét journal (không lỗi mới) rồi đóng task.
5. Không đánh dấu OK nếu chưa chạy được phép thử; dùng UNVERIFIED.

## 6. Tiến độ thực hiện

| Wave | Phạm vi | Hình thức | Trạng thái |
|---|---|---|---|
| W1 | alienware-topbar (8 unit), alienware-dash-to-panel (20 unit), alienware-desktop-enable-gnome (28 unit) | 3 subagent: audit + fix trong module | DISPATCHED |
| W2 | alienware-advanced-alt-tab (15 unit), alienware-gnome-customizer-manager (4 unit), cross-module + root suite | 3 subagent | PENDING W1 |
| W3 | Fix finding còn lại + verify runtime (reload + journal + check-all) | main agent | PENDING |
| W4 | Dọn language/i18n (939 dòng tiếng Việt trong .md, 3 dòng trong .js) + dead code | main agent | PENDING |

Findings thô: `/home/alienware/.hermes/cache/scratch/audit/<module>.findings.md`

### 6.1 Wave 1 — kết quả (3/3 module xong, `ALL CHECKS PASSED`)

| Module | Unit | Task | Fixed | Findings còn lại |
|---|---|---|---|---|
| alienware-topbar | 8 | 96 | 3 | key chết `clone-show-indicators`; 5 file `test_*.js` ship kèm (đã xóa, xác minh 0 refs); 2 `GLib.idle_add` thiếu source id (prefsCommandsUI.js:591,642) |
| alienware-dash-to-panel | 20 | 240 | 4 | 81 catch rỗng, 31 method chết, 9 `JSON.parse` không guard, 7 chuỗi hardcode, 11 `St.Bin`, tools thiếu cổng chặn `lookupByUUID` |
| alienware-desktop-enable-gnome | 28 | 336 | 0 | ding.js pin GTK3, /proc scan đồng bộ + `proc.wait(null)` block main loop khi enable, 52 catch rỗng, 112 connect bỏ id |

**Bug nặng đã fix (bằng chứng cụ thể)**
- `dash-to-panel/appIcons.js:2215` — `const GLib = imports.gi.GLib;` trong `_forceQuitFromTaskbar()` ném ReferenceError trên GNOME 45+ ⇒ **Force Quit trên taskbar chết im lặng** (lệnh `kill -9` không bao giờ chạy). Đã xóa dòng legacy.
- `dash-to-panel/prefs.js:52-65` — `_`/`ngettext` gọi `ExtensionPreferences.lookupByUUID(...)` (sai gettext domain) → **toàn bộ 88 chuỗi `_()` trong prefs không dịch được**; đã chuyển sang `gettext as _` từ `resource:///...prefs.js`, `lookupByUUID` = 0 toàn repo.
- `dash-to-panel/appIcons.js:2112,2217` — `global.log(...)` không tồn tại trên GNOME 50 → chính handler lỗi ném TypeError che mất lỗi gốc; đã đổi `console.log`.
- `topbar/appindicator/{appIndicator,indicatorStatusIcon,interfaces}.js` — `imports.gi.Cogl/Meta/GLib` legacy → ESM `import ... from 'gi://...'` (3 file, đã verify `Meta` import 6/6 chỗ dùng).
- `appIcons.js:2102,2131,2150` — 3 nhãn menu taskbar hardcode → bọc `_()`.

Xác minh độc lập của main agent (không tin self-report): `grep global.log(` = 0 · `lookupByUUID` = 0 · file dùng `Meta.is_wayland_compositor` thiếu `import Meta` = 0/6 · `imports.gi` ngoài script out-of-process = 0 (sau khi xoá 5 file test) · `bash tools/check-all.sh` → `ALL CHECKS PASSED`.

**Điểm sáng đã kiểm và đạt**: topbar lifecycle/signal/timer đối xứng; dash-to-panel **không** vi phạm luật 1 (82 tham chiếu panel mà tao quét được đều là *đọc* hoặc ủy quyền `addToStatusArea.call(this)`); desktop-enable-gnome đạt cả D1/D3/D4/D5/D10/D11/D12.

### 6.2 Wave 2 — kết quả (3/3 module xong, `ALL CHECKS PASSED`, 15 cổng)

| Module / phạm vi | Unit | Fixed | Nội dung |
|---|---|---|---|
| alienware-advanced-alt-tab | 15 | 1 | **BUG THẬT**: `_selectOnScroll(direction)` được gọi ở nhánh `SELECT_ITEM` nhưng không định nghĩa ở đâu (base class của shell cũng không có) ⇒ TypeError mỗi lần cuộn để chọn trong alt-tab. Đã thêm method uỷ quyền `_next(true)`/`_previous(true)` → `_select(index)`. Các "missing method" khác là false positive: kế thừa từ `SwitcherPopup.SwitcherList` (chứng minh bằng `gresource extract /usr/lib64/gnome-shell/libshell-18.so /org/gnome/shell/ui/switcherPopup.js`, không tin bản altTab.js trong scratch) |
| gcm + lớp vỏ suite (root) | 10 | 9 | Thêm **2 cổng kiểm tra mới**: `tools/check-legacy-shell-api.py` (chặn `imports.gi`/`global.log`/`lookupByUUID`/`imports.misc` trong code in-process, có allowlist kèm lý do) và `tools/check-migration-map.py` (đối chiếu KEY_MOVES ↔ schema, 39 legacy key/3 schema). Xoá block GNOME-3 chết trong root `prefs.js`; guard `JSON.parse` metadata.json trong `modules.js`; dịch gettext cho prefs suite (6 chuỗi) + gcm (42+34+6 chuỗi) — trước đó gcm prefs **0% dịch được**; sửa drift trong AGENT.md (8→15 cổng, 9→5 module) |
| fix-backlog (topbar + d2p + desktop-enable) | 8 | 7 | Xoá key chết `clone-show-indicators` (+ whitelist, compile schemas OK); 2 `idle_add` thiếu id → helper `_queueIdleSource` + dọn trong destroy; 83 catch rỗng phân loại (62 thêm log, 21 giữ im lặng vì là idiom dọn resource); 2 `JSON.parse` bare thêm guard; xoá 16 method chết (7 chỗ còn lại giữ vì được gọi từ `.ui` GTK Builder hoặc vfunc); `/proc` scan + `proc.wait(null)` khi enable → chuyển async (`load_bytes_async`/`wait_async`), hết block main loop |

### 6.3 Phát hiện lớn nhất session — flood log mãn tính (đã vá, chờ restart để nghiệm thu)

Bằng chứng journal (không phải suy đoán):

| Đo | Giá trị |
|---|---|
| `journalctl ... '10 hours ago' \| grep -c ScrollingLabel` | **957.924 dòng** |
| Message | `Object St.Label (0x…), has been already disposed — impossible to set any property on it` |
| Frame đứng đầu | `dash-to-panel/media/utils/ui/ScrollingLabel.js` — 21.437 lần/6 phút |
| Extension ENABLED | 7.238 dòng/60s (~120/s = 2 vòng lặp × `FRAME_MS` 16ms ≈ 60fps) |
| Sau `gnome-extensions disable` | 1.706 dòng/15s (~114/s) — **vẫn flood** |

Kết luận: **2 GLib timeout orphan** sống ngoài mọi lifecycle, mỗi frame ghi `translation_x` vào St.Label đã bị dispose. Trong GJS việc ghi lên GObject đã dispose **chỉ warn, không throw** ⇒ `try/catch` sẵn có trong tick không bao giờ bắt được ⇒ vòng lặp chạy vô hạn, không có cách nào dừng kể cả disable extension (tới khi logout).

Vá (`media/utils/ui/ScrollingLabel.js`, +13 dòng): hook `this.connect('destroy')` trên chính widget + `this._label.connect('destroy')` trên child actor → null `_label` + `_stopAll()`; cờ `this._destroyed`; guard trong `_startTick()` và callback tick. Lý do phải hook signal chứ không chỉ override `destroy()`: khi Clutter/Shell hủy actor từ phía C, override JS `destroy()` có thể không được gọi.

**Nghiệm thu sau restart**: `journalctl /usr/bin/gnome-shell --since "5 min ago" -o cat | grep -c ScrollingLabel` phải = **0** (trước: ~600/phút).

## 6.3 Wave 3 + Wave 4 và kiểm chứng độc lập

**Wave 3** — săn lớp lỗi timer-orphan ghi vào actor đã dispose (dash-to-panel, 61 nguồn quét):

| Fix | Vị trí | Ý nghĩa |
|---|---|---|
| `PanelUI.destroy()` giải phóng `_scrollLabel` | `media/utils/indicator/PanelUI.js:583-591` | **root cause của flood 957.924 dòng/10h** |
| `MediaControls.destroy()` giải phóng `_titleScrollLabel`/`_artistScrollLabel` | `media/utils/ui/MediaControls.js:753-767` | cùng lớp rò |
| `bluetoothStatus.js:126/472` + `weather.js:98/399` | idle id lưu `_deferredMenuIdleId`, huỷ trong `destroy()` | timer orphan |
| Journal forensics 17.7h/3 boot | desktop-enable-gnome + advanced-alt-tab | **0 JS ERROR, 0 Gjs-WARNING** |
| `windowSwitcherPopup._delayedDestroy` | `src/windowSwitcherPopup.js:1140-1148` | id lưu + guard `_destroyed` |

**Wave 4** — 6 hạng mục còn sót, đã fix hết:

| # | Hạng mục | Vị trí | Trạng thái |
|---|---|---|---|
| 1 | `_isSafeActor` còn stringify (nguồn warn) | `media/utils/indicator/PanelUI.js:89-95` | FIXED → chỉ đọc cờ `_isDestroyed` như `host.js:34` |
| 2 | Quét stringify-dispose toàn 2 module | dash-to-panel + topbar | FIXED, `grep -rn DISPOSED modules/` = **0** |
| 3 | `get_transformed_size()` trên actor đã dispose | `taskbar.js:513-518` | FIXED (guard + comment) |
| 4 | `_measureId` gán 2 lần, 1 `source_remove` | `media/utils/ui/ScrollingLabel.js:89-90,229` | FIXED (guard + null sau remove) |
| 5 | Idempotent `source_remove` (nguồn 107 warning) | util.js, dbusMenu.js + d2p | FIXED (null id sau remove) |
| 6 | `new Util.CancellableChild()` parent undefined | `appindicator/{util,dbusMenu}.js` | FIXED |

**Kiểm chứng độc lập (subagent read-only, không sửa file nào)**: 16 fix báo cáo từ wave 1-3 → **16 PASS / 0 FAIL / 0 UNVERIFIED**. Bằng chứng cứng:

- 2 cổng mới **thật sự FAIL** khi bơm vi phạm vào sandbox `/tmp`: `check-legacy-shell-api.py` → EXIT 1 (`imports.gi is GNOME 3 only`), `check-migration-map.py` → EXIT 1 sau khi inject `KEY_MOVE` giả; cả 2 EXIT 0 khi sạch, và đã wired vào `tools/check-all.sh:27-28`.
- 16 method chết ở d2p: trích xuất độc lập lần 2 cho đúng 16, regex word-boundary trên `.js/.ui/.xml` → **0 refs còn lại**. `_showShowAppsButtonOptions` (`panelPositions.js:64`, `prefs.js:756`) là symbol KHÁC, còn sống.
- `clone-show-indicators`: 0 ref trong `.gschema.xml`, 0 trong whitelist; 8 schema dir pass `glib-compile-schemas --strict --dry-run`. Còn 2 mention text vô hại (`tools/check-wiring.py` exclusion set — **đã dọn**, `WORKLIST-AUDIT.md` doc).
- `switcherList.js:206 if (this._squareItems)` — **KHÔNG phải dead code**: file là `class SwitcherList extends SwitcherPopup.SwitcherList` (subclass của shell base class), `_squareItems` do base class set trong `_init(squareItems)`. Cùng lớp cảnh báo giả như `_maxChildWidth`/`_scrollToRight` — luôn kiểm tra kế thừa trước khi kết luận method/field chết.
- 3 điểm verifier ghi là "diễn đạt chưa chính xác" (không sai bản chất): (c) con số "3 nhãn taskbar + 7 chuỗi prefs" thực tế là 7 `_()` ở prefs.js; (e) "2 `idle_add`" thực ra 1 `GLib.idle_add` trong helper với 2 call site (đều tracked).



## 6.4 Double-check sau re-login (2026-10-14 08:30)

**Đo thật, cùng phương pháp đếm:**

| Nhóm log | Trước (boot -1) | Sau re-login (39,7 phút) |
|---|---|---|
| `ScrollingLabel` | 429.712 / 60 phút | **0** |
| `already disposed` (của mình) | 429.753 / 60 phút | **0** |
| `St.Label` | 429.720 / 60 phút | **0** |
| `PropertyNotFound` | 27 / 60 phút | **0** |
| `Gjs-WARNING` | — | **0** |
| user journal | 16.315 dòng/phút (đỉnh 28.674/phút) | **96,8 dòng/phút** (~169×) |
| system journal | ~28.899 / phút | ~800 / phút (~36×) |
| Top-8 pattern | đều của extension | **toàn ambient** (AdGuardHome 1907, hsx2gateway 613/461/446×5) — extension mình 0 |

**REGRESSION do chính đợt audit gây ra — đã tìm & sửa.** Một wave trước xoá 16 method "chết" sau khi grep 0 refs. Sai: `panelManager.js` hunk `@@ -918,54 +918,6 @@ export const IconAnimator = class` xoá **48 dòng sống** gồm `addAnimation(target, name)` + `removeAnimation(target, name)`, mà chúng được gọi **ĐỘNG**:

```js
// appIcons.js:1627
this.iconAnimator[`${state.urgent ? 'add' : 'remove'}Animation`](...)
```

⇒ `TypeError: this.iconAnimator[...] is not a function`, 12 lần/35 phút + `Exception in callback for signal: update-message-desktop` 12 lần. Đã reverse-apply hunk khôi phục 48 dòng; `md5sum panelManager.js` **= md5 bản HEAD** (byte-identical ⇒ không thiếu member nào khác); `IconAnimator` đủ constructor/destroy/pause/start/addAnimation/removeAnimation; đường expose xác nhận (`taskbar.js:369 new PanelManager.IconAnimator(...)` → `appIcons.js:126`).

**LUẬT MỚI (bắt buộc):** `grep` zero-ref **KHÔNG đủ** để kết luận một method chết — phải quét cả dispatch động: `` obj[`${x}Animation`]() ``, `obj['add'+'X']()`, `obj[cond ? 'a' : 'b']()`. Quét độc lập: 19–20 symbol bị xoá × 28 site computed-dispatch → chỉ `addAnimation`/`removeAnimation` reachable ⇒ đã khôi phục, còn lại **0**.

**`clutter_actor_allocate: assertion '!isnan (real_allocation.x)'` — KHÔNG phải lỗi của mình, không sửa:**
1. 120/120 dòng assertion **không kèm JS stack**; các frame `_handleNotifications@appIcons.js:1627` nằm cạnh đó là stack của **TypeError** (chứng minh 1:1: 29 frame ↔ 29 TypeError), không phải của assertion.
2. Giả thuyết "thiếu guard `monitor.width`" bị **bác bỏ**: guard thật ở `topbar-clone/main.js:619-620` = `if (!monitor || isNaN(monitor.x) || isNaN(monitor.y) || !monitor.width || monitor.width <= 0)` — `!NaN` = true nên NaN width đã bị chặn sẵn.
3. Không tương quan với extension: boot -4 có **21** dòng alienware nhưng vẫn **351** isnan; boot -2: 137 → 96; boot -3: 336 → 103. Assertion có mặt đều ở mọi boot bất kể mức hoạt động của extension ⇒ thuộc shell core / môi trường.

**Còn lại**: cần **1 lần logout/login nữa** để nạp `panelManager.js` (shell 08:30:22 < mtime file 08:49:09 — ES module đã cache). Sau đó lệnh nghiệm thu ở §7 phải cho `iconAnimator` = 0.

## 7. Nghiệm thu sau re-login (bắt buộc, vì GNOME cache ES module)

```bash
E=alienware-hsx2coder-gnome@hsx2coder.github.com

# 0) suite tĩnh
bash tools/check-all.sh                      # kỳ vọng: ALL CHECKS PASSED (15 cổng)

# 1) reload (chỉ để lấy state; code mới chỉ nạp sau re-login)
gnome-extensions disable $E; gnome-extensions enable $E
gnome-extensions info $E | grep -i state      # kỳ vọng: ACTIVE

# 2) sau khi LOGOUT/LOGIN, đợi 5 phút rồi đo lại các chỉ số đã từng xấu
journalctl /usr/bin/gnome-shell --since "5 min ago" -o cat | grep -c ScrollingLabel     # kỳ vọng 0 (trước ~3600)
journalctl /usr/bin/gnome-shell --since "5 min ago" -o cat | grep -c "already disposed" # kỳ vọng 0
journalctl /usr/bin/gnome-shell --since "5 min ago" -o cat | grep -c "PropertyNotFound" # kỳ vọng 0 (trước 65/19h)
journalctl /usr/bin/gnome-shell --since "5 min ago" -o cat | grep -c "Source ID .* was not found"  # kỳ vọng 0
journalctl /usr/bin/gnome-shell --since "5 min ago" -o cat | grep -cE "JS ERROR|Gjs-ERROR"         # kỳ vọng 0

# 3) top frame còn lại (nếu có lỗi) — xếp hạng theo tần suất
journalctl /usr/bin/gnome-shell --since "10 min ago" -o cat \
  | grep -o "extensions/alienware[^ :']*:[0-9]*" | sort | uniq -c | sort -rn | head
```

## 8. Post-wave-6 verification and gate hardening (2026-10-14)

### 8.1 `Delete Permanently` on non-empty folders - fixed (wave 6)

| Item | Detail |
|---|---|
| Symptom | Deleting a folder that contains files from the desktop context menu did nothing; every child had to be deleted by hand first, then the empty folder. |
| Root cause | `app/localFileOps.js`, permanent-delete branch of `_trashOrDeleteOne()`: `Gio.File.delete_async()` maps to `unlink()`/`rmdir()`, so a non-empty directory fails with `G_IO_ERROR_NOT_EMPTY` (code 5, `NOT_EMPTY=true`). No recursive path existed anywhere in the delete branch (`FileType.DIRECTORY` was only handled on the copy/move paths). |
| Fix | Bottom-up async recursive delete: `_deleteTreeRecursive()`, `_queryInfoNoFollow()` (NOFOLLOW_SYMLINKS), `_listChildrenNoFollow()` (`enumerate_children_async`/`_finish` + `next_files_async`, batches of 64), `_unlinkOne()` (`delete_async`/`delete_finish`), `_closeEnumerator()` (`close_async`/`close_finish`). Cancellation is checked at entry and before every child (`Gio.IOErrorEnum.CANCELLED`); symlinks are unlinked, never followed; the trash branch keeps its original `trash_async`/`trash_finish` code byte-for-byte; `_trashOrDeleteOne` / `removeItemsWithProgress` signatures are unchanged. |
| Error surfacing | Real failure reasons are collected (`failureReasons`) and merged into the progress-card message (`progressItem.setError`), so a partial failure names the item that failed instead of a generic string. |
| Proof | Independent verifier, 12 edge cases PASS: empty folder, deep nesting, no write permission, no read permission (chmod 0000), name with spaces, special characters, nested symlink, top-level symlink to a directory, symlink loop, 200 sub-directories, 40 rounds with no fd leak (13-23), trash regression with isolated `XDG_DATA_HOME`. Baseline HEAD reproduces the original failure. |
| Load | Desktop file operations run in the out-of-process `ding.js`; restart that process (or log out/in) to load the change. |

### 8.2 `check-dead-keys` flap - root-caused, gate made deterministic

| Item | Detail |
|---|---|
| Symptom | `tools/check-all.sh` alternated between `ALL CHECKS PASSED` and `SUITE CHECK FAILED` / `DEAD KEYS: 62 declared but never referenced from JS` on an unchanged tree. |
| Root cause | The check keyed declarations by key name (`keys[name] = (schema_id, path)`), so when one key name is declared under two schema ids the surviving id depended on `find` traversal order. `org.gnome.shell.extensions.system-monitor` (live id, not allowlisted) and `org.gnome.shell.extensions.system-monitor-next-applet` (upstream id, allowlisted) declare the same 61 ported keys, so the order decided pass/fail. |
| Fix | Evaluate one entry per declaration (`pairs`, reported per key + schema id) instead of collapsing by key name; allowlist the live id in `tools/dead-keys-allow.txt` with its reason (verbatim upstream port key set retained for settings migration, no JS consumer yet); `migrations/schemas/` frozen copies stay intentionally out of scope. |
| Second failure source, same script | Check 2 (`glib-compile-schemas --strict`) reports `STALE` whenever a `.gschema.xml` is newer than its `gschemas.compiled` - regenerate with `glib-compile-schemas --strict <module>/schemas`. |
| Controls after the fix | Positive: injecting a dead key into a `modules/` schema returns rc=1 and names the key. Negative: clean tree rc=0. `bash tools/check-all.sh` 3/3 `ALL CHECKS PASSED`; `tools/check-dead-keys.sh` 5/5 rc=0. |
