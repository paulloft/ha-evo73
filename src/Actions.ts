import type { Request, Response } from 'express';
import { getSnapshot, getSnapshotUrl } from './Evo/DoorPhone.js';
import { fetchUrl } from './Utils/Api.js';
import { isTokenProvided } from './Evo/SecureApi.js';
import { getIntParam } from './Utils/Params.js';
import type { Doorphone, InfoResponse } from './Types.js';

export async function getSnapshotImageResponse(params: URLSearchParams, _request: Request, response: Response): Promise<void> {
  const compress = ['true', '1'].includes(params.get('compress') || '');
  const upstream = await getSnapshot(getIntParam(params, 'deviceId'), compress);
  response.type(upstream.headers.get('Content-Type') || 'image/jpeg');
  response.send(Buffer.from(await upstream.arrayBuffer()));
}

export async function sendWebhook(doorphone: Doorphone) {
  const webhookUrl = process.env.APP_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error('Webhook отключен');
  }
  const data = {
    address: doorphone.address,
    apartment: doorphone.apartment,
    entrance: doorphone.entrance,
    openDoorUrl: doorphone.door_open_url,
    snapshot: getSnapshotUrl(doorphone.id, true),
  };
  await fetchUrl(webhookUrl, { method: 'POST', body: JSON.stringify(data), signal: AbortSignal.timeout(30000) });
  return data;
}

export function getInfo(): InfoResponse {
  return { authorized: isTokenProvided(), number: process.env.APP_PHONE_NUMBER || '' };
}
