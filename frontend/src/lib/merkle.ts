// Poseidon Merkle tree — must match the circuit and test/fixtures/setup.ts exactly
// so the root we compute here is the same root that was registered on-chain.
// Tree depth 10 = 1024 leaf slots, matching the circuit's `levels` parameter.
import { poseidonHash } from "./poseidon";

export const TREE_DEPTH = 10;

export interface MerkleTree {
  root: bigint;
  layers: bigint[][];
}

// Pads leaves with zeros to fill all 1024 slots, then hashes up the tree level by level.
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

// Returns the sibling elements and left/right indices needed to reconstruct
// the root from a given leaf — this is what the circuit takes as private input.
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
