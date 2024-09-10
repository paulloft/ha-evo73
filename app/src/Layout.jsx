import React from 'react';
import { Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="container d-flex vh-100 w-100 align-items-center">
      <div className="w-100">
        <Outlet />
      </div>
    </div>
  );
}
