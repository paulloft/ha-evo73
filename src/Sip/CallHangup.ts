import type SipSocket from './SipSocket.js';
import type SipRequest from './Messages/SipRequest.js';
import type SipResponse from './Messages/SipResponse.js';
import type { SipConfig } from './Types.js';
import { getHeader } from './Types.js';
import { createResponse } from './Messages/ResponseMessages.js';
import { createAuthRequest, createContactHeader } from './Messages/RequestMessages.js';
import { createByeRequest, getSipUri, getTag } from './Messages/DialogMessages.js';
import { createInactiveSession } from './SessionDescription.js';

/** Answer only after opening a door, then terminate on ACK (RFC 3261 section 15). */
export class CallHangup {
  private response?: SipResponse;
  private media?: Awaited<ReturnType<typeof createInactiveSession>>;
  private deadline?: ReturnType<typeof setTimeout>;
  private retry?: ReturnType<typeof setTimeout>;
  private ending = false;
  private disposed = false;
  private suspended = false;
  private readonly config: SipConfig;

  constructor(
    private readonly socket: SipSocket,
    config: SipConfig,
    private readonly invite: SipRequest,
    private readonly tag: string,
    private readonly onError: (error: unknown) => void,
    private readonly onComplete: () => void,
    private readonly ackTimeout = 32000,
  ) {
    // BYE authentication and local CSeq must never modify REGISTER's state.
    this.config = { ...config, sequence: 0, digest: undefined };
  }

  async start(): Promise<void> {
    getSipUri(getHeader(this.invite.headers, 'Contact'));
    this.media = await createInactiveSession(this.invite.body, this.config.clientIp);
    if (this.disposed) {
      this.media.close();
      return;
    }
    this.response = createResponse(200, this.invite, {
      Contact: createContactHeader(this.config), 'Content-Type': 'application/sdp',
    }, this.media.body, this.tag);
    this.deadline = setTimeout(() => {
      this.onError(new Error('SIP hangup ACK timeout; sending BYE'));
      this.end();
    }, this.ackTimeout);
    this.retransmit(500);
    await this.socket.sendMessage(this.response);
  }

  get answered(): boolean {
    return this.response !== undefined;
  }

  private retransmit(delay: number): void {
    this.retry = setTimeout(() => {
      if (this.response && !this.ending && !this.disposed && !this.suspended) {
        void this.socket.sendMessage(this.response).catch(this.onError);
        this.retransmit(Math.min(delay * 2, 4000));
      }
    }, delay);
  }

  suspend(): void {
    if (!this.ending && !this.disposed) {
      this.suspended = true;
      clearTimeout(this.retry);
      this.media?.close();
    }
  }

  resume(): void {
    if (this.suspended && !this.disposed && !this.ending && this.response) {
      this.suspended = false;
      this.retransmit(500);
      void this.socket.sendMessage(this.response).catch(this.onError);
    }
  }

  replyInvite(request: SipRequest): void {
    if (!this.response) {
      return;
    }
    const response = getHeader(request.headers, 'CSeq') === getHeader(this.invite.headers, 'CSeq')
      ? createResponse(200, request, { Contact: this.response.headers.Contact, 'Content-Type': 'application/sdp' }, this.response.body, this.tag)
      : createResponse(481, request, {}, '', this.tag);
    void this.socket.sendMessage(response).catch(this.onError);
  }

  acknowledge(request: SipRequest): void {
    if (!this.response || this.disposed || this.ending) {
      return;
    }
    const sequence = getHeader(this.invite.headers, 'CSeq').split(/\s+/)[0];
    if (getHeader(request.headers, 'Call-ID') === getHeader(this.invite.headers, 'Call-ID')
      && getTag(getHeader(request.headers, 'To')) === this.tag
      && getTag(getHeader(request.headers, 'From')) === getTag(getHeader(this.invite.headers, 'From'))
      && getHeader(request.headers, 'CSeq') === `${sequence} ACK`) {
      this.end();
    }
  }

  private clearTimers(): void {
    clearTimeout(this.deadline);
    clearTimeout(this.retry);
  }

  private end(): void {
    if (this.ending || this.disposed || !this.response) {
      return;
    }
    this.ending = true;
    this.clearTimers();
    this.media?.close();
    void this.sendBye().catch(error => {
      if (!this.disposed) {
        this.onError(error);
      }
    });
  }

  private async sendBye(): Promise<void> {
    const request = createByeRequest(this.config, this.invite, getHeader(this.response!.headers, 'To'));
    let response = await this.socket.fetch(request);
    if ([401, 407].includes(response.statusCode) && !this.disposed) {
      response = await this.socket.fetch(createAuthRequest(this.config, request, response));
    }
    if (![200, 481].includes(response.statusCode)) {
      throw new Error(`SIP BYE failed: ${response.statusCode}`);
    }
    if (!this.disposed) {
      this.onComplete();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
    this.media?.close();
  }
}
