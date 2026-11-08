export type PlaceType = 'restaurant' | 'spot';
export type PriceTier = 'low' | 'mid' | 'high';
export type FilterKind = 'all' | PlaceType;

export interface Place {
  id: number;
  type: PlaceType;
  name: string;
  externalId: string | null;
  address: string | null;
  lng: number;
  lat: number;
  category: string | null;
  cityName: string | null;
  cityAdcode: string | null;
  district: string | null;
  createdTime: string;
  updatedTime: string;
  visitCount?: number;
  lastVisitedOn: string | null;
  lastRating: number | null;
}

export interface Visit {
  id: number;
  placeId: number;
  date: string;
  rating: number | null;
  priceTier: PriceTier | null;
  note: string | null;
  createdTime: string;
}

export interface PlaceDetail {
  place: Place;
  visits: Visit[];
}

export interface PoiResult {
  id: string;
  name: string;
  type: PlaceType;
  typecode: string;
  category: string;
  address: string;
  lng: number;
  lat: number;
  distance: number | null;
  cityName: string | null;
  district: string | null;
  province: string | null;
  cityAdcode: string | null;
  existingPlaceId: number | null;
}

export interface CityStat {
  adcode: string;
  name: string;
  lng: number | null;
  lat: number | null;
  restaurantCount: number;
  spotCount: number;
  firstVisitedOn: string | null;
  lastVisitedOn: string | null;
  manual: boolean;
}

export interface Stats {
  restaurant: number;
  spot: number;
  city: number;
}

export interface AppConfig {
  jsKey: string;
  serviceHost: string;
  priceTiers: { low: number; high: number };
  /** 底图注记策略：auto = 低 zoom 显示城市名、高 zoom 隐藏 */
  mapLabels: 'auto' | 'on' | 'off';
  /** auto 模式下注记显示的 zoom 上限 */
  mapLabelMaxZoom: number;
}

export interface GeoFeature {
  type: 'Feature';
  properties: { adcode: string; name: string; province: string; level: 'city' };
  geometry: unknown;
}

export interface CitiesGeo {
  total: number;
  loaded: string[];
  missing: string[];
  unsupported: string[];
  geojson: { type: 'FeatureCollection'; features: GeoFeature[] };
}

export interface SearchResponse {
  mode: 'text' | 'around';
  results: PoiResult[];
}

export interface MapViewport {
  lng: number;
  lat: number;
  zoom: number;
}

export interface CreatePlacePayload {
  type: PlaceType;
  name: string;
  externalId?: string | null;
  address?: string | null;
  lng: number;
  lat: number;
  category?: string | null;
  cityName?: string | null;
  cityAdcode?: string | null;
  district?: string | null;
  date: string;
  rating?: number | null;
  priceTier?: PriceTier | null;
  note?: string | null;
}

export interface VisitPayload {
  date: string;
  rating?: number | null;
  priceTier?: PriceTier | null;
  note?: string | null;
}

export interface CreatePlaceResponse {
  place: Place;
  visit: Visit;
  deduped: boolean;
}

export interface MapApi {
  setView(center: { lng: number; lat: number }, level?: number): void;
  fitTo(places: Place[]): void;
  getCenter(): { lng: number; lat: number } | null;
  getZoom(): number;
  refresh(): void;
  resize(): void;
}
