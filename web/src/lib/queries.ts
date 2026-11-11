import { apiDelete, apiGet, apiPost } from './api.ts';
import type {
  AppConfig,
  CitiesGeo,
  CityStat,
  CreatePlacePayload,
  CreatePlaceResponse,
  Place,
  PlaceDetail,
  SearchResponse,
  Stats,
  Visit,
  VisitPayload,
} from './types.ts';

export const qk = {
  config: ['config'] as const,
  places: (type?: string) => ['places', type ?? 'all'] as const,
  place: (id: number) => ['place', id] as const,
  stats: ['stats'] as const,
  cities: ['cities'] as const,
  citiesGeo: ['cities', 'geo'] as const,
  searchAround: (lng: number, lat: number, radius: number, type?: string) =>
    ['search', 'around', lng.toFixed(3), lat.toFixed(3), radius, type ?? 'all'] as const,
  searchText: (keyword: string, type?: string, city?: string) =>
    ['search', 'text', keyword, type ?? 'all', city ?? 'all'] as const,
};

export const fetchConfig = () => apiGet<AppConfig>('/api/config');

export const fetchPlaces = (type?: string) =>
  apiGet<{ places: Place[] }>('/api/places', { type }).then((data) => data.places);

export const fetchPlace = (id: number) => apiGet<PlaceDetail>(`/api/places/${id}`);

export const fetchStats = () => apiGet<Stats>('/api/stats');

export const fetchCities = () => apiGet<{ cities: CityStat[] }>('/api/cities').then((data) => data.cities);

export const fetchCitiesGeo = (loaded: readonly string[] = []): Promise<CitiesGeo> =>
  apiGet<CitiesGeo>('/api/cities/geo', loaded.length ? { loaded: loaded.join(',') } : undefined);

export const searchAround = (lng: number, lat: number, radius: number, type?: string) =>
  apiGet<SearchResponse>('/api/search', { lng, lat, radius, type });

export const searchText = (keyword: string, type?: string, city?: string) =>
  apiGet<SearchResponse>('/api/search', { keyword, type, city });

export const createPlace = (payload: CreatePlacePayload) =>
  apiPost<CreatePlaceResponse>('/api/places', payload);

export const addVisit = (placeId: number, payload: VisitPayload) =>
  apiPost<{ place: Place; visit: Visit }>(`/api/places/${placeId}/visits`, payload);

export const deletePlace = (placeId: number) => apiDelete<{ ok: true }>(`/api/places/${placeId}`);

export const deleteVisit = (visitId: number) =>
  apiDelete<{ ok: true; placeDeleted: boolean }>(`/api/visits/${visitId}`);

export const markCity = (adcode: string, name?: string) =>
  apiPost<{ ok: true }>('/api/cities/manual', { adcode, name });

export const unmarkCity = (adcode: string) =>
  apiDelete<{ ok: true; removed: boolean }>(`/api/cities/manual?adcode=${encodeURIComponent(adcode)}`);

export const fetchRegeo = (lng: number, lat: number, signal?: AbortSignal) =>
  apiGet<{ cityName: string; cityAdcode: string | null; district: string | null; address: string }>(
    '/api/regeo',
    { lng, lat },
    { signal },
  );
