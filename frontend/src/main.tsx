import process from 'process';
import { Buffer } from 'buffer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const g = globalThis as unknown as {
  process?: unknown;
  Buffer?: unknown;
  global?: unknown;
};

if (!g.process || typeof (g.process as { nextTick?: unknown }).nextTick !== 'function') {
  g.process = process;
}

if (!g.Buffer) {
  g.Buffer = Buffer;
}

if (!g.global) {
  g.global = globalThis;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
