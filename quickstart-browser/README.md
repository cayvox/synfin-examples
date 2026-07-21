# quickstart-browser

> **Keep the PartyLayer chain current (a real footgun).** The wallet connect uses
> `@fivenorth/loop-sdk`, bundled into your app as a transitive dependency of
> `@partylayer/sdk` (via `@partylayer/adapter-loop`). Loop evolves its pairing
> protocol, so a **stale** bundled version fails to connect with an opaque
> wallet-side error ("the ticket may be invalid or expired") that names nothing
> real. The fix is version currency: this example uses `@partylayer/sdk >=0.15`
> (which brings adapter-loop 0.4 and loop-sdk 0.13) and `@partylayer/react >=2.1`
> (which itself requires sdk >=0.15). The older combination `sdk 0.14` / `react 2.0`
> bundles `loop-sdk 0.10`, whose handshake Loop's server now rejects, and mixing a
> new sdk with `react 2.0` produces a dual-SDK type error. If connect fails with a
> ticket/credential error, run `npm ls @fivenorth/loop-sdk` and raise it. Origin is
> NOT the issue: `http://localhost` connects fine with a current chain.

A minimal browser app that executes a **real Synfin swap through the published
SDK**, from your own PartyLayer wallet (Loop and others). It uses only the
published packages:

- [`@synfin/client`](https://www.npmjs.com/package/@synfin/client) for
  `getQuote` / `createPlan` / `executePlan` / `track`
- [`@synfin/wallet-partylayer`](https://www.npmjs.com/package/@synfin/wallet-partylayer)
  for the `WalletAdapter`
- `@partylayer/react` + `@partylayer/sdk` + `@partylayer/session` for the wallet
  connect

Your app holds no keys; the wallet signs.

## Run

```sh
npm install
cp .env.example .env.local          # add your key from portal.synfin.xyz
npm run dev                         # opens on http://localhost:5178
```

Then, in the page:

1. **Connect a wallet** (a PartyLayer wallet such as Loop).
2. **Quote + Plan** (dry: this moves no funds; review the plan and `minReceive`).
3. **Execute swap** (this moves REAL funds on mainnet; approve the wallet popup
   quickly, then watch the log for `INITIATED -> VENUE_ACCEPTED -> COMPLETED`).

## The flow, in code

`src/App.tsx` is the whole thing: connect to read the taker party, then
`getQuote` -> `createPlan` -> `createPartyLayerWalletAdapter(pl, { party })` ->
`executePlan(plan, { wallet })` -> `track` to a terminal state. Nothing
Canton-specific and no network identifiers to paste.

Execution moves real funds, so the plan is built first (dry) and Execute is a
separate, confirmed step. On-ledger bounds (`minReceive`, deadline) mean a bad
quote aborts and refunds rather than losing funds.
