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
