import { Hono } from 'hono';
import { getConfig } from '../env.ts';

export const configRoute = new Hono();

configRoute.get('/', (c) => {
  const config = getConfig();
  return c.json({
    jsKey: config.jsKey,
    serviceHost: '/_AMapService',
    priceTiers: config.priceTiers,
    mapLabels: config.mapLabels,
    mapLabelMaxZoom: config.mapLabelMaxZoom,
  });
});
