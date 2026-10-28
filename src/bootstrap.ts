import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { getPathApp } from './Utils/Helpers.js';

export function initEnv(): void {
  // Supervisor environment takes precedence, followed by .env.local and .env.
  for (const name of ['.env.local', '.env']) {
    const filename = resolve(getPathApp(), name);
    if (existsSync(filename)) {
      loadEnvFile(filename);
    }
  }
}
