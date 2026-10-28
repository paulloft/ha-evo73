import { createHash, randomBytes } from 'node:crypto';

export interface DigestState {
  nonce: string;
  cnonce: string;
  count: number;
}

type DigestQop = 'auth' | 'auth-int';

interface DigestChallenge {
  realm: string;
  nonce: string;
  algorithm: string;
  hashName: string;
  qop?: DigestQop;
  opaque?: string;
}

const HASH_ALGORITHMS: Readonly<Record<string, string>> = {
  MD5: 'md5',
  'SHA-256': 'sha256',
  'SHA-512-256': 'sha512-256',
};

function parseChallenge(challenge: string): DigestChallenge {
  if (!/^Digest\s+/i.test(challenge)) {
    throw new Error('Unsupported SIP authentication challenge');
  }

  const fields: Record<string, string> = {};
  const parameters = challenge.replace(/^Digest\s+/i, '');
  // Quoted values may contain commas and escaped quotes (e.g. qop="auth,auth-int").
  const parameterPattern = /([\w-]+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^,\s]+))/g;
  for (const match of parameters.matchAll(parameterPattern)) {
    const value = match[2] ?? match[3];
    fields[match[1].toLowerCase()] = value.replace(/\\(.)/g, '$1');
  }

  const { realm, nonce, opaque } = fields;
  if (realm === undefined || !nonce) {
    throw new Error('Invalid SIP digest challenge');
  }

  const algorithm = (fields.algorithm || 'MD5').toUpperCase();
  const hashName = HASH_ALGORITHMS[algorithm.replace(/-SESS$/, '')];
  if (!hashName) {
    throw new Error(`Unsupported SIP digest algorithm: ${algorithm}`);
  }

  return { realm, nonce, algorithm, hashName, qop: selectQop(fields.qop), opaque };
}

function selectQop(value: string | undefined): DigestQop | undefined {
  if (value === undefined) {
    return undefined;
  }

  const choices = value.split(',').map(choice => choice.trim().toLowerCase());
  if (choices.includes('auth')) {
    return 'auth';
  }
  if (choices.includes('auth-int')) {
    return 'auth-int';
  }
  throw new Error('Unsupported SIP digest qop');
}

function nextNonceCount(state: DigestState, nonce: string): string {
  if (state.nonce !== nonce || !state.cnonce) {
    state.nonce = nonce;
    state.cnonce = randomBytes(12).toString('hex');
    state.count = 0;
  }

  state.count++;
  return state.count.toString(16).padStart(8, '0');
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function formatAuthorization(
  challenge: DigestChallenge,
  username: string,
  uri: string,
  response: string,
  cnonce: string,
  nonceCount: string,
): string {
  const { realm, nonce, algorithm, qop, opaque } = challenge;
  const fields = [
    `username=${quote(username)}`,
    `realm=${quote(realm)}`,
    `nonce=${quote(nonce)}`,
    `uri=${quote(uri)}`,
    `algorithm=${algorithm}`,
    `response=${quote(response)}`,
  ];

  if (opaque !== undefined) {
    fields.push(`opaque=${quote(opaque)}`);
  }
  if (qop) {
    fields.push(`qop=${qop}`, `nc=${nonceCount}`, `cnonce=${quote(cnonce)}`);
  } else if (algorithm.endsWith('-SESS')) {
    fields.push(`cnonce=${quote(cnonce)}`);
  }
  return `Digest ${fields.join(', ')}`;
}

export function createDigestAuthorization(
  method: string,
  uri: string,
  challenge: string,
  username: string,
  password: string,
  state: DigestState,
  body = '',
): string {
  const parsed = parseChallenge(challenge);
  const { realm, nonce, algorithm, hashName, qop } = parsed;
  const nonceCount = nextNonceCount(state, nonce);
  const hash = (value: string): string => createHash(hashName).update(value).digest('hex');

  // HA1 hashes credentials; session algorithms also bind them to both nonces.
  let ha1 = hash(`${username}:${realm}:${password}`);
  if (algorithm.endsWith('-SESS')) {
    ha1 = hash(`${ha1}:${nonce}:${state.cnonce}`);
  }

  // HA2 hashes the request; auth-int additionally protects its body.
  let requestDigest = `${method.toUpperCase()}:${uri}`;
  if (qop === 'auth-int') {
    requestDigest += `:${hash(body)}`;
  }
  const ha2 = hash(requestDigest);

  const responseParts = [ha1, nonce];
  if (qop) {
    responseParts.push(nonceCount, state.cnonce, qop);
  }
  responseParts.push(ha2);
  const response = hash(responseParts.join(':'));

  return formatAuthorization(parsed, username, uri, response, state.cnonce, nonceCount);
}
