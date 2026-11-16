// Deploy the vault and arm it: register PQC keys, open the owner's own EVM
// window (EVM lane is closed without one), deploy, write .deploy.json.
const fs = require("node:fs");
const path = require("node:path");
const { createWalletClient, createPublicClient, http: viemHttp } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { ensurePqcRegistered, openEvmWindowMsg } = require("@qorechain/sdk");
const { identities, txClientFor, endpoints } = require("./lib/chain.cjs");

async function main() {
  const ids = await identities();
  const out = {};

  for (const role of ["OWNER", "AGENT"]) {
    const { tx } = await txClientFor(ids[role]);
    const r = await ensurePqcRegistered(tx, {
      pqcKeypair: ids[role].pqc,
      rest: endpoints.rest,
    });
    console.log(`${role}: pqc ${r.alreadyRegistered ? "already registered" : "registered " + r.txHash}`);
    out[`${role.toLowerCase()}PqcTx`] = r.txHash || null;
  }

  // The vault is deployed from the owner's own EVM lane, so the owner needs a
  // window too — narrow, one transaction, expiring in a few hundred blocks.
  const { tx } = await txClientFor(ids.OWNER);
  const res = await tx.signAndBroadcast(
    [
      openEvmWindowMsg({
        sender: ids.OWNER.cosmos,
        blocks: 512,
        maxTxs: 8,
        maxValue: "50000000",
      }),
    ],
    "auto"
  );
  console.log("owner window opened:", res.transactionHash ?? JSON.stringify(res));
  out.ownerWindowTx = res.transactionHash;

  const artifact = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../contracts/out/BlastRadiusVault.sol/BlastRadiusVault.json"),
      "utf8"
    )
  );

  const account = privateKeyToAccount(ids.OWNER.privateKey);
  const pub = createPublicClient({ transport: viemHttp(endpoints.evm) });
  const wallet = createWalletClient({ account, transport: viemHttp(endpoints.evm) });

  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log("vault deployed:", receipt.contractAddress);

  const deploy = {
    vault: receipt.contractAddress,
    fromBlock: Number(receipt.blockNumber),
    agentQor: ids.AGENT.cosmos,
    agentEvm: ids.AGENT.evm,
    ownerQor: ids.OWNER.cosmos,
    ownerEvm: ids.OWNER.evm,
    deployedAt: new Date().toISOString(),
    ...out,
  };
  fs.writeFileSync(path.join(process.cwd(), ".deploy.json"), JSON.stringify(deploy, null, 2));
  console.log("wrote .deploy.json");
}

main().catch((e) => {
  console.error(e.shortMessage || e.message || e);
  process.exit(1);
});
