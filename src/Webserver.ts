import express from 'express';
import type { Request, Response, ErrorRequestHandler } from 'express';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { getPathApp } from './Utils/Helpers.js';
import HttpException, { getErrorMessage, getErrorStatus } from './Utils/HttpException.js';
import Logger from './Logger.js';

export type RouteHandler = (params: URLSearchParams, request: Request, response: Response) => unknown | Promise<unknown>;

export function getServerUrl(): string {
  const port = Number(process.env.APP_WEBSERVER_PORT || 8099);
  return `http://localhost${port === 80 ? '' : `:${port}`}`;
}

export function createWebserver() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  function add(method: 'get' | 'post', path: string, handler: RouteHandler): void {
    app[method](path, async (request, response) => {
      const params = method === 'get'
        ? new URL(request.originalUrl, 'http://localhost').searchParams
        : new URLSearchParams(request.body as Record<string, string>);
      const result = await handler(params, request, response);
      if (response.headersSent) {
        if (!response.writableEnded) {
          response.end();
        }
      } else if (result === undefined) {
        response.end();
      } else {
        response.json(result);
      }
    });
  }

  function start(callback?: () => void): Server {
    app.use(express.static(resolve(getPathApp(), 'public')));
    app.use((request, _response, next) => {
      next(HttpException(`Route ${request.method} ${request.path} not found`, 404));
    });
    const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
      if (response.headersSent) {
        next(error);
        return;
      }
      const status = getErrorStatus(error);
      Logger.debug('HTTP error', { status, message: getErrorMessage(error) });
      response.status(status).json({ code: status, error: getErrorMessage(error), status: false });
    };
    app.use(errorHandler);
    return app.listen(Number(process.env.APP_WEBSERVER_PORT || 8099), callback);
  }

  return { add, start, app };
}

export default createWebserver();
