import { createPartyLayer } from '@partylayer/sdk';

// One PartyLayer client for the app. Mainnet, since this executes a real swap.
// The provider (main.tsx) wires it; components read it back with usePartyLayer().
export const client = createPartyLayer({
  network: 'mainnet',
  app: { name: 'Synfin swap (published SDK)' },
});
