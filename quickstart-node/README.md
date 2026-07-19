# Synfin quickstart (Node)

A minimal, runnable Synfin integration. Clone it, add a key, and get a live
best-execution quote across the Canton venues in a couple of minutes; then, with
your own Canton wallet, execute a swap.

This talks only to the hosted Synfin API and (for execution) your wallet. Synfin
holds no keys and moves no funds.

## Run it

You need Node 18 or newer.

```sh
# 1. Install the client
npm install

# 2. Add your key (get a free one at https://portal.synfin.xyz)
cp .env.example .env
#    then edit .env and set SYNFIN_API_KEY=sk_live_...

# 3. First quote (safe: read-only, no funds move)
node --env-file=.env src/quote.mjs
```

On Node 18 (no `--env-file`), pass the variable inline instead:

```sh
SYNFIN_API_KEY=sk_live_... node src/quote.mjs
```

You should see each venue's net receive, ranked best first.

## The one package you need

```sh
npm install @synfin/client
```

That is the whole SDK. The older `@synfin/spec`, `@synfin/adapters`,
`@synfin/router-ref`, `@synfin/conformance`, and `@synfin/cli` packages are
**deprecated**, do not install them. `@synfin/client` talks to the hosted API;
`@synfin/widget` is the optional drop-in UI.

## First swap

```sh
node --env-file=.env src/swap.mjs
```

`src/swap.mjs` quotes, then builds a plan (both are read-only, no funds move).
To actually execute, you implement the `WalletAdapter` in that file against your
own Canton wallet on the taker's party, then set `SYNFIN_EXECUTE=1`. **Execution
moves real funds on mainnet.**

- **Tradecraft is the executable venue today.** Other venues appear in the quote
  for comparison but are not yet plan-buildable.
- The plan's `minReceive` is the on-ledger floor. It is computed server-side and
  enforced on-ledger: a bad quote aborts and your funds never leave the wallet.

## The fee reality (read this)

- **Fees are DISCLOSED, not COLLECTED on-ledger today.** The server flag
  `FEE_COLLECTION_ENABLED` is `false`, so every swap is fee-less right now. Your
  quote's `clientFees` and your plan's `collectsFees: false` tell you this
  directly, the plan carries no fee step while the flag is off.
- **When the flag flips, the partner fee is planned and disclosed but not
  executed by this SDK yet.** The fee rides an atomic CIP-0112 batch with the
  deposit, a wallet-side capability. The generic `WalletAdapter` in this
  example does not perform that batch, so the fee legs are not SDK-executed even
  after the flip, until `@synfin/client`'s adapter gains batch capability. This
  is the exact current limitation, not a promise.
- **The atomic fee path depends on the wallet's Canton participant carrying the
  `splice-util-token-standard-wallet` package.** Loop's participant currently
  does not, so a Loop-signed swap **degrades to fee-less**, the deposit stands,
  no fee is collected, and the outcome says so honestly. Never a broken swap for
  a fee, never a silent charge.

## Where to go next

- Quickstart guide: https://synfin.xyz/docs/quickstart
- API reference (generated from the OpenAPI contract): https://synfin.xyz/docs/api
- Wallet and venue support matrix: https://synfin.xyz/docs/support-matrix
- How fees work: https://synfin.xyz/docs/fees
