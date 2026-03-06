/**
 * Merkle tree helpers — mirrors test/fixtures/setup.ts exactly so the
 * root computed here matches what was registered on-chain.
 *
 * Depth 10 → 1024 leaves → matches the circuit (levels = 10).
 */
import { poseidonHash } from "./poseidon";

export const TREE_DEPTH = 10;

export interface MerkleTree {
  root: bigint;
  layers: bigint[][];
}

/**
 * Build a Poseidon Merkle tree from a list of leaf commitments.
 * Pads with zeros to fill 2^TREE_DEPTH leaves.
 */
export function buildMerkleTree(leaves: bigint[]): MerkleTree {
  const totalLeaves = 2 ** TREE_DEPTH;
  const padded = [...leaves];
  while (padded.length < totalLeaves) padded.push(0n);

  let current = padded;
  const layers: bigint[][] = [current];

  for (let i = 0; i < TREE_DEPTH; i++) {
    const next: bigint[] = [];
    for (let j = 0; j < current.length; j += 2) {
      next.push(poseidonHash([current[j], current[j + 1]]));
    }
    current = next;
    layers.push(current);
  }

  return { root: layers[TREE_DEPTH][0], layers };
}

/**
 * Compute the sibling path for `leafIndex` in the tree.
 */
export function getMerkleProof(
  layers: bigint[][],
  leafIndex: number
): { pathElements: bigint[]; pathIndices: bigint[] } {
  const pathElements: bigint[] = [];
  const pathIndices: bigint[] = [];
  let idx = leafIndex;

  for (let i = 0; i < TREE_DEPTH; i++) {
    const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    pathElements.push(layers[i][siblingIdx]);
    pathIndices.push(BigInt(idx % 2));
    idx = Math.floor(idx / 2);
  }

  return { pathElements, pathIndices };
}
