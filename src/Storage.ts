import { resolve, dirname } from 'node:path';
import { readFileSync, writeFileSync, renameSync, rmSync, mkdirSync } from 'node:fs';
import { getPathApp } from './Utils/Helpers.js';
import Logger from './Logger.js';

const storage: Record<string, string | null> = {};

function getFilename(key: string): string {
  return `${resolve(getPathApp(), process.env.APP_STORAGE_DIR || './var')}/${key}`;
}

function get(key: string): string | null {
  let value = storage[key];

  if (value === undefined) {
    try {
      value = readFileSync(getFilename(key), 'utf8');
    } catch {
      value = null;
    }
    storage[key] = value;
  }

  return value;
}

function save(key: string, content: string): void {
  storage[key] = content;
  const filename = getFilename(key);
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(temporary, content, { mode: 0o600 });
    renameSync(temporary, filename);
  } catch (error) {
    rmSync(temporary, { force: true });
    Logger.error('Unable save to storage', error);
  }
}

export default {
  get,
  save,
};
