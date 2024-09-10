import SecureApi, { normalizeUrl } from './SecureApi.js';
import { fetchUrl } from '../Utils/Api.js';
import { getUrlString } from '../Utils/Helpers.js';

let devices;

export function getDevices() {
  if (devices) {
    return Promise.resolve(devices);
  }

  return SecureApi.getJson('doorphone://client/doorphone')
    .then((response) => {
      devices = response;
      return response;
    });
}

export async function getDoorphone(id) {
  const devices = await getDevices();
  return devices.doorphones.find((doorphone) => doorphone.id === id);
}

export async function getFirstDeviceId() {
  const devices = await getDevices();
  const id = devices?.doorphones[0]?.id;

  if (!id) {
    return new Error('Доступные устройства найдены');
  }

  return id;
}

export async function openDoor(deviceId = null, doorNum = null) {
  if (!deviceId) {
    deviceId = await getFirstDeviceId();
  }

  return SecureApi.postJson(`doorphone://doorphone/${deviceId}/open-door/${doorNum || 1}`);
}

export async function getStreamUrl(deviceId = null, high = true) {
  if (!deviceId) {
    deviceId = await getFirstDeviceId();
  }

  return SecureApi
    .getJson(`doorphone://doorphone/${deviceId}/camera`)
    .then((response) => (high
        ? response.channel.stream_url
        : response.channel.sub_stream_url
    ));
}

export function getSnapshotUrl(deviceId, compress = false) {
  return getUrlString(normalizeUrl(`doorphone://doorphone/${deviceId}/snapshot`), { compress });
}

export async function getSnapshot(deviceId = null, compress = false) {
  if (!deviceId) {
    deviceId = await getFirstDeviceId();
  }

  return fetchUrl(getSnapshotUrl(deviceId, compress), { method: 'get' });
}
