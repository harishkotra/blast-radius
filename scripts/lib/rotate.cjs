// Hand a policy to a new key without pausing it. Shared by the CLI and the
// judge-facing page, so the "kill this key" button runs exactly the same code
// path as the script — no special-case admin endpoint.
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

function load() {
  const deploy = JSON.parse(fs.readFileSync(".deploy.json", "utf8"));
  const artifact = JSON.parse(
    fs.readFileSync("contracts/out/BlastRadiusVault.sol/BlastRadiusVault.json", "utf8")
  );
  return { deploy, abi: artifact.abi };
}

/**
 * rotate(from -> to): the owner's classical key sends the tx, the owner's
 * ML-DSA key authorises the hand-over. The old key is dead from the next block
 * and its spend window travels with the policy, so rotation cannot launder caps.
 */
async function rotateAgent({ from, to }) {
  if (!from || !to) throw new Error("rotateAgent needs both `from` and `to`");
  const { deploy, abi } = load();
  const ids = await identities();
  const owner = ids.OWNER;

  const pub = createPublicClient({ transport: viemHttp(endpoints.evm) });
  const wallet = createWalletClient({
    account: privateKeyToAccount(owner.privateKey),
    transport: viemHttp(endpoints.evm),
  });

  const nonce = await pub.readContract({
    address: deploy.vault,
    abi,
    functionName: "policyNonce",
    args: [from],
  });

  const digest = keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "string" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      [BigInt(Number(process.env.EVM_CHAIN_ID || 9800)), deploy.vault, "ROTATE", from, to, BigInt(nonce)]
    )
  );

  const sig = pqcSign(owner.pqc.secretKey, hexToBytes(digest));
  const hash = await wallet.writeContract({
    address: deploy.vault,
    abi,
    functionName: "rotate",
    args: [from, to, sig, owner.pqc.publicKey],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });

  return { hash, block: Number(receipt.blockNumber), digest, newPubkey: owner.pqc.publicKey };
}

module.exports = { rotateAgent, load };
