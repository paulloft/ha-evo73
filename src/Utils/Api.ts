import { getUrlString } from './Helpers.js';
import type { QueryParams } from './Helpers.js';

export async function createRequest(url: string, request: RequestInit | Request = {}): Promise<Request> {
  const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json' });
  new Headers(request.headers).forEach((value, key) => headers.set(key, value));
  if (request instanceof Request) {
    return new Request(url, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? null : await request.blob(),
      signal: request.signal,
      redirect: request.redirect,
    });
  }
  return new Request(url, { credentials: 'include', ...request, headers });
}

export async function fetchRequest(request: Request | Promise<Request>): Promise<Response> {
  const response = await fetch(await request);
  if (!response.ok) {
    throw response;
  }
  return response;
}

export function fetchUrl(url: string, request: RequestInit = {}): Promise<Response> {
  return fetchRequest(createRequest(url, request));
}

async function get<T = unknown>(url: string, params: QueryParams = {}, options: RequestInit = {}): Promise<T> {
  const response = await fetchUrl(getUrlString(url, params), { ...options, method: 'GET' });
  return response.json() as Promise<T>;
}

async function post<T = unknown>(url: string, data: unknown = {}, options: RequestInit = {}): Promise<T> {
  const response = await fetchUrl(url, { ...options, method: 'POST', body: JSON.stringify(data) });
  return response.json() as Promise<T>;
}

export default { get, post };
