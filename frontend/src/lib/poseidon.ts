/**
 * Singleton Poseidon hasher backed by circomlibjs.
 * All methods are safe to call from browser or Node.js.
 * Dynamic import ensures snarkjs/circomlibjs are never touched during SSR.
 */

// circomlibjs types are loose by design — it accepts field elements, not raw bigints
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let poseidon: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let F: { e: (x: bigint) => unknown; toObject: (x: unknown) => bigint } | null =
  null;

export async function initPoseidon() {
  if (poseidon) return;
  const { buildPoseidon } = await import("circomlibjs");
  const p = await buildPoseidon();
  poseidon = p;
  F = p.F;
}

export function poseidonHash(inputs: bigint[]): bigint {
  if (!poseidon || !F) throw new Error("Call initPoseidon() first");
  const hash = poseidon(inputs.map((x) => F!.e(x)));
  return F!.toObject(hash) as bigint;
}
