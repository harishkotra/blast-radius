// Prove the owner is alive. Anyone can relay this transaction — the authority is
// the owner's ML-DSA-87 signature, not the sender. Skip it and the agent's
// authority decays to zero on its own, with no kill transaction from anyone.
const { beat } = require("./lib/beat.cjs");

(async () => {
  const r = await beat({});
  if (r.skipped) {
    console.log(r.reason);
    return;
  }
  console.log(`heartbeat accepted — ${r.hash}`);
  console.log(`authority now valid for another ${r.authorityLeft}s (heartbeat ${r.heartbeat}s)`);
})().catch((e) => {
  console.error(e.shortMessage || e.message || e);
  process.exit(1);
});
