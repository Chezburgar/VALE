import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './vale/styles.css';
import { mountApp } from './vale/app';
import { registerServiceWorker } from './vale/installer';
import { showSplash } from './vale/splash';

const root = document.getElementById('app')!;

function preload(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve();
    img.src = src;
  });
}

registerServiceWorker();

const skipSplash = new URLSearchParams(location.search).has('nosplash');
const ready = [preload('/brand/vale-logo.png'), document.fonts?.ready ?? Promise.resolve()];

mountApp(root);
if (!skipSplash) showSplash(ready);
