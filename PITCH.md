# Paste-ready submission copy

## Name

Blast Radius

## Tagline (one line)

A stolen key is worth only what the policy admits.

## Short description (~50 words, for card/grid)

Post-quantum authority for agent wallets. Declare a policy once — per-tx cap,
allowlist, expiry, call budget — and it compiles into a chain-level EVM
authorisation window plus a vault contract. Hand out the agent's classic key.
Publish it. It cannot leave the policy, and every attempt it makes is logged.

## Long description (project page body)

Every team that hands an AI agent a wallet key is making the same bet: that the
key never leaks. Blast Radius replaces the bet with a number. A policy file
compiles into two independent enforcements on QoreChain — an EVM authorisation
window opened by the owner's ML-DSA-87 hybrid signature (`blocks`, `maxTxs`,
`maxValue`, `allowedTargets`), and a vault contract that enforces the business
rules (per-tx cap, daily cap, target allowlist, expiry, call budget). The quantum
key stays with the operator; the agent gets only the classical one. A stolen
classical key can therefore freeze the vault but never unfreeze it, cannot open
or widen a window, and cannot pay a target that is not on the list.

Then the part that follows: an agent that hires another agent.
`AgentBureau.sol` lets an authority delegate, but a grant is checked against its
parent at creation and on every spend — per-tx cap, budget, expiry, call budget
and target set must all be a subset of what the parent holds. A payment is
charged to every ancestor, so the same budget cannot be spent twice, and one
revocation kills the whole subtree. `blastRadius(node)` reports the minimum
remaining authority across every ancestor, which is the honest number.

Refusals do not revert. They return a stable reason code and emit an event, so
the refusal log is the product surface: anyone can read what a compromised key
tried, in what order, and see exactly how much it got — nothing.

## What is live

- Vault address: `<filled after deploy>`
- Agent address (and its published private key, on purpose): `<filled>`
- 25 forge tests, covering every leaked-key path and the delegation-attenuation
  path
- Policy compiler validated against live chain limits before broadcast

## Stack

Solidity 0.8.24 + Foundry, `@qorechain/sdk` (hybrid signing, `openEvmWindowMsg`,
`ensurePqcRegistered`), viem, Node 22, `pqcVerify` / `pqcKeyStatus` precompiles,
QoreChain testnet `qorechain-diana` (EVM chain 9800).

## Honest limits (put these on the page; judges reward it)

- EVM windows and `x/abstractaccount` are enabled on testnet, disabled on
  mainnet. This is a `qorechain-diana` deployment.
- The demo publishes a testnet private key deliberately. Never do that with real
  funds.
- `maxValue` covers value plus maximum fee per admitted transaction, so a window
  reserves headroom above the daily cap.

## Tweet (if asked for one)

handed an AI agent a wallet key. then published the key.

it still can't drain the vault — the policy is a chain-level window plus a
contract, signed post-quantum by the owner, and the agent's authority only ever
attenuates.

every refusal is a public event. @qorechain
