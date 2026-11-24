import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { StickyApp } from './app/pages/StickyApp.tsx';
import { isStickyId } from './core/data/sticky.ts';
import './app/styles.css';
import './app/design.css';

const sticky = new URLSearchParams(location.search).get('sticky');
createRoot(document.getElementById('root')!).render(<StrictMode>{sticky && isStickyId(sticky) ? <StickyApp id={sticky} /> : <App />}</StrictMode>);
