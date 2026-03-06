# ZK-Whistleblower

Anonymous whistleblowing platform using zero-knowledge proofs and blockchain. Members of an organization can submit reports proving they are legitimate insiders — without revealing their identity.

## How It Works

1. **Organization setup**: Admin registers employee commitments as leaves in a Merkle tree and publishes the root on-chain.
2. **Whistleblower submits**: The whistleblower generates a ZK proof (Groth16) proving they know a secret corresponding to a leaf in the Merkle tree — without revealing which leaf. They also produce a nullifier hash to prevent double submissions.
3. **On-chain verification**: The smart contract verifies the ZK proof, checks the nullifier hasn't been used, and stores the report with an encrypted IPFS CID pointing to the evidence.
4. **Reviewer access**: Authorized reviewers fetch the encrypted evidence from IPFS and decrypt it locally.

## Tech Stack

- **ZK Circuits**: Circom 2 + Groth16 (via snarkjs)
- **Hash Function**: Poseidon (ZK-optimized, from circomlib)
- **Smart Contracts**: Solidity 0.8.28 (Hardhat 3)
- **Access Control**: OpenZeppelin Ownable
- **Merkle Tree Depth**: 10 (supports ~1024 members)

## Project Structure

```
circuits/membership.circom       — ZK circuit (membership proof + nullifier)
contracts/Groth16Verifier.sol    — Auto-generated proof verifier (by snarkjs)
contracts/WhistleblowerRegistry.sol — Core contract (root mgmt, proof verification, reports)
test/fixtures/setup.ts           — Poseidon, Merkle tree, proof generation utilities
test/WhistleblowerRegistry.ts    — 13 tests with real ZK proofs
scripts/compile-circuit.ts       — Circuit compilation + trusted setup pipeline
scripts/deploy.ts                — Deploy + end-to-end demo
frontend/                        — Next.js 15 UI 
  src/app/admin/                 —   Admin: register / revoke Merkle roots
  src/app/submit/                —   Submit: generate ZK proof + send report
  src/app/reviewer/              —   Reviewer: list all ReportSubmitted events
  src/lib/                       —   contracts ABI, Poseidon, Merkle tree, zkProof helpers
  src/providers/                 —   wagmi v2 + RainbowKit wallet provider
```

## Setup

```bash
pnpm install
pnpm run compile:circuit    # compile circuit + generate verifier (first time only)
```

## Commands

```bash
pnpm run test               # run all 13 tests
pnpm run deploy:local       # deploy + demo on local Hardhat network
pnpm run deploy:sepolia     # deploy to Sepolia testnet
```

## Frontend 

### First-time setup

```bash
# 1. Copy circuit artifacts into the Next.js public dir
cd frontend
pnpm install
pnpm run copy-artifacts         # copies wasm + zkey from ../circuits-artifacts/

# 2. Set contract addresses
cp .env.local.example .env.local
#    → paste addresses printed by `pnpm run deploy:local` into .env.local

# 3. Start dev server
pnpm run dev                    # http://localhost:3000
```

### Exit criteria (local Hardhat)

1. Start Hardhat node: `npx hardhat node` (in root dir)
2. Deploy contracts: `npx hardhat run scripts/deploy.ts`
3. Copy the printed addresses into `frontend/.env.local`
4. Run `pnpm run dev` in `frontend/`
5. Connect MetaMask to `localhost:8545` (Chain ID 31337)
6. **Admin page**: enter member secrets → Build Tree → Add Root
7. **Submit page**: enter your secret + same secrets list + external nullifier → Generate Proof (~30 s) → Submit Report
8. **Reviewer page**: see the submitted report listed with its category and CID

### Tech stack (frontend)

| Library | Purpose |
|---|---|
| Next.js 15 (App Router) | Framework |
| wagmi v2 + viem | Contract reads/writes |
| RainbowKit | Wallet connect modal |
| snarkjs (browser) | Client-side Groth16 proof generation |
| circomlibjs | Poseidon hashing in browser |
| Tailwind CSS | Styling |

## Circuit Details

The circuit proves: "I know a `secret` such that `Poseidon(secret)` is a leaf in the Merkle tree with the given root, and `Poseidon(secret, externalNullifier)` equals the given nullifier hash."

**Public inputs** (visible on-chain): `root`, `nullifierHash`, `externalNullifier`

**Private inputs** (known only to prover): `secret`, `pathElements[10]`, `pathIndices[10]`

**Constraints**: 2,909 non-linear + 3,213 linear

## Tests

All tests use real ZK proof generation (no mocks):

- Root management: add, duplicate rejection, revoke, non-owner rejection
- Report submission: valid proof, nullifier replay, multi-member, unknown root, revoked root, fake proof, invalid category
- Report retrieval: count check, non-existent report revert
