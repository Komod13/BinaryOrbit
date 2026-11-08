# 前端冒烟（agent-browser）

不引 Playwright/Puppeteer 依赖；用 `agent-browser` 手动跑一遍，截图存档即可。
服务先跑起来：`npm run build && npm start`（或双击 `启动.bat`），默认 `http://localhost:8787`。

## 准备

```bash
export AGENT_BROWSER_SESSION="bo-smoke"
agent-browser set viewport 1440 900
agent-browser open http://localhost:8787/map
```

## 1. 地图页骨架（桌面）

```bash
agent-browser eval 'JSON.stringify({
  pins: document.querySelectorAll(".pin-marker").length,
  clusters: document.querySelectorAll(".pin-cluster").length,
  stats: [...document.querySelectorAll(".stat-num")].map(n => n.textContent.trim()),
  tileFilter: getComputedStyle(document.querySelector(".amap-layer-tile")).filter
})'
agent-browser screenshot /tmp/smoke-1-map.png
```

通过标准：`tileFilter` 含 `saturate(0.35)`；统计三项与 `/api/stats` 一致；无 console 报错。

## 2. 搜索附近 → 录一条

```bash
agent-browser click ".nearby-btn"
agent-browser eval 'document.querySelectorAll(".result").length'      # > 0
agent-browser eval 'var r=[...document.querySelectorAll(".result")].find(x=>!x.querySelector(".badge")); r.click(); "ok"'
agent-browser eval 'document.querySelectorAll(".sheet-actions .btn").length'   # 保存 / 取消
agent-browser eval '[...document.querySelectorAll(".sheet-actions .btn")].find(b=>b.textContent.trim()==="保存").click()'
agent-browser screenshot /tmp/smoke-2-saved.png
```

通过标准：保存后抽屉关闭、弹出 toast、统计数字 +1、地图上出现新标记。

## 3. 详情抽屉 → 删到访

```bash
agent-browser eval 'document.querySelector(".pin-marker").click()'
agent-browser eval 'document.querySelector(".visit-delete").click(); document.querySelector(".visit-delete").click()'
agent-browser screenshot /tmp/smoke-3-delete.png
```

通过标准：
- 有多条到访时 → 「已删除这条到访」，地点仍在；
- 只剩一条时 → 「已删除该地点的最后一条到访，地点同时被删除」，抽屉关闭、统计 -1。

## 4. 关键词搜索 + 城市范围

```bash
agent-browser eval 'var i=document.querySelector(".search-field input"); i.focus(); i.value="西湖"; i.dispatchEvent(new Event("input")); "ok"'
agent-browser eval 'JSON.stringify({rows: [...document.querySelectorAll(".suggest-row")].length, scope: document.querySelector(".scope-toggle").textContent.trim()})'
agent-browser screenshot /tmp/smoke-4-suggest.png
```

通过标准：先出本地已记录项，再出高德结果；城市范围显示当前城市，点一下可切「全国」。

## 5. 手动记点 50m 合并

地图中心附近先有一个同名地点时：

```bash
agent-browser click ".nearby-btn"
agent-browser eval '[...document.querySelectorAll(".btn")].find(b=>b.textContent.includes("手动记一笔")).click()'
agent-browser eval 'var n=document.querySelector("#form-name"); n.value="<已存在的同名地点>"; n.dispatchEvent(new Event("input")); [...document.querySelectorAll(".sheet-actions .btn")].find(b=>b.textContent.trim()==="保存").click()'
agent-browser screenshot /tmp/smoke-5-merge.png
```

通过标准：出现「合到已有地点 / 仍然新建」二选一；选「合到已有地点」后该地点到访 +1，选「仍然新建」则新建一条。

## 6. 城市页

```bash
agent-browser open http://localhost:8787/cities
agent-browser eval 'JSON.stringify({
  labels: [...document.querySelectorAll(".city-label")].map(e => e.textContent.trim()),
  sub: document.querySelector(".cities-sub").textContent.replace(/\s+/g," ").trim(),
  progress: document.querySelector(".cities-progress")?.textContent || null
})'
agent-browser screenshot /tmp/smoke-6-cities.png
```

通过标准：已点亮城市有紫色多边形 + 名称（zoom<5 时无副行）；未点亮城市可点开「点亮」；
点「在地图上查看」跳到 `/map?city=<adcode>` 并高亮该城标记。

## 7. 移动端

```bash
agent-browser set viewport 390 844
agent-browser open http://localhost:8787/map
agent-browser screenshot /tmp/smoke-7-m-map.png
agent-browser click ".nearby-btn"
agent-browser eval 'JSON.stringify({
  mapH: Math.round(document.querySelector(".amap-shell").getBoundingClientRect().height),
  circle: !!document.querySelector(".amap-layer-overlay circle"),
  statsTop: Math.round(document.querySelector(".stats").getBoundingClientRect().top),
  chipsBottom: Math.round(document.querySelector(".chips").getBoundingClientRect().bottom)
})'
agent-browser screenshot /tmp/smoke-8-m-search.png
```

通过标准：地图缩到抽屉上方（约 44vh），准星与半径圈可见，统计徽标不压 chips 行。

## 8. 搜索范围跟随地图中心

```bash
# 全国视野（zoom 5）
agent-browser eval 'localStorage.setItem("bo.map.view", JSON.stringify({lng:112.7,lat:31.0,zoom:5})); location.reload()'
# 输入任意关键词后看建议面板底部
agent-browser eval 'var i=document.querySelector(".search-field input"); i.focus(); i.value="餐厅"; i.dispatchEvent(new Event("input"))'
agent-browser eval 'document.querySelector(".scope-toggle").textContent.replace(/\s+/g," ").trim()'
# → 搜索范围：全国 切换

# 杭州 zoom 13
agent-browser eval 'localStorage.setItem("bo.map.view", JSON.stringify({lng:120.1551,lat:30.2741,zoom:13})); location.reload()'
# → 搜索范围：杭州市 切换，且请求带 city=330100
```

通过标准：范围只跟随**当前地图中心**；缩放到 zoom < 9 时自动退化为「全国」；
地图移动很远后不再显示上一个城市的名字（宁可短暂显示「定位中…」）。

## 9. 切换与刷新

```bash
agent-browser eval 'document.querySelectorAll(".tab")[1].click()'
agent-browser eval 'document.querySelectorAll(".tab")[0].click()'
agent-browser eval 'document.querySelectorAll(".pin-marker").length'    # 切回来标记仍在（KeepAlive）
agent-browser reload
agent-browser eval 'JSON.stringify({url: location.pathname, pins: document.querySelectorAll(".pin-marker").length})'
```

通过标准：刷新后仍停在当前 Tab，标记与统计正常，无「地图加载中」卡死。

## 最近一次记录（2026-11）

| 步骤 | 结果 |
|---|---|
| 1 地图页骨架 | ✅ 瓦片滤镜生效，8 个标记 / 2 个聚合，统计 4/4/4 |
| 2 搜索附近 → 保存 | ✅ 50 条结果，保存后统计 +1、标记 +1 |
| 3 删除最后一条到访 | ✅ 地点连带删除，toast 提示，抽屉关闭 |
| 4 关键词搜索 | ✅ 本地 + 高德混合，城市范围「上海市 切换」 |
| 5 50m 同名合并 | ✅ 弹出二选一，合并后到访 1→2 |
| 6 城市页 | ✅ 4 座城市点亮，369 个地级市要素，未点亮城市可点亮 |
| 7 移动端 | ✅ 地图 371px / 准星 186 / 半径圈可见 / 统计徽标 110（chips 底 102） |
| 8 搜索范围 | ✅ 全国视野显示「全国」、杭州 zoom13 显示「杭州市」且请求带 `city=330100` |
| 9 切换与刷新 | ✅ KeepAlive 保留实例，刷新保持当前 Tab |
