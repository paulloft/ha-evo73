import { fileURLToPath } from 'url';
import { dirname, resolve } from 'node:path';

export function getPathApp() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return resolve(__dirname, '../');
}

export function isEmptyValue(value) {
  return value === null
    || value === ''
    || value === undefined
    || (typeof value === 'object' && !Object.keys(value).length);
}

export function serializeQuery(params, prefix) {
  const query = [];
  Object.entries(params).forEach(([key, value]) => {
    if (isEmptyValue(value)) {
      return;
    }

    if (params.constructor === Array) {
      // eslint-disable-next-line no-param-reassign
      key = `${prefix}[]`;
    } else if (params.constructor === Object) {
      // eslint-disable-next-line no-param-reassign
      key = (prefix ? `${prefix}[${key}]` : key);
    }

    if (typeof value === 'object') {
      query.push(serializeQuery(value, key));
    } else {
      query.push(`${key}=${encodeURIComponent(value)}`);
    }
  });

  return Array.prototype.concat.apply([], query).join('&');
}

/**
 * Сформировать URL строку из объекта параметров
 * @param {string} url
 * @param {{}} params
 * @return {string}
 */
export function getUrlString(url, params) {
  const urlObject = new URL(url, 'http://localhost');
  const queryParams = {
    ...Object.fromEntries(urlObject.searchParams),
    ...params,
  };
  return `${url}${queryParams ? `?${serializeQuery(queryParams)}` : ''}`;
}

export function filterObject(object) {
  const resultObject = {};
  Object.entries(object).forEach(([key, value]) => {
    if (isEmptyValue(value)) {
      return;
    }

    if (typeof value === 'object') {
      const childObject = filterObject(value);
      if (!isEmptyValue(childObject)) {
        resultObject[key] = childObject;
      }
    } else {
      resultObject[key] = value;
    }
  });

  return resultObject;
}

export function generateString() {
  return (Math.random() + 1).toString(36).substring(7);
}

export function getFileMimeType(filepath) {
  const parts = filepath.split('.');
  const extension = parts.pop();
  const encoding = 'charset=utf-8';
  switch (extension) {
    case 'html':
      return `text/${extension}; ${encoding}`;
    case 'css':
      return `text/${extension}`;
    case 'js':
      return `application/javascript; ${encoding}`;
    case 'png':
    case 'gif':
      return `image/${extension}`;
    case 'jpg':
      return 'image/jpeg';
    case 'ico':
      return 'image/x-icon';
    case 'svg':
      return 'image/svg+xml';
    default:
      return `text/plain; ${encoding}`;
  }
}
