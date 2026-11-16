// Register the ML-DSA-87 keys for both identities (idempotent).
// Every account on QoreChain needs this before it can transact at all.
const { ensurePqcRegistered } = require("@qorechain/sdk");
const { identities, txClientFor, endpoints } = require("./lib/chain.cjs");

(async () => {
  const ids = await identities();
  for (const role of ["OWNER", "AGENT"]) {
    const { tx } = await txClientFor(ids[role]);
    const r = await ensurePqcRegistered(tx, {
      pqcKeypair: ids[role].pqc,
      rest: endpoints.rest,
    });
    console.log(
      `${role.padEnd(6)} ${r.alreadyRegistered ? "already registered" : "registered"} ${r.txHash || ""}`
    );
  }
})().catch((e) => {
  console.error(e.shortMessage || e.message || e);
  process.exit(1);
});
