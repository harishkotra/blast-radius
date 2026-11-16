# Blast Radius — what I need from you, in order

Everything below is the short list of things only you can do: sign in, paste an
address, record a voice, press submit. The code side is done and tested; the
chain side is blocked on step 1.

Deadlines that matter (UTC):

- **17 Nov 23:59** — Q-Day Drill registration closes (project page → drill form)
- **18 Nov** — drill day: the organisers attack your registered account; you must
  send at least one normal transaction that day and submit its hash by
  **19 Nov 23:59**
- **2 Dec 23:59** — project submission (repo, README, image, video, testnet addresses)
- **6–15 Dec** — People's Choice voting
- **16 Dec** — winners

---

## Step 1 — funds (blocks everything else)

The faucet is behind a sign-in, so this is yours:

1. Open <https://dashboard.qorechain.io/faucet> and sign in.
2. Request for the **owner** address:

   ```
   0xFa0EA3A5F89841d1bbbF032B7113Cd35070eBc80
   ```

3. Wait for the claim to land, then request again for the **agent** address:

   ```
   0xd697053C7cc14ea217DC8c7305982f053F576e15
   ```

   100 QOR per address per 24h is enough: the vault needs ~15 QOR and gas is cheap.

Say "funded" and I run the whole armed pipeline in one go: register both ML-DSA
keys, open the owner window, deploy the vault, arm the policy, open the agent
window, and run the demo. You get tx hashes and a public page.

## Step 2 — GitHub

Already authenticated on this machine as `harishkotra`, so I create and push
`harishkotra/blast-radius` myself once the tests are green (they are: 25/25).
You only need to confirm the repo is **public** and the license reads
Apache-2.0 — both are set.

## Step 3 — the project page (yours, ~10 minutes)

<https://build.qorechain.io/> → register / sign in with GitHub, connect the X
account, connect the QoreX testnet wallet, then create the project.

Paste-ready fields:

- **Name:** Blast Radius
- **Category:** Post-Quantum AI Agents
- **One-liner:** A stolen key is worth only what the policy admits.
- **Repo:** https://github.com/harishkotra/blast-radius
- **Featured image:** `assets/featured.png` (1920×1080, in the repo)
- **Description:** see `PITCH.md` — first three paragraphs, verbatim
- **Testnet addresses:** owner `0xFa0EA3A5F89841d1bbbF032B7113Cd35070eBc80`,
  agent `0xd697053C7cc14ea217DC8c7305982f053F576e15`, plus the vault address after step 1

## Step 4 — register for the Q-Day Drill (before 17 Nov 23:59 UTC)

On the **same project page** there is a drill registration form. It asks for:

1. the testnet account the organisers will attack — use the **agent** account
   (it is the one whose classical key is meant to leak), ML-DSA-87 key **already
   registered** (step 1 does this);
2. that account's **ECDSA private key** — the organisers need it to play attacker.
   It is in `.env.local` as `AGENT_PRIVATE_KEY`. This is a drill account with a
   bounded balance; pasting it there is the intended mechanic, and it is not the
   same thing as committing it to the repo (never do that);
3. up to 5 contract addresses to watch — the deployed vault address, once step 1
   finishes.

If the form wants the addresses before the deploy, register with the agent
account only, then add the vault address after — the drill allows edits until
the deadline.

## Step 5 — the 3-minute video (yours, I write the script)

I will produce the shot-by-shot script and the terminal recording; you narrate.

The beat that wins it: hand the judges the agent's private key **on screen**, let
them try to drain the vault, show the refusal code and the explorer event, then
the same key pays a legitimate invoice. A refused attack is more convincing than
a successful payment.

---

## What is already done, so you can check my work

- `contracts/src/BlastRadiusVault.sol` — policy engine, PQC-verified policy
  writes, asymmetric freeze, refusal events
- `contracts/src/AgentBureau.sol` — delegation that can only attenuate: a child
  agent's authority is checked against every ancestor on every spend, and
  revoking a parent kills the subtree
- **25/25 forge tests pass**, including all the leaked-key paths and the
  delegation-attenuation paths
- `npm run policy:check` compiles `policy.json` against live chain limits
- `web/` — the judge-facing page: spendable now, per-tx cap, daily remaining,
  expiry countdown, refusal log, payment log
- `README.md`, `AI_USAGE.md`, `LICENSE` (Apache-2.0), `assets/featured.png`

## Honest limits I will not paper over

- EVM windows and `x/abstractaccount` are **enabled on testnet, disabled on
  mainnet**. The README says so.
- The drill requires handing the organisers a private key. That is the drill's
  design, not a hole in ours.
- The field is crowded: several entries also bound agent spending with a
  post-quantum second lock. The difference this repo argues is *attenuated
  delegation* — an agent that hires an agent cannot hand down more authority
  than it holds, and one revocation kills the tree — plus a refusal log as the
  product surface rather than an afterthought.
