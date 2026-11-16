// Owner liveness proof, shared by the CLI and the page.
// The ML-DSA-87 signature is the authority; the sender is irrelevant, so a
// relayer (or this server) can keep an agent alive without holding funds.
const fs = require("node:fs");
const {
  createWalletClient,
  createPublicClient,
  http: viemHttp,
  encodeAbiParameters,
  keccak256,
  hexToBytes,
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { pqcSign } = require("@qorechain/sdk");
const { identities, endpoints } = require("./chain.cjs");

const EVM_CHAIN_ID = Number(process.env.EVM_CHAIN_ID || 9800);

function load() {
  const deploy = JSON.parse(fs.readFileSync(".deploy.json", "utf8"));
  const abi = JSON.parse(
    fs.readFileSync("contracts/out/BlastRadiusVault.sol/BlastRadiusVault.json", "utf8")
  ).abi;
  return { deploy, abi };
}

async function beat({ agent } = {}) {
  const { deploy, abi } = load();
  const ids = await identities();
  const owner = ids.OWNER;
  const target = agent || deploy.agentEvm;

  const pub = createPublicClient({ transport: viemHttp(endpoints.evm) });
  const wallet = createWalletClient({
    account: privateKeyToAccount(owner.privateKey),
    transport: viemHttp(endpoints.evm),
  });

  const p = await pub.readContract({ address: deploy.vault, abi, functionName: "policyOf", args: [target] });
  const heartbeat = Number(p[5]);
  const lastBeat = p[6];
  if (!heartbeat) return { skipped: true, reason: "no heartbeat on this policy" };

  const digest = keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "string" },
        { type: "address" },
        { type: "uint64" },
        { type: "uint32" },
      ],
      [BigInt(EVM_CHAIN_ID), deploy.vault, "HEARTBEAT", target, BigInt(lastBeat), heartbeat]
    )
  );
  const sig = pqcSign(owner.pqc.secretKey, hexToBytes(digest));

  const hash = await wallet.writeContract({
    address: deploy.vault,
    abi,
    functionName: "beat",
    args: [target, sig, owner.pqc.publicKey],
  });
  await pub.waitForTransactionReceipt({ hash });

  const left = await pub.readContract({
    address: deploy.vault,
    abi,
    functionName: "authorityLeft",
    args: [target],
  });
  return { hash, authorityLeft: Number(left), heartbeat };
}

module.exports = { beat, load };
