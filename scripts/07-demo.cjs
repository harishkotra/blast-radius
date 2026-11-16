// The demo run: four things an attacker does with a stolen key, and one thing
// the owner does to close the door. Prints a transcript that reads as the video.
const fs = require("node:fs");
const {
  createWalletClient, createPublicClient, http: viemHttp, keccak256, toHex, parseEther, formatEther
} = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const {
  createClient, directSignerFromPrivateKey, openEvmWindowMsg, fetchEvmWindow,
} = require("@qorechain/sdk");
const { identities, endpoints } = require("./lib/chain.cjs");
const { ABI, REFUSAL_CODES } = require("../web/abi.cjs");

const VENDOR = "0x1111111111111111111111111111111111111111";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const line = (s = "") => console.log(s);
const head = (s) => { line(); line("─".repeat(64)); line(s); line("─".repeat(64)); };

async function main() {
  const deploy = JSON.parse(fs.readFileSync(".deploy.json", "utf8"));
  const ids = await identities();

  // The attacker has exactly one thing: the agent's classical private key.
  const attacker = privateKeyToAccount(ids.AGENT.privateKey);
  const pub = createPublicClient({ transport: viemHttp(endpoints.evm) });
  const wallet = createWalletClient({ account: attacker, transport: viemHttp(endpoints.evm) });

  head("BLAST RADIUS  ·  attacker holds the agent private key, and nothing else");
  const [rad] = await pub.readContract({
    address: deploy.vault, abi: ABI, functionName: "blastRadius", args: [attacker.address],
  });
  line(`  spendable right now : ${formatEther(rad[0])} QOR`);
  line(`  per-attempt cap     : ${formatEther(rad[1])} QOR`);
  line(`  daily budget left   : ${formatEther(rad[2])} QOR`);
  line(`  policy expires in   : ${Math.round((Number(rad[3]) - Date.now() / 1000) / 60)} min`);

  // ── attempt 1: drain to an address of the attacker's choosing
  head("ATTACK 1  ·  send the money to my own address");
  const before = await pub.getBalance({ address: DEAD });
  const h1 = await wallet.writeContract({
    address: deploy.vault, abi: ABI, functionName: "request",
    args: [DEAD, parseEther("1"), keccak256(toHex("drain-1"))],
  });
  const r1 = await pub.waitForTransactionReceipt({ hash: h1 });
  const refused1 = r1.logs.find((l) => l.topics[0]);
  line(`  tx ${h1}`);
  line(`  status: ${r1.status}  (the chain accepted the transaction — the policy refused the money)`);
  line(`  attacker balance delta: ${formatEther((await pub.getBalance({ address: DEAD })) - before)} QOR`);

  // ── attempt 2: pay the real vendor but take more than the cap
  head("ATTACK 2  ·  pay the allowlisted vendor, but 4× the per-tx cap");
  const h2 = await wallet.writeContract({
    address: deploy.vault, abi: ABI, functionName: "request",
    args: [VENDOR, parseEther("4"), keccak256(toHex("greedy"))],
  });
  const r2 = await pub.waitForTransactionReceipt({ hash: h2 });
  line(`  tx ${h2}`);
  line(`  status: ${r2.status}  ·  paid out: ${formatEther(await pub.getBalance({ address: VENDOR }))} QOR`);

  // ── attempt 3: the real horror scenario — widen my own authority
  head("ATTACK 3  ·  open myself a bigger window (classical key only)");
  try {
    const client = createClient();
    const signer = await directSignerFromPrivateKey(ids.AGENT.privateKey, "qor");
    const tx = await client.connectTx(signer, {}); // no pqcKeypair: attacker has no ML-DSA key
    const res = await tx.signAndBroadcast(
      [openEvmWindowMsg({ sender: ids.AGENT.cosmos, blocks: 17280, maxTxs: 1000, maxValue: "999000000000" })],
      "auto"
    );
    line("  ✗ UNEXPECTED: the chain accepted a classical-only window");
    line("  " + JSON.stringify(res));
  } catch (e) {
    const msg = e.shortMessage || e.message || String(e);
    line(`  refused: ${msg.split("\n")[0]}`);
    line("  → a key without the ML-DSA half cannot authorise spending at all");
  }

  // ── the legitimate payment, from the same key
  head("LEGIT  ·  the same key pays an invoice it was authorised for");
  const w0 = await fetchEvmWindow({ rest: endpoints.rest, address: ids.AGENT.cosmos });
  line(`  window before: ${w0.remainingTxs} txs left, ${w0.remainingBlocks} blocks left`);
  const h3 = await wallet.writeContract({
    address: deploy.vault, abi: ABI, functionName: "request",
    args: [VENDOR, parseEther("1.5"), keccak256(toHex("invoice-0042"))],
  });
  const r3 = await pub.waitForTransactionReceipt({ hash: h3 });
  const w1 = await fetchEvmWindow({ rest: endpoints.rest, address: ids.AGENT.cosmos });
  line(`  tx ${h3}  status ${r3.status}`);
  line(`  vendor received: ${formatEther(await pub.getBalance({ address: VENDOR }))} QOR`);
  line(`  window after : ${w1.remainingTxs} txs left, ${w1.remainingBlocks} blocks left`);

  // ── the door closes
  head("CLOSE  ·  owner shuts the window; the key stops working mid-flow");
  const { txClientFor } = require("./lib/chain.cjs");
  const { closeEvmWindowMsg } = require("@qorechain/sdk");
  const { tx: ownerTx } = await txClientFor(ids.AGENT); // hybrid, owner holds the PQC half
  const closed = await ownerTx.signAndBroadcast([closeEvmWindowMsg(ids.AGENT.cosmos)], "auto");
  line(`  tx ${closed.transactionHash ?? "ok"}`);

  try {
    await wallet.writeContract({
      address: deploy.vault, abi: ABI, functionName: "request",
      args: [VENDOR, parseEther("0.5"), keccak256(toHex("after-close"))],
    });
    line("  ✗ UNEXPECTED: the tx went through with the window closed");
  } catch (e) {
    line(`  refused: ${(e.shortMessage || e.message || String(e)).split("\n")[0]}`);
    line("  → same key, same contract, no window: nothing moves");
  }

  // ── the log
  head("PUBLIC LOG  ·  what the vault recorded");
  const logs = await pub.getLogs({
    address: deploy.vault, events: ABI.filter((x) => x.type === "event"),
    fromBlock: BigInt(deploy.fromBlock),
  });
  for (const l of logs) {
    if (l.eventName === "Refused") {
      line(`  refused  ${l.args.target}  ${formatEther(l.args.amount)} QOR  · ${REFUSAL_CODES[Number(l.args.code)]}`);
    }
    if (l.eventName === "Paid") {
      line(`  paid     ${l.args.target}  ${formatEther(l.args.amount)} QOR  · released`);
    }
  }
  line();
}

main().catch((e) => {
  console.error(e.shortMessage || e.message || e);
  process.exit(1);
});
