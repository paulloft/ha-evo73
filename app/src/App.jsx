import { RouterProvider } from 'react-router-dom';
import React, { useEffect } from 'react';
import Wrapper from './Components/Wrapper';
import Spinner from './Components/Spinner';
import router from './Router';

function changeColorTheme({ matches: isDark }) {
  document.firstElementChild.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
}

export default function App() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', changeColorTheme);
    changeColorTheme(media);

    return () => {
      media.removeEventListener('change', changeColorTheme);
    };
  }, []);


  return (
    <RouterProvider router={router} fallbackElement={(<Wrapper><Spinner size="lg"/></Wrapper>)}/>
  );
}