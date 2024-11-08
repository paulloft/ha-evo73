import { useLoaderData } from 'react-router-dom';
import React, { useState } from 'react';
import { getUrl, sendRequest } from '../Utils';
import VideoPlayer from 'app/Components/VideoPlayer';


export default function Devices() {
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const devices = useLoaderData();

  const openDoor = (deviceId) => {
    setLoaded(true);
    sendRequest(`/open?deviceId=${deviceId}`)
      .catch(setError)
      .finally(() => setLoaded(false));
  };

  const callWebhook = (deviceId) => {
    setLoaded(true);
    sendRequest(`/test-webhook?deviceId=${deviceId}`)
      .catch(setError)
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
          <button type="button" className="btn-close" onClick={() => setError('')}/>
        </div>
      )}
      <div className="row justify-content-center">
        {devices.doorphones.map((doorphone) => (
          <div className={cardClass} key={doorphone.id}>
            <div className="card">
              <VideoPlayer poster={doorphone.snapshot} src={getUrl('/stream?high=0')} className="rounded" />
              <div className="card-body">
                <h5 className="card-title">
                  {doorphone.address}{doorphone.apartment && (`, кв. ${doorphone.apartment}`)}
                </h5>
                <p className="card-text">
                  Вход {doorphone.entrance}
                </p>
                <button
                  type="button"
                  disabled={loaded}
                  className="btn btn-primary me-3"
                  onClick={() => openDoor(doorphone.id)}
                >
                  Открыть дверь
                </button>
                <button
                  type="button"
                  disabled={loaded}
                  className="btn btn-secondary"
                  onClick={() => callWebhook(doorphone.id)}
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
