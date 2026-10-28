import type { DevicesResponse } from '../../../src/Types.js';
import { useLoaderData, useRevalidator } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getUrl, sendRequest, errorMessage } from '../Utils';
import VideoPlayer from 'app/Components/VideoPlayer';


export default function Devices() {
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const devices = useLoaderData<DevicesResponse>();
  const { revalidate } = useRevalidator();

  useEffect(() => {
    const timer = window.setInterval(() => {
      revalidate().catch(error => setError(errorMessage(error)));
    }, 15000);
    return () => window.clearInterval(timer);
  }, [revalidate]);

  const setCourier = (deviceId: number, enabled: boolean) => {
    setLoaded(true);
    setError('');
    sendRequest('/courier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, enabled }),
    })
      .then(() => revalidate())
      .catch(error => setError(errorMessage(error)))
      .finally(() => setLoaded(false));
  };

  const openDoor = (deviceId: number) => {
    setLoaded(true);
    sendRequest(`/open?deviceId=${deviceId}`)
      .catch(error => setError(errorMessage(error)))
      .finally(() => setLoaded(false));
  };

  const callWebhook = (deviceId: number) => {
    setLoaded(true);
    sendRequest(`/test-webhook?deviceId=${deviceId}`)
      .catch(error => setError(errorMessage(error)))
      .finally(() => setLoaded(false));
  };

  const cardClass = devices.doorphones.length > 1
    ? 'col-sm-12 col-md-12 col-lg-6 col-xl-4'
    : 'col col-lg-8 col-xl-6';

  return (
    <>
      {error && (
        <div className="mb-3 alert alert-danger alert-dismissible">
          {error}
          <button type="button" className="btn-close" aria-label="Закрыть сообщение" onClick={() => setError('')}/>
        </div>
      )}
      <div className="row justify-content-center">
        {devices.doorphones.map((doorphone) => (
          <div className={cardClass} key={doorphone.id}>
            <div className="card">
              <VideoPlayer poster={doorphone.snapshot} src={getUrl(`/stream?deviceId=${doorphone.id}&high=0`)} className="rounded" />
              <div className="card-body">
                <h5 className="card-title">
                  {doorphone.address}{doorphone.apartment && (`, кв. ${doorphone.apartment}`)}
                </h5>
                <p className="card-text">
                  Вход {doorphone.entrance}
                </p>
                <div className="form-check form-switch mb-3">
                  <input
                    id={`courier-${doorphone.id}`}
                    type="checkbox"
                    role="switch"
                    className="form-check-input"
                    checked={doorphone.courierWaiting === true}
                    disabled={loaded}
                    onChange={event => setCourier(doorphone.id, event.target.checked)}
                  />
                  <label className="form-check-label" htmlFor={`courier-${doorphone.id}`}>Жду курьера</label>
                  <div className="form-text">Открыть дверь при первом звонке и выключить режим.</div>
                </div>
                <button
                  type="button"
                  disabled={loaded}
                  className="btn btn-primary me-3"
                  onClick={() => void openDoor(doorphone.id)}
                >
                  Открыть дверь
                </button>
                <button
                  type="button"
                  disabled={loaded}
                  className="btn btn-secondary"
                  onClick={() => void callWebhook(doorphone.id)}
                >
                  Имитировать звонок
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
