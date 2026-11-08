/** localStorage 只存 README §2.1 #27 约定的 4 项，避免脏状态。 */
export const STORAGE_KEYS = {
  statsCollapsed: 'bo.stats.collapsed',
  mapView: 'bo.map.view',
  filter: 'bo.map.filter',
  citiesView: 'bo.cities.view',
} as const;

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式等场景下忽略 */
  }
}
