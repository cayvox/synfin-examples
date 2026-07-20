import { createPartyLayer } from '@partylayer/sdk';

// One PartyLayer client for the app. Mainnet, since this executes a real swap.
// The provider (main.tsx) wires it; components read it back with usePartyLayer().
// Same app identity as the production app (a distinct name was wrong: this is the
// same Synfin app). If the connect is gated on the registered app name, matching
// it here is the fix; if it is gated on the ORIGIN, this alone will not make
// localhost connect (see the README caveat).
export const client = createPartyLayer({
  network: 'mainnet',
  app: { name: 'Synfin Swap' },
});
