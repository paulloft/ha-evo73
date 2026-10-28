import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import App from './App';
import './Styles.scss';

const element = document.getElementById('root');
if (!element) throw new Error('Root element not found');
const root = createRoot(element);

root.render((
  <StrictMode>
    <App/>
  </StrictMode>
));
