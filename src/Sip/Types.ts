import type { DigestState } from './Digest.js';

export type SipHeaders = Record<string, string | string[] | number | undefined>;

export interface MessageOptions {
  id?: string;
  protocol?: string;
  headers: SipHeaders;
  body?: string;
}

export interface SipConfig {
  username: string;
  password: string;
  serverHost: string;
  serverPort: number;
  clientIp: string;
  clientPort: number;
  login?: string;
  callId?: string;
  fromTag?: string;
  sequence?: number;
  digest?: DigestState;
}

export interface ClientOptions extends Pick<SipConfig, 'username' | 'password' | 'serverHost'> {
  login?: string;
  serverPort?: number | null;
  clientIp?: string | null;
  clientPort?: number | null;
  requestTimeoutMs?: number;
  reconnectDelayMs?: number;
  refreshIntervalMs?: number;
}

export function getHeaderValues(headers: SipHeaders, name: string): string[] {
  const key = Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase());
  const value = key === undefined ? undefined : headers[key];
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [String(value)];
}

export function getHeader(headers: SipHeaders, name: string): string {
  return getHeaderValues(headers, name)[0] || '';
}
