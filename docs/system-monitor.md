# System Monitor — Module Documentation

> **Vai trò:** Hiển thị thông tin hệ thống (CPU, RAM, disk, network, battery, GPU, fan) trên top bar.

---

## 1. Tổng quan

Các widget hiển thị real-time system metrics trên GNOME Shell panel. Hỗ trợ CPU, memory, swap, network upload/download, disk usage, battery, GPU frequency, fan speed, và nhiều hơn nữa.

**Kế thừa từ:** `system-monitor@mgalgs.github.com`

### 1.1 Tính năng chính

- CPU usage % + load average
- Memory usage + swap
- Network upload/download speed
- Disk usage (total + per partition)
- Battery percentage + charging status
- GPU frequency (NVIDIA/AMD)
- Fan speed (hwmon sensors)
- Custom refresh interval
- Click menu: detailed stats with popup
- Theme-aware: adapts to shell theme

### 1.2 Module integration

- **Class:** `SystemMonitorExtension extends Extension`
- **Sub-schema:** `system-monitor-next-applet` cho next-gen features
- **System libraries:** libgtop, libnm, upower-glib

---

## 2. GSchema Keys

Schema: `org.gnome.shell.extensions.system-monitor` (115 keys)
Sub-schema: `org.gnome.shell.extensions.system-monitor-next-applet`

### 2.1 CPU

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `cpu-show-menu` | b | true | Show CPU in panel |
| `cpu-show-text` | b | true | Show text label |
| `cpu-style` | i | 0 | Display style (0=percentage, 1=bar, 2=graph) |
| `cpu-refresh-time` | i | 2000 | Refresh interval (ms) |
| `cpu-sensor-name` | s | '' | Custom sensor name for CPU temp |

### 2.2 Memory

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `memory-show-menu` | b | true | Show memory widget |
| `memory-show-text` | b | true | Show text label |
| `memory-style` | i | 0 | Display style |

### 2.3 Network

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `net-show-menu` | b | true | Show network widget |
| `net-show-text` | b | true | Show speed text |
| `net-style` | i | 0 | 0=upload+download, 1=combined |
| `net-refresh-time` | i | 2000 | Refresh interval (ms) |

### 2.4 Disk

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `disk-show-menu` | b | true | Show disk widget |
| `disk-show-text` | b | true | Show text |
| `disk-style` | i | 0 | Display style |

### 2.5 Battery

| Key | Type | Default | Mô tả |
|-----|------|---------|-------|
| `battery-show-menu` | b | false | Show battery widget |
| `battery-style` | i | 0 | Display style |

---

## 3. Luồng nghiệp vụ

### 3.1 Data collection

```
enable()
  → this.getSettings()
  → Create widgets per enabled sensor
  → Start refresh timers
  → Each tick:
       CPU: GTop.glibtop_get_cpu()
       Memory: GTop.glibtop_get_mem()
       Network: gNetworkMonitor + /proc/net/dev
       Disk: GTop.glibtop_get_fsusage()
       Battery: UPowerGlib.UPowerClient
       GPU: /sys/class/drm/ or nvidia-smi
  → Update panel text/graph
  → on 'changed' signal → update config
```

### 3.2 Click menu

```
User clicks widget
  → PopupMenu with detailed breakdown
  → CPU: load avg, frequency, temperature
  → Memory: used, free, swap
  → Network: interface stats
  → Disk: per-mount usage
  → Battery: capacity, remaining time
```

---

## 4. Cấu hình mặc định

- CPU/Memory/Network/Disk: enabled
- Battery: disabled
- Refresh rate: 2000ms (CPU/network), others vary
- Style: percentage (CPU), text+bar (memory), speed (network)
- GPU/fan: disabled

---

## 5. Lưu ý kỹ thuật

- **Dependencies:** `gir1.2-gtop-2.0`, `gir1.2-nm-1.0`, `gir1.2-upowerglib-1.0`, `gir1.2-gtk-3.0`
- **GPU monitoring:** Cần thư viện bổ sung — nvidia-smi cho NVIDIA
- **Graph rendering:** Dùng Cairo để vẽ live graphs trong panel
- **Two schemas:** system-monitor (chính) + system-monitor-next-applet (future features)

---

## 6. References

- Dconf path: `/org/gnome/shell/extensions/system-monitor/`
- Source: https://github.com/mgalgs/gnome-shell-system-monitor-next-applet
