import { Hono } from 'hono';
import { regeo } from '../amap.ts';
import { ValidationError } from '../validate.ts';
import { findCityByName, findProvinceAdcode, normalizeCityAdcode } from '../cities.ts';

export const regeoRoute = new Hono();

regeoRoute.get('/', async (c) => {
  const lng = Number(c.req.query('lng'));
  const lat = Number(c.req.query('lat'));
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new ValidationError('缺少有效的 lng 与 lat');
  }

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
