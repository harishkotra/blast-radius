# Build Before Q-Day — new project form, paste-ready

Fill this in order. Fields marked **later** are not required at creation.

## Name

```
Blast Radius
```

## Tagline

```
A stolen key is worth only what the policy admits.
```

## Category

```
Post-Quantum AI Agents
```

## Description

```
Agent wallets get handed keys that can move everything. Blast Radius compiles a
plain policy file — per-transaction cap, daily cap, expiry, call budget, one
allowlist, a heartbeat term — into a chain-level EVM authorisation window opened
by an ML-DSA-87 signature, plus a vault contract that enforces the business
rules. The agent's classical key is published on the project page on purpose:
try to drain it and you get a refusal, with a receipt.
```

## How it's made

```
The agent host holds only a classical secp256k1 key; the owner keeps the
ML-DSA-87 half and signs from their own machine. One policy file is compiled by
scripts/lib/policy.cjs into two objects that must both hold.

1. A chain-level EVM authorisation window — blocks, max transaction count, max
value — opened on the Cosmos lane by the owner's hybrid signature through
@qorechain/sdk (openEvmWindowMsg). The agent cannot open, widen or reopen its
own window: it holds no quantum key, so the chain refuses. It also cannot
unfreeze a vault it just froze, because unfreezing requires the PQC half.

2. A Solidity vault enforcing per-transaction cap, daily cap, call budget,
expiry, target allowlist, freeze state, heartbeat and rotation. Before every
payment it calls the pqcKeyStatus precompile (0x…0a02) and requires the agent's
key to be registered with proof of possession — registered alone is not enough —
then verifies the owner's ML-DSA-87 signature on privileged actions with
pqcVerify (0x…0a01).

Refusals never revert: they emit a Refused event with a stable reason code, so
the log is queryable and the live page renders each attempt with its code.

Layer two, AgentBureau, is the delegation case: an agent hiring a sub-agent.
Every grant is attenuated — per-tx cap ≤ parent, budget ≤ parent unspent, expiry
≤ parent, targets ⊆ parent, depth ≤ 4 — checked at grant time and again at spend
time by walking the ancestor chain, and revoked in cascade, so revoking one node
kills everything beneath it.

Authority is treated as a loan, not a grant. A heartbeat field makes the vault
refuse once the owner has been silent longer than the term, and any relayer can
restore it with one ML-DSA-87 signature, so the owner needs no funded key. A
rotation moves the entire policy — caps, expiry, allowlist, the day's spend
already consumed, the freeze state — to a key the thief has never seen in a
single transaction.

What was hard: making the hybrid signature path work for a relayer-submitted
heartbeat; keeping rotation from laundering a daily cap; and proving the economic
bound rather than asserting it. The vault is attacked by a fuzz harness that is
handed the agent's private key and free choice of amount, target and timing:
100,000 sequences, zero escapes, and the bound proven tight.
```

## Cover image

Upload `assets/featured.png` from the repo — 1920×1080 PNG, 229 KB (16:9, over
the 1200×675 minimum, under 5 MB).

## Links and addresses

**Public GitHub repository** (Apache-2.0, public, verified):

```
https://github.com/harishkotra/blast-radius
```

**Video** — later, after recording. Script is `VIDEO.md`, under 3:00.
Upload unlisted to YouTube and paste the link.

**Testnet addresses** (qor1, `qorechain-diana`, one per line):

```
qor1lg828f0cnpqarwalqv4hzy7dx5rsa0yqm8pga0
qor166ts20ruc982y97u33estxp0q5l4wms4e9907z
```

Owner and agent. A third identity (`SPARE1`, the rotation target) exists locally
and is registered on chain when the demo needs it; leave it out of the form.

## Kits and SDKs used

Tick **only** what is actually imported (they check dependency files and mark
verified):

- QoreChain SDK → **TypeScript** — `@qorechain/sdk@0.14`: `generateMnemonic`,
  `deriveUnifiedAccount`, `derivePqcCanonical`, `pqcSign`, `openEvmWindowMsg`,
  `closeEvmWindowMsg`, `fetchEvmWindow`, `ensurePqcRegistered`.

Leave **unticked**: create-qorechain-dapp, qorechain-pqc, QoreSign, QoreSeal,
QoreX integrations, wallet adapter, RDK, MCP + qore CLI, Asset Kit, QoreScan,
Custody kit, Chain bridge, Handles, PQ light client. (`@qorechain/pqc`,
`@qorechain/qoresign` and `@qorechain/evm` sit in `package.json` but the code
calls the SDK surface; do not claim them.)

## Network features used

Tick:

- **Hybrid ML-DSA-87 transactions** — the window open/close messages are signed
  with the owner's hybrid signer (secp256k1 + ML-DSA-87).
- **PQC key registration with proof of possession** — `ensurePqcRegistered`, and
  the vault re-reads `possessionProven` before every spend.
- **EVM window (incl. scoped)** — 1–17280 blocks, 1–1000 txs, capped value; the
  agent's window is re-opened by the owner when it nears exhaustion.
- **Solidity PQC signature check** — `pqcVerify` at `0x…0a01` in the vault.
- **Solidity PQC key status** — `pqcKeyStatus` at `0x…0a02` in the vault and in
  `AgentBureau`.

Leave unticked: QoreSeal/encryption registry, smart accounts and spending rules,
staking tiers, AMM pools, test tokens, IBC/QORel, Cross-VM, RDK rollup,
sidechain/paychain, light node, MCP/qore CLI, approved native contracts, SIWC,
Asset Kit, QoreScan. The project writes its own vault and delegation contracts
rather than using the smart-account spending rules.

## Special awards

- **AI-Native** — yes. `AI_USAGE.md` is in the repo root and lists what the agent
  wrote, what was verified, and what a human decided.
- **Regional** — India.
- **Quantum Campus** — no (not a student team).

## Order of operations

1. Submit this form now with name, tagline, category, description, how-it's-made,
   cover, repo, and the two qor1 addresses. Nothing here needs funds.
2. Fund both addresses, then run `npm run register`, `npm run deploy`,
   `npm run window:open`, `npm run arm` — this is what turns the network-feature
   ticks from "used in code" into "found on chain".
3. Register the Q-Day drill before **2026-11-17 23:59 UTC**.
4. Record the video against the live page and paste the link.
5. Proof transaction before **2026-11-19 23:59 UTC**; submission closes
   **2026-12-02 23:59 UTC**.
