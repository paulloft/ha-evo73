import { RouterProvider } from 'react-router-dom';
import { useEffect } from 'react';
import router from './Router';

function changeColorTheme({ matches: isDark }: { matches: boolean }) {
  document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
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
    <RouterProvider router={router}/>
  );
}