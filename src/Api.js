import { getUrlString } from './Helpers.js';

export async function createRequest(url, request = {}) {
  const method = request.method.toUpperCase();
  const isGet = method === 'GET';
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...request?.headers,
  };

  if (request instanceof Request) {
    const body = isGet ? null : await request.blob();
    return new Request(url, {
      headers,
      method,
      body,
      cache: request.cache,
      credentials: request.credentials,
      referrer: request.referrer,
      referrerPolicy: request.referrerPolicy,
      mode: request.mode,
      redirect: request.redirect,
      integrity: request.integrity,
      signal: request.signal,
    });
  }

  return new Request(url, {
    credentials: 'include', ...request, headers,
  });
}

/**
 * @param {Promise} request
 * @return {Promise<any>}
 */
export async function fetchRequest(request) {
  return fetch(await request).then((response) => (response.status < 200 || response.status >= 400 ? Promise.reject(response) : response));
}

export async function fetchUrl(url, request) {
  return fetchRequest(createRequest(url, request));
}

async function get(url, queryParams = {}, options = {}) {
  const requestUrl = getUrlString(url, queryParams);
  return fetchRequest(createRequest(requestUrl, {
    ...options,
    method: 'GET',
  })).then((response) => response.json());
}

async function post(url, formData = {}, options = {}) {
  return fetchRequest(createRequest(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(formData),
  })).then((response) => response.json());
}

export default {
  get,
  post,
};
