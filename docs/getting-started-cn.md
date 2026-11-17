# 新手接入指南

建议按顺序完成：**确认数据来源 → 清理旧数据并同步自己的记录 → 获取地图 Token → 选择平台部署**。下面的清理操作用于你自己的 Fork 或副本，本文不会要求你直接修改原仓库的数据。

## 1. 确认数据来源

先查看 [running_page 中文文档](https://github.com/yihong0618/running_page/blob/master/README-CN.md) 的数据源与认证章节，确认自己的平台有可行的接入方案，提前准备授权信息或可导出的轨迹文件。

| 数据来源           | 本仓库的主要入口                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Strava             | `run_page/strava_sync.py`                                                                     |
| Garmin / Garmin CN | `run_page/garmin_sync.py`                                                                     |
| Nike Run Club      | `run_page/nike_sync.py`                                                                       |
| Keep               | `run_page/keep_sync.py`                                                                       |
| COROS              | `run_page/coros_sync.py`                                                                      |
| GPX / TCX / FIT    | `run_page/gpx_sync.py`、`tcx_sync.py`、`fit_sync.py`                                          |
| 自驾 / 飞行 / 铁路 | [RoadTrip](../roadtrip/README.md)、[Flight](../flight/README.md)、[Train](../train/README.md) |

平台认证方式和接口可能变化。本仓库日常使用 Strava，其他脚本不能视为全部经过验证；上游新增的平台也不一定已经合入这里。先确认 `run_page/` 中存在你需要的脚本，再使用本仓库。

## 2. 清理旧数据并同步自己的记录

### 准备自己的副本和环境

在 GitHub Fork 本仓库，通过自己仓库的 Code 按钮复制地址并克隆到本地，然后进入项目目录。

前端建议使用 Node.js 22，pnpm 版本由 `package.json` 固定为 8.9.0：

```bash
corepack enable
pnpm install --frozen-lockfile
```

若系统没有 Corepack，可先安装 `npm install --global corepack`。同步或导入数据时还需要 Python。Python 项目声明为 3.12 及以上，现有定时同步工作流仍使用 3.11；本地新环境建议使用 3.12。

Windows PowerShell：

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

macOS / Linux：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

部分 SVG / 分享图工具还需要系统图形依赖。也保留了 `pdm.lock` 与 `uv.lock` 供对应工具使用，无需同时运行三种 Python 包管理器。

### 首次使用时清理旧数据

更换运动平台凭据不会自动删除数据库中维护者已有的记录。在自己的副本首次接入前，先查看清理范围：

```bash
pnpm data:clean --dry-run
```

确认后执行：

```bash
pnpm data:clean
```

这两个命令适用于 Windows、macOS 和 Linux，只依赖 Node.js。实际清理会把旧数据按原路径移到 `.local-backups/data-<时间>-<编号>/`，并保存清单，不会直接销毁旧文件。备份目录已被 Git 忽略，恢复文件时可按清单找到原路径。

| 处理范围                                                                   | 清理后的状态                                |
| -------------------------------------------------------------------------- | ------------------------------------------- |
| `run_page/data.db` 及 SQLite 附属文件                                      | 移入备份，首次同步自动建立新数据库          |
| `src/static/activities.json`                                               | 重置为 `[]`                                 |
| `imported.json`、已同步记录                                                | 旧记录备份，文件导入记录重置为 `[]`         |
| `public/data/activity-timelines/`、旧曲线预览                              | 旧曲线备份，新建空曲线索引                  |
| `assets/` 中的统计 SVG                                                     | 旧统计图备份，必要的总览图替换为空图        |
| `GPX_OUT/`、`TCX_OUT/`、`FIT_OUT/`、`activities/`、`Workouts/`、`PNG_OUT/` | 已有数据移入备份，保留目录占位文件和 README |

源码、许可证、配置、`.env`、文档图片，以及 `flight/`、`roadtrip/`、`train/` 中准备的新输入文件保留。保留的输入文件下次导入时会重新处理，请确认它们确实属于自己的数据。

清理用于首次建立自己的数据集，不是每次同步的前置步骤。不要在后台同步或导入仍运行时执行它。随后同步自己的活动、重新生成统计图，并提交清理及同步结果；旧年份图表通过 `assets/index.tsx` 的动态导入自动更新，无需逐个删除源码引用。

### 替换个人资料

| 文件                                  | 修改内容                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `src/static/site-metadata.ts`         | 姓名、头像、描述与导航；`siteUrl` 使用不带 `https://` 的域名，第四步拿到网址后更新 |
| `src/components/Dashboard/config.ts`  | 运动目标、热力图署名；当前主页目标按跑步类活动计算                                 |
| `.github/workflows/run_data_sync.yml` | `RUN_TYPE`、`ATHLETE`、图表标题与生日月份                                          |
| `run_page/config.py`                  | Python 类型映射与基础时区                                                          |

### 通过 GitHub Actions 同步：以 Strava 为例

先按 [running_page 的 Strava 说明](https://github.com/yihong0618/running_page/blob/master/README-CN.md#strava)获取授权，并在自己的仓库 **Settings → Secrets and variables → Actions → Secrets** 中添加：

| 名称                          | 内容                             |
| ----------------------------- | -------------------------------- |
| `STRAVA_CLIENT_ID`            | Strava Client ID                 |
| `STRAVA_CLIENT_SECRET`        | Strava Client Secret             |
| `STRAVA_CLIENT_REFRESH_TOKEN` | 具备活动读取权限的 Refresh Token |

将 `RUN_TYPE` 设为 `strava`，提交并推送清理结果和个人配置到 `main`。在 **Settings → Actions → General → Workflow permissions** 中允许工作流读写仓库，再在 **Actions** 启用工作流，选择 **Run Data Sync → Run workflow**。

成功后检查提交回仓库的活动记录和统计图。其他数据源需按对应脚本、工作流支持的 `RUN_TYPE` 和上游说明配置；本地轨迹文件也可按各目录说明手动导入。

当前计划任务为每天 UTC 16:00，即北京时间 / 新加坡时间次日 00:00，实际运行可能延迟。`SAVE_DATA_IN_GITHUB_CACHE: false` 表示生成的数据提交回仓库，也是当前 Surge 部署读取数据的方式；`BUILD_GH_PAGES: false` 表示未自动发布 GitHub Pages。

### 在本地同步：以 Strava 为例

在根目录创建已被 Git 忽略的 `.env`，填入自己的值：

```dotenv
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
STRAVA_CLIENT_REFRESH_TOKEN=your_refresh_token
ATHLETE=YourName
TITLE=Workouts
TITLE_GRID=Over 10km Workouts
MIN_GRID_DISTANCE=10
BIRTHDAY_MONTH=2000-01
```

Windows 可运行：

```powershell
.\sync-strava-local.ps1
```

它会读取 `.env`，同步 Strava 并生成统计图。macOS / Linux 先在环境中设置对应变量，再执行：

```bash
python run_page/strava_sync.py "$STRAVA_CLIENT_ID" "$STRAVA_CLIENT_SECRET" "$STRAVA_CLIENT_REFRESH_TOKEN"
```

直接调用 `strava_sync.py` 不会自动读取 `.env`，也不会生成全部统计 SVG；图表命令可参考工作流中的 `Make svg GitHub profile` 和 `Make month of life`。曲线和成绩分批回填，详细参数见[活动曲线](activity-timelines.md)和[个人最佳](personal-bests-cn.md)。

### 检查自己的记录

```bash
pnpm dev
```

打开终端显示的地址，通常为 `http://localhost:5173/`，新版地址为 `/dashboard`。确认活动列表与统计中已没有旧记录，再继续申请地图 Token 和发布网站。`pnpm develop`、`pnpm serve` 也是开发入口；生产预览使用 `pnpm build` 后运行 `pnpm exec vite preview`。

## 3. 申请并配置地图 Token

登录 [Mapbox](https://account.mapbox.com/access-tokens/)，申请自己的公开 Token，替换 `src/utils/const.ts` 顶部的 `MAPBOX_TOKEN`，不要继续使用源码继承的 Token。

当前共用地图组件的普通底图、卫星底图和 3D 地形均使用 Mapbox。旧的 MapTiler 配置仍保留，但更换 `MAP_TILE_ACCESS_TOKEN` 不会替换实际使用的 Mapbox Token。

公开 Token 会用于浏览器请求，前端环境变量也不能让它对访问者保密。建议设置 [Mapbox URL 限制](https://docs.mapbox.com/help/dive-deeper/access-tokens/#url-restrictions)：本地测试时允许本机地址，第四步取得部署域名后补充对应域名。运动平台的 Client Secret 和 Refresh Token 继续保存在 `.env` 或 GitHub Actions Secrets 中。

其他地图显示、运动配色和经典版语言选项也在 `src/utils/const.ts` 中。

## 4. 选择托管平台并发布

- **Vercel**：网页导入自己的仓库，选择 Vite，构建命令 `pnpm build`，输出目录 `dist`。
- **Surge.sh**：首次在终端登录、生成 Token，再通过仓库已有的 `Publish Surge` 工作流部署并自动更新。

按照[部署与自动更新](deployment-cn.md)完成平台配置，发布后将实际域名写回 `site-metadata.ts`，并更新地图 Token 的域名限制。以后新增运动记录只需继续同步，不要再次执行首次清理命令。
