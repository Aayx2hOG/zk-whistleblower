declare module "circomlibjs" {
    export function buildPoseidon(): Promise<any>;
}

declare module "snarkjs" {
    export namespace groth16 {
        function fullProve(
            input: Record<string, string | string[]>,
            wasmPath: string,
            zkeyPath: string
        ): Promise<{ proof: any; publicSignals: string[] }>;
        function verify(
            vkey: any,
            publicSignals: string[],
            proof: any
        ): Promise<boolean>;
    }
}
