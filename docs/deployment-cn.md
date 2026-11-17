# 部署与自动更新

前端构建命令为 `pnpm build`，输出目录为 `dist/`。以下说明对应本仓库当前的 Vite 静态网站，不需要在托管平台运行 Python。

## Vercel

1. 在 Vercel 导入自己的 GitHub 仓库，框架选择 **Vite**。
2. 安装命令使用 `pnpm install --frozen-lockfile`，构建命令为 `pnpm build`，输出目录为 `dist`，Node.js 使用 22。
3. 根目录站点的 `PATH_PREFIX` 保持 `/`，不要使用 GitHub Pages 的仓库子目录前缀。
4. 保留 `vercel.json` 中的 SPA 重写规则，支持 `/dashboard/summary` 等子页面直接访问。

普通 Git 推送可由 Vercel 的 Git 集成触发部署。定时同步生成的数据通过 GitHub Actions 的 `GITHUB_TOKEN` 提交；此类提交是否被 Vercel 自动构建，需要在 Vercel 部署记录中单独验证，不能用 Surge 工作流的成功代替验证。

## Surge

### 首次配置

在自己的终端登录或注册，并按邮件提示验证邮箱：

```powershell
npx --yes surge@0.57.1 login
```

选择自己的域名，生成用于部署的 Token。下方 `your-site.surge.sh` 为示例：

```powershell
npx --yes surge@0.57.1 tokens add --domain your-site.surge.sh -m "github actions"
```

打开自己的 GitHub 仓库 **Settings → Secrets and variables → Actions**：

| 选项卡                              | 名称           | 内容                             |
| ----------------------------------- | -------------- | -------------------------------- |
| Secrets → New repository secret     | `SURGE_TOKEN`  | 上一步生成的 Token               |
| Variables → New repository variable | `SURGE_DOMAIN` | 你的域名，不含 `https://` 和路径 |

使用工作流固定的 CLI 版本无需另设 `SURGE_LOGIN`。将工作流保留在默认分支 `main`，进入 **Actions → Publish Surge → Run workflow**，选择 `main` 完成首次部署。运行 Summary 会显示发布地址与构建的提交。

### 自动发布的触发条件

`.github/workflows/surge.yml` 在以下情况构建并发布：

- 推送或合并更新到 `main`。
- `main` 上的 `Run Data Sync` 工作流成功完成，包括定时同步与手动同步。
- 在 GitHub Actions 网页手动运行 `Publish Surge`。

工作流始终检出最新 `main`，使用 `PATH_PREFIX=/`，并复制 `dist/index.html` 为 `dist/200.html`，让客户端路由可直接打开或刷新。数据同步当前将数据提交回仓库，请保留 `SAVE_DATA_IN_GITHUB_CACHE: false`。

GitHub 自带 `GITHUB_TOKEN` 推送的提交不会再次触发普通 `push` 工作流，因此 Surge 同时监听 `Run Data Sync` 的成功完成事件。发布任务串行执行，避免多个上传同时进行。

### 本地手动发布

Windows PowerShell：

```powershell
$env:PATH_PREFIX = "/"
pnpm build
Copy-Item dist/index.html dist/200.html
npx --yes surge@0.57.1 ./dist your-site.surge.sh
```

macOS / Linux：

```bash
PATH_PREFIX=/ pnpm build
cp dist/index.html dist/200.html
npx --yes surge@0.57.1 ./dist your-site.surge.sh
```

参考：[Surge GitHub Actions 部署](https://surge.sh/docs/guides/github-actions)、[Surge SPA 路由](https://surge.sh/help/adding-a-200-page-for-client-side-routing)、[GitHub 工作流触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。

## GitHub Pages

仓库保留 `.github/workflows/gh-pages.yml`，但当前 `BUILD_GH_PAGES` 为 `false`，没有启用自动发布。这个继承工作流还固定检出 `master`，而本仓库使用 `main`；启用前必须调整检出分支，并在仓库设置中选择 GitHub Actions 作为 Pages 构建来源。

该工作流按 `/<仓库名>` 设置 `PATH_PREFIX`，适用于项目子目录站点。若使用自定义域名或根站点，需要调整为 `/`，同时验证嵌套路由的直接访问与刷新；Surge 的 `200.html` 机制不适用于 GitHub Pages。

## 常见问题

### 首页有背景但没有内容

打开开发者工具检查 Console 和 Network。若出现 `Unexpected end of input`，可能是浏览器或中间缓存拿到了不完整的 JS，先尝试清空缓存并硬刷新。Edge 可在开发者工具打开时右键刷新按钮，选择“清空缓存并硬刷新”；也可在 Network 勾选 Disable cache 后刷新验证。

新窗口能打开、普通窗口不能打开，只能说明浏览器环境存在差异，不能据此认定部署文件损坏。检查后可取消 Disable cache，无需长期禁用缓存。

### 地图空白，但活动列表正常

确认地图 Key、域名白名单和地图服务请求均正常。切换部署域名后，地图服务也可能需要增加对应的允许来源。

### 页面打开了，但活动没有更新

依次检查 `Run Data Sync` 是否成功、最新 `main` 是否已有新数据、部署是否使用了最新提交。站点发布成功不代表运动平台同步已经完成。
