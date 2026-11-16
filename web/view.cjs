const { REFUSAL_CODES, REFUSAL_LAYER } = require("./abi.cjs");
const { codeBlock } = require("./cmdblock.cjs");

const fmtQor = (wei) => {
  if (wei === undefined || wei === null) return "0.00";
  const n = Number(BigInt(wei)) / 1e18;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
};

const short = (a) => (a ? `${a.slice(0, 10)}…${a.slice(-4)}` : "—");

function page(state, url = "/") {
  const {
    agentEvm,
    agentKey,
    spareEvm,
    vault,
    spendable,
    perTxCap,
    dailyRemaining,
    expiry,
    frozen,
    active,
    heartbeat = 0,
    lastBeat = 0,
    authorityLeft = 0,
    withdrawn = false,
    window,
    refusals = [],
    paid = [],
    rotated = [],
    totalPaid = "0",
    scoreboard,
    armed,
    moduleReady,
  } = state;

  const live = armed && moduleReady;
  const countdown = expiry ? Math.max(0, expiry - Math.floor(Date.now() / 1000)) : 0;
  const hours = Math.floor(countdown / 3600);
  const mins = Math.floor((countdown % 3600) / 60);

  const did = new URLSearchParams(url.split("?")[1] || "").get("did");
  const flash =
    did === "rotate"
      ? "Rotated. The key in the box above is dead from this block — refused with code 11 — and the policy moved to a key it has never seen."
      : did === "beat"
        ? "Liveness proven. Authority is alive again; let the heartbeat lapse and it drops to zero on its own."
        : "";

  const refusalRows = refusals
    .slice()
    .reverse()
    .slice(0, 25)
    .map((r) => {
      const layer = REFUSAL_LAYER[r.code] || "budget";
      return `<tr>
        <td class="mono dim">${new Date(r.at * 1000).toISOString().slice(11, 19)}</td>
        <td class="mono dim">${short(r.sender)}</td>
        <td class="mono">${short(r.target)}</td>
        <td class="mono">${fmtQor(r.amount)}</td>
        <td><span class="tag bad">${REFUSAL_CODES[r.code] || "code " + r.code}</span></td>
        <td><span class="tag layer">${layer}</span></td>
      </tr>`;
    })
    .join("");

  const paidRows = paid
    .slice()
    .reverse()
    .slice(0, 10)
    .map(
      (p) => `<tr>
        <td class="mono dim">${new Date(p.at * 1000).toISOString().slice(11, 19)}</td>
        <td class="mono">${short(p.target)}</td>
        <td class="mono">${fmtQor(p.amount)}</td>
        <td><span class="tag good">released</span></td>
      </tr>`
    )
    .join("");

  const sb = scoreboard || { attempts: 0, attackers: 0, askedWei: "0", layers: { authority: 0, scope: 0, budget: 0 } };
  const pulse = heartbeat
    ? `${Math.floor(authorityLeft / 60)}m ${String(authorityLeft % 60).padStart(2, "0")}s`
    : "no heartbeat";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blast Radius — what a stolen key can do</title>
<style>
  :root{
    --bg:#08090c; --panel:#0f1116; --line:#242833; --ink:#eceef4; --dim:#9aa2b4;
    --good:#3ddc97; --bad:#ff5c5c; --accent:#7c8cff; --warn:#ffb454;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased}
  .mono{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace}
  .wrap{max-width:980px;margin:0 auto;padding:28px 20px 80px}
  header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:38px}
  .dot{width:8px;height:8px;border-radius:50%;background:${live ? "var(--good)" : "#555"};box-shadow:0 0 0 4px rgba(61,220,151,.12)}
  .brand{font-weight:650;letter-spacing:.14em;font-size:12px;text-transform:uppercase;color:var(--dim)}
  .chip{font-size:11px;color:var(--dim);border:1px solid var(--line);border-radius:999px;padding:3px 10px}
  h1{font-size:clamp(28px,5vw,44px);line-height:1.08;letter-spacing:-.02em;margin:0 0 14px;font-weight:640}
  .lede{color:var(--dim);max-width:62ch;margin:0 0 26px}
  .flash{border-left:2px solid var(--good);background:rgba(61,220,151,.06);padding:10px 14px;border-radius:0 8px 8px 0;
    font-size:13px;margin:0 0 22px;color:#cfe9dd}
  .hero{border:1px solid var(--line);border-radius:16px;padding:26px 24px;background:linear-gradient(180deg,#101319,#0b0d11)}
  .hero .label{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
  .hero .num{font-size:clamp(44px,10vw,86px);font-weight:680;letter-spacing:-.03em;line-height:1;margin:8px 0 6px}
  .hero .num small{font-size:.3em;font-weight:600;color:var(--dim);letter-spacing:0;margin-left:8px}
  .hero .sub{color:var(--dim);font-size:13px}
  .hero .sub b{color:var(--ink);font-weight:600}
  .bar{height:3px;border-radius:2px;background:#1b1f28;margin-top:16px;overflow:hidden}
  .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--good));width:${heartbeat ? Math.min(100, Math.round((authorityLeft / heartbeat) * 100)) : 0}%}
  .strip{display:flex;gap:20px;flex-wrap:wrap;align-items:baseline;margin:14px 0 30px;padding:14px 18px;
    border:1px solid var(--line);border-radius:12px;background:var(--panel);font-size:13px;color:var(--dim)}
  .strip>span+span{padding-left:20px;border-left:1px solid var(--line)}
  .strip b{color:var(--ink);font-weight:650}
  .strip .zero{color:var(--good)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:16px 0 30px}
  .card{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--panel)}
  .card .k{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:6px}
  .card .v{font-size:19px;font-weight:600}
  .card .v.small{font-size:14px;font-weight:500;word-break:break-all}
  .acts{display:flex;gap:10px;flex-wrap:wrap;margin:4px 0 8px}
  form{margin:0}
  button{font:inherit;font-size:13px;border-radius:9px;padding:9px 14px;cursor:pointer;border:1px solid var(--line);
    background:#12151c;color:var(--ink)}
  button:hover{border-color:#39404f}
  button.kill{border-color:rgba(255,92,92,.45);color:#ffb3b3;background:rgba(255,92,92,.07)}
  button.kill:hover{background:rgba(255,92,92,.13)}
  .hint{color:var(--dim);font-size:12px;margin:0 0 26px}
  h2{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:38px 0 12px;font-weight:600}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--dim);font-weight:500;font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding:6px 8px;border-bottom:1px solid var(--line)}
  td{padding:9px 8px;border-bottom:1px solid #14171d}
  .tag{font-size:11px;border-radius:5px;padding:2px 7px;white-space:nowrap}
  .tag.bad{background:rgba(255,92,92,.12);color:var(--bad)}
  .tag.good{background:rgba(61,220,151,.12);color:var(--good)}
  .tag.layer{background:rgba(124,140,255,.12);color:#a8b3ff}
  .keybox{border:1px solid var(--line);border-radius:12px;background:#0b0d11;padding:16px}
  .keybox .k{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);margin-bottom:8px}
  .keyval{font-size:12.5px;word-break:break-all;color:#dfe3ee;background:#0f1116;border:1px solid var(--line);border-radius:8px;padding:10px;user-select:all}
  .dead{color:#7a5560;text-decoration:line-through}
  pre{background:#0b0d11;border:1px solid var(--line);border-radius:10px;padding:14px 16px;
    font-size:12px;line-height:1.8;color:#c9cede;white-space:pre;overflow-x:auto;margin:0}
  pre::-webkit-scrollbar{height:8px}
  pre::-webkit-scrollbar-thumb{background:#2b3040;border-radius:4px}
  code{font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace}
  .empty{border:1px dashed var(--line);border-radius:12px;padding:22px 18px;color:var(--dim);
    font-size:13px;background:#0b0d11}
  .empty b{color:var(--ink);font-weight:600}
  .pilltag{display:inline-block;font-size:11px;letter-spacing:.04em;border-radius:6px;padding:3px 8px;
    background:rgba(255,255,255,.05);color:var(--dim);border:1px solid var(--line)}
  .copy{float:right;font-size:11px;color:var(--dim);border:1px solid var(--line);border-radius:6px;
    padding:2px 8px;cursor:pointer;background:#12151c}
  .copy:hover{color:var(--ink);border-color:#39404f}
  .note{font-style:italic}
  .dim{color:var(--dim)}
  footer{margin-top:52px;color:var(--dim);font-size:12px;border-top:1px solid var(--line);padding-top:18px}
  a{color:var(--accent);text-decoration:none}
  a:hover{text-decoration:underline}
</style></head>
<body><div class="wrap">

<header>
  <span class="dot"></span>
  <span class="brand">Blast Radius</span>
  <span class="chip">${armed ? "qorechain-diana" : "not armed yet"}</span>
  <span class="chip">${withdrawn ? "key rotated out" : frozen ? "vault frozen" : active ? "policy active" : "no policy"}</span>
</header>

<h1>A stolen key is only worth<br>what the policy admits.</h1>
<p class="lede">This page holds an operator key that an AI agent uses to pay invoices.
The key below is public on purpose. Try to drain it. Everything you get is
everything a quantum attacker would get after recovering that key.</p>
${flash ? `<p class="flash">${flash}</p>` : ""}

<div class="hero">
  <div class="label">Spendable by whoever holds the key, right now</div>
  <div class="num" id="rad">${renderNumber(spendable)}<small>QOR</small></div>
  <div class="sub">
    ${live
      ? `authority valid for <b id="pulse">${pulse}</b> · ${hours}h ${mins}m to policy expiry · ${refusals.length} attempts on chain`
      : "waiting for a funded, armed deployment"}
  </div>
  ${heartbeat ? `<div class="bar"><i></i></div>` : ""}
</div>

<div class="strip">
  <span><b>${sb.attempts}</b> refused attempts</span>
  <span><b>${sb.attackers}</b> distinct keys</span>
  <span><b>${fmtQor(sb.askedWei)}</b> QOR asked for</span>
  <span class="zero"><b>${fmtQor(sb.moved)}</b> QOR moved</span>
  <span><b>${sb.layers.authority}</b> by authority</span>
  <span><b>${sb.layers.scope}</b> by scope</span>
  <span><b>${sb.layers.budget}</b> by budget</span>
</div>

<div class="acts">
  <form method="post" action="/api/beat"><button type="submit">Prove the owner is alive</button></form>
  <form method="post" action="/api/rotate"><button type="submit" class="kill">${spareEvm ? `Kill this key · rotate to ${short(spareEvm)}` : "Kill this key"}</button></form>
</div>
<p class="hint">Rotation is live: the owner's ML-DSA key authorises the hand-over, the old key is refused with
code 11 from the next block, and the day's spend travels with the policy so the new key cannot start a fresh budget.</p>

<div class="grid">
  <div class="card"><div class="k">Per-transaction cap</div><div class="v">${renderNumber(perTxCap)} QOR</div></div>
  <div class="card"><div class="k">Daily budget left</div><div class="v">${renderNumber(dailyRemaining)} QOR</div></div>
  <div class="card"><div class="k">Liveness heartbeat</div><div class="v">${heartbeat ? heartbeat + "s" : `<span class="dim" style="font-weight:500">none</span>`}</div></div>
  <div class="card"><div class="k">EVM window</div><div class="v small">${window && window.live ? `${window.remainingTxs} txs · ${window.remainingBlocks} blocks` : `<span class="dim">closed</span>`}</div></div>
  <div class="card"><div class="k">Paid out legitimately</div><div class="v">${fmtQor(totalPaid)} QOR</div></div>
  <div class="card"><div class="k">Rotations</div><div class="v">${rotated.length}</div></div>
</div>

<h2>The key</h2>
<div class="keybox">
  <div class="k">Agent private key — take it, it is real <span class="copy" onclick="cp('pk',this)">copy</span></div>
  <div class="keyval mono ${withdrawn ? "dead" : ""}" id="pk">${agentKey || "not generated"}</div>
  <div class="keyval mono" style="margin-top:8px">${agentEvm || "—"}</div>
  <p class="dim" style="font-size:12px;margin:8px 0 0">${vault ? "vault " + vault : "the vault deploys once this account is funded"}</p>
  ${withdrawn ? `<p class="dim" style="margin:12px 0 0;font-size:12px">Rotated out. This key is worth exactly zero — the policy lives at <span class="mono">${short(spareEvm)}</span> now.</p>` : ""}
</div>

<h2>Try it yourself <span class="copy" style="float:none;margin-left:8px" onclick="cp('cmds',this)">copy commands</span></h2>
${codeBlock({ vault, agentEvm, agentKey })}
<p class="dim" style="font-size:13px;margin-top:14px">The second call is signed with the key above and still cannot move a wei to an
address that is not on the allowlist. The refusal is written to the log below instead of reverting.</p>

<h2>Refused attempts</h2>
${
  refusalRows
    ? `<table><thead><tr><th>time</th><th>sender</th><th>target</th><th>amount</th><th>verdict</th><th>layer</th></tr></thead><tbody>${refusalRows}</tbody></table>`
    : `<div class="empty">No attempts yet. <b>Be the first</b> — send one wei anywhere and watch it land here.</div>`
}

<h2>Released payments</h2>
${
  paidRows
    ? `<table><thead><tr><th>time</th><th>vendor</th><th>amount</th><th>verdict</th></tr></thead><tbody>${paidRows}</tbody></table>`
    : `<div class="empty">Empty. The same key, used for the thing it was authorised to do, lands here.</div>`
}

<footer>
  Blast Radius · bounded authority for agent keys on QoreChain ·
  <a href="https://github.com/harishkotra/blast-radius">source</a> ·
  key status checked with <code>possessionProven</code>, policy signed with ML-DSA-87,
  authority decays without an owner heartbeat and can be rotated out from under a thief.
</footer>
</div>
<script>
var left = ${Number(authorityLeft) || 0};
var el = document.getElementById('pulse');
if (el && left > 0) {
  setInterval(function () {
    left = Math.max(0, left - 1);
    var m = Math.floor(left / 60), s = String(left % 60).padStart(2, '0');
    el.textContent = left === 0 ? 'none — authority lapsed' : m + 'm ' + s + 's';
    if (left === 0) document.getElementById('rad').innerHTML = '0.00<small>QOR</small>';
  }, 1000);
}
function cp(id, el){
  const t = document.getElementById(id).innerText;
  navigator.clipboard.writeText(t).then(()=>{el.textContent='copied'; setTimeout(()=>el.textContent=id==='pk'?'copy':'copy commands',1600)});
}
</script>
</body></html>`;
}

function renderNumber(wei) {
  if (wei === undefined || wei === null) return "0.00";
  return fmtQor(wei);
}

module.exports = { page, fmtQor };
