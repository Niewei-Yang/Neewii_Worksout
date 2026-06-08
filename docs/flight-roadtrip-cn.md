# Flight 和 RoadTrip 导入帮助

这份文档说明如何把飞行航线和自驾路线导入到当前项目数据库，并在地图页面展示。

## 基本概念

项目使用本地 SQLite 数据库保存活动数据：

- 数据库文件：`run_page/data.db`
- 前端地图数据：`src/static/activities.json`
- 已导入文件记录：`imported.json`

导入脚本会先写入 `run_page/data.db`，然后自动重建 `src/static/activities.json`。页面读取的是 `activities.json`，所以导入后需要重新启动或刷新前端页面。

## 目录和格式

| 类型 | 文件目录 | 支持格式 | 导入脚本 | 数据类型 |
| --- | --- | --- | --- | --- |
| Flight | `flight/` | `.kml`, `.gpx` | `run_page/flight_sync.py` | `Flight` |
| RoadTrip | `roadtrip/` | `.gpx` | `run_page/roadtrip_sync.py` | `RoadTrip` |

如果 `flight/` 目录不存在，可以手动新建，也可以直接运行脚本，脚本会自动创建。

## RoadTrip 自驾路线

### 1. 准备 GPX 文件

把自驾路线文件放到 `roadtrip/` 目录：

```text
roadtrip/
  妙峰山爆胎回程.gpx
```

页面显示的路线名称默认来自文件名。例如 `妙峰山爆胎回程.gpx` 会显示为 `妙峰山爆胎回程`。

GPX 文件需要包含：

- 路线坐标点
- 起始时间
- 有效距离

如果缺少这些信息，脚本会跳过并提示 `skip invalid GPX`。

### 2. 先做 dry run

dry run 只检查文件，不写数据库：

```powershell
python run_page\roadtrip_sync.py --dry-run
```

正常输出类似：

```text
RoadTrip GPX files: 1
import RoadTrip: 妙峰山爆胎回程
Dry run done. would_import=1, skipped=0, failed=0
```

### 3. 正式导入

```powershell
python run_page\roadtrip_sync.py
```

成功后会看到类似：

```text
Done. imported=1, skipped=0, failed=0
Rebuilt C:\Programs\github\Neewii_Worksout\src\static\activities.json
```

## Flight 飞行航线

### 1. 准备航线文件

把飞行航线文件放到 `flight/` 目录：

```text
flight/
  CCA1496_ZUYB_ZBAA_20260407.kml
  MU8202-20260608.gpx
```

页面显示的航线名称默认来自文件名。例如 `CCA1496_ZUYB_ZBAA_20260407.kml` 会显示为 `CCA1496_ZUYB_ZBAA_20260407`，`MU8202-20260608.gpx` 会显示为 `MU8202-20260608`。

脚本支持 GPX 和两类 KML：

- 带时间点的 GPX 轨迹
- 带时间点的 `gx:Track`
- 普通 `LineString` 坐标线

如果文件自带时间，脚本会使用文件中的时间。如果没有时间，需要用 `--date` 指定一个本地日期。

### 2. KML 有时间时

先检查：

```powershell
python run_page\flight_sync.py --dry-run
```

正式导入：

```powershell
python run_page\flight_sync.py
```

### 3. KML 没有时间时

如果 KML 只有坐标，没有时间，用 `--date YYYYMMDD` 指定日期：

```powershell
python run_page\flight_sync.py --date 20260407 --dry-run
```

确认没问题后正式导入：

```powershell
python run_page\flight_sync.py --date 20260407
```

没有时间的 KML 会把开始时间设为当天中午 12:00，结束时间按坐标点数量做一个保守估算。

## 导入后的查看

启动前端：

```powershell
corepack pnpm run dev
```

如果你已经启用了 pnpm，也可以运行：

```powershell
pnpm run dev
```

浏览器打开终端显示的地址，通常是：

```text
http://localhost:5173/
```

## 如何确认是否导入成功

### 查数据库里的 RoadTrip

```powershell
@'
import sqlite3
c = sqlite3.connect('run_page/data.db')
for row in c.execute("select run_id, name, type, round(distance, 2), source from activities where type='RoadTrip' order by start_date_local"):
    print(row)
'@ | python -
```

### 查数据库里的 Flight

```powershell
@'
import sqlite3
c = sqlite3.connect('run_page/data.db')
for row in c.execute("select run_id, name, type, round(distance / 1000, 1), source from activities where type='Flight' order by start_date_local"):
    print(row)
'@ | python -
```

### 查前端数据文件

```powershell
rg "roadtrip_gpx|flight_kml" src\static\activities.json
```

## 重复导入规则

脚本会用 `imported.json` 记录已经导入过的文件名。

如果再次运行脚本，已导入文件会被跳过：

```text
skip synced file: xxx.gpx
skip synced file: xxx.kml
```

RoadTrip 还会按活动名称去重；Flight 会按活动名称和日期去重。

如果确实需要重新导入某个文件，推荐做法：

1. 从数据库删除旧记录，或确认旧记录不再需要。
2. 从 `imported.json` 移除对应文件名。
3. 重新运行对应导入脚本。

不要直接复制同名文件反复导入，否则脚本会按重复文件跳过。

## 常见问题

### pnpm 无法识别

如果 PowerShell 提示：

```text
pnpm : 无法将“pnpm”项识别为 cmdlet
```

用 Corepack 启动：

```powershell
corepack pnpm run dev
```

或者启用 pnpm：

```powershell
corepack enable
```

然后重新打开 PowerShell，再运行：

```powershell
pnpm run dev
```

### flight 文件夹不存在

手动新建即可：

```powershell
New-Item -ItemType Directory flight
```

也可以直接运行：

```powershell
python run_page\flight_sync.py --dry-run
```

脚本会自动创建 `flight/`。

### RoadTrip 显示为 skip invalid GPX

通常是 GPX 缺少起始时间、路线点或距离信息。可以尝试从原始工具重新导出 GPX，并确认文件里有 `<trkpt>` 和 `<time>`。

### Flight 显示 KML does not contain at least two route coordinates

说明 KML 里没有可用航线，或者导出的不是路线图层。需要重新导出包含轨迹线的 KML，至少要有两个坐标点。

### 导入成功但页面没变化

检查这几项：

1. 确认脚本输出里有 `Rebuilt ... src\static\activities.json`。
2. 停掉前端 dev server 后重新运行 `corepack pnpm run dev`。
3. 浏览器强制刷新页面。
4. 确认地图筛选没有隐藏 `Flight` 或 `RoadTrip`。

## 当前仓库已有示例

当前仓库已经有一个 RoadTrip 示例：

```text
roadtrip/妙峰山爆胎回程.gpx
```

导入后数据库中类型是 `RoadTrip`，来源是 `roadtrip_gpx`。

`imported.json` 中也可以看到已导入过的 Flight 和 RoadTrip 文件名。
