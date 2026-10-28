import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export function getPathApp(): string {
  // Resolve from src/Utils independently of the working directory.
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../');
}

export type QueryValue = string | number | boolean | null | undefined | QueryValue[] | { [key: string]: QueryValue };
export type QueryParams = Record<string, QueryValue>;

export function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === ''
    || (typeof value === 'object' && !Object.keys(value).length);
}

export function serializeQuery(params: QueryParams | QueryValue[], prefix?: string): string {
  return Object.entries(params).flatMap(([key, value]) => {
    if (isEmptyValue(value)) {
      return [];
    }
    let name = key;
    if (Array.isArray(params)) {
      name = `${prefix}[]`;
    } else if (prefix) {
      name = `${prefix}[${key}]`;
    }
    if (typeof value === 'object' && value !== null) {
      return serializeQuery(value, name);
    }
    return `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`;
  }).join('&');
}

export function getUrlString(url: string, params: QueryParams = {}): string {
  const parsed = new URL(url, 'http://localhost');
  const query = serializeQuery({ ...Object.fromEntries(parsed.searchParams), ...params });
  const base = url.split(/[?#]/)[0];
  return `${base}${query ? `?${query}` : ''}${parsed.hash}`;
}
