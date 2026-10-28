import { randomUUID } from 'node:crypto';
import type { createWebserver } from '../Webserver.js';
import { isTokenProvided } from '../Evo/SecureApi.js';
import { getDevices, getStreamUrl, openDoor } from '../Evo/DoorPhone.js';
import { getSnapshotImageResponse } from '../Actions.js';
import { getIntParam } from '../Utils/Params.js';
import HttpException from '../Utils/HttpException.js';
import Storage from '../Storage.js';
import { callEvents } from './CallEvents.js';
import { courierMode } from '../CourierMode.js';
import { setCourierMode } from '../CourierRoutes.js';

function requireAuthorization(): void {
  if (!isTokenProvided()) {
    throw HttpException('Авторизуйтесь в интерфейсе дополнения EVO', 401);
  }
}

function getInstanceId(): string {
  let id = Storage.get('ha_instance_id');
  if (!id) {
    id = randomUUID();
    Storage.save('ha_instance_id', id);
  }
  return id;
}

export function registerHomeAssistantRoutes(webserver: ReturnType<typeof createWebserver>): void {
  webserver.add('get', '/ha/info', () => {
    requireAuthorization();
    return { instanceId: getInstanceId(), apiVersion: 1 };
  });
  webserver.add('get', '/ha/devices', async () => {
    requireAuthorization();
    const response = await getDevices();
    return { devices: response.doorphones.map(device => ({
      id: device.id,
      address: device.address,
      apartment: device.apartment,
      entrance: device.entrance,
      courierWaiting: courierMode.isWaiting(device.id),
    })) };
  });
  webserver.add('post', '/ha/courier', setCourierMode);
  webserver.add('post', '/ha/open', params => {
    requireAuthorization();
    const deviceId = getIntParam(params, 'deviceId');
    if (deviceId === null) {
      throw HttpException('Не указан deviceId');
    }
    return openDoor(deviceId, getIntParam(params, 'doorNum') ?? 1);
  });
  webserver.add('get', '/ha/stream', async params => {
    requireAuthorization();
    return { url: await getStreamUrl(getIntParam(params, 'deviceId')) };
  });
  webserver.add('get', '/ha/snapshot', (params, request, response) => {
    requireAuthorization();
    return getSnapshotImageResponse(params, request, response);
  });
  webserver.add('get', '/ha/events', async (params, _request, response) => {
    requireAuthorization();
    const controller = new AbortController();
    const abort = () => controller.abort();
    response.once('close', abort);
    try {
      return await callEvents.poll(params.get('cursor'), controller.signal);
    } finally {
      response.off('close', abort);
    }
  });
}
