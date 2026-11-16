# The 3-minute video

Rules: under 3 minutes, real product footage, no stock footage. This is a
shot-by-shot script. Terminal text is copy-paste; narration is yours.

The arc is deliberate: *here is the money → here is the policy → here is what a
thief gets → here is what the owner can do about it, without downtime.* The last
two beats are the ones no other entrant has.

## 0:00–0:16 — the claim (screen: the live page, hero number visible)

> "This page holds a real private key. It is printed in full, right there. Take
> it. The wallet holds testnet QOR. You will not get the money — you will get a
> refusal, and a receipt for it."

Do not explain how it works yet. Let the key on screen carry the first beat.

## 0:16–0:38 — the policy (screen: `policy.json`, then `npm run policy:check`)

```bash
npm run policy:check
```

> "One file. Two QOR per transaction, five a day, three calls, twenty-four hours,
> exactly one address — and a heartbeat: if I stop proving I'm alive, the
> authority goes to zero on its own."

## 0:38–1:02 — how it becomes chain state (screen: deploy output, then the window)

```bash
npm run deploy
npm run window:open
npm run arm
```

> "That compiles into two independent objects. An EVM authorisation window —
> blocks, transaction count, maximum value — opened by my ML-DSA-87 signature on
> the Cosmos lane. And a vault contract enforcing the business rules. The agent
> host never sees the quantum key, so a stolen classical key cannot widen its own
> window. It cannot even open one."

## 1:02–1:42 — the attack, using the key from the page (screen: terminal)

```bash
npm run demo
```

Narrate the refusals as they print:

> "Off-list target: refused. Four times the per-transaction cap: refused. The
> same key tries to unfreeze the vault it just froze: refused — freezing needs
> only the classical key, unfreezing needs the post-quantum one. Nothing moved.
> Every attempt is an event on the explorer. That log is the product."

Cut to the explorer, click one `Refused` event, hold on the reason code.

## 1:42–2:04 — the legitimate payment (screen: terminal, then the page)

> "Same key. Real invoice, allowlisted vendor, inside the caps. Paid. The agent
> keeps working — that is the point. The key is not the problem, unbounded
> authority is."

## 2:04–2:26 — authority that expires on its own (screen: terminal, live)

Rehearsed setup: set `heartbeatSeconds` to `60`, re-arm, start rolling.

```bash
cast call $V "authorityLeft(address)(uint256)" <agent>
# …let it run out on camera…
npm run demo        # the DECAY beat: refused, code 10
```

> "Nobody sends a kill transaction here. I go quiet, the clock runs out, and the
> key is worth zero — refused with code ten. Then one signature from me, relayed
> by anyone, brings it back. Authority is a loan with a term, not a grant."

## 2:26–2:44 — kill the leaked key without pausing the agent (screen: terminal)

```bash
npm run rotate
```

> "And if the key is already out there: one transaction moves the entire policy —
> caps, expiry, allowlist, and the budget already spent today — to a key the
> thief has never seen. The old one is refused with code eleven from the next
> block. No downtime, and no fresh budget to launder."

## 2:44–3:00 — close (screen: `forge test`, then the page)

```bash
forge test --root contracts
```

> "Thirty-five tests. One of them hands an attacker the key and lets it choose
> the amount, the target and the moment — a hundred thousand sequences, zero
> escapes. Another covers agents that hire agents, where a grant can only ever be
> smaller than its parent's. A stolen key is worth only what the policy admits.
> Blast Radius. QoreChain."

## Recording notes

- 1920×1080 or 2880×1800, one terminal at 15–16pt, no window chrome flicker.
- Record the page *before* the attack so the balance is visibly non-zero.
- Never cut away from a refusal before the reason code renders.
- For 2:04 the sixty-second lapse is the only waiting beat: film it last, then
  trim the wait into a six-second time-lapse with the countdown visible.
- Upload unlisted to YouTube, link it on the project page. Under 3:00 strict.
