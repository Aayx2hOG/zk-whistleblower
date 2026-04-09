/**
 * Singleton Poseidon hasher backed by circomlibjs.
 * All methods are safe to call from browser or Node.js.
 * Dynamic import ensures snarkjs/circomlibjs are never touched during SSR.
 */

let poseidon: any = null;
let F: { e: (x: bigint) => unknown; toObject: (x: unknown) => bigint } | null =
  null;

export async function initPoseidon() {
  if (poseidon) return;
  const circomlib = (await import("circomlibjs" as string)) as {
    buildPoseidon: () => Promise<any>;
  };
  const p = await circomlib.buildPoseidon();
  poseidon = p;
  F = p.F;
}

export function poseidonHash(inputs: bigint[]): bigint {
  if (!poseidon || !F) throw new Error("Call initPoseidon() first");
  const hash = poseidon(inputs.map((x) => F!.e(x)));
  return F!.toObject(hash) as bigint;
}
