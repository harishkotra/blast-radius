# Blast Radius

**Bounded authority for the keys we hand to agents.**

Every team that gives an AI agent a wallet key is making the same bet: that the key
will never leak. Blast Radius replaces that bet with a number. You declare a
policy; the chain enforces it; anyone can read what a stolen key would be worth,
and every attempt a stolen key makes is written to a public log.

The published page is the argument:

> **A stolen key is only worth what the policy admits.**

It holds a real, funded operator key — printed in full — and dares you to take it.
You will not get the money. You will get a receipt.

---

## The problem, stated in the project's own terms

QoreChain's design already says the right thing:

> "The window is opened by a Cosmos-lane message, so the classical secp256k1 key
> can never authorise spending on its own."

That is a strong primitive. It is also unfinished as a *product*: a primitive
that bounds spending is useless to an operator who cannot say what the bound is,
cannot see it while it is live, and cannot prove afterwards what a compromised
key tried to do. Blast Radius is the missing operator layer:

1. **Declare** a policy in one file — per-transaction cap, daily cap, allowlist,
   expiry, call budget.
2. **Enforce** it twice: in the chain's EVM authorisation window (post-quantum
   authorisation) and in a vault contract (business rules), so a single mistake
   does not become a single point of failure.
3. **Publish** the resulting blast radius, live, and every refusal.
4. **Revoke** it without downtime — authority decays on its own when the owner
   goes quiet, and one signature moves the policy to a key the thief has never
   seen.

The frame that matters: a delegated key is not a grant, it is a loan. It has an
amount, a term, and a keeper who must keep proving they are alive.

## What is actually enforced, and where

| Layer | Enforced by | A stolen classical key can… |
|---|---|---|
| Chain | `MsgOpenEVMWindow` + hybrid signature | not open a window, not widen one, not send at all while closed |
| Chain | registered ML-DSA-87 key + `possessionProven` | nothing — a key re-registered without proof loses authority |
| Contract | per-tx cap, daily cap, allowlist, expiry, call budget | only pay allowlisted targets, within caps, before expiry |
| Contract | asymmetric kill switch | freeze the vault (classical key), never unfreeze it (needs ML-DSA) |
| Contract | refusal log | nothing — but leaves a permanent public record of the attempt |
| Contract | delegation attenuation (`AgentBureau`) | nothing — a sub-agent it hires inherits the same ceiling, and revoking the agent kills the subtree |

### Two details most integrations get wrong

- **`registered` is not enough.** `pqcKeyStatus` returns a fourth value,
  `possessionProven`. The docs are explicit that proof of possession is optional
  at registration, so `registered == true` says nothing about whether the key
  holder ever proved they had the secret. Blast Radius requires
  `possessionProven` in both the policy write and every spend attempt.
- **A refusal must not revert.** A reverted transaction leaves no evidence. The
  vault's `request()` therefore *returns* a verdict and writes a `Refused` event
  with a stable reason code, so refusals are cheap (under 120k gas, asserted in
  tests) and permanently legible on the explorer.

## Architecture

```
operator (owner)                      agent host
  ├── ML-DSA-87 key  ─────────┐         └── classical secp256k1 key  ← the leakable one
  ├── classical key           │
  │                           │
  │  openEvmWindowMsg ────────┴──► QoreChain EVM window   (blocks, maxTxs, maxValue,
  │                                  │                     allowedTargets)
  │  setPolicy(policy, pqcSig) ──────┤
  │                                  ▼
  └──────────────────────────► BlastRadiusVault.sol
                                     ├── per-tx / daily caps
                                     ├── target allowlist
                                     ├── expiry + call budget
                                     ├── PQC Verify (0x…0a01) on policy writes
                                     ├── PQC Key Status (0x…0a02) on every spend
                                     └── Refused / Paid event log
```

The key insight is **where the post-quantum key lives**. It lives with the
operator, not with the agent. The agent gets only the classical key, so the thing
an attacker steals is structurally incapable of authorising anything. The owner
opens a narrow window for the length of a payment run, then closes it.

## Agents that hire agents: `AgentBureau`

One bounded key is a stopgap. The thing that arrives next is an agent that pays
another agent — a researcher hires a summariser, a treasury agent hires a
bookkeeper — and the honest question is not "does the child have a cap?" but
*"is the child's cap provably smaller than the one it was handed?"*

`contracts/src/AgentBureau.sol` answers that on chain. A grant is checked
against its parent at creation and at every spend:

```
per-tx cap  <= parent per-tx cap
budget      <= parent budget still unspent
expiry      <= parent expiry
targets     subset of parent targets
depth       <= 4
```

A spend walks the whole ancestor chain, so one child's payment is charged to
every level above it. A child cannot spend a budget twice, cannot outlive its
parent, and dies the instant any ancestor is revoked — one transaction, whole
subtree, `Revoked(node, descendants)`.

The view judges read first is the honest summary:

```solidity
blastRadius(node) -> (spendable now, per attempt, refusal code)
```

where `spendable` is the *minimum* remaining budget and call allowance across
every ancestor, not the child's own optimistic number.

## Try it

```bash
npm install
npm run accounts          # generates owner + agent identities into .env.local
npm run policy:check      # compile policy.json, validated against chain bounds
forge test --root contracts   # 35 tests: leaked-key paths, decay, rotation, delegation
npm start                 # live page on :8899
```

Armed deployment (needs a funded testnet account):

```bash
npm run deploy            # register PQC keys, open owner window, deploy vault
npm run arm               # fund the vault, sign the policy with ML-DSA-87, write it
npm run window:open       # open the agent's narrow window
npm run demo              # the full run: attacks, decay, rotation, payment, close
npm run beat              # owner liveness proof (any relayer can send it)
npm run rotate            # kill the leaked key, keep the agent alive
npm run test:fuzz         # 100,000 adversarial sequences against the bound
```

## Evidence

Everything is on `qorechain-diana` (EVM chain `9800`). The page at the repo root
renders live chain state, not fixtures: policy caps, remaining window, the
refusal log and the released payments all come from the explorer.

- Vault: see `.deploy.json` after `npm run deploy`
- Public log: `Refused` and `Paid` events on that address
- Policy signature: ML-DSA-87 over the policy digest, verified on chain by the
  `pqcVerify` precompile — the transaction reverts without it

## Authority that decays, and dies on demand

A cap answers "how much can this key lose". It does not answer "what if nobody
is watching". Three properties cover that, and each one is enforced in the
vault, not in a script.

**Silence kills.** `Policy.heartbeat` is a number of seconds. `spend` refuses
with `REFUSED_STALE_HEARTBEAT` once `now > lastBeat + heartbeat`. Keeping an
agent alive therefore requires the owner to keep producing ML-DSA-87 signatures;
the heartbeat transaction can be relayed by anyone, so the owner needs no funded
key and no uptime beyond the ability to sign. A stolen classical key cannot
produce one, and cannot extend the deadline.

**Kill without downtime.** `rotate(agent, newAgent)` moves the whole policy —
caps, expiry, call budget, allowlist, the day's spend already consumed, and the
freeze state — to a new key in one transaction. The old key is marked
`rotatedOut` and `spend` returns `REFUSED_ROTATED` from the next block. `npm run
rotate` hands the policy to `SPARE1`, an identity generated locally that the
thief has never seen. Rotation cannot launder a cap, because spend carries over.

**The bound is attacked, not asserted.** `contracts/test/BlastRadiusMev.t.sol`
gives a fuzzer the agent's private key and free choice of amount, target and
moment, then asserts the vault never pays more than the policy admits. Run at
25,000 sequences per property:

```
FOUNDRY_FUZZ_RUNS=25000 forge test --root contracts --match-path '*Mev*'
```

## Tests

`forge test --root contracts` — 35 tests, all with a leaked classical key or a
handed-down authority.

Vault (17)

- cannot reach a target that is not allowlisted
- cannot exceed the per-transaction cap
- cannot exceed the daily cap or the call budget
- cannot act after expiry
- cannot act when possession proof is withdrawn
- policy write rejects a wrong ML-DSA signature and an unproven owner key
- freeze works from the classical key; unfreeze fails without ML-DSA
- a recorded refusal costs under 120k gas
- authority dies when the owner's heartbeat lapses, and a fresh ML-DSA signature
  restores it without rewriting the policy
- rotation kills the leaked copy, hands the same policy to a key the thief has
  never seen, and carries the day's spend across so caps cannot be laundered

Bureau (14)

- a child cannot be granted a per-tx cap, budget, expiry or call budget larger
  than its parent's, or a target the parent does not allow
- a child's spend is charged to every ancestor, so the same budget cannot be
  spent twice
- the parent's call budget caps the sum of all its children's payments
- a grandchild is bounded by every ancestor, not just its parent
- cycles are refused: authority cannot flow back up the tree
- revoking a parent kills the whole subtree in one transaction, and a revoked
  child cannot grant anything

Adversarial (4)

- fuzzed attacker with the key, free choice of amount/target/timing: the vault
  never pays more than the policy admits (100,000 sequences at
  `FOUNDRY_FUZZ_RUNS=25000`, zero escapes)
- a policy-less key moves nothing, whatever the amount or target
- waiting does not widen authority — time only ever removes it
- the bound is tight: the policy's full allowance is reachable in one sequence,
  so the fuzz assertion is not vacuous

## Honest limits

- EVM authorisation windows and the `x/abstractaccount` module are enabled on
  testnet and disabled on mainnet. This runs on `qorechain-diana`; it is not a
  mainnet deployment.
- The vault enforces business rules on payments it holds. It is not a general
  signer proxy, so funds must move through it rather than through the agent
  wallet directly.
- `maxValue` in a window covers value *plus* the maximum fee of each admitted
  transaction, so a window must reserve a little headroom above the daily cap.
- The demo publishes a private key. It is a testnet key with a bounded balance,
  and publishing it is the point. Do not do this with real money.

## Why this is a post-quantum project, not a security project

A quantum attacker's win condition is not breaking the algorithm — QoreChain
already uses ML-DSA-87 — it is *recovering a classical key from a machine that
already used it*. Every post-quantum deployment still has that day-one problem:
the old key, on the old host, still works until rotation completes. Blast Radius
is what makes the interval between "key recovered" and "key rotated" survivable,
and it measures that interval in a currency a non-cryptographer understands:
QOR a thief could actually move.

## Credits

Built solo for the QoreChain Build Before Q-Day Hackathon, in the
*Post-Quantum AI Agents* category.

## License

Apache-2.0
