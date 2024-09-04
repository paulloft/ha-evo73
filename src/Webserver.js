import { createServer } from 'node:http';
import { parse } from 'node:querystring';
import HttpException from './HttpException.js';

const routes = { GET: {}, POST: {} };

export function getServerUrl() {
  return `http://localhost:${process.env.APP_WEBSERVER_PORT}`;
}

function handleError(error, response) {
  const statusCode = error?.cause?.status || 400;
  console.error(error);
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.write(JSON.stringify({ code: statusCode, error: error.message, status: false }));
}

function parseResult(buffer, request) {
  const contentType = request.headers['content-type'];
  switch (contentType) {
    case 'application/x-www-form-urlencoded':
      return parse(buffer);

    case 'application/json':
      return JSON.parse(buffer);

    default:
      return buffer;
  }
}

function getPayload(request) {
  return new Promise((resolve, reject) => {
    const bodyParts = [];
    request.on('data', (chunk) => {
      bodyParts.push(chunk);
    }).on('end', () => {
      try {
        const buffer = Buffer.concat(bodyParts).toString();
        const payload = parseResult(buffer, request);
        resolve(payload);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function handleRequest(request, response) {
  const baseURL = request.protocol + '://' + request.headers.host + '/';
  const url = new URL(request.url, baseURL);

  const handler = routes[request.method][url.pathname] || null;
  if (!handler) {
    return Promise.reject(HttpException('Page not found', 404));
  }

  const payload = request.method === 'GET' ? url.searchParams : await getPayload(request);
  const result = handler(payload, request, response);
  return result instanceof Promise ? result : Promise.resolve(result);
}

export function add(method, path, callback) {
  routes[method.toUpperCase()][path] = callback;
}

export function start(callback = null) {
  createServer((request, response) => {
    handleRequest(request, response)
      .then((result) => {
        if (result) {
          response.setHeader('Content-Type', 'application/json');
          response.write(JSON.stringify(result));
        }
      })
      .catch((error) => {
        handleError(error, response);
      }).finally(() => response.end());
  }).listen(process.env.APP_WEBSERVER_PORT, () => {
    if (callback) {
      callback();
    }
  });
}

export default {
  start,
  add,
};
