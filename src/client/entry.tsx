import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root')!);

if (import.meta.env.DEV && location.pathname === '/review') {
  const { ReviewGallery } = await import('./review/gallery');

  root.render(<ReviewGallery />);
} else {
  const { App } = await import('./main');

  root.render(<App />);
}
