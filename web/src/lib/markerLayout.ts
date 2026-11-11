/**
 * 标记在该聚合还是该分开的层级策略，以及「分开」时的像素级排布。
 *
 * 背景：聚合按像素网格做（见 AMapCanvas 的 clusterPoints），两个点位只要落进同一个格子
 * 就永远是一个气泡——商场里的两家店即使 zoom 到最大也分不开。所以只要到了最大/次大层级
 * 就不聚合，改用 `spreadOffsets` 把互相压住的图钉推开一个身位（只改显示偏移，不改经纬度）。
 */

export const MIN_ZOOM = 3;
export const MAX_ZOOM = 18;

/** 该层级及以上强制单点展示，不再聚合 */
export const SPREAD_ZOOM = MAX_ZOOM - 1;

/** 聚合网格的边长（像素） */
export const CLUSTER_GRID = 60;

/** 两个图钉之间至少留出的像素距离：图钉本体 38px，按圆形算直径 38，44 留出呼吸 */
export const MARKER_GAP = 44;

/** 迭代轮数：够收敛到互不重叠，又不至于在高 zoom 重建时拖慢主线程 */
const MAX_ROUNDS = 24;
/** 黄金角：完全重合的点按序号取不同方向，方向稳定且分布均匀 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface PixelPoint {
  x: number;
  y: number;
}

export function forcesSpread(zoom: number): boolean {
  return zoom >= SPREAD_ZOOM;
}

/**
 * 把像素坐标上互相压住的点错开，返回每个点的位移量（相对原位置）。
 *
 * 纯几何 + 纯函数：同样的输入永远得到同样的结果，所以地图平移后重建不会抖动；
 * 按输入顺序处理，调用方排序（按 place.id）即可保证稳定。
 */
export function spreadOffsets(points: readonly PixelPoint[], gap = MARKER_GAP): PixelPoint[] {
  const offsets: PixelPoint[] = points.map(() => ({ x: 0, y: 0 }));
  if (points.length < 2) return offsets;

  // 先挑出可能互相影响的点对（位移上限约一个 gap，留 4 倍余量），之后只迭代这份小列表
  const pairs = candidatePairs(points, gap * 4);
  if (!pairs.length) return offsets;

  const gapSq = gap * gap;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let moved = false;
    for (const [i, j] of pairs) {
      const left = points[i];
      const right = points[j];
      let dx = right.x + offsets[j].x - (left.x + offsets[i].x);
      let dy = right.y + offsets[j].y - (left.y + offsets[i].y);
      let distance = Math.hypot(dx, dy);
      if (distance * distance >= gapSq) continue;
      if (distance < 1e-3) {
        const angle = ((i + j) * GOLDEN_ANGLE) % (Math.PI * 2);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        distance = 1;
      }
      // 各退一半，保证相邻两个点的位移是对称的
      const push = (gap - distance) / 2;
      const ux = (dx / distance) * push;
      const uy = (dy / distance) * push;
      offsets[i].x -= ux;
      offsets[i].y -= uy;
      offsets[j].x += ux;
      offsets[j].y += uy;
      moved = true;
    }
    if (!moved) break;
  }
  return offsets;
}

function candidatePairs(points: readonly PixelPoint[], reach: number): [number, number][] {
  const pairs: [number, number][] = [];
  const reachSq = reach * reach;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      if (dx * dx + dy * dy <= reachSq) pairs.push([i, j]);
    }
  }
  return pairs;
}
