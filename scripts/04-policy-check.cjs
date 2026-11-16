// Compile a policy and show what it means, in words and in QOR.
const fs = require("node:fs");
const { compile } = require("./lib/policy.cjs");

const policy = JSON.parse(fs.readFileSync(process.argv[2] || "policy.json", "utf8"));
const { ok, effective, errors } = compile(policy);

if (!ok) {
  console.error("\npolicy rejected — nothing would be sent to the chain:\n");
  for (const e of errors) console.error("  · " + e);
  console.error("");
  process.exit(1);
}

const w = effective.window;
const v = effective.vault;
const mins = Math.round((v.expiry - Math.floor(Date.now() / 1000)) / 60);

console.log(`
policy for ${policy.agent}
${"─".repeat(64)}
  worst case            ${effective.worstCaseQor} QOR  (daily cap)
  worst per attempt     ${effective.blastRadiusQor} QOR  (per-tx cap)
  call budget           ${v.maxCallsPerDay} transactions
  expires               ${new Date(v.expiry * 1000).toISOString()}  (${mins} min)
  allowlist             ${effective.allowedTargets.join(", ")}

chain lane (EVM window)
  blocks                ${w.blocks}          (max 17,280)
  max txs               ${w.maxTxs}
  max value             ${w.maxValueQor} QOR  (daily cap + ${w.maxValueUqor} uqor fee headroom)

what a stolen classical key can do
  · move at most ${effective.blastRadiusQor} QOR per transaction
  · move at most ${effective.worstCaseQor} QOR in total, ${v.maxCallsPerDay} times
  · only to the ${effective.allowedTargets.length} allowlisted address(es)
  · nothing at all once the window is closed or the policy expires
`);
