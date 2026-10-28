export const SIP_PING = '\r\n\r\n';
export const SIP_PONG = '\r\n';
const MAX_MESSAGE_SIZE = 1024 * 1024;

export class FrameBuffer {
  private buffer: Buffer = Buffer.alloc(0);

  append(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
  }

  read(): string | null {
    while (this.buffer.length) {
      if (this.buffer.subarray(0, 4).equals(Buffer.from(SIP_PING))) {
        this.buffer = this.buffer.subarray(4);
        return SIP_PING;
      }
      if (this.buffer.subarray(0, 2).equals(Buffer.from(SIP_PONG))) {
        // Wait for enough bytes to distinguish a fragmented ping from a pong.
        if (this.buffer.length < 4) {
          return null;
        }
        this.buffer = this.buffer.subarray(2);
        continue;
      }

      const separator = this.buffer.indexOf(SIP_PING);
      if (separator === -1) {
        if (this.buffer.length > MAX_MESSAGE_SIZE) {
          throw new Error('SIP headers exceed maximum size');
        }
        return null;
      }

      const headers = this.buffer.subarray(0, separator).toString();
      const bodyLength = this.getBodyLength(headers);
      if (separator + bodyLength > MAX_MESSAGE_SIZE) {
        throw new Error('SIP message exceeds maximum size');
      }
      const end = separator + 4 + bodyLength;
      if (this.buffer.length < end) {
        return null;
      }

      const message = this.buffer.subarray(0, end).toString();
      this.buffer = this.buffer.subarray(end);
      return message;
    }
    return null;
  }

  private getBodyLength(headers: string): number {
    const match = /^(?:Content-Length|l):\s*([^\r\n]*)/im.exec(headers);
    const value = match?.[1].trim() || '0';
    if (!/^\d+$/.test(value)) {
      throw new Error('Invalid SIP Content-Length');
    }
    return Number(value);
  }
}
