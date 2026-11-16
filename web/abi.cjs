const ABI = [
  {
    type: "function",
    name: "blastRadius",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "spendableNow", type: "uint256" },
      { name: "perTxCap", type: "uint256" },
      { name: "dailyRemaining", type: "uint256" },
      { name: "expiry", type: "uint64" },
      { name: "isFrozen", type: "bool" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "policyOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "perTxCap", type: "uint96" },
      { name: "dailyCap", type: "uint96" },
      { name: "expiry", type: "uint64" },
      { name: "maxCallsPerDay", type: "uint8" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "refusalCount",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "totalPaid",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Refused",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "target", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "code", type: "uint8", indexed: false },
      { name: "invoiceId", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Paid",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "target", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "invoiceId", type: "bytes32", indexed: false },
    ],
  },
];

const REFUSAL_CODES = [
  "none",
  "no policy",
  "frozen",
  "expired",
  "target not allowlisted",
  "over per-tx cap",
  "over daily cap",
  "call budget exhausted",
  "no possession proof",
  "insufficient balance",
];

module.exports = { ABI, REFUSAL_CODES };
