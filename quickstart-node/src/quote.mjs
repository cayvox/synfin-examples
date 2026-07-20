// First quote: a live best-execution quote across the Canton venues.
//
// Run (Node 20+):   node --env-file=.env src/quote.mjs
// Run (Node 18):    SYNFIN_API_KEY=sk_live_... node src/quote.mjs
//
// This talks only to the hosted Synfin API. No wallet, no keys on the ledger,
// no funds move. It is safe to run as often as your rate limit allows.

import { createClient, SynfinApiError } from '@synfin/client';

const apiKey = process.env.SYNFIN_API_KEY;
if (!apiKey || apiKey.startsWith('sk_live_your_key')) {
  console.error(
    'Set SYNFIN_API_KEY first. Copy .env.example to .env and add your key\n' +
      '(get one at https://portal.synfin.xyz), then run with:\n' +
      '  node --env-file=.env src/quote.mjs',
  );
  process.exit(1);
}

const synfin = createClient({ apiKey });

try {
  const quote = await synfin.getQuote({
    from: 'CC',
    to: 'USDCx',
    amount: '100',
    // Optional: disclose your integrator fee. These are DISCLOSED for you to
    // show your user; on-ledger collection is flag-gated off today (see README).
    ...(process.env.SYNFIN_FEE_BPS && process.env.SYNFIN_FEE_RECIPIENT
      ? {
          feeBps: Number(process.env.SYNFIN_FEE_BPS),
          feeRecipient: process.env.SYNFIN_FEE_RECIPIENT,
        }
      : {}),
  });

  console.log(
    `Quote for ${quote.amount} ${quote.pair.give} -> ${quote.pair.want}`,
  );
  console.log(`As of ${quote.asOf}\n`);

  // Venues are ranked best net receive first. Tradecraft is the executable
  // venue today; the others appear for comparison but are not yet plan-buildable.
  for (const v of quote.venues) {
    if (!v.available) {
      console.log(`  ${v.venueId.padEnd(12)} unavailable (${v.rejectionCode})`);
      continue;
    }
    const fee = v.clientFees
      ? `  fees: service ${v.clientFees.service.bps}bps` +
        (v.clientFees.integrator
          ? ` + integrator ${v.clientFees.integrator.bps}bps`
          : '') +
        `, user receives ${v.clientFees.userReceives}`
      : '';
    console.log(`  ${v.venueId.padEnd(12)} net ${v.net}${fee}`);
  }

  const best = quote.venues.find((v) => v.available);
  if (best) {
    console.log(`\nBest executable venue: ${best.venueId} (net ${best.net})`);
    console.log(
      'Next: connect a wallet and run src/swap.mjs to execute.',
    );
  } else {
    console.log('\nNo venue is currently available for this pair.');
  }
} catch (err) {
  if (err instanceof SynfinApiError) {
    // Every API error carries a stable machine `code` and often an `action`.
    console.error(`API error ${err.status} (${err.code}): ${err.message}`);
    process.exit(1);
  }
  throw err;
}
