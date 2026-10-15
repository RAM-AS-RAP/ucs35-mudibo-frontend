import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { envResult } from '@/lib/env';
import ConfigErrorScreen from '@/screens/shared/ConfigErrorScreen';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

createRoot(container).render(
  <StrictMode>
    {envResult.ok ? <App /> : <ConfigErrorScreen errors={envResult.errors} />}
  </StrictMode>,
);
