export function getUrl(path: string): string {
  return `${window.location.pathname.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос';
}

export async function sendRequest<T = unknown>(path: string, request: RequestInit = {}): Promise<T> {
  const headers = new Headers(request.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const response = await fetch(getUrl(path), { ...request, headers });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error : `Ошибка запроса: ${response.status}`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}
