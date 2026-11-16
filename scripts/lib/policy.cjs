// The policy compiler: turns a human policy into the exact on-chain bounds,
// after checking them against the chain's own limits so a mistake fails here
// instead of costing a refused transaction.
const CHAIN_LIMITS = {
  blocks: { min: 1, max: 17280 }, // ~5h on testnet
  maxTxs: { min: 1, max: 1000 },
  // Opening a window consumes this much of maxValue in fees, per the docs.
  windowOpenFeeUqor: 3363n,
};

const UQOR_PER_QOR = 1_000_000n;

function toUqor(qor) {
  const [whole, frac = ""] = String(qor).split(".");
  const padded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * UQOR_PER_QOR + BigInt(padded || "0");
}

function validate(policy) {
  const errors = [];
  const cap = (v, b, name) => {
    if (!Number.isInteger(v) || v < b.min || v > b.max) {
      errors.push(`${name} must be an integer in [${b.min}, ${b.max}] (got ${v})`);
    }
  };

  cap(policy.windowBlocks, CHAIN_LIMITS.blocks, "windowBlocks");
  cap(policy.windowMaxTxs, CHAIN_LIMITS.maxTxs, "windowMaxTxs");

  if (!Array.isArray(policy.allowedTargets) || policy.allowedTargets.length === 0) {
    errors.push("allowedTargets must list at least one 0x address");
  } else {
    for (const t of policy.allowedTargets) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(t)) errors.push(`allowedTargets: not an address: ${t}`);
    }
  }

  const perTx = toUqor(policy.perTxCapQor);
  const daily = toUqor(policy.dailyCapQor);
  if (perTx <= 0n) errors.push("perTxCapQor must be > 0");
  if (daily < perTx) errors.push("dailyCapQor must be >= perTxCapQor");
  if (!Number.isInteger(policy.maxCallsPerDay) || policy.maxCallsPerDay < 1) {
    errors.push("maxCallsPerDay must be >= 1");
  }
  if (!(policy.expiryHours > 0)) errors.push("expiryHours must be > 0");

  return { errors, perTx, daily };
}

/// Compile: what the chain lane needs (window) + what the EVM lane needs (caps).
function compile(policy, { nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  const { errors, perTx, daily } = validate(policy);
  if (errors.length) return { ok: false, errors };

  // maxValue bounds value PLUS the maximum fee of every admitted tx, so the
  // window must be allowed to spend the daily cap and still cover its fees.
  const maxValue = daily + CHAIN_LIMITS.windowOpenFeeUqor;
  const windowMaxTxs = Math.min(policy.windowMaxTxs, policy.maxCallsPerDay);

  const effective = {
    // per-tx bound is whichever is tighter: the window's own per-tx value or
    // the vault's cap. We keep both explicit so the UI can show the binding one.
    window: {
      blocks: policy.windowBlocks,
      maxTxs: windowMaxTxs,
      maxValueUqor: maxValue.toString(),
      maxValueQor: Number(maxValue) / 1e6,
    },
    vault: {
      perTxCapWei: (perTx * 10n ** 12n).toString(), // uqor -> 18-dec wei-equivalent
      dailyCapWei: (daily * 10n ** 12n).toString(),
      expiry: nowSeconds + Math.round(policy.expiryHours * 3600),
      maxCallsPerDay: policy.maxCallsPerDay,
      active: true,
    },
    allowedTargets: policy.allowedTargets,
    // The single number a non-cryptographer can hold onto.
    blastRadiusQor: Number(policy.perTxCapQor),
    worstCaseQor: Number(policy.dailyCapQor),
  };

  return { ok: true, effective, errors: [] };
}

module.exports = { compile, validate, toUqor, CHAIN_LIMITS };
