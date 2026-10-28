import type { Doorphone, SipSettings } from './Types.js';
import type SipRequest from './Sip/Messages/SipRequest.js';
import { getDevices } from './Evo/DoorPhone.js';
import SipClient, { EVENT_INVITE, EVENT_REGISTER, EVENT_REGISTRATION_ERROR } from './Sip/SipClient.js';
import { isTokenProvided } from './Evo/SecureApi.js';
import { publishIncomingCall } from './Actions.js';
import { RECONNECT_TIMEOUT } from './Sip/Constants.js';
import { getHeader } from './Sip/Types.js';
import { getErrorMessage } from './Utils/HttpException.js';
import Logger from './Logger.js';

interface ManagedClient {
  client: ReturnType<typeof SipClient>;
  settings: SipSettings;
  device: Doorphone;
  notifiedCalls: Set<string>;
}

const MAX_NOTIFIED_CALLS = 1000;
const clients = new Map<number, ManagedClient>();
let starting: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let enabled = false;
let generation = 0;

function hasSameSettings(previous: SipSettings, next: SipSettings): boolean {
  return previous.login === next.login
    && previous.sip_password === next.sip_password
    && previous.sip_address === next.sip_address;
}

function notifyIncomingCall(managed: ManagedClient, request: SipRequest): void {
  const { device, notifiedCalls } = managed;
  if (clients.get(device.id) !== managed) {
    return;
  }
  const callId = getHeader(request.headers, 'Call-ID');
  if (notifiedCalls.has(callId)) {
    return;
  }

  // Claim before HTTP so pending or failed requests cannot produce duplicates.
  notifiedCalls.add(callId);
  if (notifiedCalls.size > MAX_NOTIFIED_CALLS) {
    const oldest = notifiedCalls.values().next().value;
    if (oldest !== undefined) {
      notifiedCalls.delete(oldest);
    }
  }
  Logger.info(`SIP ${device.id}: incoming call`);
  void publishIncomingCall(device).catch((error: unknown) => {
    const fallback = error instanceof Response ? `HTTP ${error.status}` : 'HTTP request failed';
    Logger.error(`SIP ${device.id}: webhook failed`, getErrorMessage(error, fallback));
  });
}

function connectSocket(doorphone: Doorphone): ManagedClient['client'] | undefined {
  const settings = doorphone.apartment_sip_settings;
  if (!settings?.login || !settings.sip_password || !settings.sip_address) {
    return;
  }
  const previous = clients.get(doorphone.id);
  if (previous && hasSameSettings(previous.settings, settings)) {
    previous.device = doorphone;
    return previous.client;
  }

  const login = settings.login.replace(/^sip:/i, '');
  const [username] = login.split('@');
  const endpoint = new URL(`sip://${settings.sip_address}`);
  const client = SipClient({
    username,
    login,
    password: settings.sip_password,
    serverHost: endpoint.hostname,
    serverPort: endpoint.port ? Number(endpoint.port) : undefined,
  });
  previous?.client.stop();
  const managed: ManagedClient = {
    client,
    settings,
    device: doorphone,
    // Preserve notification history when credentials replace the client.
    notifiedCalls: previous?.notifiedCalls ?? new Set(),
  };
  clients.set(doorphone.id, managed);
  client.on(EVENT_REGISTER, () => Logger.info(`SIP ${doorphone.id}: registered over TCP`));
  client.on(EVENT_REGISTRATION_ERROR, error => Logger.error(`SIP ${doorphone.id}: ${error.message}; reconnecting`));
  client.on(EVENT_INVITE, request => notifyIncomingCall(managed, request));
  void client.register().catch(() => {
    // SipClient reports the error and schedules another registration attempt.
  });
  return client;
}

function reconcileClients(doorphones: Doorphone[]): void {
  const active = new Set<number>();
  for (const doorphone of doorphones) {
    try {
      if (connectSocket(doorphone)) {
        active.add(doorphone.id);
      }
    } catch (error) {
      Logger.error(`SIP ${doorphone.id}: invalid settings`, getErrorMessage(error, 'Unknown error'));
    }
  }
  for (const [id, managed] of clients) {
    if (!active.has(id)) {
      managed.client.stop();
      clients.delete(id);
    }
  }
}

function clearRetry(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
  }
  retryTimer = null;
}

function scheduleRetry(): void {
  if (!enabled || retryTimer) {
    return;
  }
  retryTimer = setTimeout(() => {
    retryTimer = null;
    start();
  }, RECONNECT_TIMEOUT);
}

async function loadDevices(currentGeneration: number): Promise<void> {
  try {
    const response = await getDevices();
    if (enabled && currentGeneration === generation) {
      reconcileClients(response.doorphones);
    }
  } catch (error) {
    if (enabled && currentGeneration === generation) {
      Logger.error('Unable to load SIP devices; will retry', getErrorMessage(error, 'API request failed'));
      scheduleRetry();
    }
  } finally {
    if (currentGeneration === generation) {
      starting = null;
    }
  }
}

function start(): void {
  if (!isTokenProvided()) {
    return;
  }
  enabled = true;
  if (starting) {
    return;
  }
  clearRetry();
  starting = loadDevices(generation);
}

function stop(): void {
  enabled = false;
  generation++;
  starting = null;
  clearRetry();
  for (const managed of clients.values()) {
    managed.client.stop();
  }
  clients.clear();
}

export default { start, stop, connectSocket };
