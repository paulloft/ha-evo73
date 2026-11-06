import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import { randomInt } from 'node:crypto';
import { isIP } from 'node:net';

/** Reserve a real port, but never record, decode or transmit media. */
export async function createInactiveSession(offer: string, address: string) {
  const family = isIP(address) === 6 ? 'IP6' : 'IP4';
  const socket = createSocket(family === 'IP6' ? 'udp6' : 'udp4');
  socket.bind(0, address);
  await once(socket, 'listening');
  let closed = false;
  const close = () => {
    if (!closed) {
      closed = true;
      socket.close();
    }
  };
  socket.on('error', close);
  try {
    const lines = offer.split(/\r?\n/);
    const sections: string[][] = [];
    for (const line of lines) {
      if (line.startsWith('m=')) {
        sections.push([line]);
      } else {
        sections.at(-1)?.push(line);
      }
    }
    const sessionId = randomInt(1, 0x7fffffff);
    const answer = ['v=0', `o=- ${sessionId} ${sessionId} IN ${family} ${address}`, 's=EVO', `c=IN ${family} ${address}`, 't=0 0'];
    const port = socket.address().port;
    let audioAccepted = false;
    for (const section of sections) {
      const [media, offeredPort, transport, ...formats] = section[0].split(/\s+/);
      if (!transport || !formats.length) {
        throw new Error('Invalid SDP media description');
      }
      const accept = !audioAccepted && media === 'm=audio' && Number(offeredPort.split('/')[0]) > 0
        && ['RTP/AVP', 'RTP/AVPF'].includes(transport);
      answer.push(`${media} ${accept ? port : 0} ${transport} ${formats.join(' ')}`);
      if (accept) {
        audioAccepted = true;
        answer.push(...section.filter(line => /^a=(rtpmap|fmtp|ptime|maxptime):/.test(line)));
      }
      answer.push('a=inactive');
    }
    if (!offer.trim()) {
      // Offerless INVITE: the peer supplies its answer in ACK.
      answer.push(`m=audio ${port} RTP/AVP 0 8`, 'a=rtpmap:0 PCMU/8000', 'a=rtpmap:8 PCMA/8000', 'a=inactive');
    } else if (!audioAccepted) {
      throw new Error('No supported unencrypted audio stream in SDP');
    }
    return { body: `${answer.join('\r\n')}\r\n`, close };
  } catch (error) {
    close();
    throw error;
  }
}
