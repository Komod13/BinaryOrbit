import { Hono } from 'hono';
import { regeo } from '../amap.ts';
import { ValidationError, asNumber } from '../validate.ts';
import { findCityByName, findProvinceAdcode, normalizeCityAdcode } from '../cities.ts';

export const regeoRoute = new Hono();

regeoRoute.get('/', async (c) => {
  const rawLng = c.req.query('lng');
  const rawLat = c.req.query('lat');
  if (!rawLng?.trim() || !rawLat?.trim()) {
    throw new ValidationError('缺少有效的 lng 与 lat');
  }
  const lng = asNumber(rawLng, '经度', -180, 180);
  const lat = asNumber(rawLat, '纬度', -90, 90);

  const raw = await regeo(lng, lat);

  // 城市口径：cityname 命中字典 → 用字典 adcode；直辖市 city 为空 → 用省级 adcode
  const dict = findCityByName(raw.cityName);
  const provinceAdcode = findProvinceAdcode(raw.province);
  const cityAdcode =
    normalizeCityAdcode(dict?.adcode ?? null) ??
    normalizeCityAdcode(provinceAdcode) ??
    normalizeCityAdcode(raw.adcode);

  return c.json({
    province: raw.province,
    cityName: raw.cityName ?? raw.province,
    cityAdcode,
    district: raw.district,
    adcode: raw.adcode,
    address: raw.address,
    lng,
    lat,
  });
});
