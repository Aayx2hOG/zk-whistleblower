import { type Address } from "viem";

// Copy the addresses printed after running `pnpm run deploy:local` and set them
// in frontend/.env.local

export const REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as Address;


export const REGISTRY_ABI = [
  // errors 
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
  {
    type: "error",
    name: "UnknownMerkleRoot",
    inputs: [],
  },
  {
    type: "error",
    name: "NullifierAlreadyUsed",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidCategory",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidZKProof",
    inputs: [],
  },
  {
    type: "error",
    name: "RootAlreadyExists",
    inputs: [],
  },
  {
    type: "error",
    name: "RootDoesNotExist",
    inputs: [],
  },
  {
    type: "error",
    name: "ReportDoesNotExist",
    inputs: [],
  },
  {
    type: "error",
    name: "OrganizationAlreadyExists",
    inputs: [],
  },
  {
    type: "error",
    name: "OrganizationDoesNotExist",
    inputs: [],
  },
  {
    type: "error",
    name: "OrganizationInactive",
    inputs: [],
  },
  //Events
  {
    type: "event",
    name: "RootAdded",
    inputs: [{ indexed: true, name: "root", type: "uint256" }],
  },
  {
    type: "event",
    name: "OrganizationCreated",
    inputs: [
      { indexed: true, name: "orgId", type: "uint256" },
      { indexed: false, name: "name", type: "string" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "OrganizationStatusUpdated",
    inputs: [
      { indexed: true, name: "orgId", type: "uint256" },
      { indexed: false, name: "active", type: "bool" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "RootAddedForOrg",
    inputs: [
      { indexed: true, name: "orgId", type: "uint256" },
      { indexed: true, name: "root", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "RootRevoked",
    inputs: [{ indexed: true, name: "root", type: "uint256" }],
  },
  {
    type: "event",
    name: "RootRevokedForOrg",
    inputs: [
      { indexed: true, name: "orgId", type: "uint256" },
      { indexed: true, name: "root", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "ReportSubmitted",
    inputs: [
      { indexed: true, name: "reportId", type: "uint256" },
      { indexed: true, name: "nullifierHash", type: "uint256" },
      { indexed: false, name: "encryptedCID", type: "bytes" },
      { indexed: false, name: "category", type: "uint8" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "ReportSubmittedForOrg",
    inputs: [
      { indexed: true, name: "reportId", type: "uint256" },
      { indexed: true, name: "orgId", type: "uint256" },
      { indexed: true, name: "nullifierHash", type: "uint256" },
      { indexed: false, name: "encryptedCID", type: "bytes" },
      { indexed: false, name: "category", type: "uint8" },
      { indexed: false, name: "timestamp", type: "uint256" },
    ],
  },
  // read 
  {
    type: "function",
    name: "DEFAULT_ORG_ID",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "verifier",
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
    name: "organizationExists",
    stateMutability: "view",
    inputs: [{ name: "orgId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "orgRoots",
    stateMutability: "view",
    inputs: [
      { name: "orgId", type: "uint256" },
      { name: "root", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "orgUsedNullifiers",
    stateMutability: "view",
    inputs: [
      { name: "orgId", type: "uint256" },
      { name: "nullifierHash", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "reportOrgId",
    stateMutability: "view",
    inputs: [{ name: "reportId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
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
    name: "getOrgReportCount",
    stateMutability: "view",
    inputs: [{ name: "_orgId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getOrgReportIdAt",
    stateMutability: "view",
    inputs: [
      { name: "_orgId", type: "uint256" },
      { name: "_index", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getOrganization",
    stateMutability: "view",
    inputs: [{ name: "_orgId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "active", type: "bool" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
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
          { name: "merkleRoot", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "category", type: "uint8" },
          { name: "encryptedCID", type: "bytes" },
        ],
      },
    ],
  },
  // Write
  {
    type: "function",
    name: "addRoot",
    stateMutability: "nonpayable",
    inputs: [{ name: "_root", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "createOrganization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_orgId", type: "uint256" },
      { name: "_name", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setOrganizationActive",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_orgId", type: "uint256" },
      { name: "_active", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "addRootForOrg",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_orgId", type: "uint256" },
      { name: "_root", type: "uint256" },
    ],
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
    name: "revokeRootForOrg",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_orgId", type: "uint256" },
      { name: "_root", type: "uint256" },
    ],
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
      { name: "_encryptedCID", type: "bytes" },
      { name: "_category", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submitReportForOrg",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_orgId", type: "uint256" },
      { name: "_pA", type: "uint256[2]" },
      { name: "_pB", type: "uint256[2][2]" },
      { name: "_pC", type: "uint256[2]" },
      { name: "_root", type: "uint256" },
      { name: "_nullifierHash", type: "uint256" },
      { name: "_externalNullifier", type: "uint256" },
      { name: "_encryptedCID", type: "bytes" },
      { name: "_category", type: "uint8" },
    ],
    outputs: [],
  },
] as const;

export const CATEGORIES = ["Fraud", "Safety", "Ethics", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];
