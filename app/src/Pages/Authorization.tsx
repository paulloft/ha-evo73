import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendRequest, errorMessage } from 'app/Utils';
import type { AuthResult, CodeResult } from '../../../src/Types.js';

export default function Authorization() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [requested, setRequested] = useState(false);
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  const requestCode = async (isSms: boolean) => {
    setError('');
    setMessage('');
    setRequested(true);
    try {
      await sendRequest<CodeResult>(isSms ? '/sendsms' : '/sendcall');
      setCode('');
      setMessage(isSms ? 'СМС запрошено. Введите код из сообщения.' : 'Звонок запрошен. Введите последние 4 цифры входящего номера.');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setRequested(false);
    }
  };

  const onAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setRequested(true);
    try {
      await sendRequest<AuthResult>(`/auth?code=${encodeURIComponent(code)}`);
      await navigate('/', { replace: true });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setRequested(false);
    }
  };

  return (
    <div className="text-center">
      <div className="alert alert-warning">
        <h4>Требуется авторизация</h4> Запросите звонок и введите последние 4 цифры входящего номера. Также можно получить код по СМС.
      </div>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <form onSubmit={onAuth}>
        <div className="input-group mb-3">
          <input
            type="text" inputMode="numeric" autoComplete="one-time-code" required
            className="form-control" placeholder="Введите код подтверждения" aria-label="Код подтверждения"
            disabled={requested} value={code}
            onChange={event => setCode(event.currentTarget.value.replace(/\D/g, ''))}
          />
          <button className="btn btn-outline-primary" type="submit" disabled={requested || !code}>Авторизоваться</button>
        </div>
      </form>
      <button type="button" className="btn btn-primary me-2" onClick={() => void requestCode(false)} disabled={requested}>Запросить звонок</button>
      <button type="button" className="btn btn-outline-primary" onClick={() => void requestCode(true)} disabled={requested}>Запросить СМС</button>
      {message && <div role="status" className="mt-3">{message}</div>}
    </div>
  );
}
