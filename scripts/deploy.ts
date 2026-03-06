import { network } from "hardhat";
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";
import { resolve } from "path";

const { ethers } = await network.connect();

const ARTIFACTS_DIR = resolve(import.meta.dirname, "../circuits-artifacts");
const WASM_PATH = resolve(ARTIFACTS_DIR, "membership_js/membership.wasm");
const ZKEY_PATH = resolve(ARTIFACTS_DIR, "membership_final.zkey");
const TREE_DEPTH = 10;

let poseidon: any;
let F: any;

async function initPoseidon() {
    poseidon = await buildPoseidon();
    F = poseidon.F;
}

function poseidonHash(inputs: bigint[]): bigint {
    const hash = poseidon(inputs.map((x: bigint) => F.e(x)));
    return F.toObject(hash);
}

function buildMerkleTree(leaves: bigint[]) {
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

function getMerkleProof(layers: bigint[][], leafIndex: number) {
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

async function generateProof(
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

function formatProofForContract(proof: any) {
    return {
        pA: [proof.pi_a[0], proof.pi_a[1]] as [string, string],
        pB: [
            [proof.pi_b[0][1], proof.pi_b[0][0]],
            [proof.pi_b[1][1], proof.pi_b[1][0]],
        ] as [[string, string], [string, string]],
        pC: [proof.pi_c[0], proof.pi_c[1]] as [string, string],
    };
}

async function main() {
    await initPoseidon();

    console.log("Deploying Groth16Verifier...");
    const verifier = await ethers.deployContract("Groth16Verifier");
    const verifierAddr = await verifier.getAddress();
    console.log("Groth16Verifier deployed at:", verifierAddr);

    console.log("Deploying WhistleblowerRegistry...");
    const registry = await ethers.deployContract("WhistleblowerRegistry", [verifierAddr]);
    const registryAddr = await registry.getAddress();
    console.log("WhistleblowerRegistry deployed at:", registryAddr);

    const secrets = [123456789n, 987654321n, 555555555n];
    const commitments = secrets.map((s) => poseidonHash([s]));
    const tree = buildMerkleTree(commitments);

    console.log("\nAdding membership root...");
    await registry.addRoot(tree.root);
    console.log("Root added:", tree.root.toString());

    const externalNullifier = 1n;
    console.log("\nMember 0 generating proof...");
    const { proof, nullifierHash } = await generateProof(secrets[0], tree, 0, externalNullifier);
    const { pA, pB, pC } = formatProofForContract(proof);

    console.log("Submitting report...");
    const tx = await registry.submitReport(
        pA, pB, pC,
        tree.root, nullifierHash, externalNullifier,
        "QmDemoEncryptedEvidence123", 0
    );
    await tx.wait();
    console.log("Report submitted successfully!");

    console.log("\nAttempting duplicate submission (should fail)...");
    try {
        await registry.submitReport(
            pA, pB, pC,
            tree.root, nullifierHash, externalNullifier,
            "QmDuplicate", 0
        );
    } catch (e: any) {
        console.log("Correctly rejected:", e.message.includes("Nullifier already used") ? "Nullifier already used" : e.message);
    }

    const count = await registry.getReportCount();
    console.log(`\nTotal reports: ${count}`);
    for (let i = 0; i < count; i++) {
        const r = await registry.getReport(i);
        console.log(`Report ${i}: CID=${r.encryptedCID}, category=${r.category}, timestamp=${r.timestamp}`);
    }

    console.log("\n=== Demo complete ===");
    console.log("Verifier:", verifierAddr);
    console.log("Registry:", registryAddr);
}

main().catch(console.error);
