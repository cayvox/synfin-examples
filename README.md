# Synfin examples

Runnable examples for [Synfin](https://synfin.xyz), the open best-execution and
liquidity-routing layer for the Canton Network. Clone this repo, add a free API
key, and run against the live hosted API.

- **[quickstart-node](./quickstart-node)** — the 30-minute path: a live quote in
  minutes, then a swap from your own Canton wallet. This is the example the
  [quickstart guide](https://synfin.xyz/docs/quickstart) walks through.

## Get a key

Create a free key at [portal.synfin.xyz](https://portal.synfin.xyz). Signup is
open and self-serve.

## Proprietary artifacts

Receiving a registry token such as USDCx on your own validator requires vetting the
registrar's Daml packages on your participant (for USDCx, Digital Asset's Canton
Network Utility DARs). Those DARs are proprietary and are node artifacts: obtain them
from their publisher under their terms, upload them to your participant, and never
commit them. This repository enforces that with `.gitignore` and a CI check
(`scripts/check-proprietary-artifacts.mjs`, run locally with
`node scripts/check-proprietary-artifacts.mjs`) that fails on any copy in the tree or
in a pull request's history, including a renamed one.

## License

MIT. Copyright Cayvox Labs. See [LICENSE](./LICENSE).
