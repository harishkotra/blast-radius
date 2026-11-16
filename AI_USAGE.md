# How AI was used

Disclosed in the spirit of the "Best AI-Native Use" category: what was generated,
what was verified, and what a human decided.

## Built with AI

- Contract, tests, scripts and the public page were written by an AI coding agent
  (Hermes / Claude-class model) working from a human-set direction: "win a
  QoreChain prize with something that solves a real problem and can be demonstrated
  on chain."
- The agent read `docs.qorechain.io` and the `@qorechain/sdk` type declarations
  directly, and built against the real `openEvmWindowMsg`, `fetchEvmWindow`,
  `ensurePqcRegistered` and precompile ABIs rather than an imagined API. Where the
  SDK's own docs disagreed with a first guess (`maxValue` covers value *plus* fee;
  `blocks` is a block count, not a duration; the PQC key query path), the docs won.

## Verified by machine, not asserted

- `forge test` — 11 tests, including every leaked-key path and the gas cost of a
  recorded refusal.
- `npm run policy:check` — the policy compiler validates against the chain's own
  bounds (`blocks` 1…17,280, `maxTxs` 1…1,000) before a transaction is built.
- Live chain reads at build time: chain id `qorechain-diana`, EVM `9800`,
  `abstractaccount` enabled, `pqc` required. Nothing on the page is fixture data.

## Human decisions

- The project direction, the funnel-shaped scope (ship one demonstrable thing, not
  three half-things), and the decision to publish a real private key on the page.
- Which bounty to enter and how effort maps to the judged criteria.

## Not AI

No AI model signs policy changes, guards funds, or takes a decision at runtime.
The contract's authority model is deterministic and inspectable on chain.
