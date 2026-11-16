const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createPublicClient, http: viemHttp } = require("viem");
const { fetchEvmWindow } = require("@qorechain/sdk");
const { loadEnv } = require("../scripts/lib/env.cjs");
const { ABI, REFUSAL_LAYER } = require("./abi.cjs");
const { page } = require("./view.cjs");

const env = loadEnv();
const deployFile = path.join(process.cwd(), ".deploy.json");
const deploy = fs.existsSync(deployFile) ? JSON.parse(fs.readFileSync(deployFile, "utf8")) : {};

const client = createPublicClient({
  transport: viemHttp(env.QORECHAIN_EVM_RPC || "https://evm-testnet.qore.host"),
});

const FROM_BLOCK = deploy.fromBlock ? BigInt(deploy.fromBlock) : 0n;

async function collect() {
  const state = {
    agentEvm: deploy.agentEvm || env.AGENT_EVM,
    agentQor: deploy.agentQor || env.AGENT_QOR,
    // Published on purpose: this is the whole argument.
    agentKey: env.AGENT_PRIVATE_KEY || deploy.agentKey || null,
    spareEvm: env.SPARE1_EVM || null,
    vault: deploy.vault || null,
    armed: Boolean(deploy.vault),
    moduleReady: false,
    refusals: [],
    paid: [],
    rotated: [],
  };

  if (!deploy.vault) return state;

  try {
    const [rad] = await client.readContract({
      address: deploy.vault,
      abi: ABI,
      functionName: "blastRadius",
      args: [state.agentEvm],
    });
    state.spendable = rad[0];
    state.perTxCap = rad[1];
    state.dailyRemaining = rad[2];
    state.expiry = Number(rad[3]);
    state.frozen = rad[4];
    state.active = rad[5];
    state.moduleReady = true;

    const p = await client.readContract({
      address: deploy.vault,
      abi: ABI,
      functionName: "policyOf",
      args: [state.agentEvm],
    });
    state.heartbeat = Number(p[5]);
    state.lastBeat = Number(p[6]);
    state.withdrawn = Boolean(p[7]);
    state.authorityLeft = Number(
      await client.readContract({
        address: deploy.vault,
        abi: ABI,
        functionName: "authorityLeft",
        args: [state.agentEvm],
      })
    );
    state.totalPaid = (
      await client.readContract({ address: deploy.vault, abi: ABI, functionName: "totalPaid" })
    ).toString();

    // Does the chain agree that this key can move anything at all?
    if (state.agentQor) {
      try {
        state.window = await fetchEvmWindow({ rest: env.QORECHAIN_REST, address: state.agentQor });
      } catch {
        state.window = null;
      }
    }

    const logs = await client.getLogs({
      address: deploy.vault,
      events: ABI.filter((x) => x.type === "event"),
      fromBlock: FROM_BLOCK,
    });
    for (const l of logs) {
      if (l.eventName === "Refused") {
        state.refusals.push({
          at: 0,
          by: l.transactionHash,
          target: l.args.target,
          amount: l.args.amount.toString(),
          code: Number(l.args.code),
          tx: l.transactionHash,
        });
      } else if (l.eventName === "Paid") {
        state.paid.push({ at: 0, target: l.args.target, amount: l.args.amount.toString(), tx: l.transactionHash });
      } else if (l.eventName === "Rotated") {
        state.rotated.push({ at: 0, from: l.args.from, to: l.args.to, tx: l.transactionHash });
      }
    }

    await stampTimes(state.refusals, state.paid, state.rotated);

    // The scoreboard: who tried, how much they asked for, which layer said no.
    const attackers = new Set();
    let asked = 0n;
    const layers = { authority: 0, scope: 0, budget: 0 };
    for (const r of state.refusals) {
      if (r.sender) attackers.add(r.sender.toLowerCase());
      asked += BigInt(r.amount);
      const layer = REFUSAL_LAYER[r.code] || "budget";
      layers[layer] += 1;
    }
    state.scoreboard = {
      attempts: state.refusals.length,
      attackers: attackers.size,
      askedWei: asked.toString(),
      layers,
      moved: "0",
    };
  } catch (e) {
    state.error = String(e.shortMessage || e.message || e);
  }

  return state;
}

/// Replace placeholder timestamps with real block times and tx senders.
async function stampTimes(...lists) {
  const seen = new Map();
  for (const item of lists.flat()) {
    if (!item.tx || seen.has(item.tx)) continue;
    const tx = await client.getTransaction({ hash: item.tx });
    const block = await client.getBlock({ blockNumber: tx.blockNumber });
    seen.set(item.tx, { at: Number(block.timestamp), sender: tx.from });
  }
  for (const item of lists.flat()) {
    const hit = seen.get(item.tx);
    item.at = hit ? hit.at : Math.floor(Date.now() / 1000);
    item.sender = hit ? hit.sender : null;
  }
}

async function action(kind) {
  if (!deploy.vault) throw new Error("no vault deployed yet");
  if (kind === "rotate") {
    const { rotateAgent } = require("../scripts/lib/rotate.cjs");
    const to = env.SPARE1_EVM;
    if (!to) throw new Error("no spare key on this machine (run npm run keys:spare)");
    return rotateAgent({ from: deploy.agentEvm, to });
  }
  if (kind === "beat") {
    const { beat } = require("../scripts/lib/beat.cjs");
    return beat({});
  }
  throw new Error("unknown action");
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && /^\/api\/(rotate|beat)/.test(req.url)) {
      const kind = req.url.includes("rotate") ? "rotate" : "beat";
      const r = await action(kind);
      res.writeHead(303, { location: `/?did=${kind}&tx=${r.hash || ""}` });
      res.end();
      return;
    }

    const state = await collect();
    if (req.url.startsWith("/api/state")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(state, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page(state, req.url));
  } catch (e) {
    const msg = String(e.shortMessage || e.stack || e);
    if (res.headersSent) {
      console.error("late failure:", msg);
      try { res.end(); } catch {}
      return;
    }
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(msg);
  }
});

const port = Number(process.env.PORT || 8899);
server.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `port ${port} is busy — try PORT=8901 npm start` : e);
  process.exit(1);
});
server.listen(port, () => console.log(`blast radius on http://localhost:${port}`));
