import '@setout/ui/styles.css';
import { SystemStatus } from '@setout/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SystemStatus app="designer">
      The designer a company puts on its own website. Its screens arrive in step 1. This page shows that the engine in your browser and the engine on the server give the same answer.
    </SystemStatus>
  </StrictMode>
);
