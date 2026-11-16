// The product's core action: open a narrow EVM window for the agent.
// Runs on the OWNER's side, which is the only side that holds the agent's
// ML-DSA-87 key. The agent host never sees this key, so a key stolen from the
// agent cannot widen its own authority.
const fs = require("node:fs");
const { openEvmWindowMsg } = require("@qorechain/sdk");
const { identities, txClientFor } = require("./lib/chain.cjs");
const { compile } = require("./lib/policy.cjs");

async function main() {
  const policy = JSON.parse(fs.readFileSync(process.argv[2] || "policy.json", "utf8"));
  const { ok, effective, errors } = compile(policy);
  if (!ok) {
    console.error("policy rejected before touching the chain:");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }

  const ids = await identities();
  const { tx } = await txClientFor(ids.AGENT); // hybrid: secp256k1 + ML-DSA-87

  const res = await tx.signAndBroadcast(
    [
      openEvmWindowMsg({
        sender: ids.AGENT.cosmos,
        blocks: effective.window.blocks,
        maxTxs: effective.window.maxTxs,
        maxValue: effective.window.maxValueUqor,
      }),
    ],
    "auto"
  );

  console.log("window opened");
  console.log("  blocks  ", effective.window.blocks);
  console.log("  maxTxs  ", effective.window.maxTxs);
  console.log("  maxValue", effective.window.maxValueQor, "QOR");
  console.log("  tx      ", res.transactionHash ?? JSON.stringify(res));
  fs.writeFileSync(".window.json", JSON.stringify({ ...effective, openedTx: res.transactionHash }, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
