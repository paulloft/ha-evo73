import { resolve } from 'node:path';
import { readFileSync, writeFile } from 'node:fs';
import { getPathApp } from './Utils/Helpers.js';
import Logger from './Logger.js';

const storage = {};

function getFilename(key) {
  return `${resolve(getPathApp(), process.env.APP_STORAGE_DIR)}/${key}`;
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
      Logger.error(`Unable save to storage`, error);
    }
  });
}

export default {
  get,
  save,
};
