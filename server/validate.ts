export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function asText(value: unknown, field: string, options: { max?: number; required?: boolean } = {}): string | null {
  if (value === undefined || value === null) {
    if (options.required) throw new ValidationError(`${field}不能为空`);
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    if (options.required) throw new ValidationError(`${field}不能为空`);
    return null;
  }
  if (options.max && text.length > options.max) throw new ValidationError(`${field}最多 ${options.max} 个字`);
  return text;
}

export function asNumber(value: unknown, field: string, min: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) throw new ValidationError(`${field}必须是数字`);
  if (num < min || num > max) throw new ValidationError(`${field}需在 ${min}–${max} 之间`);
  return num;
}

export function asEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  const text = String(value ?? '').trim();
  if (!(allowed as readonly string[]).includes(text)) {
    throw new ValidationError(`${field}只能是 ${allowed.join(' / ')}`);
  }
  return text as T;
}

export function asDate(value: unknown, field = '日期'): string {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ValidationError(`${field}格式应为 YYYY-MM-DD`);
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${field}不是有效日期`);
  const year = Number(text.slice(0, 4));
  if (year < 1900 || year > 2100) throw new ValidationError(`${field}需在 1900–2100 年之间`);
  return text;
}

export function asRating(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 5) throw new ValidationError('评分需是 1–5 的整数');
  return num;
}

export const PRICE_TIERS = ['low', 'mid', 'high'] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export function asPriceTier(value: unknown, type: string): PriceTier | null {
  if (value === undefined || value === null || value === '') return null;
  if (type !== 'restaurant') return null;
  return asEnum(value, '价位', PRICE_TIERS);
}

export const PLACE_TYPES = ['restaurant', 'spot'] as const;
export type PlaceType = (typeof PLACE_TYPES)[number];

export const DATE_TODAY = (): string => new Date().toLocaleDateString('sv-SE');
