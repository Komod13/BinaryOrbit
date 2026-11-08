# BinaryOrbit—双星轨道

> 本文是设计文档（需求、技术路线、前后端设计、测试方案）。功能简介与安装使用说明见 [README.md](README.md)。

## 1. 需求概述

- 一张可交互的情侣地图，用来标注、记录和统计自己和女朋友吃过的饭店、去过的景点、走过的城市
- 支持检索国内地点，也支持查询当前位置附近的餐厅和景点并直接标记
- 饭店可以记录用餐日期、评分和人均价格（按低、中、高档位显示）
- 景点可以记录游玩日期
- 地图上显示饭店和景点标记；走过的城市放在另一个页面，按城市区域高亮
- 统计饭店总数、景点总数和城市总数，以卡片形式展示

### 1.1 范围确认

- **不含定位**：手机定位需要 HTTPS，本期不做 HTTPS，所以"附近"改成**以地图中心为锚点的周边检索**（把地图拖到某处，再搜这一带）。
- **不含导入**：历史数据手动录入，不做 Excel/截图导入。
- **不含照片/分享/时间轴**：留到二期，数据模型预留字段。
- **部署形态**：本机自托管，局域网 IP 访问，仅两人使用，无账号体系。
- **不含编辑**：地点信息和到访记录都只能新增和删除，不能编辑（见 §3.2/§4.2）。
- **不含长按记点**：手动记点只能从「搜索附近」抽屉里的「在地图上手动记一笔」进入。
- **不含补标城市搜索**：城市页上全国地级市轮廓常驻且可点击，点亮靠点地图，不用搜名字。
- **不含城市页到地图的筛选联动**：城市卡片只做「定位视野 + 高亮该城标记」，不改筛选 chips。

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
| 9 | POI 查询路径 | 后端代理 `/v3/place/*`（key 不外泄、结果可缓存），前端不使用 `PlaceSearch` 插件 |
| 10 | 数据模型 | `place`（地点实体）+ `visit`（到访记录）双表 |
| 11 | 城市口径 | place 的 `city_adcode` 反推 + `city_manual` 补标；**直辖市归一化到省级 adcode** |
| 12 | 前端栈 | Vue 3 + Vite + TypeScript（Pinia/组合式 API，不引入 UI 组件库） |
| 13 | 页面结构 | 2 个 Tab：地图 / 城市；统计以**浮窗**形式常驻，可显隐切换 |
| 14 | 价格档位 | 低 `<60`、中 `60–150`、高 `>150`（元/人），阈值由 `.env` 经 `/api/config` 下发 |
| 15 | 评分 | 1–5 星整数，**可选**（不阻塞快速录入） |
| 16 | 景点字段 | 复用 `visit`：日期必填，评分/备注可选，不用 `price_tier` |
| 17 | 去重键 | `place.external_id` = 高德 POI id（唯一索引）；再次提交 = 追加 visit |
| 18 | 运行时 | Node **24 LTS**（自带 `node:sqlite` 与 TS 类型剥离，后端零构建） |
| 19 | 后端框架 | Hono（轻、无装饰器、`@hono/node-server` 一行起服务） |
| 20 | 启动方式 | Windows 侧 `启动.bat` 一键启动（不打包 exe）；`开发.bat` 走 Vite HMR |
| 21 | 代码位置 | 开发直接在仓库目录进行（ext4），**不再做 zip 中转** |
| 22 | 交付 | `git push origin main` → Windows 端 `git pull` → 首次 `npm install` → 双击 `启动.bat` |
| 23 | 底图观感 | **CSS 滤镜压色调**（`saturate/contrast/brightness` 变量化）逼近原型的安静米色；触屏设备改用静态色纱 `--map-tint`（避免滤镜逐帧重算）；自定义地图样式留二期 |
| 24 | 城市页实现 | **真实地理边界**：AMap zoom 4 + DataV 逐省地级市 GeoJSON，全国轮廓常驻且可点 |
| 25 | 端适配 | **一套响应式**，断点 `860px`：≥860 右侧栏 + 常驻统计卡；<860 底部抽屉 + 统计徽标 |
| 26 | 删除语义 | 删除某地点最后一条到访 = **连带删除该地点** |
| 27 | 状态持久化 | `localStorage` 只存 4 项：统计折叠、地图视野、筛选 chips、城市页视野 |
| 28 | 边界数据源 | DataV.GeoAtlas，逐省懒加载 + 本地缓存（约 3.68MB，一次性后永久离线） |
| 29 | 关键词搜索范围 | 默认限定**地图中心所在城市**，可一键切「全国」 |
| 30 | 标记标签 | zoom ≥ 13 常显店名（聚合点除外）；聚合气泡为 accent 实底 + 白字数量 |

### 2.2 环境事实（已实测，2026-11）

- `node:sqlite` 在 Node 24.22 上**免 flag 可用**（建表、插入、查询都验证通过），所以不需要原生模块，Windows 上也不用装编译工具链。
- Node 24 可以**直接执行 `.ts`**（类型剥离），所以后端没有 tsc/esbuild 构建步骤，`node server/index.ts` 就能起服务。
- Node 版本要求（README 需写明）：**Node ≥ 24**（`node:sqlite` 在 22.x 需要实验性 flag）。
- Node 原生的 `--env-file=.env` 能正确处理 `KEY=value`；**但行内 `# 注释` 会被截断**，`dotenv` 则不会。因此 `.env` 一律「注释单独成行」，不写行内注释。
- 仓库没有 `.gitignore` 时 `.env` 有被提交的风险，所以已经补上（`node_modules/ web/dist/ data/ .env`）。

### 2.3 进程与请求流向

```
手机/电脑浏览器
   │  http://<LAN-IP>:8787
   ▼
┌──────────────────────────── Node 24 单进程（Hono） ──────────────────────────┐
│  GET  /                → 托管 web/dist 静态资源（SPA fallback）               │
│  GET  /api/config      → { jsKey, serviceHost, priceTiers }                  │
│  ALL  /api/*           → 业务接口（places / visits / cities / stats / search）│
│  ALL  /_AMapService/*  → 转发 restapi.amap.com，注入 jscode + platform=JS    │
│  SQLite                → data/orbit.db（node:sqlite，同步 API）              │
│  其他                   → data/geo/*.json（地级市边界缓存，DataV 源，免 key）│
└──────────────────────────────────────────────────────────────────────────────┘
        │ 后端持有 2 个 key
        ├── AMAP_WEB_KEY      → /v3/place/text、/v3/place/around、/v3/geocode/regeo、/v3/config/district
        ├── AMAP_JS_KEY + AMAP_SECURITY_CODE → 前端渲染地图 / JSAPI 内部请求
        └── DataV GeoAtlas    → 地级市边界（免 key，逐省缓存）
```

**代理注入配方（实测）**：转发 `/_AMapService/*` 时必须同时追加 `jscode=<AMAP_SECURITY_CODE>` 和 `platform=JS&s=rsv3`。
只加 `jscode` 会返回 `10009 USERKEY_PLAT_NOMATCH`，补上 `platform=JS&s=rsv3` 后同一个 URL 立刻返回 `status=1`。

**为什么这样分**：JSAPI 2.0 强制要求"安全密钥"，把它明文放在前端就等于公开。官方支持的 `serviceHost` 方案正好能把 `/_AMapService/*` 反代到 `restapi.amap.com` 并注入密钥，前端因此只拿到不含密钥的请求地址。

### 2.4 配置

`.env` 已被 gitignore，注释**单独成行**；`.env.example` 保持同样结构但留空：

```ini
PORT=8787
# 高德 Web端(JS API) key，前端渲染地图用
AMAP_JS_KEY=
# 对应安全密钥 jscode，只在服务端使用
AMAP_SECURITY_CODE=
# 高德 Web服务 key，后端检索 POI / 逆地理 / 行政区划用
AMAP_WEB_KEY=
# 低档上限（元/人）
PRICE_TIER_LOW=60
# 高档下限（元/人）
PRICE_TIER_HIGH=150
# 可选：手机访问用的局域网地址；自动挑选不对时手动指定
LAN_IP=
```

启动自检：缺任何一个 `AMAP_*` 项，就打印中文指引（说明哪个 key 去哪儿申请）并 `exit(1)`，不会带着不完整的配置起服务。

**手机地址的挑选**：Windows 上装了代理 / 虚拟机时，`networkInterfaces()` 的第一个地址经常是 Clash 的 `198.18.0.1` 或 WSL / VMware 的虚拟网卡，直接取第一个会让手机永远连不上。`server/net.ts` 改成打分：`192.168/16` > `10/8` > `172.16/12` > 公网 > `100.64/10`；`198.18/15`（代理 fake-ip）、`169.254/16`（没拿到 DHCP）直接负分，网卡名像 `Clash / WSL / VMware / TUN` 再降权。多个候选时横幅会把其余的列出来，并支持用 `.env` 的 `LAN_IP` 强制指定。

### 2.5 目录结构

```
BinaryOrbit/
├─ README.md             # 功能说明与安装使用
├─ DESIGN.md             # 设计文档（需求 / 技术路线 / 前后端设计 / 测试）
├─ package.json          # 单 package，前端依赖放 devDependencies
├─ .env.example  .env(gitignored)
├─ 启动.bat              # Windows 生产启动（构建好的 dist + 后端）
├─ 开发.bat              # Windows 开发（Vite HMR + 后端并行）
├─ scripts/smoke.md      # agent-browser 冒烟步骤记录（不引入前端测试依赖）
├─ scripts/ensure-build.mjs # 启动前判断 dist 是否比源码旧，旧了就自动构建
├─ server/
│  ├─ index.ts           # Hono 装配、静态托管、启动横幅（IP + 二维码 + 开浏览器）
│  ├─ net.ts             # 挑手机能用的局域网地址（跳过代理/虚拟机网卡）
│  ├─ build.ts           # 读 web/dist 的构建时间 / bundle 名，源码比 dist 新就告警
│  ├─ db.ts              # node:sqlite 连接 + 迁移执行
│  ├─ schema.sql
│  ├─ amap.ts            # 高德 Web 服务封装（含限流/错误映射/城市字典）
│  ├─ geo.ts             # 地级市边界下载、归一化与缓存
│  └─ routes/{places,visits,cities,stats,search,config,regeo,diag}.ts
├─ web/
│  ├─ index.html  vite.config.ts
│  └─ src/
│     ├─ main.ts  App.vue  router.ts
│     ├─ views/MapView.vue  CitiesView.vue
│     ├─ components/AMapCanvas.vue  SearchPanel.vue  PlaceDetailPanel.vue
│     │             PlaceFormPanel.vue  MapDock.vue  SideSheet.vue
│     │             StatsFloat.vue  TabBar.vue
│     ├─ lib/{amap.ts,api.ts,theme.ts,geo.ts,diag.ts}
│     └─ styles/
└─ data/                 # gitignored：orbit.db + geo 缓存
```

## 3. 前端设计

### 3.1 信息架构

- 两个底部 Tab：**标记**（`/map`，默认）和**足迹**（`/cities`），路由直链可用，刷新后仍停在当前页。
- 「搜索附近」的地点选择浮窗挂在筛选栏下方（桌面端左侧、移动端底部），**不是模态框**，开着也能拖地图换范围；详情与录入表单仍走右侧栏/底部抽屉。列表最多展示 8 条，其余靠滚动与提示。
- **统计浮窗**：`fixed` 在右上角，两个 Tab 上都显示，记录 3 个数字（饭店 / 景点 / 城市）。
  - ≥860px：常驻展开卡片（三列 + 分隔线，高度与搜索/筛选区对齐）。
  - <860px：默认收成小徽标（总足迹数），点击展开卡片。
  - 折叠状态存 `localStorage`。

### 3.2 地图页

**图层**：`AMap.Map`（zoom 12 起）、餐厅/景点两类 Marker、`AMap.MarkerCluster` 聚合、周边搜索圆。
**底图**：`mapStyle` 不可用（样式服务未开通），统一用默认底图 + 容器 CSS 滤镜 `saturate(.35) contrast(.95) brightness(1.04)`（写成 CSS 变量，便于微调）。

> 触屏设备（iPad / 手机）不套这个滤镜：满屏图层套 `filter` 等于每帧都要整屏重算，平移缩放会明显掉帧。`@media (any-pointer: coarse)` 下把滤镜关掉，只有在高德退到**栅格瓦片**时才补一层插在瓦片层上方的静态色纱（`.amap-tint`，颜色由 `--map-tint` 控制，由 `installMapTint()` 注入）；走 WebGL 画布时底图本来就套不上滤镜，保持原样。同理，`backdrop-filter` 只在鼠标设备保留（底部 Tab 的毛玻璃），触屏改成接近不透明的纯色背景。

**标记与聚合**：
- 聚合 `gridSize 60`，气泡自定义为 `--accent` 实底 + 白字数量；点击聚合 → `zoomIn`（最多到 16）。
- 点单个标记，打开底部抽屉或右侧栏的详情。
- zoom ≥ 13 时常显店名标签（聚合点不显示任何单个名字）；< 13 只在 hover/focus/选中时显示。

**顶部**：搜索入口（按关键词搜索）和筛选 chips（`全部 / 餐厅 / 景点`，带计数，选择存进 `localStorage`）。

**记录入口（现场快速标记）**：
1. 地图中心固定一个准星；点右下角或顶部的「搜索附近」打开抽屉。
2. 选半径 `500m / 1km / 3km`（默认 1km），调用 `/api/search?lng&lat&radius&type`。
3. 结果按距离升序排列，每项显示店名、分类、距离，以及「已记录 ✓」角标（由后端比对 `external_id` 得出）。
4. 点某一条，抽屉内切到录入表单，**自动预填**名称、地址、坐标、分类和 `city_adcode`；只需填日期（默认今天）、星级（可选）、价位（可选，只有餐厅有）和备注（可选），保存即可。
5. 抽屉底部还有一个「**在地图上手动记一笔**」，这是唯一的手动记点入口（不做长按或右键）。提交前会检查附近 50m 内是否已有同名地点，命中就弹二选一（**合到已有地点** / **仍然新建**），不会自动合并。

**记录入口（回家补录）**：在顶部搜索框输入关键词，调用 `/api/search?keyword&city`；`city` 默认是地图中心所在城市，输入框右侧显示「上海 ∨」，可以切到「全国」。选中的店如果 `external_id` 已存在，表单标题会变成「再来一次」，保存时只追加一条 `visit`。

**搜索建议**：输入满 1 个字符后触发，防抖 300ms；建议项由本地已存（最多 4 条）和高德结果（最多 4 条）组成，用 ↑↓ 选择、Enter 打开、Esc 关闭；没有结果时提供「记一个『关键词』」入口。

**标记交互（详情抽屉）**：显示店名、类型或分类、地址、城市、总到访次数、最近一次日期和平均评分，下方是到访历史（日期、星级、价位、备注）。
- 每条到访右侧有一个**红色垃圾桶图标**，点击后按钮变成红底「确认删除？」，**3 秒**内再点一次才会执行，超时自动复原。
- 删掉某个地点的**最后一条**到访，后端会连带删除这个地点；前端关闭抽屉，并弹 toast「已删除该地点」。
- 底部按钮：「再去一次」（追加今天的到访）和「删除地点」（同样要二次确认）。
- **不做**单条到访编辑，也**不做**地点信息编辑。

### 3.3 城市页

- 全国视野（zoom 4）AMap + `AMap.GeoJSON` 图层渲染**地级市边界**。
  - **已点亮**（有 place 或 `city_manual` 记录）：`--accent` 25% 填充，`--accent-ink` 1.5px 描边，城市名常显，下面一行「餐厅 N · 景点 M」（zoom < 5 时隐藏）。
  - **未点亮**：透明填充，极淡灰描边（全国常驻，任意城市可点）；名字只在 hover 或选中时出现。
- 边界数据来自 DataV.GeoAtlas，**逐省懒加载**（并发 4），缓存到 `data/geo/prov_<adcode>.json`；已经缓存的省立即渲染，缺的按「正在加载城市边界 12/34」的进度补齐，补齐之后完全离线。
- **行政单元归一化**：4 个直辖市合并为 1 个城市（多边形用省级轮廓 `310000.json` 等，不用 16 个区）；省直辖县级市（仙桃/济源/海南各县）保留为独立城市；台湾（710000，DataV 无数据）不画多边形，也不能点亮；港澳正常。
- 点某城市 → 浮卡片：
  - 已点亮：显示餐厅 N、景点 M、最近一次时间，以及「在地图上查看」；点击后跳回地图页，视野移到该城地点范围并高亮这些标记（**不改筛选 chips**）。
  - 未点亮：显示「点亮」按钮，点击后写入 `city_manual`。
  - 手动补标城市：「取消补标」。
- 虚线航线：按**首次到访日期**依次连接各已点亮城市的中心，`#b487b3`、透明度 0.55 的虚线。

### 3.4 关键实现约定

- `AMapCanvas.vue` 只负责 JSAPI 生命周期（load → 建图 → 销毁清理），**命令式 API 用 `shallowRef` + `watch` 驱动**，不让 Vue 响应式包裹 AMap 实例。
- 所有数据访问走 `lib/api.ts`（`fetch` + 统一错误 toast），用 `@tanstack/vue-query` 做缓存与失效（标记删除后自动刷新列表/统计）。
- 状态（`places`、`filters`、`stats`、抽屉状态）放 Pinia；地图实例不放进 store。
- 响应式断点 `860px`：≥860 时抽屉改为右侧栏（404px），统计改成常驻卡；<860 时抽屉在底部、高 90vh，统计收成徽标。**不使用 `data-surface` 双壳**。
- 移动端打开「搜索附近」时，地图容器缩到抽屉上方（约 44vh）并 `map.resize()`，让准星与半径圈始终可见（这也是「半径圈不被抽屉遮挡」的落地方式）。
- 不引入 UI 组件库，样式手写（CSS 变量定义主题色，为二期视觉留改口）。
- 视觉与交互以 `prototype/` 为准（其缺陷按 §3.2 已修正：搜索按钮不换行、移动端标签常显、半径圈不被抽屉遮挡、建议面板对齐输入框）。
- 初始视野：先读 `localStorage` 里的上次地图视野；没有就用 `/v3/ip` 定位到省份中心；再没有就落在全国中心（104.19, 35.86）、zoom 4。空库时显示引导语「拖地图到店门口 → 点『搜索附近』开始记录」。

## 4. 后端设计

### 4.1 数据模型（`server/schema.sql`）

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS place (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL CHECK (type IN ('restaurant','spot')),
  name         TEXT NOT NULL,
  external_id  TEXT UNIQUE,            -- 高德 POI id；手选点为 NULL
  address      TEXT,
  lng          REAL NOT NULL,          -- GCJ-02
  lat          REAL NOT NULL,
  category     TEXT,                   -- 高德分类，如 "餐饮服务;中餐厅"
  city_name    TEXT,
  city_adcode  TEXT,                   -- 用于城市反推与高亮（直辖市存省级 adcode）
  district     TEXT,
  created_time TEXT NOT NULL DEFAULT (datetime('now')),
  updated_time TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visit (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id     INTEGER NOT NULL REFERENCES place(id) ON DELETE CASCADE,
  visited_date TEXT NOT NULL,            -- 'YYYY-MM-DD'
  rating       INTEGER CHECK (rating BETWEEN 1 AND 5),
  price_tier   TEXT CHECK (price_tier IN ('low','mid','high')),  -- 仅餐厅
  note         TEXT,
  created_time TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_visit_place ON visit(place_id, visited_date DESC);

CREATE TABLE IF NOT EXISTS city_manual (   -- 手动补标的"去过"城市
  adcode      TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  marked_time TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS city_dict (     -- 城市字典（启动时从 /v3/config/district 同步）
  adcode    TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  lng       REAL,
  lat       REAL
);
```

- 城市的唯一口径：`SELECT DISTINCT city_adcode FROM place WHERE city_adcode IS NOT NULL UNION SELECT adcode FROM city_manual`。
- 统计三张卡片分别显示：饭店数 `count(place where type='restaurant')`、景点数 `count(place where type='spot')`，以及上面这个城市集合的大小。
- 高德 POI 结果**不含 adcode**（只有 `pname/cityname/adname`），`regeo` 对直辖市还会返回 `city: []`，因此落库时按这个顺序取 adcode：先按 `cityname` 查 `city_dict`；`cityname` 为空就按 `pname`（省级）取；仍然查不到才调 `/v3/geocode/regeo` 兜底。

### 4.2 API 清单（13 个）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/config` | `{ jsKey, serviceHost, priceTiers }` |
| GET | `/api/places` | 标记列表（仅 `?type=` 筛选），每条带 `visit_count`/`last_visited_on`/`last_rating` |
| GET | `/api/places/:id` | 详情 + 全部 visits |
| POST | `/api/places` | 建地点；`external_id` 命中则**追加 visit** 并返回 `{place, visit, deduped:true}` |
| DELETE | `/api/places/:id` | 级联删 visits |
| POST | `/api/places/:id/visits` | 新增到访（"再去一次"） |
| DELETE | `/api/visits/:id` | 删除单次到访；**若是该地点最后一条，连带删除地点**，返回 `{ place_deleted: true }` |
| GET | `/api/search` | 高德代理：`?keyword=&lng=&lat=&radius=&type=`；有关键词走 `place/text`，有坐标+半径走 `place/around`；结果附 `existing_place_id` |
| GET | `/api/regeo` | 逆地理编码：坐标 → 城市名/adcode/区县 |
| GET | `/api/cities` | 去过的城市列表 + 每城 `restaurant_count`/`spot_count`/`last_visited_on` |
| GET | `/api/cities/geo` | 地级市 GeoJSON（按省缓存、全国轮廓，服务端归一化后合并下发） |
| POST / DELETE | `/api/cities/manual` | 补标 / 取消补标城市 |
| GET | `/api/stats` | 三个数字 |

**明确不做**：`PATCH /api/places/:id`（地点编辑）、`PATCH /api/visits/:id`（到访编辑）、`?year=`（年份筛选）、`?city=`（城市筛选）、`stats.visit_total`。

### 4.3 高德代理层（`server/amap.ts`）

- `searchText` / `searchAround` / `regeo` / `district` 四个函数，统一处理：注入 `key=AMAP_WEB_KEY`、`city_limit=false`、超时 5s、失败重试 1 次。
- **类型映射**：`/api/search?type=restaurant` 传 `types=050000`；`type=spot` 传 `050000` 之外的白名单，比如 `110000`（风景名胜）、`140000`（科教文化），实现时按 typecode 前缀过滤。返回结果只保留能归类的项（`05*` 记为 restaurant，`11*`/`14*` 记为 spot），其余丢弃。
- 错误映射：把高德的 `infocode` 翻成中文可读的错误（`10001` key 错误、`10003` 超配额、`10008/10009` 安全密钥或平台不匹配等），前端 toast 可以直接展示。
- **缓存**：`place/text|around` 的响应放进内存 LRU（键是参数串，TTL 10min）；结果里的 POI 详情落进 `place` 表后就是长期缓存。
- **城市字典**：启动时用 `/v3/config/district?keywords=中国&subdistrict=2`（实测 55KB）同步一次到 `city_dict`，并做归一化：把直辖市的伪城市（上海城区 `310100`、重庆城区/郊县 `500100/500200`）折叠到省级 adcode。之后按名称在本地匹配，不用再请求。
- `/_AMapService/*` 反向代理：转发到 `https://restapi.amap.com/*`，**追加 `jscode=AMAP_SECURITY_CODE` + `platform=JS&s=rsv3`**，只允许 `GET`，5s 超时。

### 4.4 边界数据（`server/geo.ts`）

- 源：`https://geo.datav.aliyun.com/areas_v3/bound/<adcode>_full.json`，逐省（33 个可用，台湾 404）。
- 归一化：直辖市跳过其 `district` 级要素，改用 `<adcode>.json`（省级整体轮廓，如上海 21KB）；其余 `level=city` 要素照收（含省直辖县级市、海南各县）。
- 缓存：`data/geo/prov_<adcode>.json` 原样落盘，`data/geo/index.json` 记录已完成的省份；`/api/cities/geo` 只下发已经缓存的部分，其余由前端按进度提示补齐。
- 首次全量约 **3.68MB**，之后零网络请求。

### 4.5 运行与运维

- 启动自检：三个 key 缺任意一个，就打印中文指引并 `exit(1)`；`PORT` 不合法也直接退出。
- 启动横幅：打印 `本机 http://localhost:8787`、所有非回环 IPv4 的 `http://<ip>:8787`，以及 ASCII 二维码（`qrcode-terminal`），并提示「手机需与电脑同一 WiFi，首次连接请在 Windows 防火墙弹窗选『专用网络』」；随后尝试自动打开默认浏览器。
- 端口被占用（`EADDRINUSE`）：打印「程序似乎已在运行，已为你打开浏览器」并 `exit(0)`。
- 数据库：`data/orbit.db`，WAL 模式；启动时执行 `schema.sql`（幂等 `IF NOT EXISTS`）；备份就是复制 `data/` 目录。
- 日志：请求行和错误堆栈打到 `stdout`，留在控制台方便查看。
- 不做认证（仅监听局域网，不做端口转发）。

### 4.6 Windows 交付（git 直连，不再打包 zip）

交付流程：`git pull`，首次还要 `npm install`，然后双击 `启动.bat`。

`启动.bat`（约 30 行，纯检测 + 调用）：

1. `chcp 65001` + 设置窗口标题；
2. `node -v` 主版本 `< 24` 时，打印安装指引并 `pause` 退出；
3. `node_modules` 不存在时，打印「请先执行 npm install」并 `pause`（不自动装）；
4. `.env` 不存在时，打印「请复制 .env.example 为 .env 并填写三个 key」并 `pause`；
5. `web/dist` 不存在时，自动执行 `npm run build`；
6. `node server\index.ts`（控制台保持打开，关窗即停止）。

`开发.bat`（可选）：`npm run dev:server`（`node --watch server/index.ts`）+ `npm run dev:web`（Vite HMR `5173`，`/api` 与 `/_AMapService` 代理到 `8787`）并行。
**不提供** `scripts/pack.mjs`（zip 中转已取消）。

npm scripts：

| 命令 | 作用 |
|---|---|
| `npm run dev:server` / `dev:web` | 后端 watch / Vite 开发服务器 |
| `npm run build` | 构建 `web/dist`（生产） |
| `npm start` | 起生产服务（需要 `web/dist`） |
| `npm test` | 后端 8 条集成测试（`node --test`，无需额外依赖） |
| `npm run typecheck` | `tsc --noEmit`（前后端共享一个 tsconfig） |

> npm 11 默认不执行依赖的安装脚本，`esbuild` 缺 postinstall 会导致 `vite build` 失败。
> `package.json` 里的 `allowScripts` 已显式放行 `esbuild` 与 `vue-demi`，`npm install` 会自动生效，无需手动干预。

## 5. 测试设计

### 5.1 开工前验证（原 M0 Spike，已全部通过）

| 检查项 | 实测结果 |
|---|---|
| JSAPI 在 `http://<IP>:<port>` 下加载 | ✅ 地图 `complete`，无 key 报错；`PlaceSearch` 走代理成功 |
| `/_AMapService` 代理注入密钥 | ✅ 需 `jscode + platform=JS&s=rsv3`；只加 `jscode` → `10009` |
| 静态资源缓存头 | ✅ `/assets/*` 长缓存 immutable，`index.html` / API `no-cache`，改完刷新不会卡在旧页面 |
| 旧前端导致的「改了没效果」 | ✅ `启动.bat` 自动比较 mtime 重建，横幅打印 bundle 名 + 构建时间，`?debug=1` 面板上报同一时间戳 |
| 移动端卡顿定位 | ✅ `?debug=1` 面板（帧率 / 最低帧 / 长任务 / 地图重绘节奏 / 标记重建耗时）一键 POST 到 `/api/diag`，在电脑控制台看 |
| 局域网地址自动挑选 | ✅ 跳过 `198.18.0.1`（代理 TUN）、`169.254.x`；`192.168` 优先，支持 `LAN_IP` 覆盖 |
| `node:sqlite` + Hono 起服务 | ✅ `node:sqlite` 免 flag 可用 |
| DataV 地级市 GeoJSON | ✅ 33/34 省可下（3.68MB/475 要素），二次启动零请求；台湾 404 |
| `AMap.GeoJSON` + `AMap.MarkerCluster` | ✅ 均可渲染（江苏 13 市验证通过） |
| 内置/自定义地图样式 | ❌ `mapStyle` 被忽略、`/v4/map/styles2` 返回 `10002` → 改用 CSS 滤镜 |
| 高德瓦片直连（Leaflet 退路） | ✅ `webrd0X.is.autonavi.com` 无 key 返回 PNG |

### 5.2 后端集成测试（`node --test`，内置运行器，高德 API 全部 mock）

1. 新建 place + 首次 visit 成功，`external_id` 唯一；
2. 同 `external_id` 二次 POST → 不新建 place、追加 visit、返回 `deduped:true`；
3. 手选点（`external_id=null`）可建多条，互不干扰；
4. `DELETE visit` 生效，place 的 `visit_count` 随之变化；
5. 删除某地点**最后一条** visit → 返回 `place_deleted:true` 且地点被删；
6. `DELETE place` 级联删除 visits；
7. `POST /api/cities/manual` / `DELETE` 生效，城市并集口径正确（含直辖市归一化：`310101` 落库为 `310000`）；
8. `/api/stats` 三个数字口径正确（同一店多次到访只算一家店）。

### 5.3 手动验收清单（Windows，约 5 分钟）

1. `node -v` = v24.x；`git pull` 无冲突；
2. `npm install` 成功（失败就把报错贴出来）；
3. 复制 `.env.example` 为 `.env`，填好三个 key；
4. 双击 `启动.bat`，控制台出现本机地址、手机地址和二维码，浏览器自动打开；
5. 手机连同一 WiFi 扫码，地图显示正常（**这是 key 白名单的实测点**）；
6. 用「搜索附近」选一家店保存，标记就会出现；再搜同一家会显示「已记录」，保存后到访次数变成 2；
7. 在详情抽屉里删掉某地点的唯一一条到访，地点消失，统计同步；
8. 切到城市 Tab，全国轮廓加载完成，该城市已被点亮，未点亮城市可以点「点亮」；统计浮窗三个数字同步；
9. 关掉窗口，服务停止；重启后数据还在（`data\orbit.db`）。

### 5.4 前端冒烟

用 `agent-browser` 做一次性冒烟：起服务、打开页面、录一条记录、核对统计、切到城市页、截图存档。步骤记录在 `scripts/smoke.md`，**不引入 Playwright/Puppeteer 依赖，也不进 CI**。

### 5.5 移动端卡顿排查

iPad / 手机上开不了 DevTools，所以把采样搬回电脑控制台：

1. 浏览器打开 `<地址>?debug=1`，左下角出现自检面板（`?fps=1` 也兼容）；
2. 拖动 / 缩放下地图，面板实时显示帧率、最低帧、卡顿次数、主线程延迟、地图重绘节奏、标记数量与重建耗时；
3. 面板会自己上报（进页面 8s，之后每 20s），也可以点「上报到电脑控制台」；
4. 服务端 `POST /api/diag` 把字段逐行打印到启动窗口（不落库、不存文件，最多 8KB）。

判别口径：`minFps` 低 + `frozenFrames` 多 + `loopLagMs` 大 → 主线程忙（高德渲染 JS / 我们的代码）；`loopLagMs` 小 → 主线程空闲，卡在 GPU / 合成器；`mapFramesPerSec` 低 + `slowResources` 有高德瓦片 → 等网络。

两个对照开关（可叠加在 `?debug=1` 上，`query` / `mapOptions` 字段会记下）：

- `dpr=1`：在 `loadAMap` 里把 `window.detectRetina = 0`（必须在高德脚本执行前设），让底图按 1x 而不是 dpr 倍渲染；iPad 实测无改善；
- `labels=0` / `nopoint=1` / `nobuilding=1` / `lean=1`：分别关掉底图注记 / POI 图标 / 建筑 / 只剩底色+道路；
- `dom=1`：在 `new AMap.Map` 前把 `AMap.Browser.isWebGL = false`（并置 `baseRender = 'd'`），高德会落到 DomRender → 栅格瓦片，注记烘在图片里。

iPad 实测（Chrome iOS，dpr 2，0 条地点）：

| URL | minFps | frozenFrames | loopLagMs |
|---|---|---|---|
| `?debug=1` | 3–6 | 3–12 | 295–353 |
| `?debug=1&dpr=1` | 5–11 | 8–10 | 298–308 |
| `?debug=1&labels=0` | 40–58 | 0 | 10–70 |
| `?debug=1&nopoint=1` | 5–6 | 6–8 | 316–362 |
| `?debug=1&nobuilding=1` | 4–7 | 12–20 | 333–374 |
| `?debug=1&lean=1` | 56–58 | 0 | 9–26 |

定位结论：瓶颈在高德 2.0 WebGL 的**矢量文字注记**（主线程排版、建纹理），POI 图标 / 建筑 / 填充率 / 网络都已排除。后续按 `dom=1` 的结果决定触屏默认：能保注记且流畅就默认 DomRender，否则触屏在 zoom ≥ 13 关底图注记（自有标记名照旧显示）。

面板里的 `build` 与启动横幅的「前端 bundle · 构建时间」对比，能直接确认手机上跑的是不是最新前端；不能对上就是 dist 旧 / 浏览器缓存，先重启 `启动.bat`（会自动重建）。

## 6. 待办需求

### 6.1 需要你做的事

- [x] 高德开放平台注册 + 个人实名认证，创建两个 key（Web端 JS API / Web服务）并记下安全密钥
- [x] 确认 Web端 key 的**域名白名单为空**（否则局域网 IP 访问会 `INVALID_USER_DOMAIN`）
- [ ] Windows 宿主机安装 **Node 24 LTS**（勾选 Add to PATH）
- [ ] `git pull` 后首次执行 `npm install`
- [ ] 复制 `.env.example` → `.env` 并填写三个 key（不入库）
- [ ] 首次运行后确认防火墙弹窗选择「专用网络」，否则手机连不上

### 6.2 二期 Backlog

- 编辑地点信息、编辑单条到访（本轮已明确不做）
- 长按/右键地图空白处记点、补标城市搜索、城市页到地图的筛选联动
- 自定义地图样式（控制台建样式 → 给 styleId，替换 CSS 滤镜）
- 时间轴筛选（滑块/年份切换）与"年度总结"页（`?year=` 接口届时再加）
- 到访照片墙、相册上传与压缩
- 统计增强：评分榜、最近一次卡片、按价位估算的总花费区间
- 只读分享页 / 生成年度海报（需 HTTPS 或长链接方案）
- HTTPS + 手机定位（`mkcert` 自签，恢复到"我在附近"的原始需求）
- 单文件 `exe` 打包（Node SEA 或 Bun `--compile`），替换 bat
- 省份级着色、城市旅行路线动画
- 数据导出（JSON/CSV）与自动备份
