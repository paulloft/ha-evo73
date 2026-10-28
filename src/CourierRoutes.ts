import type { RouteHandler } from './Webserver.js';
import { isTokenProvided } from './Evo/SecureApi.js';
import { getDoorphone } from './Evo/DoorPhone.js';
import { getIntParam } from './Utils/Params.js';
import HttpException from './Utils/HttpException.js';
import { courierMode } from './CourierMode.js';

export const setCourierMode: RouteHandler = async (params, request) => {
  if (!isTokenProvided()) {
    throw HttpException('Авторизуйтесь в интерфейсе дополнения EVO', 401);
  }
  const deviceId = getIntParam(params, 'deviceId');
  const body: unknown = request.body;
  if (deviceId === null || typeof body !== 'object' || body === null
    || !('enabled' in body) || typeof body.enabled !== 'boolean') {
    throw HttpException('Укажите deviceId и enabled (boolean)');
  }
  const enabled = body.enabled;
  await getDoorphone(deviceId);
  courierMode.setWaiting(deviceId, enabled);
  return { courierWaiting: courierMode.isWaiting(deviceId) };
};
