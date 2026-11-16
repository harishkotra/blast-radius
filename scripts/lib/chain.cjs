// Shared chain wiring: client, unified accounts, hybrid tx client.
const {
  createClient,
  deriveUnifiedAccount,
  derivePqcCanonical,
  directSignerFromPrivateKey,
} = require("@qorechain/sdk");
const { loadEnv } = require("./env.cjs");

const env = loadEnv();

async function identities() {
  const out = {};
  for (const role of ["OWNER", "AGENT"]) {
    const mnemonic = env[`${role}_MNEMONIC`];
    const acct = await deriveUnifiedAccount(mnemonic);
    const pqc = derivePqcCanonical(acct.cosmos, mnemonic);
    out[role] = { role, mnemonic, cosmos: acct.cosmos, evm: acct.evm, privateKey: acct.privateKey, pqc };
  }
  return out;
}

async function txClientFor(id) {
  const client = createClient();
  const signer = await directSignerFromPrivateKey(id.privateKey, "qor");
  const tx = await client.connectTx(signer, { pqcKeypair: id.pqc });
  return { client, tx };
}

const endpoints = {
  rest: env.QORECHAIN_REST || "https://api-testnet.qore.host",
  rpc: env.QORECHAIN_RPC || "https://rpc-testnet.qore.host",
  evm: env.QORECHAIN_EVM_RPC || "https://evm-testnet.qore.host",
  chainId: env.CHAIN_ID || "qorechain-diana",
};

module.exports = { env, identities, txClientFor, endpoints };
