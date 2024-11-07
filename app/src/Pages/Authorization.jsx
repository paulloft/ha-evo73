import React, { useState } from 'react';

const parseResponse = async (response) => {
  const json = await response.json();
  return response.status === 200 ? json : Promise.reject(json.error);
};

export default function Authorization() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [requested, setRequested] = useState(false);
  const [code, setCode] = useState('');
  const requestCode = () => {
    setRequested(true);
    fetch('/sendsms')
      .then(parseResponse)
      .then(() => setMessage('СМС успешно запрошено'))
      .catch((error) => setError(error))
      .finally(() => setRequested(false));
  }

  const onAuth = (event) => {
    event.preventDefault();
    setRequested(true);
    fetch(`/auth?code=${code}`)
      .then(parseResponse)
      .then(() => location.reload())
      .catch((error) => setError(error))
      .finally(() => setRequested(false));
  }

  return (
    <div className="text-center">
      <div className="alert alert-warning">
        <h4>Токен авторизации отсутствует!</h4> Для получения нового токена введите код авторизации из СМС сообщения.
      </div>

      {error.length > 0 && (
        <div className="alert alert-danger">{error}</div>
      )}

      <form onSubmit={onAuth}>
        <div className="input-group mb-3">
          <input
            type="text"
            inputMode="decimal"
            className="form-control"
            placeholder="Введите код из СМС"
            value={code}
            onChange={(event) => setCode(event.currentTarget.value.replace(/\D/, ''))}
          />
          <button className="btn btn-outline-primary" type="submit" disabled={requested}>Авторизоваться</button>
        </div>
      </form>

      <button type="button" className="btn btn-primary" onClick={requestCode} disabled={requested}>
        Запросить новое СМС с кодом авторизации
      </button>

      {message.length > 0 && (
        <div>{message}</div>
      )}
    </div>
  );
}
