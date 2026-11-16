// Adds a SPARE agent identity — the key a rotation hands the policy to.
// Kept separate from AGENT on purpose: AGENT is the one whose key gets leaked,
// SPARE is the one the thief has never seen.
const { appendFileSync, existsSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { generateMnemonic, deriveUnifiedAccount, derivePqcCanonical } = require("@qorechain/sdk");

async function main() {
  const envPath = path.join(process.cwd(), ".env.local");
  const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  if (/^SPARE1_EVM=/m.test(env)) {
    console.log("SPARE1 already present — nothing to do");
    return;
  }

  const mnemonic = generateMnemonic();
  const acct = await deriveUnifiedAccount(mnemonic);
  const evm = acct.evm ?? acct.evmAddress;
  const pqc = derivePqcCanonical(acct.cosmos, mnemonic);
  const pub = typeof pqc.publicKey === "string" ? pqc.publicKey : Buffer.from(pqc.publicKey).toString("hex");

  appendFileSync(
    envPath,
    `\nSPARE1_MNEMONIC="${mnemonic}"\nSPARE1_QOR=${acct.cosmos}\nSPARE1_EVM=${evm}\nSPARE1_PQC_PUBKEY=${pub}\n`,
    { mode: 0o600 }
  );

  console.log("== SPARE1 (the key the thief never sees)");
  console.log("   qor1 :", acct.cosmos);
  console.log("   0x   :", evm);
  console.log(`   ML-DSA-87 pubkey (${pub.length / 2} bytes): ${pub.slice(0, 24)}…`);
}

main().catch((e) => {
  console.error(e.shortMessage || e.message || e);
  process.exit(1);
});
