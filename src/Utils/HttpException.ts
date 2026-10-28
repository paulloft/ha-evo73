export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message, { cause: { status } });
    this.name = 'HttpError';
    this.status = status;
  }
}

export function getErrorStatus(error: unknown): number {
  if (error instanceof Response || error instanceof HttpError) {
    return error.status;
  }
  if (typeof error === 'object' && error !== null && 'status' in error
    && typeof error.status === 'number' && error.status >= 400 && error.status <= 599) {
    return error.status;
  }
  return 502;
}

export function getErrorMessage(error: unknown, fallback = 'Не удалось выполнить запрос'): string {
  return error instanceof Error ? error.message : fallback;
}

export default function HttpException(message: string, status = 400): HttpError {
  return new HttpError(message, status);
}
