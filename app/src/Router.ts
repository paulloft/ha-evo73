import { createHashRouter, redirect } from 'react-router-dom';
import Layout from 'app/Layout';
import Loading from 'app/Components/Loading';
import { sendRequest, ApiError } from 'app/Utils';
import Devices from 'app/Pages/Devices';
import Authorization from 'app/Pages/Authorization';
import RouteError from 'app/Pages/RouteError';
import type { InfoResponse, DevicesResponse } from '../../src/Types.js';

export default createHashRouter([
  {
    Component: Layout,
    HydrateFallback: Loading,
    ErrorBoundary: RouteError,
    children: [
      {
        path: '/',
        loader: async ({ request }) => {
          const info = await sendRequest<InfoResponse>('/info', { signal: request.signal });
          return info.authorized ? info : redirect('/auth');
        },
        children: [
          {
            index: true,
            Component: Devices,
            loader: async ({ request }) => {
              try {
                return await sendRequest<DevicesResponse>('/devices', { signal: request.signal });
              } catch (error) {
                if (error instanceof ApiError && [401, 403].includes(error.status)) return redirect('/auth');
                throw error;
              }
            },
          },
        ],
      },
      { path: '/auth', Component: Authorization },
    ],
  },
]);
