// Live chain probe: identity wiring, balances, PQC key status, EVM window.
// Everything the public page needs, in one call.
const { identities, endpoints } = require("./lib/chain.cjs");
const { fetchEvmWindow } = require("@qorechain/sdk");
const { privateKeyToAccount } = require("viem/accounts");

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) return { error: `HTTP ${r.status}` };
  return r.json();
}

async function main() {
  const ids = await identities();

  for (const role of ["OWNER", "AGENT"]) {
    const id = ids[role];
    const fromKey = privateKeyToAccount(id.privateKey).address;
    const bal = await get(`${endpoints.rest}/cosmos/bank/v1beta1/balances/${id.cosmos}`);
    const status = await get(`${endpoints.rest}/qorechain/pqc/v1/account/${id.cosmos}`);
    let window = null;
    try {
      window = await fetchEvmWindow({ rest: endpoints.rest, address: id.cosmos });
    } catch (e) {
      window = { error: String(e.message || e) };
    }

    console.log(`\n=== ${role}`);
    console.log(`  qor1            ${id.cosmos}`);
    console.log(`  evm             ${id.evm}`);
    console.log(`  key->evm match  ${fromKey.toLowerCase() === String(id.evm).toLowerCase() ? "YES" : `NO (${fromKey})`}`);
    console.log(`  balances        ${JSON.stringify(bal.balances ?? bal)}`);
    console.log(`  pqc registered  ${JSON.stringify(status.key ? { algorithm: status.key.algorithm_id ?? status.key.algorithmId, proven: status.key.proof_of_possession ?? status.key.possession_proven } : status)}`);
    console.log(`  evm window      ${window.error ? window.error : JSON.stringify(window, (k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
