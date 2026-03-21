import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import { resolve } from "path";

const ARTIFACTS_DIR = resolve(import.meta.dirname, "../../circuits-artifacts");
const WASM_PATH = resolve(ARTIFACTS_DIR, "membership_js/membership.wasm");
const ZKEY_PATH = resolve(ARTIFACTS_DIR, "membership_final.zkey");

const TREE_DEPTH = 10;

let poseidon: any;
let F: any;

export async function initPoseidon() {
    if (!poseidon) {
        poseidon = await buildPoseidon();
        F = poseidon.F;
    }
    return { poseidon, F };
}

export function poseidonHash(inputs: bigint[]): bigint {
    const hash = poseidon(inputs.map((x: bigint) => F.e(x)));
    return F.toObject(hash);
}

export function buildMerkleTree(leaves: bigint[]) {
    const totalLeaves = 2 ** TREE_DEPTH;
    const paddedLeaves = [...leaves];
    while (paddedLeaves.length < totalLeaves) paddedLeaves.push(0n);

    let currentLevel = paddedLeaves;
    const layers: bigint[][] = [currentLevel];

    for (let i = 0; i < TREE_DEPTH; i++) {
        const nextLevel: bigint[] = [];
        for (let j = 0; j < currentLevel.length; j += 2) {
            nextLevel.push(poseidonHash([currentLevel[j], currentLevel[j + 1]]));
        }
        currentLevel = nextLevel;
        layers.push(currentLevel);
    }

    return { root: layers[TREE_DEPTH][0], layers };
}

export function getMerkleProof(layers: bigint[][], leafIndex: number) {
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

export async function generateProof(
    secret: bigint,
    tree: ReturnType<typeof buildMerkleTree>,
    leafIndex: number,
    externalNullifier: bigint
) {
    const { pathElements, pathIndices } = getMerkleProof(tree.layers, leafIndex);
    const nullifierHash = poseidonHash([secret, externalNullifier]);

    const input = {
        root: tree.root.toString(),
        nullifierHash: nullifierHash.toString(),
        externalNullifier: externalNullifier.toString(),
        secret: secret.toString(),
        pathElements: pathElements.map((x) => x.toString()),
        pathIndices: pathIndices.map((x) => x.toString()),
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
    return { proof, publicSignals, nullifierHash };
}

export async function generateProofRaw(input: Record<string, string | string[]>) {
    return snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
}

export async function formatProofForContract(proof: any, publicSignals: string[]) {
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const [pA, pB, pC] = JSON.parse(`[${calldata}]`) as [
        [string, string],
        [[string, string], [string, string]],
        [string, string],
        [string, string, string],
    ];

    return { pA, pB, pC };
}
