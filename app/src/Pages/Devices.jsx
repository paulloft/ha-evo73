import { useLoaderData } from 'react-router-dom';
import React, { useState } from 'react';
import { sendRequest } from '../Utils';


export default function Devices() {
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const devices = useLoaderData();

  const openDoor = (deviceId) => {
    setLoaded(true);
    sendRequest(`/open?deviceId=${deviceId}`)
      .catch(setError)
      .finally(() => setLoaded(false));
  }

  const callWebhook = (deviceId) => {
    setLoaded(true);
    sendRequest(`/test-webhook?deviceId=${deviceId}`)
      .catch(setError)
      .finally(() => setLoaded(false));
  }

  return (
    <>
      {error && (
        <div className="mb-3 alert alert-danger alert-dismissible">
          {error}
          <button type="button" className="btn-close" onClick={() => setError('')} />
        </div>
      )}
      <div className="row">
        {devices.doorphones.map((doorphone) => (
          <div className="col" key={doorphone.id}>
            <div className="card">
              <img src={doorphone.snapshot} className="card-img-top" alt="" />
              <div className="card-body">
                <h5 className="card-title">{doorphone.address}{doorphone.apartment && (`, кв. ${doorphone.apartment}`)}</h5>
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
                  Иммитировать звонок
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
