import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PartyLayerProvider } from '@partylayer/react';
import { createMemoryStorage } from '@partylayer/session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { client } from './lib/partylayer';
import { App } from './App';

// Session state is kept in memory (no browser storage), matching Synfin's own app.
const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PartyLayerProvider
        client={client}
        sessionOptions={{ storage: createMemoryStorage(), reconnect: false }}
      >
        <App />
      </PartyLayerProvider>
    </QueryClientProvider>
  </StrictMode>,
);
