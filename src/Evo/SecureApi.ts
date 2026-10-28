import { randomUUID } from 'node:crypto';
import HttpException, { HttpError, getErrorStatus } from '../Utils/HttpException.js';
import Api, { fetchUrl } from '../Utils/Api.js';
import { getUrlString, type QueryParams } from '../Utils/Helpers.js';
import Storage from '../Storage.js';
import Logger from '../Logger.js';
import { parseAuthResponse, readAuthResponse } from './AuthResponse.js';
import type { AuthResult } from '../Types.js';

const NAMESPACE_DEFAULT = 'main';
const NAMESPACE_DOORPHONE = 'doorphone';
const NAMESPACE_SINGLE = 'single';
const BASE_URI = 'https://api.app.evo73.ru/api/v1';
const TOKEN_REFRESH_INTERVAL = 20 * 60 * 1000;
const MAIN_TOKEN_URI = 'https://api.app.evo73.ru/api/v2/single-auth/main-token';
type Namespace = 'main' | 'doorphone' | 'single';

const namespaces: Record<Namespace, { url: string; tokenName: string }> = {
  [NAMESPACE_DEFAULT]: { url: BASE_URI, tokenName: 'token' },
  [NAMESPACE_DOORPHONE]: { url: 'https://doorphone.app.evo73.ru/api', tokenName: 'doorphone_token' },
  [NAMESPACE_SINGLE]: { url: 'https://id.evo73.ru', tokenName: 'single_token' },
};
let refreshPromise: Promise<void> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | undefined;

function isNamespace(value: string): value is Namespace {
  return value === NAMESPACE_DEFAULT || value === NAMESPACE_DOORPHONE || value === NAMESPACE_SINGLE;
}

function getNamespace(url: string): Namespace {
  const [name] = url.split(':/');
  if (!isNamespace(name)) {
    throw HttpException('Неизвестное пространство имён API', 400);
  }
  return name;
}

export function normalizeUrl(url: string): string {
  const [name, path] = url.split(':/');
  return isNamespace(name) ? namespaces[name].url + path : url;
}

function getToken(namespace: Namespace): string | null {
  return Storage.get(namespaces[namespace].tokenName);
}

function saveToken(token: string | null | undefined, namespace: Namespace): string {
  if (typeof token !== 'string' || !token.trim()) {
    throw HttpException('Сервер не вернул токен авторизации', 502);
  }
  const value = token.replace(/^Bearer\s+/i, '').trim();
  if (!value) {
    throw HttpException('Сервер не вернул токен авторизации', 502);
  }
  Storage.save(namespaces[namespace].tokenName, value);
  Logger.log(`[${namespace}] Token update was successful`);
  return value;
}

function getOptions(namespace?: Namespace): RequestInit {
  let uuid = process.env.APP_DEVICE_UUID || Storage.get('device_uuid');
  if (!uuid) {
    uuid = randomUUID();
    Storage.save('device_uuid', uuid);
  }
  const token = namespace && getToken(namespace);
  return {
    signal: AbortSignal.timeout(30000),
    headers: {
      Accept: 'application/json, text/plain, */*',
      Origin: 'capacitor://localhost',
      Referer: 'capacitor://localhost/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'X-Device-UUID': uuid,
      'X-Device-Model': 'Pixel 7',
      'X-Device-Platform': 'android',
      'X-Device-Version': '4.0.33',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

function isAuthError(error: unknown): boolean {
  return [401, 403].includes(getErrorStatus(error));
}

async function refreshSingleToken(): Promise<void> {
  const response = await fetchUrl(`${namespaces.single.url}/auth/refresh`, {
    method: 'POST', body: '{}', ...getOptions(NAMESPACE_SINGLE),
  });
  const body = await readAuthResponse(response);
  saveToken(body.token || response.headers.get('Authorization'), NAMESPACE_SINGLE);
}

async function refreshMainToken(): Promise<void> {
  if (!getToken(NAMESPACE_SINGLE)) {
    throw HttpException('Пройдите авторизацию заново: отсутствует токен SingleAuth', 401);
  }
  const exchange = () => Api.post<unknown>(MAIN_TOKEN_URI, { token: getToken(NAMESPACE_SINGLE) }, getOptions());
  let body: unknown;
  try {
    body = await exchange();
  } catch (error) {
    if (!isAuthError(error)) {
      throw error;
    }
    await refreshSingleToken();
    body = await exchange();
  }
  saveToken(parseAuthResponse(body).token, NAMESPACE_DEFAULT);
}

async function refreshDoorPhoneToken(): Promise<void> {
  const body = await Api.post<unknown>(`${BASE_URI}/authIntercom`, {}, getOptions(NAMESPACE_DEFAULT));
  saveToken(parseAuthResponse(body).token, NAMESPACE_DOORPHONE);
}

// The server invalidates the previous token when issuing its replacement.
// Serialize refreshes so simultaneous requests cannot overwrite the new token.
function withRefreshLock(callback: () => Promise<void>): Promise<void> {
  const pending = (refreshPromise || Promise.resolve()).catch(() => {}).then(callback);
  refreshPromise = pending;
  return pending.finally(() => {
    if (refreshPromise === pending) {
      refreshPromise = null;
    }
  });
}

async function renewDoorphoneToken(): Promise<void> {
  if (getToken(NAMESPACE_DOORPHONE)) {
    try {
      const response = await fetchUrl(`${namespaces.doorphone.url}/auth/refresh`, {
        method: 'GET', ...getOptions(NAMESPACE_DOORPHONE),
      });
      saveToken(response.headers.get('Authorization'), NAMESPACE_DOORPHONE);
      return;
    } catch (error) {
      // An expired doorphone token needs the SingleAuth -> main exchange.
      if (!isAuthError(error)) {
        throw error;
      }
    }
  }
  await refreshMainToken();
  await refreshDoorPhoneToken();
}

export function startTokenRefresh(): void {
  if (refreshTimer) {
    return;
  }
  refreshTimer = setInterval(() => {
    if (getToken(NAMESPACE_DOORPHONE)) {
      void withRefreshLock(renewDoorphoneToken).catch((error: unknown) => {
        Logger.error('Не удалось продлить токен домофона', getErrorStatus(error));
      });
    }
  }, TOKEN_REFRESH_INTERVAL);
  refreshTimer.unref();
}

async function authError(error: unknown, fallback: string, confirming = false): Promise<HttpError> {
  const body = error instanceof Response ? await readAuthResponse(error) : undefined;
  const message = body?.message;
  const status = getErrorStatus(error);
  if (status === 429 || message === 'Operations is blocked') {
    return HttpException('Превышено количество попыток. Попробуйте позже.', status);
  }
  if (status === 423) {
    return HttpException('Сервис временно недоступен, попробуйте позже', status);
  }
  if (message === 'Operations not found') {
    return HttpException('Запросите новый код подтверждения', status);
  }
  if (confirming && ([401, 403, 422].includes(status) || ['Invalid code', 'WRONG_CODE'].includes(message || ''))) {
    return HttpException('Неверный код авторизации', status);
  }
  return HttpException(error instanceof HttpError ? error.message : fallback, status);
}

async function requestCode(isSms: boolean): Promise<unknown> {
  try {
    const body = await Api.post<unknown>(`${namespaces.single.url}/auth/login`, {
      phone: (process.env.APP_PHONE_NUMBER || '').replace(/\D/g, ''), isSms,
    }, getOptions());
    if (parseAuthResponse(body).status !== 'ok') {
      throw HttpException('Не удалось запросить код подтверждения', 502);
    }
    Storage.save('auth_is_sms', String(isSms));
    return body;
  } catch (error) {
    throw await authError(error, 'Не удалось запросить код подтверждения');
  }
}

export function sendSms(): Promise<unknown> {
  return requestCode(true);
}

export function sendCall(): Promise<unknown> {
  return requestCode(false);
}

export async function createToken(code: string): Promise<AuthResult> {
  try {
    const body = await Api.post<unknown>(`${namespaces.single.url}/auth/code-confirm`, {
      phone: (process.env.APP_PHONE_NUMBER || '').replace(/\D/g, ''),
      code: String(code),
      isSms: Storage.get('auth_is_sms') === 'true',
    }, getOptions());
    saveToken(parseAuthResponse(body).token, NAMESPACE_SINGLE);
  } catch (error) {
    throw await authError(error, 'Не удалось подтвердить код', true);
  }
  try {
    await withRefreshLock(async () => {
      await refreshMainToken();
      await refreshDoorPhoneToken();
    });
  } catch (error) {
    throw await authError(error, 'Не удалось получить токен домофона');
  }
  startTokenRefresh();
  Logger.log('Токены авторизации успешно созданы');
  return { authorized: true };
}

function createRequest(url: string, requestOptions: RequestInit): Promise<Response> {
  const namespace = getNamespace(url);
  return fetchUrl(normalizeUrl(url), {
    ...requestOptions, ...getOptions(namespace),
  });
}

async function recoverToken(namespace: Namespace, previousToken: string | null): Promise<void> {
  try {
    await withRefreshLock(async () => {
      const currentToken = getToken(namespace);
      if (currentToken && currentToken !== previousToken) {
        return;
      }
      switch (namespace) {
        case NAMESPACE_DOORPHONE:
          await renewDoorphoneToken();
          break;
        case NAMESPACE_SINGLE:
          await refreshSingleToken();
          break;
        case NAMESPACE_DEFAULT:
          await refreshMainToken();
          break;
      }
    });
  } catch (error) {
    if (isAuthError(error)) {
      Storage.save(namespaces[namespace].tokenName, '');
    }
    throw await authError(error, 'Не удалось обновить токен. Пройдите авторизацию заново');
  }
}

async function sendRequest(url: string, requestOptions: RequestInit): Promise<Response> {
  const namespace = getNamespace(url);
  const previousToken = getToken(namespace);
  try {
    return await createRequest(url, requestOptions);
  } catch (error) {
    if (!isAuthError(error)) {
      const fallback = error instanceof Response ? error.statusText : 'Не удалось выполнить запрос';
      throw await authError(error, fallback);
    }
  }

  await recoverToken(namespace, previousToken);
  // Retry once; failures propagate instead of starting another refresh loop.
  try {
    return await createRequest(url, requestOptions);
  } catch (error) {
    if (isAuthError(error)) {
      Storage.save(namespaces[namespace].tokenName, '');
    }
    throw await authError(error, 'Не удалось выполнить запрос после обновления токена');
  }
}

export function post(url: string, formData?: unknown): Promise<Response> {
  return sendRequest(url, { method: 'POST', body: JSON.stringify(formData) });
}

export function get(url: string, params?: QueryParams): Promise<Response> {
  return sendRequest(getUrlString(url, params), { method: 'GET' });
}

export function isTokenProvided(): boolean {
  return !!getToken(NAMESPACE_DOORPHONE);
}

export async function getJson<T = unknown>(url: string, params?: QueryParams): Promise<T> {
  const response = await get(url, params);
  return response.json() as Promise<T>;
}

export async function postJson<T = unknown>(url: string, formData?: unknown): Promise<T> {
  const response = await post(url, formData);
  return response.json() as Promise<T>;
}

export default { get, post, getJson, postJson };
