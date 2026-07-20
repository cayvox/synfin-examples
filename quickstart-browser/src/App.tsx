import { useState } from 'react';
import {
  useAccount,
  useConnect,
  usePartyLayer,
  useWallets,
} from '@partylayer/react';
import {
  createClient,
  executePlan,
  track,
  isPartnerTerminal,
  SynfinApiError,
  type ExecutionPlan,
  type PartnerState,
} from '@synfin/client';
import { createPartyLayerWalletAdapter } from '@synfin/wallet-partylayer';

const API_KEY = import.meta.env.VITE_SYNFIN_API_KEY as string | undefined;
const FROM = 'CC';
const TO = 'USDCx';

export function App() {
  // The wallet session, exactly as the Synfin app reads it.
  const pl = usePartyLayer();
  const account = useAccount();
  const { connect } = useConnect();
  const walletsQuery = useWallets();
  const party = account.party;

  const [amount, setAmount] = useState('50');
  const [slippageBps, setSlippageBps] = useState('200');
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const append = (line: string): void => setLog((l) => [...l, line]);

  const synfin = API_KEY ? createClient({ apiKey: API_KEY }) : null;

  // Step 2: quote and build a plan. DRY, moves no funds.
  async function quoteAndPlan(): Promise<void> {
    if (!synfin || party === null) return;
    setBusy(true);
    setPlan(null);
    try {
      const quote = await synfin.getQuote({
        from: FROM,
        to: TO,
        amount,
        slippageBps: Number(slippageBps),
      });
      const best = quote.venues.find((v) => v.available);
      if (best === undefined) {
        append('No executable venue is available right now.');
        return;
      }
      append(
        `Quote: best ${best.venueId}, net ${best.net} ${TO}, clientFees ${JSON.stringify(best.clientFees)}`,
      );
      const built = await synfin.createPlan({
        from: FROM,
        to: TO,
        amount,
        venueId: best.venueId,
        takerParty: party,
        idempotencyKey: `canary-${party}-${amount}-${Date.now()}`,
        slippageBps: Number(slippageBps),
      });
      setPlan(built);
      append(
        `Plan ${built.planId}: minReceive ${built.quoteRef.minReceive} ${TO}, ` +
          `steps [${built.steps.map((s) => s.kind).join(', ')}], collectsFees ${built.collectsFees}`,
      );
      append('Dry step done. No funds moved. Review the plan, then Execute.');
    } catch (err) {
      append(
        err instanceof SynfinApiError
          ? `API error ${err.status} (${err.code}): ${err.message}`
          : `Error: ${String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  // Step 3: execute from the wallet. REAL funds move.
  async function execute(): Promise<void> {
    if (!synfin || party === null || plan === null) return;
    if (
      !window.confirm(
        `Execute a REAL swap of ${amount} ${FROM} from ${party}? This moves funds.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const wallet = createPartyLayerWalletAdapter(pl, { party });
      append('Executing. Approve the wallet popup to sign the deposit (quickly).');
      const handle = await executePlan(plan, {
        wallet,
        hooks: {
          onStatus: (s: PartnerState) =>
            append(
              `  ${s.status}: ${s.note}${s.payoutAmount ? ` (payout ${s.payoutAmount})` : ''}`,
            ),
        },
      });
      let state = await track(handle, { wallet });
      while (!isPartnerTerminal(state.status)) {
        await new Promise((r) => setTimeout(r, 3000));
        state = await track(handle, { wallet });
      }
      append(`FINAL: ${state.status}, payout ${state.payoutAmount ?? 'none'}`);
    } catch (err) {
      append(`Execute error: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const wrap = { margin: '20px 0' };
  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 680,
        margin: '40px auto',
        padding: '0 16px',
        lineHeight: 1.5,
      }}
    >
      <h1>Synfin swap (published SDK)</h1>
      <p style={{ color: '#666' }}>
        Executes a real swap through <code>@synfin/client</code> and the reference
        adapter <code>@synfin/wallet-partylayer</code>, from your own PartyLayer
        wallet. This app holds no keys.
      </p>

      {API_KEY === undefined && (
        <p style={{ color: '#b00' }}>
          Set <code>VITE_SYNFIN_API_KEY</code> in <code>.env.local</code> (your key
          from portal.synfin.xyz), then restart <code>npm run dev</code>.
        </p>
      )}

      <section style={wrap}>
        <h2>1. Connect a wallet</h2>
        {party !== null ? (
          <p>
            Connected: <code>{party}</code>
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {walletsQuery.wallets.length === 0 && (
              <span style={{ color: '#666' }}>No wallets detected.</span>
            )}
            {walletsQuery.wallets.map((w) => (
              <button
                key={String(w.walletId)}
                onClick={() => connect({ walletId: w.walletId })}
                disabled={busy}
              >
                Connect {w.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section style={wrap}>
        <h2>2. Quote and plan (dry, no funds move)</h2>
        <label>
          Amount ({FROM}):{' '}
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ width: 80 }}
          />
        </label>{' '}
        <label>
          Slippage (bps):{' '}
          <input
            value={slippageBps}
            onChange={(e) => setSlippageBps(e.target.value)}
            style={{ width: 80 }}
          />
        </label>{' '}
        <button
          onClick={quoteAndPlan}
          disabled={synfin === null || party === null || busy}
        >
          Quote + Plan
        </button>
      </section>

      <section style={wrap}>
        <h2>3. Execute (REAL funds)</h2>
        <button
          onClick={execute}
          disabled={plan === null || busy}
          style={{
            padding: '8px 14px',
            background: plan !== null ? '#c0392b' : undefined,
            color: plan !== null ? '#fff' : undefined,
          }}
        >
          Execute swap
        </button>
        {plan === null && (
          <p style={{ color: '#666' }}>Build a plan first (step 2).</p>
        )}
      </section>

      <section style={wrap}>
        <h2>Log</h2>
        <pre
          style={{
            background: '#111',
            color: '#eee',
            padding: 12,
            borderRadius: 8,
            whiteSpace: 'pre-wrap',
            minHeight: 80,
          }}
        >
          {log.join('\n') || '(waiting)'}
        </pre>
      </section>
    </main>
  );
}
