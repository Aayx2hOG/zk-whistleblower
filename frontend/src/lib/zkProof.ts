/**
 * Browser-side ZK proof generation using snarkjs.
 *
 * The circuit WASM and zkey are fetched from /circuits/ (public/circuits/).
 * Run `pnpm run copy-artifacts` from the frontend directory to populate that
 * folder from the parent project's circuits-artifacts/.
 */
import { getMerkleProof, type MerkleTree, TREE_DEPTH } from "./merkle";
import { poseidonHash } from "./poseidon";

export interface ProofInput {
  root: bigint;
  secret: bigint;
  leafIndex: number;
  externalNullifier: bigint;
  tree: MerkleTree;
}

export interface FormattedProof {
  pA: readonly [bigint, bigint];
  pB: readonly [readonly [bigint, bigint], readonly [bigint, bigint]];
  pC: readonly [bigint, bigint];
  nullifierHash: bigint;
  root: bigint;
  externalNullifier: bigint;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Generates a Groth16 membership proof.
 * Fetches wasm + zkey from public/circuits/ at runtime.
 */
export async function generateZKProof(input: ProofInput): Promise<FormattedProof> {
  const { initPoseidon } = await import("./poseidon");
  await initPoseidon();

  const { pathElements, pathIndices } = getMerkleProof(
    input.tree.layers,
    input.leafIndex
  );
  const nullifierHash = poseidonHash([input.secret, input.externalNullifier]);

  const circuitInput = {
    root: input.root.toString(),
    nullifierHash: nullifierHash.toString(),
    externalNullifier: input.externalNullifier.toString(),
    secret: input.secret.toString(),
    pathElements: pathElements.map((x) => x.toString()),
    pathIndices: pathIndices.map((x) => x.toString()),
  };

  // Dynamic import so snarkjs is never bundled for SSR
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snarkjs = await import("snarkjs") as any;
  const [wasm, zkey] = await Promise.all([
    fetchBytes("/circuits/membership.wasm"),
    fetchBytes("/circuits/membership_final.zkey"),
  ]);

  const { proof } = await snarkjs.groth16.fullProve(circuitInput, wasm, zkey);

  // pB must be transposed to match Solidity verifier convention
  const formatted: FormattedProof = {
    pA: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
    pB: [
      [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
      [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])],
    ],
    pC: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
    nullifierHash,
    root: input.root,
    externalNullifier: input.externalNullifier,
  };

  return formatted;
}


export { TREE_DEPTH };
