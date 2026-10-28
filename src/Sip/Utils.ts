import { randomUUID } from 'node:crypto';
export function generateCallId(): string {
  return randomUUID();
}

export function generateBranch(): string {
  return `z9hG4bK${generateCallId()}X2`;
}

export function explode(separator: string, string: string, limit: number): string[] {
  const parts = string.split(separator);
  return parts.slice(0, limit - 1).concat(parts.slice(limit - 1).join(separator));
}

