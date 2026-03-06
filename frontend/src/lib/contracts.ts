import { type Address } from "viem";

// ─── Contract addresses ───────────────────────────────────────────────────────
// Copy the addresses printed after running `pnpm run deploy:local` and set them
// in frontend/.env.local  (see .env.local.example)

export const REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;

// ─── WhistleblowerRegistry ABI ───────────────────────────────────────────────
export const REGISTRY_ABI = [
  // ── Errors ──
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [{ name: "account", type: "address" }],
  },
  // ── Events ──
  {
    type: "event",
    name: "RootAdded",
    inputs: [{ indexed: true, name: "root", type: "uint256" }],
  },
  {
    type: "event",
    name: "RootRevoked",
    inputs: [{ indexed: true, name: "root", type: "uint256" }],
  },
  {
    type: "event",
    name: "ReportSubmitted",
    inputs: [
      { indexed: true, name: "reportId", type: "uint256" },
      { indexed: true, name: "nullifierHash", type: "uint256" },
      { indexed: false, name: "encryptedCID", type: "string" },
      { indexed: false, name: "category", type: "uint8" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
  // ── Read ──
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "roots",
    stateMutability: "view",
    inputs: [{ name: "root", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "usedNullifiers",
    stateMutability: "view",
    inputs: [{ name: "nullifierHash", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "getReportCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getReport",
    stateMutability: "view",
    inputs: [{ name: "_reportId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "nullifierHash", type: "uint256" },
          { name: "encryptedCID", type: "string" },
          { name: "timestamp", type: "uint256" },
          { name: "category", type: "uint8" },
          { name: "merkleRoot", type: "uint256" },
        ],
      },
    ],
  },
  // ── Write ──
  {
    type: "function",
    name: "addRoot",
    stateMutability: "nonpayable",
    inputs: [{ name: "_root", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "revokeRoot",
    stateMutability: "nonpayable",
    inputs: [{ name: "_root", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "submitReport",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_pA", type: "uint256[2]" },
      { name: "_pB", type: "uint256[2][2]" },
      { name: "_pC", type: "uint256[2]" },
      { name: "_root", type: "uint256" },
      { name: "_nullifierHash", type: "uint256" },
      { name: "_externalNullifier", type: "uint256" },
      { name: "_encryptedCID", type: "string" },
      { name: "_category", type: "uint8" },
    ],
    outputs: [],
  },
] as const;

export const CATEGORIES = ["Fraud", "Safety", "Ethics", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];
