import * as os from 'node:os';

export function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();

  for (const interfaceName in interfaces) {
    const _interface = interfaces[interfaceName];

    for (const interfaceInfo of _interface) {
      if (interfaceInfo.family === 'IPv4' && !interfaceInfo.internal) {
        return interfaceInfo.address;
      }
    }
  }

  return null; // Return null if no IP address is found
}

export function generateCallId() {
  return `${Math.floor(Math.random() * 10000000000000)}`;
}

export function generateBranch() {
  return `z9hG4bK${generateCallId()}X2`;
}

export function explode(separator, string, limit) {
  let a = string.split(separator);
  return a.slice(0, limit - 1).concat(a.slice(limit - 1).join(separator));
}

