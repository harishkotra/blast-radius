// Generates the two QoreChain testnet identities Blast Radius needs.
//   OWNER  = treasury, holds the ML-DSA-87 keys, signs policy + windows
//   AGENT  = low-trust key handed to the agent process (and to the Q-Day drill bot)
// Writes .env.local (gitignored). Prints public material only.
const { writeFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { generateMnemonic, deriveUnifiedAccount, derivePqcCanonical } = require("@qorechain/sdk");

async function main() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (existsSync(envPath)) {
    console.error(".env.local already exists — refusing to overwrite keys. Delete it to regenerate.");
    process.exit(1);
  }

  const out = [];
  for (const role of ["OWNER", "AGENT"]) {
    const mnemonic = generateMnemonic();
    const acct = await deriveUnifiedAccount(mnemonic);
    const evm = acct.evm ?? acct.evmAddress;
    const pqc = derivePqcCanonical(acct.cosmos, mnemonic);
    const pub = typeof pqc.publicKey === "string" ? pqc.publicKey : Buffer.from(pqc.publicKey).toString("hex");
    out.push({ role, mnemonic, cosmos: acct.cosmos, evm, pqcPublicKey: pub });
  }

  const env =
    out
      .map(
        (a) =>
          `${a.role}_MNEMONIC="${a.mnemonic}"\n${a.ROLE ?? a.role}_QOR=${a.cosmos}\n${a.role}_EVM=${a.evm}\n${a.role}_PQC_PUBKEY=${a.pqcPublicKey}`
      )
      .join("\n") +
    "\nQORECHAIN_REST=https://api-testnet.qore.host\nQORECHAIN_RPC=https://rpc-testnet.qore.host\nQORECHAIN_EVM_RPC=https://evm-testnet.qore.host\nCHAIN_ID=qorechain-diana\nEVM_CHAIN_ID=9800\n";

  writeFileSync(envPath, env, { mode: 0o600 });

  for (const a of out) {
    console.log(`\n== ${a.role}`);
    console.log(`   qor1 : ${a.cosmos}`);
    console.log(`   0x   : ${a.evm}`);
    console.log(`   ML-DSA-87 pubkey (${a.pqcPublicKey.length / 2} bytes): ${a.pqcPublicKey.slice(0, 24)}…`);
  }
  console.log("\nWrote .env.local (mode 0600). Mnemonics stay on this machine.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
