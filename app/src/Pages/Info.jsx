import { useLoaderData } from 'react-router-dom';
import React from 'react';
import Unauthorized from './Unauthorized';

export default function Info() {
  const { authorized } = useLoaderData();

  if (!authorized) {
    return (<Unauthorized />);
  }

  return (
    <div>hi</div>
  );
}
