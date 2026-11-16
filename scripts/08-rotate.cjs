// Kill the leaked key without pausing the agent.
// The old key is refused with code 11 from the next block; the new key inherits
// the same policy, the same day's spend, and the same freeze state.
const fs = require("node:fs");
const { identities, endpoints } = require("./lib/chain.cjs");
const { rotateAgent, load } = require("./lib/rotate.cjs");
const { createPublicClient, http: viemHttp } = require("viem");

(async () => {
  const { deploy, abi } = load();
  const ids = await identities();
  const from = deploy.agentEvm;
  const to = ids.SPARE1.evm;
  const allow = JSON.parse(fs.readFileSync("policy.json", "utf8")).allowedTargets[0];
  const pub = createPublicClient({ transport: viemHttp(endpoints.evm) });

  const before = await pub.readContract({
    address: deploy.vault,
    abi,
    functionName: "canSpend",
    args: [from, allow, 1n],
  });
  console.log(`old key before rotation: spendable=${before[0]} code=${before[1]}`);

  const r = await rotateAgent({ from, to });
  console.log(`rotated ${from} -> ${to}`);
  console.log(`  tx    ${r.hash}`);
  console.log(`  block ${r.block}`);

  const after = await pub.readContract({
    address: deploy.vault,
    abi,
    functionName: "canSpend",
    args: [from, allow, 1n],
  });
  const fresh = await pub.readContract({
    address: deploy.vault,
    abi,
    functionName: "canSpend",
    args: [to, allow, 1n],
  });
  console.log(`old key after  rotation: spendable=${after[0]} code=${after[1]}  (11 = rotated out)`);
  console.log(`new key after  rotation: spendable=${fresh[0]} code=${fresh[1]}`);
})().catch((e) => {
  console.error(e.shortMessage || e.message || e);
  process.exit(1);
});
