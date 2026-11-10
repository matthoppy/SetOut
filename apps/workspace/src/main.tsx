import '@setout/ui/styles.css';
import { SystemStatus } from '@setout/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SystemStatus app="workspace">
      The trade workspace: jobs, drawings, cut lists, quotes and orders. Its screens arrive in step 2. This page shows that the engine in your browser and the engine on the server give the same answer.
    </SystemStatus>
  </StrictMode>
);
