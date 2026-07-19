// First swap: quote -> plan -> execute (from your own wallet) -> track.
//
// Run (Node 20+):  node --env-file=.env src/swap.mjs
// Run (Node 18):   SYNFIN_API_KEY=... SYNFIN_TAKER_PARTY=... node src/swap.mjs
//
// WHAT IS AND ISN'T LIVE HERE
// - getQuote and createPlan are read-only calls to the hosted API. They move
//   no funds and are safe to run.
// - executePlan and track drive YOUR wallet. Execution moves real funds on
//   mainnet, so it runs only once you implement the WalletAdapter below against
//   a real Canton wallet on the taker's party. Until then this script stops at
//   the plan and prints it.
// - Tradecraft is the executable venue today; other venues are quote-only.
// - Fees are DISCLOSED, not COLLECTED on-ledger today (FEE_COLLECTION_ENABLED
//   is false). See the README "The fee reality".

import {
  createClient,
  executePlan,
  track,
  isPartnerTerminal,
  SynfinApiError,
} from '@synfin/client';

const apiKey = process.env.SYNFIN_API_KEY;
const takerParty = process.env.SYNFIN_TAKER_PARTY;
if (!apiKey || apiKey.startsWith('sk_live_your_key')) {
  console.error('Set SYNFIN_API_KEY (see .env.example).');
  process.exit(1);
}

const synfin = createClient({ apiKey });

// 1) Quote, and pick the best executable venue.
const quote = await synfin.getQuote({ from: 'CC', to: 'USDCx', amount: '100' });
const best = quote.venues.find((v) => v.available);
if (!best) {
  console.error('No venue is available for this pair right now.');
  process.exit(1);
}
console.log(`Best executable venue: ${best.venueId} (net ${best.net})`);

if (!takerParty) {
  console.error(
    "\nSet SYNFIN_TAKER_PARTY (your user's Canton party) to build a plan.",
  );
  process.exit(1);
}

// 2) Plan. The server computes the memo floor (minReceive) and pins the quote.
//    createPlan is a read; it moves no funds.
let plan;
try {
  plan = await synfin.createPlan({
    from: 'CC',
    to: 'USDCx',
    amount: '100',
    venueId: best.venueId,
    takerParty,
    idempotencyKey: `quickstart-${takerParty}-${best.venueId}`,
  });
} catch (err) {
  if (err instanceof SynfinApiError) {
    console.error(`API error ${err.status} (${err.code}): ${err.message}`);
    process.exit(1);
  }
  throw err;
}
console.log(`\nPlan ${plan.planId}`);
console.log(`  minReceive (on-ledger floor): ${plan.quoteRef.minReceive}`);
console.log(`  collectsFees: ${plan.collectsFees}`); // false while the flag is off
console.log(`  steps: ${plan.steps.map((s) => s.kind).join(', ')}`);

// 3) Execute, from YOUR wallet. Implement this adapter against your Canton
//    wallet on the taker's party. Every method reads/acts on the taker's OWN
//    ledger view (never a third-party explorer snapshot).
const wallet = {
  // Create the CIP-56 transfer offer for the venue deposit; return its id.
  sendDeposit: async (_step) => {
    throw new Error(
      'Implement sendDeposit against your Canton wallet to execute a real swap.',
    );
  },
  // DEPRECATED and never called: plans no longer emit a fee-escrow-lock step.
  // Keep this stub for source compatibility. On-ledger fee collection, when it
  // is enabled, rides an atomic CIP-0112 batch with the deposit, a wallet
  // capability, not this method. The generic adapter does not perform that
  // batch, so fees are not SDK-executed here even after the flag flips.
  lockFeeEscrow: () => Promise.resolve(null),
  withdrawDeposit: (_id) => Promise.resolve({ withdrawn: true }),
  depositActive: (_id) => Promise.resolve(true),
  observePayout: (_args) => Promise.resolve({ received: '0' }),
};

const canExecute = process.env.SYNFIN_EXECUTE === '1';
if (!canExecute) {
  console.log(
    '\nStopping at the plan. Implement the WalletAdapter above and set ' +
      'SYNFIN_EXECUTE=1 to execute for real.',
  );
  process.exit(0);
}

const handle = await executePlan(plan, {
  wallet,
  hooks: { onStatus: (s) => console.log(`  ${s.status}: ${s.note}`) },
});

// 4) Track to a terminal state.
let state = await track(handle, { wallet });
while (!isPartnerTerminal(state.status)) {
  await new Promise((r) => setTimeout(r, 3000));
  state = await track(handle, { wallet });
}
console.log(`\nFinal: ${state.status}, payout ${state.payoutAmount ?? 'none'}`);
