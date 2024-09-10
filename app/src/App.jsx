import React from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import Info from './Pages/Info';
import Layout from './Layout';

export default function App() {

  const router = createHashRouter([
    {
      path: '/',
      Component: Layout,
      children: [
        {
          index: true,
          Component: Info,
          loader: ({ request }) => fetch('/info', {
            signal: request.signal,
          }),
        },
      ],
    },
  ]);

  return (
    <RouterProvider router={router} />
  );
}
