# The 3-minute video

Rules: under 3 minutes, real product footage, no stock footage. This is a
shot-by-shot script. Terminal text is copy-paste; narration is yours.

## 0:00–0:18 — the claim (screen: the live page, hero number visible)

> "This page holds a real private key. It is printed in full, right there. Take
> it. The wallet holds testnet QOR. You will not get the money — you will get a
> refusal, and a receipt for it."

Do not explain how it works yet. Let the key on screen carry the first beat.

## 0:18–0:45 — the policy (screen: `policy.json`, then `npm run policy:check`)

```bash
npm run policy:check
```

> "One file. Two QOR per transaction, five a day, three calls, twenty-four hours,
> exactly one address. The compiler checks it against the chain's own limits
> before anything is broadcast, so a mistake costs a message, not a failed
> transaction."

## 0:45–1:15 — how it becomes chain state (screen: deploy output, then the window)

```bash
npm run deploy
npm run window:open
npm run arm
```

> "That policy compiles into two independent objects. An EVM authorisation
> window — blocks, transaction count, maximum value, allowed targets — opened by
> the owner's ML-DSA-87 signature on the Cosmos lane. And a vault contract that
> enforces the business rules. The agent host never sees the quantum key, so a
> stolen classical key cannot widen its own window. It cannot even open one."

## 1:15–2:05 — the attack, using the key from the page (screen: terminal)

```bash
npm run demo
```

Four attempts, each one narrated as it appears:

> "Off-list target: refused. Double the per-transaction cap: refused. One more
> call after the budget is spent: refused. The same key tries to unfreeze the
> vault it just froze: refused, because freezing only needs the classical key,
> unfreezing needs the post-quantum one. Nothing moved. Every attempt is an event
> on the explorer — that log is the product."

Then cut to the explorer, click one `Refused` event, show the reason code.

## 2:05–2:35 — the legitimate payment (screen: terminal, back to the page)

> "Same key. Real invoice, allowlisted vendor, inside the caps. Paid. The agent
> keeps working; that is the entire point — the key is not the problem, unbounded
> authority is."

## 2:35–2:55 — the part nobody else has (screen: `AgentBureau.sol` + `forge test`)

```bash
forge test --root contracts
```

> "Now the case that arrives next: an agent that hires an agent. A grant can only
> be smaller than what the parent holds — cap, budget, expiry, target set. A
> child's payment is charged to every ancestor, so the same budget can't be spent
> twice. Revoke the parent and the whole tree dies in one transaction. Twenty-five
> tests, all of them about keys that leaked or authority that shouldn't have been
> possible."

## 2:55–3:00 — close (screen: the page)

> "A stolen key is worth only what the policy admits. Blast Radius. QoreChain."

## Recording notes

- 1920×1080 or 2880×1800, one terminal at 15–16pt, no window chrome flicker.
- Record the page *before* the attack so the balance is visibly non-zero.
- Never cut away from a refusal before the reason code renders.
- Upload unlisted to YouTube, link it on the project page. Under 3:00 strict.
