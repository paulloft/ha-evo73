import { createHashRouter, redirect, RouterProvider } from 'react-router-dom';
import ReactDOM from 'react-dom/client';
import React from 'react';
import Authorization from './Pages/Authorization';
import { sendRequest } from './Utils';
import Devices from './Pages/Devices';
import Layout from './Layout';

const root = ReactDOM.createRoot(document.getElementById('root'));

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
          }
        ],
      },
      {
        path: '/auth',
        Component: Authorization,
      }
    ],
  },
]);

root.render((
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
));
