import SecureApi, { normalizeUrl } from './SecureApi.js';
import { fetchUrl } from '../Utils/Api.js';
import { getUrlString } from '../Utils/Helpers.js';
import HttpException from '../Utils/HttpException.js';
import Logger from '../Logger.js';
import type { DevicesResponse, Doorphone, CameraResponse } from '../Types.js';
import { doorEvents } from '../DoorEvents.js';

let devices: DevicesResponse | undefined;

export async function getDevices(cached = false): Promise<DevicesResponse> {
  if (devices && cached) {
    return devices;
  }
  devices = await SecureApi.getJson<DevicesResponse>('doorphone://client/doorphone');
  return devices;
}

export async function getDoorphone(id: number): Promise<Doorphone> {
  const devices = await getDevices();
  const device = devices.doorphones.find(doorphone => doorphone.id === id);
  if (!device) {
    throw HttpException('Домофон не найден', 404);
  }
  return device;
}

export async function getFirstDeviceId(): Promise<number> {
  const devices = await getDevices(true);
  const id = devices.doorphones[0]?.id;
  if (!id) {
    throw HttpException('Доступные устройства не найдены', 404);
  }
  return id;
}

export async function openDoor(deviceId?: number | null, doorNum = 1): Promise<unknown> {
  const id = deviceId ?? await getFirstDeviceId();
  const response = await SecureApi.postJson(`doorphone://doorphone/${id}/open-door/${doorNum}`);
  doorEvents.emit('opened', id);
  Logger.log('Дверь открыта');
  return response;
}

export async function getStreamUrl(deviceId?: number | null, high = true): Promise<string> {
  const id = deviceId ?? await getFirstDeviceId();
  const response = await SecureApi.getJson<CameraResponse>(`doorphone://doorphone/${id}/camera`);
  return high ? response.channel.stream_url : response.channel.sub_stream_url || response.channel.stream_url;
}

export function getSnapshotUrl(deviceId: number, compress = false): string {
  return getUrlString(normalizeUrl(`doorphone://doorphone/${deviceId}/snapshot`), { compress });
}

export async function getSnapshot(deviceId?: number | null, compress = false): Promise<Response> {
  return fetchUrl(getSnapshotUrl(deviceId ?? await getFirstDeviceId(), compress), { method: 'GET' });
}
