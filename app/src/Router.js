import { createHashRouter, redirect } from 'react-router-dom';
import Layout from 'app/Layout';
import { sendRequest } from 'app/Utils';
import Devices from 'app/Pages/Devices';
import Authorization from 'app/Pages/Authorization';

const router = createHashRouter([
  {
    Component: Layout,
    children: [
      {
        path: '/',
        loader: ({ request }) => sendRequest('/info', request)
          .then((response) => (response.authorized ? response : redirect('/auth'))),
        children: [
          {
            index: true,
            Component: Devices,
            loader: ({ request }) => sendRequest('/devices', request),
          },
        ],
      },
      {
        path: '/auth',
        Component: Authorization,
      },
    ],
  },
]);

export default router;
