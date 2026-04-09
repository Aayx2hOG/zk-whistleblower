// Type shim for snarkjs — the package ships CommonJS types that don't resolve
// under Next.js's "moduleResolution: bundler". We cast to `any` at call sites,
// so this empty declaration just silences the "cannot find module" error.
declare module "snarkjs" {
  const groth16: {
    fullProve: (
      input: Record<string, string | string[]>,
      wasm: string | Uint8Array,
      zkey: string | Uint8Array
    ) => Promise<{ proof: Record<string, string[]>; publicSignals: string[] }>;
    verify: (
      verificationKey: unknown,
      publicSignals: string[],
      proof: Record<string, string[]>
    ) => Promise<boolean>;
  };
  export { groth16 };
}
