interface AuthResponse {
  token?: string;
  status?: string;
  message?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function parseAuthResponse(value: unknown): AuthResponse {
  const body = asRecord(value);
  const data = asRecord(body.data);
  const error = asRecord(body.error);
  return {
    token: asString(body.token) || asString(data.token) || asString(data.saToken)
      || asString(body.saToken) || asString(body.access_token),
    status: asString(data.status),
    message: typeof body.error === 'object' && body.error !== null
      ? asString(error.message)
      : asString(body.message) || asString(body.error),
  };
}

export async function readAuthResponse(response: Response): Promise<AuthResponse> {
  const body: unknown = await response.json().catch(() => null);
  return parseAuthResponse(body);
}
