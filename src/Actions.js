import { getSnapshot, getSnapshotUrl } from './Evo/DoorPhone.js';
import { fetchUrl } from './Api.js';

export function getSnapshotImageResponse(params, request, webResponse) {
  return getSnapshot(params.get('deviceId'), !!params.get('compress'))
    .then((response) => response.blob())
    .then((blob) => {
      webResponse.writeHead(200, { 'Content-Type': blob.type });
      return blob.arrayBuffer();
    }).then((arrayBuffer) => {
      webResponse.write(Buffer.from(arrayBuffer), 'binary');
    });
}

export function sendWebhook(doorphone) {
  const data = {
    address: doorphone.address,
    apartment: doorphone.apartment,
    entrance: doorphone.entrance,
    openDoorUrl: doorphone.door_open_url,
    snapshot: getSnapshotUrl(doorphone.id, true),
  };
  return fetchUrl(process.env.APP_WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify(data),
  }).then(() => (data));
}
