import { createPartyLayer } from '@partylayer/sdk';

// One PartyLayer client for the app. Mainnet, since this executes a real swap.
// The provider (main.tsx) wires it; components read it back with usePartyLayer().
// Same app identity as the production app. (app.name is shown to the user by the
// wallet; it is not a security gate: connect succeeds from localhost. The real
// connect requirement is a current bundled @fivenorth/loop-sdk, see the README.)
export const client = createPartyLayer({
  network: 'mainnet',
  app: { name: 'Synfin Swap' },
});
