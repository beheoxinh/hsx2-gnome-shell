# E2E — Nautilus Context

Kiểm tra end-to-end cho tính năng Nautilus Context của module DING: plugin
nautilus-python, menu desktop và tab prefs. Bộ này chạy code thật, không mock
logic. Nó không nằm trong `gjs -m tests/run.js` vì cần Nautilus, Gtk và một
display.

```bash
bash tests/e2e/run-all.sh            # headless Nautilus + desktop menu + prefs
bash tests/e2e/run-all.sh --window   # thêm Nautilus có cửa sổ thật (~20 s)
```

Exit code là 0 khi mọi test pass. Mỗi suite in `PASS`/`FAIL` cho từng case và
một dòng `N/M passed`.

## Cô lập (không đụng session thật)

- `dbus-run-session`: D-Bus riêng, nên Nautilus test không đụng Nautilus đang chạy.
- `GSETTINGS_BACKEND=memory`: không đọc hoặc ghi dconf thật.
- `XDG_DATA_HOME`/`XDG_CONFIG_HOME`/`XDG_CACHE_HOME` tạm: plugin được cài vào
  thư mục tạm, không phải `~/.local/share/nautilus-python`.
- `wl-copy` giả (đặt trước trong `PATH`): ghi clipboard ra file, clipboard thật
  không đổi. Lệnh open-with trỏ tới một `fake-editor` ghi lại argv và cwd.
- Thư mục làm việc: `${TMPDIR:-/tmp}/alienware-e2e-*`. Được giữ lại sau khi
  chạy để debug (`nautilus.log`, `out/results.json`, `out/fault.log`).

## Các file

| File | Nội dung |
|------|----------|
| `nautilus.sh` + `zz_e2e_driver.py` | Cài snapshot qua `nautilusSync.install()`, thả driver vào cạnh 5 plugin, chạy `nautilus --gapplication-service` (hoặc `--new-window` khi `E2E_WINDOW=1`). Driver gọi từng provider: nhãn menu, activate, bật/tắt key, git emblems, refresh async. Chế độ window kiểm tra thêm trên `NautilusFile` thật. |
| `install-e2e.js` | Gọi `nautilusSync.install()` theo `XDG_DATA_HOME` hiện tại. |
| `desktop-menu.sh` + `desktop-menu.js` | Nạp module app DING thật (Gtk3), mở `FileItemMenu.showMenu()` với `desktopManager` giả. Kiểm tra nhãn, việc chặn theo key và kết quả các action. |
| `prefs.sh` + `prefs-e2e.js` | Mở `DingPrefs` thật (libadwaita). Kiểm tra switch install/uninstall, nút Sync, status, binding hai chiều của các row và việc ngắt handler khi đóng cửa sổ. Chạy thêm một bản copy module có `findNautilusPython` bị patch để kiểm tra cảnh báo thiếu nautilus-python. |

## Lưu ý khi sửa driver

- Ở chế độ service, Nautilus chưa tạo `NautilusFile` nào, nên
  `Nautilus.FileInfo.lookup_for_uri`/`create_for_uri` sẽ **segfault**. Phần
  headless chỉ dùng `Proxy`. Chỉ gọi API này trong phần `[window]`.
- Driver gọi `Gio.Application.hold()`, nếu không thì `--gapplication-service`
  thoát trước khi test chạy. Driver tự kết thúc bằng `os._exit(0)` sau khi ghi
  `results.json`.
