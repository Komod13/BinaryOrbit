# BinaryOrbit—双星轨道

## 1. 需求概述

- 一个可交互的情侣地图，用于标注、记录、显示、统计自己和女朋友曾经吃过的饭店、去过的景点、走过的城市
- 需要支持中国国内地点的检索。支持用户当前定位附近的餐厅/景点查询并标记。
- 饭店支持记录用餐日期、评分、人均价格（按低、中、高档位显示）
- 景点支持记录游玩日期
- 地图上需要显示饭店、景点标记。走过的城市在另一张页面上按城市区域高亮标记。
- 统计功能需要对饭店总数、景点总数、城市总数进行统计。可以以卡片形式展示。

### 1.1 本期范围修订（已确认）

- **不含定位**：手机定位需要 HTTPS，本期不做 HTTPS，因此"附近"改为**以地图中心为锚点的周边检索**（拖地图 → 搜这一带）。
- **不含导入**：历史数据手动录入，不做 Excel/截图导入。
- **不含照片/分享/时间轴**：留到二期，数据模型预留字段。
- **部署形态**：本机自托管，局域网 IP 访问，仅两人使用，无账号体系。

## 2. 技术路线

### 2.1 决策一览

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 项目定位 | 两阶段：先做能用的 MVP，二期再叠视觉 |
| 2 | 用户范围 | 单租户、纯自用、无注册；数据默认私有 |
| 3 | 客户端 | 移动优先的响应式 Web（手机 + 电脑浏览器） |
| 4 | 地图与 POI | 全量使用高德（JSAPI 2.0 + Web 服务 API） |
| 5 | 录入方式 | 现场快速标记（地图中心附近搜索）+ 回家补录（关键词搜索） |
| 6 | 部署 | 本机/局域网，固定端口 `8787`，IP 访问，无 HTTPS |
| 7 | 进程模型 | 单进程：API + 静态文件 + SQLite 单文件库 |
| 8 | 传输安全 | 不做 HTTPS；手机端无定位；高德请求全部经后端代理 |
| 9 | POI 查询路径 | 后端代理（key 不外泄、结果可缓存、白名单问题绕开） |
| 10 | 数据模型 | `place`（地点实体）+ `visit`（到访记录）双表 |
| 11 | 城市口径 | 由 place 的 `city_adcode` 自动反推 + 手动补标表 `city_manual` |
| 12 | 前端栈 | Vue 3 + Vite + TypeScript（Pinia/组合式 API，不引入 UI 组件库） |
| 13 | 页面结构 | 2 个 Tab：地图 / 城市；统计以**浮窗**形式常驻右上角，可显隐切换 |
| 14 | 价格档位 | 低 `<60`、中 `60–150`、高 `>150`（元/人），阈值写在配置常量里 |
| 15 | 评分 | 1–5 星整数，**可选**（不阻塞快速录入） |
| 16 | 景点字段 | 复用 `visit`：日期必填，评分/备注可选，不用 `price_tier` |
| 17 | 去重键 | `place.external_id` = 高德 POI id（唯一索引）；再次提交 = 追加 visit |
| 18 | 运行时 | Node **24 LTS**（自带 `node:sqlite` 与 TS 类型剥离，后端零构建） |
| 19 | 后端框架 | Hono（轻、无装饰器、`@hono/node-server` 一行起服务） |
| 20 | 启动方式 | Windows 侧 `启动.bat` 一键启动（不打包 exe） |
| 21 | 代码位置 | VM 的 ext4 目录 `~/BinaryOrbit` 开发；共享目录只做交付中转 |
| 22 | 交付 | `npm run pack` 生成源码 zip → `/home/VMShare/` → Windows 解压运行 |

### 2.2 环境事实（已实测）

- `node:sqlite` 在 Node 24.22 上**免 flag 可用**（建表/插入/查询验证通过）→ 不需要原生模块，Windows 上不需要编译工具链。
- Node 24 可**直接执行 `.ts`**（类型剥离）→ 后端无 tsc/esbuild 构建步骤，`node server/index.ts` 即可。
- 当前工作目录 `/home/VMShare/BinaryOrbit` 是 **vboxsf 共享盘，不支持符号链接**，`node_modules` 无法装 → 源码迁至 `~/BinaryOrbit`。
- Node 版本要求（README 需写明）：**Node ≥ 24**（`node:sqlite` 在 22.x 需要实验性 flag）。

### 2.3 进程与请求流向

```
手机/电脑浏览器
   │  http://<LAN-IP>:8787
   ▼
┌──────────────────────────── Node 24 单进程（Hono） ──────────────────────────┐
│  GET  /                → 托管 web/dist 静态资源（SPA fallback）               │
│  GET  /api/config      → { jsKey, serviceHost: "/_AMapService" }             │
│  ALL  /api/*           → 业务接口（places / visits / cities / stats / search） │
│  ALL  /_AMapService/*  → 转发 restapi.amap.com 并注入 jscode（安全密钥）      │
│  SQLite                → data/orbit.db（node:sqlite，同步 API）              │
│  其他                   → data/geo/*.json（地级市边界缓存，DataV 源，免 key）  │
└──────────────────────────────────────────────────────────────────────────────┘
        │ 后端持有 2 个 key
        ├── AMAP_WEB_KEY      → /v3/place/text、/v3/place/around、/v3/geocode/regeo
        └── AMAP_JS_KEY + AMAP_SECURITY_CODE → 前端渲染地图 / JSAPI 内部请求
```

**为什么这样分**：JSAPI 2.0 强制要求"安全密钥"，明文放前端等于公开。官方支持的 `serviceHost` 方案正好可以把 `/_AMapService/*` 反代到 `restapi.amap.com` 并注入 `jscode`，于是前端拿到的是无密钥的请求地址，且**官方文档示例就用 `http://IP:80` 形式**，与我们的无 HTTPS 局域网形态完全兼容。

### 2.4 配置

`.env`（gitignored）→ `.env.example`：

```ini
PORT=8787
AMAP_JS_KEY=            # 高德 Web端(JS API) key，前端渲染地图用
AMAP_SECURITY_CODE=     # 对应安全密钥 jscode，只在服务端使用
AMAP_WEB_KEY=           # 高德 Web服务 key，后端检索 POI / 逆地理用
PRICE_TIER_LOW=60       # 低档上限
PRICE_TIER_HIGH=150     # 高档下限
```

### 2.5 目录结构

```
BinaryOrbit/
├─ README.md
├─ package.json          # 单 package，前端依赖放 devDependencies
├─ .env.example  .env(gitignored)
├─ 启动.bat              # Windows 生产启动（构建好的 dist + 后端）
├─ 开发.bat              # Windows 开发（可选）
├─ scripts/pack.mjs      # 打源码 zip 到 /home/VMShare/
├─ server/
│  ├─ index.ts           # Hono 装配、静态托管、启动横幅（IP + 二维码 + 开浏览器）
│  ├─ db.ts              # node:sqlite 连接 + 迁移执行
│  ├─ schema.sql
│  ├─ amap.ts            # 高德 Web 服务封装（含限流/错误映射）
│  ├─ geo.ts             # 地级市边界下载与缓存
│  └─ routes/{places,visits,cities,stats,search,config}.ts
├─ web/
│  ├─ index.html  vite.config.ts
│  └─ src/
│     ├─ main.ts  App.vue  router.ts
│     ├─ views/MapView.vue  CitiesView.vue
│     ├─ components/AMapCanvas.vue  SearchPanel.vue  PlaceDrawer.vue
│     │             PlaceFormDrawer.vue  FilterChips.vue  StatsFloat.vue
│     ├─ lib/{amap.ts,api.ts,theme.ts}
│     └─ styles/
└─ data/                 # gitignored：orbit.db + geo 缓存
```

## 3. 前端设计

### 3.1 信息架构

- 底部 Tab × 2：**地图**（`/map`，默认）/ **城市**（`/cities`）。
- **统计浮窗**：`fixed` 右上角，两个 Tab 上都在，显示 3 个数字（饭店 / 景点 / 城市），点击折叠成一个小徽标，显隐与折叠状态存 `localStorage`。不单独占页面。

### 3.2 地图页

**图层**：`AMap.Map`（zoom 12 起）、餐厅/景点两类 Marker、`AMap.MarkerCluster` 聚合、可选的周边搜索圆。

**顶部**：搜索入口（关键词） + 筛选 chips（`全部 / 餐厅 / 景点`）。

**记录入口（现场快速标记）**：
1. 地图中心放一个固定准星；右下角 FAB「记录」→ 展开「搜这一带」；
2. 半径选择 `500m / 1km / 3km`（默认 1km）→ 调 `/api/search?lng&lat&radius&type`；
3. 结果以列表形式弹出在底部面板（店名、分类、距离、以及"已记录 ✓"角标——由后端比对 `external_id` 得出）；
4. 点某条 → 抽屉式表单，**自动预填**名称/地址/坐标/分类/`city_adcode`，只让填「日期（默认今天）+ 星级（可选）+ 价位（可选，餐厅才有）+ 备注（可选）」→ 保存即成功（餐厅 3 次点击内完成）。

**记录入口（回家补录）**：顶部搜索框输入关键词（可带城市）→ `/api/search?keyword&city` → 同样走上面的抽屉表单，只是日期可改成过去。选中的店若 `external_id` 已存在，表单标题变成「再来一次」，保存时只追加 `visit`。

**手动点选**：长按/点击地图空白处 → 「在这里记一个地点」→ 表单（名称必填、类型必选、城市由 `/api/regeo` 补全）。手动点没有 `external_id`，因此在提交前会检查"附近 50m 内是否已有同名地点"，有则提示合并。

**标记交互**：点 Marker → 底部抽屉：店名、类型/分类、地址、城市、总到访次数、最近一次日期、评分；下方到访历史列表（日期 + 星级 + 价位 + 备注，可编辑/删除）；底部按钮「再去一次」（追加今天）与「删除地点」。

### 3.3 城市页

- 全国视野（zoom 4）地图 + `AMap.GeoJSON` 图层渲染**地级市边界**：去过的城市填主题色（半透明）+ 深色描边，未去过不着色。
- 边界数据来自 DataV.GeoAtlas，**后端缓存到 `data/geo/`**，只在首次/新增城市时按需拉取，之后完全离线。
- 点某个已点亮城市 → 浮卡片显示该城市「餐厅 N / 景点 M / 最近一次」+ 「查看该城市标记」按钮（跳回地图页并预设筛选）。
- 「补标城市」入口：搜索城市名（`/api/geo/city?kw=` 或用本地 city 列表匹配）→ 记为"去过"（写入 `city_manual`），用于"路过但没记录地点"的情况。

### 3.4 关键实现约定

- `AMapCanvas.vue` 只负责 JSAPI 生命周期（load → 建图 → 销毁清理），**命令式 API 用 `shallowRef` + `watch` 驱动**，不让 Vue 响应式包裹 AMap 实例。
- 所有数据访问走 `lib/api.ts`（`fetch` + 统一错误 toast），用 `@tanstack/vue-query` 做缓存与失效（标记删除后自动刷新列表/统计）。
- 状态（`places`、`filters`、`stats`、抽屉状态）放 Pinia；地图实例不放进 store。
- 移动优先：底部抽屉 + 大按钮；桌面端抽屉变成右侧栏（CSS 断点 `md`）。
- 不引入 UI 组件库，样式手写（CSS 变量定义主题色，为二期视觉留改口）。

## 4. 后端设计

### 4.1 数据模型（`server/schema.sql`）

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS place (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL CHECK (type IN ('restaurant','attraction')),
  name         TEXT NOT NULL,
  external_id  TEXT UNIQUE,            -- 高德 POI id；手选点为 NULL
  address      TEXT,
  lng          REAL NOT NULL,          -- GCJ-02
  lat          REAL NOT NULL,
  category     TEXT,                   -- 高德分类，如 "餐饮服务;中餐厅"
  city_name    TEXT,
  city_adcode  TEXT,                   -- 用于城市反推与高亮
  district     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id   INTEGER NOT NULL REFERENCES place(id) ON DELETE CASCADE,
  visited_on TEXT NOT NULL,            -- 'YYYY-MM-DD'
  rating     INTEGER CHECK (rating BETWEEN 1 AND 5),
  price_tier TEXT CHECK (price_tier IN ('low','mid','high')),  -- 仅餐厅
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_visit_place ON visit(place_id, visited_on DESC);

CREATE TABLE IF NOT EXISTS city_manual (   -- 手动补标的"去过"城市
  adcode    TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  marked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

城市的唯一口径：`SELECT DISTINCT city_adcode FROM place WHERE city_adcode IS NOT NULL UNION SELECT adcode FROM city_manual`。统计三张卡：`count(place where type='restaurant')`、`count(place where type='attraction')`、上面这个集合的大小。

### 4.2 API 清单

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/config` | 返回 `{ jsKey, serviceHost, priceTiers }` |
| GET | `/api/places` | 标记列表（`?type=&city=&year=`），每条带 `visit_count`/`last_visited_on`/`last_rating` |
| GET | `/api/places/:id` | 详情 + 全部 visits |
| POST | `/api/places` | 建地点；`external_id` 命中则**追加 visit** 并返回 `{place, visit, deduped:true}` |
| PATCH | `/api/places/:id` | 改名/改类型/改坐标等 |
| DELETE | `/api/places/:id` | 级联删 visits |
| POST | `/api/places/:id/visits` | 新增到访（"再去一次"） |
| PATCH/DELETE | `/api/visits/:id` | 编辑/删除单次到访 |
| GET | `/api/search` | 高德代理：`?keyword=&lng=&lat=&radius=&type=`；有关键词走 `place/text`，有坐标+半径走 `place/around`；结果附 `existing_place_id` |
| GET | `/api/regeo` | 逆地理编码：坐标 → 城市名/adcode/区县 |
| GET | `/api/cities` | 去过的城市列表 + 每城 `restaurant_count`/`attraction_count`/`last_visited_on` |
| GET | `/api/cities/geo` | 去过的城市的 GeoJSON（服务端合并、缓存到 `data/geo/`） |
| POST/DELETE | `/api/cities/manual` | 补标 / 取消补标城市 |
| GET | `/api/stats` | 三个数字（+ `visit_total` 备用） |

### 4.3 高德代理层（`server/amap.ts`）

- `searchText` / `searchAround` / `regeo` 三个函数，统一：注入 `key=AMAP_WEB_KEY`、`city_limit=false`、超时 5s、失败重试 1 次；
- 错误映射：高德 `infocode` → 中文可读错误（`10001` key 错误、`10003` 超配额、`10009` 权限不足等），前端 toast 直接可读；
- **缓存**：`place/text|around` 的响应用内存 LRU（键＝参数串，TTL 10min）+ 结果里的 POI 详情落 `place` 表时即为长期缓存；同一家店第二次搜索秒出；
- `/_AMapService/*` 反向代理：转发到 `https://restapi.amap.com/*`，追加 `jscode=AMAP_SECURITY_CODE`，仅允许 `GET`，5s 超时。

### 4.4 运行与运维

- 启动横幅：打印 `本机 http://localhost:8787`、枚举所有非回环 IPv4 的 `http://<ip>:8787`、一个 ASCII 二维码（`qrcode-terminal`），并尝试自动打开默认浏览器；
- 端口占用：`EADDRINUSE` → 打印"程序似乎已在运行，已为你打开浏览器"并 `exit(0)`；
- 数据库：`data/orbit.db`，WAL 模式；启动时执行 `schema.sql`（幂等 `IF NOT EXISTS`）；备份 = 复制 `data/` 目录；
- 日志：请求行 + 错误堆栈打到 `stdout`（控制台保留，方便你看）；
- 不做认证（仅监听局域网，不做端口转发）。

### 4.5 Windows 交付

`启动.bat`（约 30 行，纯检测 + 调用，不写复杂逻辑）：

1. `chcp 65001` + 设置窗口标题；
2. `node -v` 版本检测，主版本 `< 24` → 打印安装指引 + `pause` 退出；
3. `node_modules` 不存在 → 打印"请先执行 npm install"并 `pause`（**不自动装**，按确认结论：报错让我手动装）；
4. `web/dist` 不存在 → 自动 `npm run build`；
5. `node server\index.ts`（控制台保持打开，关窗即停止）。

`开发.bat`（可选）：`npm run dev`（Vite HMR `5173`，`/api` 代理到 `8787`）+ 后端并行。

`scripts/pack.mjs`：把源码（排除 `node_modules`、`web/dist`、`data`、`.env`）打成 `/home/VMShare/BinaryOrbit-src.zip`，供 Windows 解压覆盖；`data/` 不在包内，因此覆盖不会丢数据。

## 5. 测试设计

### 5.1 M0 Spike（开工第一小时，唯一可能推翻架构的风险点）

| 检查项 | 通过标准 | 失败时退路 |
|---|---|---|
| JSAPI 在 `http://<IP>:8787` 下加载 | 地图渲染成功、无 key 报错 | 白名单留空只靠 `jscode` 代理；仍失败则改 Leaflet + 高德瓦片代理 |
| `/_AMapService` 代理注入 `jscode` | JSAPI 内部请求全部 200 | 改为前端明文 `securityJsCode`（局域网自用可接受） |
| `node:sqlite` + Hono 起服务 | `/api/health` 返回 200 | 换 `better-sqlite3`（Windows 有预编译包） |
| DataV 地级市 GeoJSON 可下载并缓存 | 生成 `data/geo/*.json`，二次启动不联网 | 改用高德 `config/district?extensions=all`（消耗配额） |

### 5.2 后端集成测试（`node --test`，内置运行器，高德 API 全部 mock）

1. 新建 place + 首次 visit 成功，`external_id` 唯一；
2. 同 `external_id` 二次 POST → 不新建 place、追加 visit、返回 `deduped:true`；
3. 手选点（`external_id=null`）可建多条，互不干扰；
4. `PATCH visit` / `DELETE visit` 生效，`place` 的 `visit_count` 随之变化；
5. `DELETE place` 级联删除 visits；
6. `/api/stats` 三个数字口径正确（含"同一店多次到访只算一家店"）；
7. 城市反推：`place.city_adcode` 去重 + `city_manual` 并集、去重、计数正确；
8. `/api/search` 正确在 `keyword` 与 `around` 两种模式间切换，并附 `existing_place_id`；
9. 高德 mock 返回 `infocode=10003` → 接口返回可读中文错误、HTTP 502，不崩进程；
10. `GET /api/places` 的筛选（type / city / year）与排序正确。

### 5.3 手动验收清单（Windows，约 5 分钟）

1. `node -v` = v24.x；
2. `npm install` 成功（失败 → 贴报错）；
3. 双击 `启动.bat` → 控制台出现本机地址 + 手机地址 + 二维码，浏览器自动打开；
4. 手机同 WiFi 扫码 → 地图显示正常（**这是 key 白名单实测点**）；
5. 「搜这一带」→ 选一家 → 保存 → 标记出现；再搜同一家 → 显示"已记录"，保存后到访次数变 2；
6. 切城市 Tab → 该城市被点亮；统计浮窗三个数字同步变化；
7. 关闭窗口 → 服务停止；重启后数据仍在（`data\orbit.db`）。

## 6. 待办需求

### 6.1 需要你做的事

- [ ] 高德开放平台注册 + **个人实名认证**，创建两个 key：`Web端(JS API)` 与 `Web服务`，并记下 JSAPI 的**安全密钥**；
- [ ] Windows 宿主机安装 **Node 24 LTS**（勾选 Add to PATH）；
- [ ] 把 zip 解压到 `C:\dev\BinaryOrbit` 后执行一次 `npm install`；
- [ ] 首次运行后确认防火墙弹窗选择「专用网络」，否则手机连不上。

### 6.2 二期 Backlog

- 时间轴筛选（滑块/年份切换）与"年度总结"页
- 到访照片墙、相册上传与压缩
- 统计增强：评分榜、最近一次卡片、按价位估算的总花费区间
- 只读分享页 / 生成年度海报（需 HTTPS 或长链接方案）
- HTTPS + 手机定位（`mkcert` 自签，恢复到"我在附近"的原始需求）
- 单文件 `exe` 打包（Node SEA 或 Bun `--compile`），替换 bat
- 省份级着色、城市旅行路线动画
- 数据导出（JSON/CSV）与自动备份
