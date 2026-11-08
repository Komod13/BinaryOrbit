/* 双星轨道 · 原型交互
   地图 / 城市两个 Tab，记录流程、统计与筛选都在这里。 */
(function () {
  'use strict';

  var SURFACE = document.documentElement.getAttribute('data-surface') === 'mobile' ? 'mobile' : 'desktop';
  var M_PER_PX = 6;

  /* ---------------------------------------------------------------- icons */

  var PATHS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    map: '<path d="M3 6.5 9 4.5l6 2 6-2v13l-6 2-6-2-6 2z"/><path d="M9 4.5v13M15 6.5v13"/>',
    city: '<path d="M4 21V10h6v11M14 21V4h6v17"/><path d="M2 21h20"/>',
    bowl: '<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M9 7.6c0-1.7 1.1-2.1 1.1-3.6M14 7.6c0-1.7 1.1-2.1 1.1-3.6"/>',
    camera: '<path d="M4 8h3l1.5-2.2h7L17 8h3v11H4z"/><circle cx="12" cy="13.4" r="3.2"/>',
    star: '<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.7l5.8-.8z"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    trash: '<path d="M4 7h16M9 7V4.8h6V7M7 7l1 13h8l1-13"/>',
    again: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4.5V9h-4.5"/>',
    pin: '<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>'
  };

  function icon(name) {
    return '<svg class="od-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (PATHS[name] || '') + '</svg>';
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function todayISO() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  /* ---------------------------------------------------------------- data */

  var places = [
    {
      id: 'p1', type: 'restaurant', name: '大壶春（四川中路）', category: '生煎 · 本帮小吃',
      address: '黄浦区四川中路 136 号', city: '上海', x: 872, y: 502, externalId: 'B0FF001',
      visits: [
        { date: '2026-05-02', rating: 5, tier: 'low', note: '皮薄汁多，还是这个味' },
        { date: '2025-01-04', rating: 4, tier: 'low', note: '' },
        { date: '2024-03-16', rating: 5, tier: 'low', note: '第一次来排了 20 分钟' }
      ]
    },
    {
      id: 'p2', type: 'restaurant', name: '老吉士酒家', category: '本帮菜',
      address: '徐汇区天平路 41 号', city: '上海', x: 448, y: 640, externalId: 'B0FF002',
      visits: [
        { date: '2026-02-14', rating: 5, tier: 'high', note: '红烧肉配一碗饭' },
        { date: '2024-05-20', rating: 4, tier: 'high', note: '' }
      ]
    },
    {
      id: 'p3', type: 'restaurant', name: '阿娘面馆', category: '面馆',
      address: '黄浦区思南路 36 号', city: '上海', x: 762, y: 608, externalId: 'B0FF003',
      visits: [{ date: '2025-11-09', rating: 4, tier: 'low', note: '黄鱼面要趁热' }]
    },
    {
      id: 'p4', type: 'restaurant', name: '泰安门', category: '创意菜',
      address: '静安区泰安路 113 号', city: '上海', x: 616, y: 522, externalId: 'B0FF004',
      visits: [{ date: '2026-03-21', rating: 5, tier: 'high', note: '留着纪念日再来' }]
    },
    {
      id: 'p5', type: 'restaurant', name: '佳家汤包（黄河路）', category: '小笼 · 汤包',
      address: '黄浦区黄河路 90 号', city: '上海', x: 906, y: 472, externalId: 'B0FF005',
      visits: [
        { date: '2026-01-18', rating: 5, tier: 'low', note: '' },
        { date: '2023-12-02', rating: 4, tier: 'low', note: '第一顿在上海的早餐' }
      ]
    },
    {
      id: 'p6', type: 'restaurant', name: '天泰餐厅（嘉里中心）', category: '泰国菜',
      address: '静安区南京西路 1515 号', city: '上海', x: 548, y: 466, externalId: 'B0FF006',
      visits: [{ date: '2025-08-17', rating: 3, tier: 'mid', note: '冬阴功偏酸' }]
    },
    {
      id: 'p7', type: 'spot', name: '外滩', category: '城市景观',
      address: '黄浦区中山东一路', city: '上海', x: 1046, y: 530, externalId: 'B0FF007',
      visits: [
        { date: '2026-02-14', rating: 5, tier: null, note: '风很大，灯很好看' },
        { date: '2023-10-01', rating: 4, tier: null, note: '' }
      ]
    },
    {
      id: 'p8', type: 'spot', name: '武康路', category: '街区漫步',
      address: '徐汇区武康路', city: '上海', x: 382, y: 688, externalId: 'B0FF008',
      visits: [{ date: '2024-04-05', rating: 4, tier: null, note: '梧桐刚发芽' }]
    },
    {
      id: 'p9', type: 'spot', name: '豫园', category: '园林',
      address: '黄浦区福佑路 168 号', city: '上海', x: 1004, y: 648, externalId: 'B0FF009',
      visits: [{ date: '2024-05-20', rating: 4, tier: null, note: '人多，早上去更好' }]
    },
    {
      id: 'p10', type: 'spot', name: '上海当代艺术博物馆', category: '美术馆',
      address: '黄浦区苗江路 678 号', city: '上海', x: 888, y: 758, externalId: 'B0FF00A',
      visits: [{ date: '2026-01-11', rating: 5, tier: null, note: '双年展，逛了三个小时' }]
    }
  ];

  var poiPool = [
    { id: 'B0FF001', name: '大壶春（四川中路）', type: 'restaurant', category: '生煎 · 本帮小吃', address: '黄浦区四川中路 136 号', x: 872, y: 502 },
    { id: 'B0FF101', name: '田子坊', type: 'spot', category: '特色街区', address: '黄浦区泰康路 210 弄', x: 822, y: 646 },
    { id: 'B0FF102', name: '老正兴菜馆', type: 'restaurant', category: '本帮菜', address: '黄浦区福州路 556 号', x: 900, y: 560 },
    { id: 'B0FF103', name: '南翔馒头店', type: 'restaurant', category: '小笼', address: '黄浦区豫园路 85 号', x: 1002, y: 604 },
    { id: 'B0FF104', name: '上海中心大厦', type: 'spot', category: '城市地标', address: '浦东新区银城中路 501 号', x: 1300, y: 556 },
    { id: 'B0FF105', name: '西岸美术馆', type: 'spot', category: '美术馆', address: '徐汇区龙腾大道 2600 号', x: 262, y: 722 },
    { id: 'B0FF106', name: '朱家角古镇', type: 'spot', category: '古镇', address: '青浦区朱家角镇', x: 96, y: 420 },
    { id: 'B0FF107', name: '光明邨大酒家', type: 'restaurant', category: '本帮熟食', address: '黄浦区淮海中路 588 号', x: 806, y: 622 }
  ];

  var CITY_NAMES = {
    shanghai: '上海', nanjing: '南京', suzhou: '苏州', hangzhou: '杭州',
    xiamen: '厦门', beijing: '北京', chengdu: '成都', qingdao: '青岛'
  };

  var CITY_POS = {
    shanghai: { x: 900, y: 430 },
    nanjing: { x: 380, y: 330 },
    suzhou: { x: 680, y: 330 },
    hangzhou: { x: 700, y: 530 },
    xiamen: { x: 560, y: 620 },
    beijing: { x: 560, y: 120 },
    chengdu: { x: 180, y: 430 },
    qingdao: { x: 900, y: 180 }
  };

  /* a narrower constellation for the phone surface so labels stay readable */
  var CITY_POS_M = {
    beijing: { x: 108, y: 82 },
    qingdao: { x: 298, y: 92 },
    nanjing: { x: 100, y: 215 },
    suzhou: { x: 280, y: 205 },
    shanghai: { x: 250, y: 315 },
    hangzhou: { x: 140, y: 365 },
    chengdu: { x: 66, y: 480 },
    xiamen: { x: 232, y: 495 }
  };

  function cityPositions() { return SURFACE === 'mobile' ? CITY_POS_M : CITY_POS; }

  var state = {
    tab: 'map',
    filter: 'all',
    pan: { x: 0, y: 0 },
    zoom: 1,
    selected: null,
    radius: 1000,
    cities: [
      { id: 'shanghai', name: '上海' },
      { id: 'nanjing', name: '南京', manual: true },
      { id: 'suzhou', name: '苏州', manual: true },
      { id: 'hangzhou', name: '杭州', manual: true },
      { id: 'xiamen', name: '厦门', manual: true }
    ]
  };

  var TIERS = { low: '低', mid: '中', high: '高' };
  var TIER_HINT = { low: '<60', mid: '60–150', high: '>150' };

  /* ---------------------------------------------------------------- helpers */

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function byId(id) {
    for (var i = 0; i < places.length; i++) if (places[i].id === id) return places[i];
    return null;
  }

  function maxDate(visits) {
    var best = '';
    visits.forEach(function (v) { if (v.date > best) best = v.date; });
    return best;
  }

  function typeLabel(type) { return type === 'restaurant' ? '餐厅' : '景点'; }

  function moneyLabel(tier) { return tier ? '人均 ' + (TIERS[tier] || tier) + '档' : ''; }

  function starsMarkup(n) {
    var out = '<span class="stars" role="img" aria-label="评分 ' + n + ' 星">';
    for (var i = 0; i < 5; i++) {
      out += icon('star').replace('class="od-icon"', 'class="od-icon ' + (i < n ? 'star-on' : 'star-off') + '"');
    }
    out += '</span>';
    return out;
  }

  function shortName(name) {
    return name.replace(/（.*?）/g, '');
  }

  /* ---------------------------------------------------------------- map art */

  function mapSvg() {
    var minor = [];
    [110, 215, 320, 412, 500, 600, 668, 700, 842, 902, 962, 1062, 1152, 1258, 1368, 1478, 1562].forEach(function (x, i) {
      var b = i % 3 === 0 ? 12 : -7;
      minor.push('<path class="road-minor" d="M ' + x + ' -40 C ' + (x + b) + ' 300 ' + (x - b) + ' 660 ' + (x + 4) + ' 1040"/>');
    });
    [92, 172, 258, 342, 420, 502, 582, 662, 732, 802, 882, 952].forEach(function (y, i) {
      var b = i % 2 ? 9 : -9;
      minor.push('<path class="road-minor" d="M -40 ' + y + ' C 420 ' + (y + b) + ' 900 ' + (y - b) + ' 1640 ' + (y + 4) + '"/>');
    });

    var major = [
      'M -40 470 C 300 466 560 474 862 486 C 942 490 1000 496 1044 504',
      'M -40 620 C 280 612 520 614 742 624 C 820 628 880 634 924 646',
      'M -40 552 C 340 546 700 552 980 570',
      'M 756 -40 C 760 260 766 600 772 1040',
      'M 1012 -40 C 992 200 968 400 946 620 C 930 780 922 900 920 1040',
      'M 1086 496 C 1200 596 1330 694 1470 800',
      'M 140 762 C 320 728 520 716 720 732 C 880 744 1000 792 1092 862'
    ];
    var bridges = [
      'M 1080 600 L 1252 608',
      'M 1040 770 L 1212 782',
      'M 1198 300 L 1372 308'
    ];

    var html = '<svg class="map-base" viewBox="0 0 1600 1000" preserveAspectRatio="none" aria-hidden="true" focusable="false">';
    html += '<rect width="1600" height="1000" fill="#ECEDE6"/>';

    /* parks */
    html += '<rect class="park" x="700" y="424" width="86" height="76" rx="10"/>';
    html += '<rect class="park" x="596" y="430" width="46" height="40" rx="8"/>';
    html += '<rect class="park" x="688" y="618" width="72" height="60" rx="10"/>';
    html += '<ellipse class="park" cx="1300" cy="730" rx="96" ry="58"/>';

    /* roads */
    html += minor.join('');
    major.forEach(function (d) {
      html += '<path class="road-casing" d="' + d + '"/><path class="road-major" d="' + d + '"/>';
    });

    /* water sits above the street grid so minor roads do not read as bridges */
    html += '<path class="water" d="M 1300 -40 C 1258 160 1230 300 1170 470 C 1118 620 1082 800 1078 1040 L 1168 1040 C 1172 800 1206 630 1258 480 C 1318 306 1346 160 1388 -40 Z"/>';
    html += '<path class="water" d="M -40 396 C 220 412 460 420 660 442 C 830 460 1000 486 1150 512 L 1152 552 C 1000 526 830 500 660 482 C 460 460 220 452 -40 436 Z"/>';

    bridges.forEach(function (d) { html += '<path class="road-bridge" d="' + d + '"/>'; });

    /* labels */
    var districts = [
      ['静安', 540, 352], ['虹口', 1000, 286], ['黄浦', 872, 700],
      ['徐汇', 452, 722], ['长宁', 262, 604], ['浦东', 1300, 648], ['普陀', 356, 330]
    ];
    districts.forEach(function (d) {
      html += '<text class="district" x="' + d[1] + '" y="' + d[2] + '" text-anchor="middle">' + d[0] + '</text>';
    });

    html += '<text class="water-label" x="1284" y="250" text-anchor="middle" transform="rotate(80 1284 250)">黄浦江</text>';
    html += '<text class="water-label" x="420" y="416" text-anchor="middle" transform="rotate(-2 420 416)">苏州河</text>';

    html += '<text class="road-label" x="250" y="462">南京西路</text>';
    html += '<text class="road-label" x="392" y="616">淮海中路</text>';
    html += '<text class="road-label" x="612" y="545">延安高架</text>';
    html += '<text class="road-label" x="1250" y="655" transform="rotate(31 1250 655)">世纪大道</text>';

    html += '<text class="park-label" x="743" y="470" text-anchor="middle">人民公园</text>';
    html += '<text class="park-label" x="1300" y="735" text-anchor="middle">世纪公园</text>';

    var marks = [['人民广场', 800, 546], ['陆家嘴', 1268, 512], ['新天地', 848, 636]];
    marks.forEach(function (m) {
      html += '<circle class="landmark-dot" cx="' + (m[1] - 10) + '" cy="' + (m[2] - 4) + '" r="3"/>';
      html += '<text class="landmark" x="' + m[1] + '" y="' + m[2] + '">' + m[0] + '</text>';
    });

    html += '</svg>';
    return html;
  }

  /* ---------------------------------------------------------------- shell */

  var app = document.getElementById('app');

  /* 标注层有时会把平移偏移写到根节点上，那会把整页推开；启动时清掉。 */
  app.removeAttribute('style');

  app.innerHTML =
    '<div class="map-viewport" id="mapViewport">' +
      '<div class="map-stage" id="mapStage">' + mapSvg() + '<div class="marker-layer" id="markerLayer"></div></div>' +
      '<div class="crosshair" aria-hidden="true"></div>' +
      '<div class="radius-ring" id="radiusRing" hidden aria-hidden="true"></div>' +
    '</div>' +

    '<section class="cities-view" id="citiesView" hidden aria-labelledby="citiesTitle">' +
      '<div class="cities-head">' +
        '<p class="eyebrow">城市</p>' +
        '<h1 class="cities-title" id="citiesTitle">走过的城市</h1>' +
        '<p class="cities-sub" id="citiesSub"></p>' +
      '</div>' +
      '<div class="city-canvas" id="cityCanvas"></div>' +
    '</section>' +

    '<header class="dock" id="dock" role="search">' +
      '<div class="dock-row">' +
        '<div class="search-field">' +
          '<input id="searchInput" type="search" placeholder="搜索餐厅、景点或地址" autocomplete="off" ' +
            'aria-label="搜索地点" aria-controls="suggest" aria-expanded="false">' +
          '<span class="search-glyph" aria-hidden="true">' + icon('search') + '</span>' +
        '</div>' +
        '<button class="nearby-btn" id="nearbyBtn" type="button">' + icon('pin') + '<span>搜索附近</span></button>' +
      '</div>' +
      '<div class="chips" id="chips" role="group" aria-label="按类型筛选"></div>' +
      '<div class="suggest" id="suggest" hidden></div>' +
    '</header>' +

    '<section class="stats" id="stats" data-open="false" aria-label="足迹统计">' +
      '<button class="stats-toggle" id="statsToggle" type="button" aria-expanded="false" aria-controls="statsCard">' +
        '<span class="stats-toggle-num" data-stat-badge>0</span><span class="stats-toggle-label">处足迹</span>' +
      '</button>' +
      '<div class="stats-card" id="statsCard">' +
        '<div class="stat od-stat"><span class="stat-num" data-stat="restaurant">0</span><span class="stat-label">餐厅</span></div>' +
        '<div class="stat od-stat"><span class="stat-num" data-stat="spot">0</span><span class="stat-label">景点</span></div>' +
        '<div class="stat od-stat"><span class="stat-num" data-stat="city">0</span><span class="stat-label">城市</span></div>' +
      '</div>' +
    '</section>' +

    '<nav class="tabbar" id="tabbar" aria-label="主导航">' +
      '<button class="tab is-active" type="button" data-tab="map" aria-current="page">' + icon('map') + '<span>地图</span></button>' +
      '<button class="tab" type="button" data-tab="cities">' + icon('city') + '<span>城市</span></button>' +
    '</nav>' +

    '<p class="map-note" id="mapNote">示意地图 · 非真实地理数据</p>' +
    '<div class="toast" id="toast" role="status" aria-live="polite"></div>' +
    '<dialog class="inspector" id="inspector" aria-labelledby="inspectorTitle">' +
      '<div class="inspector-panel" id="inspectorPanel" tabindex="-1"></div>' +
    '</dialog>';

  var el = {
    viewport: qs('#mapViewport'),
    stage: qs('#mapStage'),
    markerLayer: qs('#markerLayer'),
    ring: qs('#radiusRing'),
    dock: qs('#dock'),
    input: qs('#searchInput'),
    nearby: qs('#nearbyBtn'),
    chips: qs('#chips'),
    suggest: qs('#suggest'),
    stats: qs('#stats'),
    statsToggle: qs('#statsToggle'),
    tabbar: qs('#tabbar'),
    citiesView: qs('#citiesView'),
    citiesSub: qs('#citiesSub'),
    cityCanvas: qs('#cityCanvas'),
    note: qs('#mapNote'),
    toast: qs('#toast'),
    inspector: qs('#inspector'),
    panel: qs('#inspectorPanel')
  };

  var lastTrigger = null;
  var formCtx = { mode: null, place: null, poi: null };
  var toastTimer = 0;

  /* ---------------------------------------------------------------- render */

  function renderStats() {
    var r = places.filter(function (p) { return p.type === 'restaurant'; }).length;
    var s = places.filter(function (p) { return p.type === 'spot'; }).length;
    var c = state.cities.length;
    qs('[data-stat="restaurant"]').textContent = r;
    qs('[data-stat="spot"]').textContent = s;
    qs('[data-stat="city"]').textContent = c;
    qs('[data-stat-badge]').textContent = places.length;
  }

  function visiblePlaces() {
    return state.filter === 'all' ? places : places.filter(function (p) { return p.type === state.filter; });
  }

  function renderMarkers() {
    el.markerLayer.innerHTML = visiblePlaces().map(function (p) {
      var left = (p.x / 1600 * 100).toFixed(2);
      var top = (p.y / 1000 * 100).toFixed(2);
      return '<button class="marker marker--' + p.type + (state.selected === p.id ? ' is-active' : '') + '" type="button" ' +
        'data-place="' + p.id + '" style="left:' + left + '%;top:' + top + '%" ' +
        'aria-label="' + esc(p.name) + '，' + typeLabel(p.type) + '，到访 ' + p.visits.length + ' 次">' +
        '<span class="pin">' + icon(p.type === 'restaurant' ? 'bowl' : 'camera') + '</span>' +
        '<span class="marker-label">' + esc(shortName(p.name)) + '</span>' +
        '</button>';
    }).join('');
  }

  function renderChips() {
    var items = [
      { id: 'all', label: '全部', n: places.length },
      { id: 'restaurant', label: '餐厅', n: places.filter(function (p) { return p.type === 'restaurant'; }).length },
      { id: 'spot', label: '景点', n: places.filter(function (p) { return p.type === 'spot'; }).length }
    ];
    el.chips.innerHTML = items.map(function (i) {
      return '<button class="chip' + (state.filter === i.id ? ' is-active' : '') + '" type="button" data-filter="' + i.id + '" ' +
        'aria-pressed="' + (state.filter === i.id) + '">' + i.label +
        '<span class="chip-count">' + i.n + '</span></button>';
    }).join('');
  }

  function renderCities() {
    if (!el.citiesSub) return;
    el.citiesSub.innerHTML = '<b>' + state.cities.length + '</b> 座城市 <span>·</span> <b>' + places.length + '</b> 处地点';
    el.cityCanvas.innerHTML = citySvg();
  }

  function regionPoints(cx, cy, r, seed) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var a = (Math.PI * 2 * i) / 10 - Math.PI / 2;
      var wobble = 1 + 0.12 * Math.sin(i * 2.1 + seed * 1.7);
      pts.push((cx + Math.cos(a) * r * 1.1 * wobble).toFixed(1) + ',' + (cy + Math.sin(a) * r * 0.88 * wobble).toFixed(1));
    }
    return pts.join(' ');
  }

  function citySvg() {
    var pos = cityPositions();
    var isMobile = SURFACE === 'mobile';
    var vb = isMobile ? '0 0 400 640' : '0 0 1200 700';
    var r = isMobile ? 40 : 72;
    var nameY = isMobile ? 6 : 8;
    var metaY = isMobile ? 24 : 30;
    var w = isMobile ? 400 : 1200;
    var h = isMobile ? 640 : 700;
    var step = isMobile ? 64 : 90;
    var grid = [];

    for (var gx = step; gx < w; gx += step) grid.push('<line class="grid-line" x1="' + gx + '" y1="0" x2="' + gx + '" y2="' + h + '"/>');
    for (var gy = step; gy < h; gy += step) grid.push('<line class="grid-line" x1="0" y1="' + gy + '" x2="' + w + '" y2="' + gy + '"/>');

    var route = state.cities.map(function (c) { return pos[c.id].x + ',' + pos[c.id].y; }).join(' ');

    var nodes = Object.keys(pos).map(function (id, i) {
      var p = pos[id];
      var visited = state.cities.filter(function (c) { return c.id === id; })[0];
      var name = CITY_NAMES[id];
      var count = visited ? places.filter(function (pl) { return pl.city === name; }).length : 0;
      var meta = visited ? (count ? count + ' 处' : '补标') : '未点亮';
      return '<g class="city-node ' + (visited ? 'is-visited' : 'is-unlit') + '" data-city="' + id + '" tabindex="0" ' +
        'role="button" aria-label="' + name + '，' + meta + '，点击查看">' +
        '<polygon class="node-region" points="' + regionPoints(p.x, p.y, r, i) + '"></polygon>' +
        '<text class="node-label" x="' + p.x + '" y="' + (p.y + nameY) + '" text-anchor="middle">' + name + '</text>' +
        '<text class="node-meta" x="' + p.x + '" y="' + (p.y + metaY) + '" text-anchor="middle">' + meta + '</text>' +
        '</g>';
    }).join('');

    return '<svg viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" role="group" aria-label="走过的城市，点击城市区域查看">' +
      grid.join('') +
      (state.cities.length > 1 ? '<polyline class="route" points="' + route + '"/>' : '') +
      nodes + '</svg>';
  }

  /* ---------------------------------------------------------------- map transform */

  function clampPan() {
    var w = el.stage.offsetWidth;
    var h = el.stage.offsetHeight;
    if (!w || !h) return;
    var maxX = Math.max(0, (w * state.zoom - window.innerWidth) / 2);
    var maxY = Math.max(0, (h * state.zoom - window.innerHeight) / 2);
    state.pan.x = Math.max(-maxX - 40, Math.min(maxX + 40, state.pan.x));
    state.pan.y = Math.max(-maxY - 40, Math.min(maxY + 40, state.pan.y));
  }

  function applyTransform() {
    el.stage.style.setProperty('--pan-x', state.pan.x + 'px');
    el.stage.style.setProperty('--pan-y', state.pan.y + 'px');
    el.stage.style.setProperty('--zoom', String(state.zoom));
    el.markerLayer.style.setProperty('--marker-inv', (1 / state.zoom).toFixed(4));
  }

  function centerOn(x, y, zoom) {
    if (zoom) state.zoom = Math.min(2.6, Math.max(1, zoom));
    state.pan.x = -(x - 800) * state.zoom;
    state.pan.y = -(y - 500) * state.zoom;
    clampPan();
    applyTransform();
    if (!el.ring.hidden) drawRing(state.radius);
  }

  function mapCenter() {
    return { x: 800 - state.pan.x / state.zoom, y: 500 - state.pan.y / state.zoom };
  }

  function zoomAt(factor, cx, cy) {
    var next = Math.min(2.6, Math.max(1, state.zoom * factor));
    if (Math.abs(next - state.zoom) < 0.0005) return;
    var rect = el.viewport.getBoundingClientRect();
    var ox = cx - (rect.left + rect.width / 2);
    var oy = cy - (rect.top + rect.height / 2);
    var mx = 800 + (ox - state.pan.x) / state.zoom;
    var my = 500 + (oy - state.pan.y) / state.zoom;
    state.zoom = next;
    state.pan.x = ox - (mx - 800) * state.zoom;
    state.pan.y = oy - (my - 500) * state.zoom;
    clampPan();
    applyTransform();
    if (!el.ring.hidden) drawRing(state.radius);
  }

  function drawRing(radius) {
    if (!radius) { el.ring.hidden = true; return; }
    var d = (radius / M_PER_PX) * state.zoom * 2;
    el.ring.hidden = false;
    el.ring.style.width = d + 'px';
    el.ring.style.height = d + 'px';
  }

  function initPan() {
    var drag = null;
    var pointers = {};
    var pinch = null;

    function pointerCount() { return Object.keys(pointers).length; }

    el.viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest('.marker')) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { el.viewport.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

      if (pointerCount() === 2) {
        drag = null;
        el.viewport.classList.remove('is-panning');
        var ids = Object.keys(pointers);
        var a = pointers[ids[0]];
        var b = pointers[ids[1]];
        pinch = { dist: Math.hypot(b.x - a.x, b.y - a.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      } else if (pointerCount() === 1) {
        drag = { x: e.clientX, y: e.clientY, px: state.pan.x, py: state.pan.y };
        el.viewport.classList.add('is-panning');
      }
    });

    el.viewport.addEventListener('pointermove', function (e) {
      if (pointers[e.pointerId]) {
        pointers[e.pointerId].x = e.clientX;
        pointers[e.pointerId].y = e.clientY;
      }

      if (pointerCount() === 2 && pinch) {
        var ids = Object.keys(pointers);
        var a = pointers[ids[0]];
        var b = pointers[ids[1]];
        var dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        var mx = (a.x + b.x) / 2;
        var my = (a.y + b.y) / 2;
        state.pan.x += mx - pinch.mx;
        state.pan.y += my - pinch.my;
        if (pinch.dist > 0) zoomAt(dist / pinch.dist, mx, my);
        pinch = { dist: dist, mx: mx, my: my };
        return;
      }

      if (!drag) return;
      state.pan.x = drag.px + (e.clientX - drag.x);
      state.pan.y = drag.py + (e.clientY - drag.y);
      clampPan();
      applyTransform();
      if (!el.ring.hidden) drawRing(state.radius);
    });

    ['pointerup', 'pointercancel'].forEach(function (t) {
      el.viewport.addEventListener(t, function (e) {
        delete pointers[e.pointerId];
        if (pointerCount() < 2) pinch = null;
        if (pointerCount() === 1) {
          var only = pointers[Object.keys(pointers)[0]];
          drag = { x: only.x, y: only.y, px: state.pan.x, py: state.pan.y };
        } else if (pointerCount() === 0) {
          drag = null;
          el.viewport.classList.remove('is-panning');
        }
      });
    });

    el.viewport.addEventListener('wheel', function (e) {
      if (el.viewport.hidden) return;
      e.preventDefault();
      zoomAt(Math.pow(1.0016, -e.deltaY), e.clientX, e.clientY);
    }, { passive: false });

    window.addEventListener('resize', function () {
      clampPan();
      applyTransform();
    });
  }

  /* ---------------------------------------------------------------- sheet */

  function openSheet(html) {
    el.panel.innerHTML = html;
    if (!el.inspector.open) el.inspector.showModal();
    requestAnimationFrame(function () {
      var target = qs('[data-autofocus]', el.panel) || el.panel;
      if (target) target.focus({ preventScroll: true });
    });
  }

  function closeSheet() {
    if (el.inspector.open) el.inspector.close();
  }

  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('is-visible'); }, 2400);
  }

  function fieldDate() {
    return '<div class="field">' +
      '<label for="f-date">到访日期</label>' +
      '<input id="f-date" type="date" value="' + todayISO() + '" max="2100-12-31">' +
      '<p class="field-error" id="f-date-err" hidden></p>' +
      '</div>';
  }

  function fieldRating() {
    return '<fieldset class="field">' +
      '<legend>评分（可选）</legend>' +
      '<div class="star-row" data-value="">' +
        [1, 2, 3, 4, 5].map(function (n) {
          return '<button class="star" type="button" data-act="rate" data-value="' + n + '" ' +
            'aria-label="' + n + ' 星" aria-pressed="false">' + icon('star') + '</button>';
        }).join('') +
      '</div>' +
      '<p class="field-hint">再点一次已选中的星星可以取消。</p>' +
      '</fieldset>';
  }

  function fieldTier(isRestaurant) {
    return '<fieldset class="field" data-tier-field' + (isRestaurant ? '' : ' hidden') + '>' +
      '<legend>人均价位（可选）</legend>' +
      '<div class="segmented" data-tier-group>' +
        [['low', '低'], ['mid', '中'], ['high', '高']].map(function (t) {
          return '<button type="button" data-act="tier" data-value="' + t[0] + '" aria-pressed="false">' + t[1] + ' · ' + TIER_HINT[t[0]] + '</button>';
        }).join('') +
      '</div>' +
      '<p class="field-hint">低 &lt;60 · 中 60–150 · 高 &gt;150 元 / 人</p>' +
      '</fieldset>';
  }

  function fieldNote() {
    return '<div class="field">' +
      '<label for="f-note">备注（可选）</label>' +
      '<textarea id="f-note" rows="2" maxlength="80" placeholder="一句话记下当时的感觉"></textarea>' +
      '</div>';
  }

  function sheetHead(tagText, tagClass) {
    return '<div class="sheet-head">' +
      '<span class="tag' + (tagClass ? ' ' + tagClass : '') + '">' + tagText + '</span>' +
      '<button class="icon-btn" type="button" data-act="close" aria-label="关闭">' + icon('close') + '</button>' +
      '</div>';
  }

  /* ---------------------------------------------------------------- place detail */

  function openPlace(place, trigger) {
    if (trigger) lastTrigger = trigger;
    state.selected = place.id;
    renderMarkers();

    var visits = place.visits.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var last = visits[0];
    var rated = visits.filter(function (v) { return v.rating; });
    var avg = rated.length ? (rated.reduce(function (n, v) { return n + v.rating; }, 0) / rated.length).toFixed(1) : '—';

    var rows = visits.map(function (v) {
      return '<li class="visit">' +
        '<div class="visit-head">' +
          '<span class="visit-date od-nowrap">' + esc(v.date) + '</span>' +
          '<span class="visit-meta">' + (v.rating ? starsMarkup(v.rating) : '未评分') +
            (v.tier ? ' · ' + moneyLabel(v.tier) : '') + '</span>' +
        '</div>' +
        (v.note ? '<p class="visit-note">' + esc(v.note) + '</p>' : '') +
        '</li>';
    }).join('');

    openSheet(
      sheetHead(typeLabel(place.type), place.type === 'spot' ? 'tag--spot' : '') +
      '<h2 class="sheet-title" id="inspectorTitle">' + esc(place.name) + '</h2>' +
      '<p class="sheet-sub">' + esc(place.category) + ' · ' + esc(place.address) + '</p>' +
      '<div class="facts">' +
        '<div class="fact od-stat"><span class="fact-num od-nowrap">' + visits.length + '<small>次</small></span><span class="fact-label">到访</span></div>' +
        '<div class="fact od-stat"><span class="fact-num od-nowrap">' + (last ? esc(last.date.slice(5)) : '—') + '</span><span class="fact-label">最近一次</span></div>' +
        '<div class="fact od-stat"><span class="fact-num od-nowrap">' + avg + '</span><span class="fact-label">平均评分</span></div>' +
      '</div>' +
      '<div class="section-head"><h3 class="section-title">到访记录</h3><span class="section-count">' + visits.length + ' 条</span></div>' +
      '<ul class="visits">' + rows + '</ul>' +
      '<div class="sheet-actions">' +
        '<button class="btn btn--primary" type="button" data-act="again" data-id="' + place.id + '">' + icon('again') + '再去一次</button>' +
        '<button class="btn btn--ghost" type="button" data-act="delete" data-id="' + place.id + '">' + icon('trash') + '删除地点</button>' +
      '</div>'
    );
  }

  function addVisit(placeId) {
    var place = byId(placeId);
    if (!place) return;
    place.visits.push({ date: todayISO(), rating: null, tier: null, note: '' });
    renderMarkers();
    openPlace(place);
    showToast('已记录「' + place.name + '」的第 ' + place.visits.length + ' 次到访');
  }

  function deletePlace(placeId) {
    var place = byId(placeId);
    if (!place) return;
    var name = place.name;
    places = places.filter(function (p) { return p.id !== placeId; });
    if (state.selected === placeId) state.selected = null;
    renderMarkers();
    renderChips();
    renderStats();
    renderCities();
    closeSheet();
    showToast('已删除「' + name + '」');
  }

  /* ---------------------------------------------------------------- record flow */

  function openRecord(trigger) {
    if (trigger) lastTrigger = trigger;
    openSheet(
      sheetHead('搜索附近') +
      '<h2 class="sheet-title" id="inspectorTitle">搜索附近</h2>' +
      '<p class="sheet-sub">以地图中心为圆心，选一家店或一个景点记下来。</p>' +
      '<div class="field">' +
        '<span class="field-label">搜这一带</span>' +
        '<div class="chips chips--inline" role="group" aria-label="周边范围">' +
          [500, 1000, 3000].map(function (r) {
            return '<button class="chip' + (state.radius === r ? ' is-active' : '') + '" type="button" data-act="radius" data-radius="' + r + '">' +
              (r < 1000 ? r + 'm' : r / 1000 + 'km') + '</button>';
          }).join('') +
        '</div>' +
        '<p class="field-hint">以地图中心为准，拖动地图可以换个范围。</p>' +
      '</div>' +
      '<div class="results" id="recResults"></div>' +
      '<div class="field">' +
        '<label for="recKey">或者按关键词检索</label>' +
        '<div class="search-inline">' +
          '<input id="recKey" type="search" placeholder="店名、景点或地址" autocomplete="off">' +
          '<button class="btn btn--ghost btn--sm" type="button" data-act="rec-search">搜索</button>' +
        '</div>' +
      '</div>' +
      '<div class="sheet-actions">' +
        '<button class="btn btn--ghost" type="button" data-act="manual">在地图上手动记一笔</button>' +
      '</div>'
    );
    drawRing(state.radius);
    renderRecordResults();
    var key = qs('#recKey', el.panel);
    if (key) {
      key.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); runKeywordSearch(); }
      });
    }
  }

  function distanceLabel(m) {
    return m < 1000 ? Math.round(m) + 'm' : (m / 1000).toFixed(1) + 'km';
  }

  function resultRow(poi, dist) {
    var saved = places.filter(function (p) { return p.externalId === poi.id; })[0];
    return '<button class="result" type="button" data-act="poi" data-poi="' + poi.id + '">' +
      '<span class="result-main">' +
        '<span class="result-name od-truncate">' + esc(poi.name) + '</span>' +
        '<span class="result-meta">' + esc(poi.category) + ' · ' + distanceLabel(dist) + ' · ' + esc(poi.address) + '</span>' +
      '</span>' +
      (saved ? '<span class="badge">已记录</span>' : icon('chevron')) +
      '</button>';
  }

  function renderRecordResults() {
    var box = qs('#recResults', el.panel);
    if (!box) return;
    var c = mapCenter();
    var rows = poiPool.map(function (p) {
      return { p: p, dist: Math.hypot(p.x - c.x, p.y - c.y) * M_PER_PX };
    }).filter(function (r) { return r.dist <= state.radius; })
      .sort(function (a, b) { return a.dist - b.dist; });

    if (!rows.length) {
      box.innerHTML = '<div class="empty-state"><p>这个范围里没有可记录的地点。试试换 3km，或者直接用关键词检索。</p></div>';
      return;
    }
    box.innerHTML = rows.map(function (r) { return resultRow(r.p, r.dist); }).join('');
    drawRing(state.radius);
  }

  function runKeywordSearch() {
    var box = qs('#recResults', el.panel);
    var input = qs('#recKey', el.panel);
    if (!box || !input) return;
    var key = input.value.trim().toLowerCase();
    el.ring.hidden = true;
    if (!key) { renderRecordResults(); return; }

    var hits = poiPool.filter(function (p) {
      return (p.name + p.category + p.address).toLowerCase().indexOf(key) !== -1;
    });
    if (!hits.length) {
      box.innerHTML = '<div class="empty-state"><p>高德没有返回「' + esc(input.value.trim()) + '」。可以手动在地图上记一笔。</p>' +
        '<button class="btn btn--primary btn--sm" type="button" data-act="manual">记一个「' + esc(input.value.trim()) + '」</button></div>';
      return;
    }
    var c = mapCenter();
    box.innerHTML = hits.map(function (p) {
      return resultRow(p, Math.hypot(p.x - c.x, p.y - c.y) * M_PER_PX);
    }).join('');
  }

  function choosePoi(poiId) {
    var poi = poiPool.filter(function (p) { return p.id === poiId; })[0];
    if (!poi) return;
    var saved = places.filter(function (p) { return p.externalId === poi.id; })[0];
    if (saved) openVisitForm(saved);
    else openNewForm(poi, null, '');
  }

  function openNewForm(poi, trigger, presetName) {
    if (trigger) lastTrigger = trigger;
    formCtx = { mode: 'new', place: null, poi: poi };
    var type = poi ? poi.type : 'restaurant';
    var name = poi ? poi.name : (presetName || '');
    var sub = poi ? poi.category + ' · ' + poi.address : '手动标记 · 地图中心附近';
    el.ring.hidden = true;

    openSheet(
      sheetHead('新地点', type === 'spot' ? 'tag--spot' : '') +
      '<h2 class="sheet-title" id="inspectorTitle">' + (poi ? '记录到这个地点' : '手动记一个地点') + '</h2>' +
      '<p class="sheet-sub">' + esc(sub) + '</p>' +
      '<div class="field">' +
        '<label for="f-name">名称</label>' +
        '<input id="f-name" type="text" value="' + esc(name) + '" autocomplete="off" data-autofocus>' +
        '<p class="field-error" id="f-name-err" hidden></p>' +
      '</div>' +
      '<fieldset class="field" data-type-field' + (poi ? ' hidden' : '') + '>' +
        '<legend>类型</legend>' +
        '<div class="segmented" data-type-group>' +
          '<button type="button" class="' + (type === 'restaurant' ? 'is-active' : '') + '" data-act="type" data-value="restaurant" aria-pressed="' + (type === 'restaurant') + '">餐厅</button>' +
          '<button type="button" class="' + (type === 'spot' ? 'is-active' : '') + '" data-act="type" data-value="spot" aria-pressed="' + (type === 'spot') + '">景点</button>' +
        '</div>' +
      '</fieldset>' +
      fieldDate() +
      fieldRating() +
      fieldTier(type === 'restaurant') +
      fieldNote() +
      '<div class="sheet-actions">' +
        '<button class="btn btn--primary" type="button" data-act="save">保存</button>' +
        '<button class="btn btn--ghost" type="button" data-act="close">取消</button>' +
      '</div>'
    );
  }

  function openVisitForm(place) {
    formCtx = { mode: 'visit', place: place, poi: null };
    el.ring.hidden = true;
    openSheet(
      sheetHead('再来一次', place.type === 'spot' ? 'tag--spot' : '') +
      '<h2 class="sheet-title" id="inspectorTitle">' + esc(place.name) + '</h2>' +
      '<p class="sheet-sub">已到访 ' + place.visits.length + ' 次 · 这次只补一条到访记录</p>' +
      fieldDate() +
      fieldRating() +
      fieldTier(place.type === 'restaurant') +
      fieldNote() +
      '<div class="sheet-actions">' +
        '<button class="btn btn--primary" type="button" data-act="save">保存这次到访</button>' +
        '<button class="btn btn--ghost" type="button" data-act="close">取消</button>' +
      '</div>'
    );
  }

  function setFieldError(input, errNode, message) {
    var field = input.closest('.field');
    if (field) field.classList.add('is-invalid');
    if (errNode) { errNode.hidden = false; errNode.textContent = message; }
  }

  function clearFieldError(input, errNode) {
    var field = input.closest('.field');
    if (field) field.classList.remove('is-invalid');
    if (errNode) errNode.hidden = true;
  }

  function readForm() {
    var nameEl = qs('#f-name', el.panel);
    var dateEl = qs('#f-date', el.panel);
    var nameErr = qs('#f-name-err', el.panel);
    var dateErr = qs('#f-date-err', el.panel);
    var ok = true;

    if (nameEl) {
      if (!nameEl.value.trim()) {
        ok = false;
        setFieldError(nameEl, nameErr, '请填写地点名称');
      } else clearFieldError(nameEl, nameErr);
    }
    if (dateEl) {
      if (!dateEl.value) {
        ok = false;
        setFieldError(dateEl, dateErr, '请选择到访日期');
      } else clearFieldError(dateEl, dateErr);
    }
    if (!ok) return null;

    var typeBtn = qs('[data-type-group] .is-active', el.panel);
    var tierBtn = qs('[data-tier-group] .is-active', el.panel);
    var row = qs('.star-row', el.panel);
    var rating = row && row.dataset.value ? Number(row.dataset.value) : null;
    var type = typeBtn ? typeBtn.dataset.value : (formCtx.place ? formCtx.place.type : 'restaurant');

    return {
      name: nameEl ? nameEl.value.trim() : formCtx.place.name,
      type: type,
      date: dateEl.value,
      rating: rating,
      tier: type === 'restaurant' && tierBtn ? tierBtn.dataset.value : null,
      note: (qs('#f-note', el.panel) || { value: '' }).value.trim()
    };
  }

  function saveForm() {
    var data = readForm();
    if (!data) return;

    if (formCtx.mode === 'visit' && formCtx.place) {
      var place = formCtx.place;
      place.visits.push({ date: data.date, rating: data.rating, tier: data.tier, note: data.note });
      renderMarkers();
      renderStats();
      openPlace(place);
      showToast('已记录「' + place.name + '」的第 ' + place.visits.length + ' 次到访');
      return;
    }

    var poi = formCtx.poi;
    var center = mapCenter();
    var created = {
      id: 'p' + Date.now(),
      type: data.type,
      name: data.name,
      category: poi ? poi.category : (data.type === 'restaurant' ? '餐厅' : '景点'),
      address: poi ? poi.address : '手动标记 · 地图中心附近',
      city: '上海',
      x: poi ? poi.x : Math.round(center.x),
      y: poi ? poi.y : Math.round(center.y),
      externalId: poi ? poi.id : null,
      visits: [{ date: data.date, rating: data.rating, tier: data.tier, note: data.note }]
    };
    places.push(created);
    state.filter = 'all';
    renderMarkers();
    renderChips();
    renderStats();
    renderCities();
    closeSheet();
    showToast('已保存「' + created.name + '」');
    centerOn(created.x, created.y, Math.max(state.zoom, 1.3));
  }

  /* ---------------------------------------------------------------- city sheets */

  function openCity(cityId, trigger) {
    if (trigger) lastTrigger = trigger;
    var city = state.cities.filter(function (c) { return c.id === cityId; })[0];
    var cityName = CITY_NAMES[cityId];
    if (!cityName) return;

    if (!city) {
      openSheet(
        sheetHead('城市', 'tag--quiet') +
        '<h2 class="sheet-title" id="inspectorTitle">' + cityName + '</h2>' +
        '<p class="sheet-sub">还没有点亮这座城市</p>' +
        '<p class="note-line">点亮后会计入城市总数，之后也可以再补上具体的地点。</p>' +
        '<div class="sheet-actions">' +
          '<button class="btn btn--primary" type="button" data-act="light-city" data-city="' + cityId + '">' + icon('pin') + '点亮</button>' +
          '<button class="btn btn--ghost" type="button" data-act="close">取消</button>' +
        '</div>'
      );
      return;
    }

    var list = places.filter(function (p) { return p.city === city.name; });
    var r = list.filter(function (p) { return p.type === 'restaurant'; }).length;
    var s = list.filter(function (p) { return p.type === 'spot'; }).length;
    var last = '';
    list.forEach(function (p) {
      var d = maxDate(p.visits);
      if (d > last) last = d;
    });

    var listHtml = list.length
      ? '<ul class="city-detail-places">' + list.map(function (p) {
          return '<li><button class="city-place" type="button" data-act="visit-place" data-id="' + p.id + '">' +
            icon(p.type === 'restaurant' ? 'bowl' : 'camera') +
            '<span class="city-place-name od-truncate">' + esc(p.name) + '</span>' +
            '<span class="city-place-meta od-nowrap">' + p.visits.length + ' 次</span>' +
            '</button></li>';
        }).join('') + '</ul>'
      : '<p class="note-line">这座城市是手动补标的——路过、没来得及记录具体地点。下次去可以边吃边记。</p>';

    openSheet(
      sheetHead('城市', 'tag--quiet') +
      '<h2 class="sheet-title" id="inspectorTitle">' + esc(city.name) + '</h2>' +
      '<p class="sheet-sub">' + (city.manual ? '补标城市 · 暂无地点记录' : (last ? '最近一次 ' + last : '还没有到访记录')) + '</p>' +
      '<div class="facts">' +
        '<div class="fact od-stat"><span class="fact-num">' + r + '</span><span class="fact-label">餐厅</span></div>' +
        '<div class="fact od-stat"><span class="fact-num">' + s + '</span><span class="fact-label">景点</span></div>' +
        '<div class="fact od-stat"><span class="fact-num">' + list.length + '</span><span class="fact-label">地点</span></div>' +
      '</div>' +
      listHtml +
      '<div class="sheet-actions">' +
        (list.length ? '<button class="btn btn--primary" type="button" data-act="go-map" data-city="' + city.id + '">在地图上查看</button>' : '') +
        (city.manual ? '<button class="btn btn--ghost" type="button" data-act="unmark-city" data-city="' + city.id + '">取消补标</button>' : '') +
        '<button class="btn btn--ghost" type="button" data-act="close">关闭</button>' +
      '</div>'
    );
  }

  function lightCity(cityId) {
    if (state.cities.some(function (c) { return c.id === cityId; })) return;
    state.cities.push({ id: cityId, name: CITY_NAMES[cityId], manual: true });
    renderCities();
    renderStats();
    openCity(cityId);
    showToast('已点亮「' + CITY_NAMES[cityId] + '」');
  }

  function unmarkCity(cityId) {
    var city = state.cities.filter(function (c) { return c.id === cityId; })[0];
    if (!city) return;
    state.cities = state.cities.filter(function (c) { return c.id !== cityId; });
    renderCities();
    renderStats();
    closeSheet();
    showToast('已取消「' + city.name + '」的补标');
  }

  function goMapCity(cityId) {
    var city = state.cities.filter(function (c) { return c.id === cityId; })[0];
    if (!city) return;
    closeSheet();
    setTab('map');
    var list = places.filter(function (p) { return p.city === city.name; });
    if (list.length) {
      var cx = list.reduce(function (n, p) { return n + p.x; }, 0) / list.length;
      var cy = list.reduce(function (n, p) { return n + p.y; }, 0) / list.length;
      centerOn(cx, cy, 1.2);
    }
  }

  /* ---------------------------------------------------------------- search */

  function hits(obj, key) {
    return (obj.name + ' ' + (obj.address || '') + ' ' + (obj.category || '')).toLowerCase().indexOf(key) !== -1;
  }

  function renderSuggest(query) {
    var key = query.toLowerCase();
    var saved = places.filter(function (p) { return hits(p, key); }).slice(0, 4);
    var pois = poiPool.filter(function (p) {
      return hits(p, key) && !places.some(function (x) { return x.externalId === p.id; });
    }).slice(0, 4);

    var rows = saved.map(function (p) {
      return '<button class="suggest-row" type="button" data-suggest-place="' + p.id + '">' +
        '<span class="suggest-main"><span class="suggest-name">' + esc(p.name) + '</span>' +
        '<span class="suggest-meta">' + typeLabel(p.type) + ' · 已记录 ' + p.visits.length + ' 次</span></span>' +
        icon('chevron') + '</button>';
    }).concat(pois.map(function (p) {
      return '<button class="suggest-row" type="button" data-suggest-poi="' + p.id + '">' +
        '<span class="suggest-main"><span class="suggest-name">' + esc(p.name) + '</span>' +
        '<span class="suggest-meta">' + esc(p.category) + ' · 还没记录</span></span>' +
        icon('plus') + '</button>';
    }));

    if (!rows.length) {
      el.suggest.innerHTML = '<div class="suggest-empty">没有找到「' + esc(query) + '」' +
        '<button class="btn btn--primary btn--sm" type="button" data-suggest-new>' + icon('plus') + '记一个「' + esc(query) + '」</button></div>';
    } else {
      el.suggest.innerHTML = rows.join('');
    }
    el.suggest.hidden = false;
    el.input.setAttribute('aria-expanded', 'true');
  }

  function hideSuggest() {
    el.suggest.hidden = true;
    el.input.setAttribute('aria-expanded', 'false');
  }

  function submitSearch() {
    var q = el.input.value.trim();
    if (!q) { el.input.focus(); return; }
    if (el.suggest.hidden) renderSuggest(q);
    var target = qs('[data-suggest-place], [data-suggest-poi]', el.suggest);
    if (target) target.click();
    else el.input.focus();
  }

  /* ---------------------------------------------------------------- tabs */

  function setTab(tab) {
    state.tab = tab;
    var isMap = tab === 'map';

    qsa('.tab', el.tabbar).forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle('is-active', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });

    el.viewport.hidden = !isMap;
    el.citiesView.hidden = isMap;
    el.dock.hidden = !isMap;
    el.note.hidden = !isMap;
    document.body.classList.toggle('is-cities', !isMap);
    hideSuggest();

    if (!isMap) renderCities();
    else { clampPan(); applyTransform(); }
  }

  /* ---------------------------------------------------------------- panel events */

  el.panel.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.dataset.act;

    if (act === 'close') { closeSheet(); return; }
    if (act === 'again') { addVisit(btn.dataset.id); return; }
    if (act === 'delete') {
      if (btn.dataset.armed === '1') {
        deletePlace(btn.dataset.id);
      } else {
        btn.dataset.armed = '1';
        btn.className = 'btn btn--danger';
        btn.innerHTML = icon('trash') + '再点一次确认删除';
      }
      return;
    }
    if (act === 'poi') { choosePoi(btn.dataset.poi); return; }
    if (act === 'visit-place') {
      var p = byId(btn.dataset.id);
      if (p) openPlace(p, btn);
      return;
    }
    if (act === 'radius') {
      state.radius = Number(btn.dataset.radius);
      qsa('.chip[data-act="radius"]', el.panel).forEach(function (c) {
        c.classList.toggle('is-active', Number(c.dataset.radius) === state.radius);
      });
      renderRecordResults();
      return;
    }
    if (act === 'rec-search') { runKeywordSearch(); return; }
    if (act === 'manual') {
      var key = qs('#recKey', el.panel);
      var preset = key ? key.value.trim() : '';
      openNewForm(null, null, preset);
      return;
    }
    if (act === 'save') { saveForm(); return; }
    if (act === 'rate') {
      var row = btn.closest('.star-row');
      var val = Number(btn.dataset.value);
      var current = Number(row.dataset.value || 0);
      var next = current === val ? 0 : val;
      row.dataset.value = next ? String(next) : '';
      qsa('.star', row).forEach(function (s, i) {
        var on = i < next;
        s.classList.toggle('is-active', on);
        s.setAttribute('aria-pressed', String(on));
      });
      return;
    }
    if (act === 'type') {
      qsa('[data-type-group] button', el.panel).forEach(function (b) {
        var on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      var tierField = qs('[data-tier-field]', el.panel);
      if (tierField) tierField.hidden = btn.dataset.value !== 'restaurant';
      return;
    }
    if (act === 'tier') {
      var wasActive = btn.classList.contains('is-active');
      qsa('[data-tier-group] button', el.panel).forEach(function (b) {
        var on = b === btn && !wasActive;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      return;
    }
    if (act === 'city') { openCity(btn.dataset.city, btn); return; }
    if (act === 'light-city') { lightCity(btn.dataset.city); return; }
    if (act === 'unmark-city') { unmarkCity(btn.dataset.city); return; }
    if (act === 'go-map') { goMapCity(btn.dataset.city); return; }
  });

  el.panel.addEventListener('input', function (e) {
    if (e.target.id === 'f-name') {
      var err = qs('#f-name-err', el.panel);
      if (e.target.value.trim()) clearFieldError(e.target, err);
    }
    if (e.target.id === 'f-date') {
      var err2 = qs('#f-date-err', el.panel);
      if (e.target.value) clearFieldError(e.target, err2);
    }
  });

  el.inspector.addEventListener('close', function () {
    statResetRing();
    formCtx = { mode: null, place: null, poi: null };
    if (state.selected) { state.selected = null; renderMarkers(); }
    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus({ preventScroll: true });
    lastTrigger = null;
  });

  function statResetRing() { el.ring.hidden = true; }

  el.inspector.addEventListener('click', function (e) {
    if (e.target === el.inspector) closeSheet();
  });

  /* ---------------------------------------------------------------- map + dock events */

  el.markerLayer.addEventListener('click', function (e) {
    var m = e.target.closest('.marker');
    if (!m) return;
    var p = byId(m.dataset.place);
    if (p) openPlace(p, m);
  });

  el.nearby.addEventListener('click', function () { openRecord(el.nearby); });

  el.tabbar.addEventListener('click', function (e) {
    var t = e.target.closest('.tab');
    if (t) setTab(t.dataset.tab);
  });

  el.statsToggle.addEventListener('click', function () {
    var open = el.stats.dataset.open === 'true';
    el.stats.dataset.open = String(!open);
    el.statsToggle.setAttribute('aria-expanded', String(!open));
  });

  el.chips.addEventListener('click', function (e) {
    var c = e.target.closest('[data-filter]');
    if (!c) return;
    state.filter = c.dataset.filter;
    renderChips();
    renderMarkers();
  });

  el.input.addEventListener('input', function () {
    var q = el.input.value.trim();
    if (!q) { hideSuggest(); return; }
    renderSuggest(q);
  });

  el.input.addEventListener('focus', function () {
    var q = el.input.value.trim();
    if (q) renderSuggest(q);
  });

  el.input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (el.suggest.hidden) el.input.value = '';
      hideSuggest();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      submitSearch();
    }
  });

  el.suggest.addEventListener('click', function (e) {
    var savedBtn = e.target.closest('[data-suggest-place]');
    var poiBtn = e.target.closest('[data-suggest-poi]');
    var newBtn = e.target.closest('[data-suggest-new]');
    var q = el.input.value.trim();

    if (savedBtn) {
      var p = byId(savedBtn.dataset.suggestPlace);
      hideSuggest();
      el.input.value = '';
      if (p) { centerOn(p.x, p.y, Math.max(state.zoom, 1.3)); openPlace(p, el.input); }
    } else if (poiBtn) {
      var poi = poiPool.filter(function (x) { return x.id === poiBtn.dataset.suggestPoi; })[0];
      hideSuggest();
      el.input.value = '';
      if (poi) openNewForm(poi);
    } else if (newBtn) {
      hideSuggest();
      el.input.value = '';
      openNewForm(null, null, q);
    }
  });

  document.addEventListener('click', function (e) {
    if (!el.dock.contains(e.target)) hideSuggest();
    if (el.stats.dataset.open === 'true' && !el.stats.contains(e.target)) {
      el.stats.dataset.open = 'false';
      el.statsToggle.setAttribute('aria-expanded', 'false');
    }
  });

  el.cityCanvas.addEventListener('click', function (e) {
    var node = e.target.closest('.city-node');
    if (node) openCity(node.dataset.city, node);
  });

  el.cityCanvas.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var node = e.target.closest('.city-node');
    if (!node) return;
    e.preventDefault();
    openCity(node.dataset.city, node);
  });

  /* ---------------------------------------------------------------- boot */

  renderChips();
  renderStats();
  renderMarkers();
  renderCities();
  initPan();
  setTab('map');
  applyTransform();

  if (SURFACE === 'mobile') {
    centerOn(900, 545, 1);
  }
})();
