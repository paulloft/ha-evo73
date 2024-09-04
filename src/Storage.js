import { dirname, resolve } from 'node:path';
import { readFileSync, writeFile } from 'node:fs';
import { fileURLToPath } from 'url';

const storage = {};
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const storagePath = resolve(__dirname, '../var');

function getFilename(key) {
  return `${storagePath}/${key}`;
}

function get(key) {
  let value = storage[key];

  if (value === undefined) {
    try {
      value = readFileSync(getFilename(key), 'utf8');
    } catch (error) {
      value = null;
    }
    storage[key] = value;
  }

  return value;
}

function save(key, content) {
  storage[key] = content;
  writeFile(getFilename(key), content, (error) => {
    if (error) {
      console.error(`Unable save to storage`, error);
    }
  });
}

export default {
  get,
  save,
};