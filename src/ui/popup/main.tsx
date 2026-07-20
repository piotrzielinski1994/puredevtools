import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HotkeysProvider } from '@tanstack/react-hotkeys';
import '../globals.css';
import { App } from './App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <HotkeysProvider>
        <App />
      </HotkeysProvider>
    </StrictMode>,
  );
}
