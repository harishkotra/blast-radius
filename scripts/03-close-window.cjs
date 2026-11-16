// Shut the door: close the agent's EVM window. One message, immediate effect.
const { closeEvmWindowMsg } = require("@qorechain/sdk");
const { identities, txClientFor } = require("./lib/chain.cjs");

(async () => {
  const ids = await identities();
  const { tx } = await txClientFor(ids.AGENT);
  const res = await tx.signAndBroadcast([closeEvmWindowMsg(ids.AGENT.cosmos)], "auto");
  console.log("window closed:", res.transactionHash ?? JSON.stringify(res));
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
