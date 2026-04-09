// Generates a Groth16 membership proof in the browser using snarkjs.
// The circuit WASM and final zkey are served from /public/circuits/.
// Run `pnpm run copy-artifacts` to sync them from the root circuits-artifacts/ folder.
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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  return (await res.json()) as T;
}

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

  // snarkjs is huge, so we import it dynamically to keep it out of the SSR bundle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snarkjs = await import("snarkjs") as any;
  const [wasm, zkey, vKey] = await Promise.all([
    fetchBytes("/circuits/membership.wasm"),
    fetchBytes("/circuits/membership_final.zkey"),
    fetchJson<unknown>("/circuits/verification_key.json"),
  ]);

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    wasm,
    zkey
  );
  const calldata = await snarkjs.groth16.exportSolidityCallData(
    proof,
    publicSignals
  );

  const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  if (!isValid) {
    throw new Error(
      "Local proof verification failed. Circuit artifacts may be inconsistent (wasm/zkey/verification_key)."
    );
  }

  const [pA, pB, pC] = JSON.parse(`[${calldata}]`) as [
    [string, string],
    [[string, string], [string, string]],
    [string, string],
    [string, string, string],
  ];

  const formatted: FormattedProof = {
    pA: [BigInt(pA[0]), BigInt(pA[1])],
    pB: [
      [BigInt(pB[0][0]), BigInt(pB[0][1])],
      [BigInt(pB[1][0]), BigInt(pB[1][1])],
    ],
    pC: [BigInt(pC[0]), BigInt(pC[1])],
    nullifierHash,
    root: input.root,
    externalNullifier: input.externalNullifier,
  };

  return formatted;
}


export { TREE_DEPTH };
