import { getSnapshot, getSnapshotUrl } from './Evo/DoorPhone.js';
import { fetchUrl } from './Utils/Api.js';
import { isTokenProvided } from './Evo/SecureApi.js';
import HttpException from './Utils/HttpException.js';

export function getSnapshotImageResponse(params, request, webResponse) {
  return getSnapshot(params.get('deviceId'), !!params.get('compress'))
    .then((response) => response.blob())
    .then((blob) => {
      webResponse.writeHead(200, { 'Content-Type': blob.type });
      return blob.arrayBuffer();
    }).then((arrayBuffer) => {
      webResponse.write(Buffer.from(arrayBuffer), 'binary');
    }).catch(async (response) => {
      throw HttpException(response.statusText, response.status);
    });
}

export function sendWebhook(doorphone) {
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

  return fetchUrl(webhookUrl, {
    method: 'POST',
    body: JSON.stringify(data),
  }).then(() => (data));
}

export function getInfo() {
  return ({
    authorized: isTokenProvided(),
    number: process.env.APP_PHONE_NUMBER,
  });
}
