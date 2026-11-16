// Arm the vault: fund it, then write a policy that needs the owner's classical
// key AND a live ML-DSA-87 signature over the digest.
const fs = require("node:fs");
const { createWalletClient, createPublicClient, http: viemHttp, encodeAbiParameters, keccak256, hexToBytes } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { pqcSign, fetchEvmWindow, openEvmWindowMsg } = require("@qorechain/sdk");
const { identities, txClientFor, endpoints } = require("./lib/chain.cjs");
const { compile, toUqor } = require("./lib/policy.cjs");

const EVM_CHAIN_ID = 9800;

async function ensureOwnerWindow(owner) {
  const w = await fetchEvmWindow({ rest: endpoints.rest, address: owner.cosmos });
  const usable = w.live && w.remainingTxs >= 4n && w.remainingValue >= 30_000_000n;
  if (usable) return false;
  const { tx } = await txClientFor(owner);
  const res = await tx.signAndBroadcast(
    [openEvmWindowMsg({ sender: owner.cosmos, blocks: 1024, maxTxs: 12, maxValue: "60000000" })],
    "auto"
  );
  console.log("  owner window refreshed:", res.transactionHash ?? "ok");
  return true;
}

async function main() {
  const deploy = JSON.parse(fs.readFileSync(".deploy.json", "utf8"));
  const policy = JSON.parse(fs.readFileSync(process.argv[2] || "policy.json", "utf8"));
  const { ok, effective, errors } = compile(policy);
  if (!ok) {
    console.error("policy rejected:");
    errors.forEach((e) => console.error("  - " + e));
    process.exit(1);
  }

  const ids = await identities();
  const owner = ids.OWNER;
  const account = privateKeyToAccount(owner.privateKey);
  const pub = createPublicClient({ transport: viemHttp(endpoints.evm) });
  const wallet = createWalletClient({ account, transport: viemHttp(endpoints.evm) });
  const artifact = JSON.parse(
    fs.readFileSync("contracts/out/BlastRadiusVault.sol/BlastRadiusVault.json", "utf8")
  );
  const vault = deploy.vault;

  await ensureOwnerWindow(owner);

  // 1. fund the vault (EVM value transfer, consumes one window tx)
  const fundWei = BigInt(effective.vault.dailyCapWei) * 2n;
  const fh = await wallet.sendTransaction({ to: vault, value: fundWei });
  await pub.waitForTransactionReceipt({ hash: fh });
  console.log(`funded ${Number(fundWei) / 1e18} QOR-equivalent into the vault`);

  // 2. sign the policy with the post-quantum key
  const nonce = await pub.readContract({
    address: vault,
    abi: artifact.abi,
    functionName: "policyNonce",
    args: [deploy.agentEvm],
  });
  const digest = keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint256" },
        { type: "uint96" }, { type: "uint96" }, { type: "uint64" }, { type: "uint8" },
        { type: "bool" }, { type: "address[]" },
      ],
      [
        BigInt(EVM_CHAIN_ID),
        vault,
        deploy.agentEvm,
        BigInt(nonce),
        BigInt(effective.vault.perTxCapWei),
        BigInt(effective.vault.dailyCapWei),
        BigInt(effective.vault.expiry),
        effective.vault.maxCallsPerDay,
        true,
        effective.allowedTargets,
      ]
    )
  );
  const sig = pqcSign(owner.pqc.secretKey, hexToBytes(digest));
  console.log(`ML-DSA-87 signature over policy ${digest.slice(0, 18)}… (${sig.length} bytes)`);

  // 3. write it on chain: classical key (msg.sender) + post-quantum signature
  const ph = await wallet.writeContract({
    address: vault,
    abi: artifact.abi,
    functionName: "setPolicy",
    args: [
      deploy.agentEvm,
      {
        perTxCap: BigInt(effective.vault.perTxCapWei),
        dailyCap: BigInt(effective.vault.dailyCapWei),
        expiry: BigInt(effective.vault.expiry),
        maxCallsPerDay: effective.vault.maxCallsPerDay,
        active: true,
      },
      effective.allowedTargets,
      sig,
      owner.pqc.publicKey,
    ],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: ph });
  console.log("policy armed in block", Number(receipt.blockNumber), "tx", ph);

  const [rad] = await pub.readContract({
    address: vault,
    abi: artifact.abi,
    functionName: "blastRadius",
    args: [deploy.agentEvm],
  });
  console.log(`blast radius now: ${Number(rad[0]) / 1e18} QOR per attempt`);
}

main().catch((e) => {
  console.error(e.shortMessage || e.message || e);
  process.exit(1);
});
