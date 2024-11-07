import HttpException from '../Utils/HttpException.js';
import Api, { fetchUrl } from '../Utils/Api.js';
import { getUrlString } from '../Utils/Helpers.js';
import Storage from '../Storage.js';
import Logger from '../Logger.js';

const NAMESPACE_DEFAULT = 'main';
const NAMESPACE_DOORPHONE = 'doorphone';
const BASE_URI = 'https://api.app.evo73.ru/api/v1';

const namespaces = {
  [NAMESPACE_DEFAULT]: {
    url: BASE_URI,
    tokenName: 'token',
  },
  [NAMESPACE_DOORPHONE]: {
    url: 'https://doorphone.app.evo73.ru/api',
    tokenName: 'doorphone_token',
  },
};

export function normalizeUrl(url) {
  const [namespace, path] = url.split(':/');

  if (namespaces[namespace]) {
    return namespaces[namespace].url + path;
  }

  return url;
}

async function refreshMainToken() {
  return fetchUrl(`${BASE_URI}/auth/refresh`, {
    method: 'GET',
    ...getAuthOptions(NAMESPACE_DEFAULT),
  }).then((response) => {
    if (response.status === 200) {
      const [, token] = response.headers.get('Authorization').split(' ');
      saveToken(token, NAMESPACE_DEFAULT);
      return { token };
    }

    return Promise.reject(response);
  }).catch((response) => {
    if (response.status === 401) {
      Logger.error('Refresh main token failed. Token expired or invalid');
      Storage.save(NAMESPACE_DEFAULT, null);
    }

    return response;
  });
}

function refreshDoorPhoneToken() {
  // Берем токен из NAMESPACE_DEFAULT а сохраняем уже в NAMESPACE_DOORPHONE
  return Api.post(`${BASE_URI}/authIntercom`, {}, getAuthOptions(NAMESPACE_DEFAULT))
    .then(({ token }) => {
      saveToken(token, NAMESPACE_DOORPHONE);
    })
    .catch((response) => {
      if (response.status === 401) {
        Logger.error('Refresh doorphone token failed. Token expired or invalid');
        Storage.save(NAMESPACE_DOORPHONE, null);
      }

      return Promise.reject(response);
    });
}

function getToken(namespace) {
  return Storage.get(namespaces[namespace].tokenName);
}

function saveToken(token, namespace) {
  Storage.save(namespaces[namespace].tokenName, token);
  Logger.log(`[${namespace}] Token update was successful`);
}

export function sendSms() {
  return Api.post(`${BASE_URI}/auth/phoneLogin`, {
    phone: process.env.APP_PHONE_NUMBER,
  }).catch((response) => {
    switch (response.status) {
      case 423:
        throw HttpException('Сервис временно недоступен, попробуйте позже', response.status);

      case 429:
        throw HttpException('Превышено количество попыток отправки. Попробуйте позже.', response.status);

      default:
        Logger.error('Failed to send SMS');
        Logger.debug('Send SMS response:', response);
        throw HttpException('Не удалось отправить смс', response.status);
    }
  });
}

export function createToken(code) {
  return Api.post(`${BASE_URI}/auth/phoneLogin`, {
    phone: process.env.APP_PHONE_NUMBER,
    code,
  }).then((response) => {
    if (response.access_token) {
      saveToken(response.access_token, NAMESPACE_DEFAULT);
      Logger.log('Токен авторизации успешно создан');
    }
    return response;
  }).catch(async (response) => {
    const json = await response.json();
    Logger.error('Failed to create token', json);
    Logger.debug('Response json:', json);
    if (response.status === 401) {
      throw HttpException('Неверный код авторизации', response.status);
    }
    throw HttpException('Не удалось получить токен', response.status);
  });
}

function getAuthOptions(namespace) {
  const token = getToken(namespace);
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

async function tryRefreshTokens(response) {
  if (response.status === 401) {
    Logger.log('Need to refresh tokens');
    return refreshMainToken()
      .then(refreshDoorPhoneToken)
      .catch((response) => {
        Logger.error('Failed to refresh tokens');
        Logger.debug('Refresh token response', response);
        throw HttpException(`Не удалось обновить токен. Статус ответа: ${response.status}`, response.status);
      });
  }

  const json = await response.json();
  Logger.debug('JSON response', json);

  throw HttpException(response.statusText, response.status);
}

function createRequest(url, requestOptions) {
  const [namespace, path] = url.split(':/');
  return fetchUrl(namespaces[namespace].url + path, {
    ...requestOptions,
    ...getAuthOptions(namespace),
  });
}

function sendRequest(url, requestOptions) {
  return createRequest(url, requestOptions)
    .catch((response) => tryRefreshTokens(response)
      .then(() => createRequest(url, requestOptions)),
    );
}

export function post(url, formData) {
  return sendRequest(url, {
    method: 'POST',
    body: JSON.stringify(formData),
  });
}

export function get(url, params) {
  return sendRequest(getUrlString(url, params), {
    method: 'GET',
  });
}

export function isTokenProvided() {
  return !!getToken(NAMESPACE_DEFAULT);
}

export default {
  get,
  post,
  getJson: (url, params) => get(url, params).then((response) => response.json()),
  postJson: (url, formData) => post(url, formData).then((response) => response.json()),
};
