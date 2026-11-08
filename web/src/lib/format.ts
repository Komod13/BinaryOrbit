import type { PriceTier, PlaceType } from './types.ts';

export const TYPE_LABEL: Record<PlaceType, string> = { restaurant: '餐厅', spot: '景点' };
export const TIER_LABEL: Record<PriceTier, string> = { low: '低', mid: '中', high: '高' };

export function todayISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** 2026-05-02 → 05-02 */
export function shortDate(date: string | null | undefined): string {
  if (!date) return '—';
  return date.length === 10 ? date.slice(5) : date;
}

export function tierHint(tier: PriceTier, tiers: { low: number; high: number }): string {
  if (tier === 'low') return `<${tiers.low}`;
  if (tier === 'mid') return `${tiers.low}–${tiers.high}`;
  return `>${tiers.high}`;
}

export function tierSummary(tier: PriceTier | null, tiers: { low: number; high: number }): string {
  if (!tier) return '';
  return `人均 ${TIER_LABEL[tier]}档`;
}

export function distanceLabel(meters: number | null): string {
  if (meters === null) return '';
  return meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)}km`;
}

/** 高德分类「餐饮服务;中餐厅;本帮菜」→「本帮菜」，取最具体的一级 */
export function categoryLabel(category: string | null | undefined, fallback = ''): string {
  if (!category) return fallback;
  const parts = category
    .split(/[;；]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? (parts[parts.length - 1] as string) : fallback;
}

/** 「大壶春（四川中路）」→「大壶春」，地图标签用短名 */
export function shortName(name: string): string {
  return name.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '');
}

export function averageRating(visits: { rating: number | null }[]): string {
  const rated = visits.filter((visit) => visit.rating);
  if (!rated.length) return '—';
  const sum = rated.reduce((total, visit) => total + (visit.rating ?? 0), 0);
  return (sum / rated.length).toFixed(1);
}

/** 两点间距离（米），用于「50m 内同名地点」判断 */
export function distanceMeters(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
