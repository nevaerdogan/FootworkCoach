import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/big-shoulders-display/600';
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource-variable/archivo';
import '@fontsource/chivo-mono/400';
import '@fontsource/chivo-mono/500';
import '@fontsource/chivo-mono/600';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App';
// Loaded after every screen's own CSS so responsive overrides win predictably.
import './styles/responsive.css';
import { ErrorBoundary } from './components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
