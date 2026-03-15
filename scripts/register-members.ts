import { network } from "hardhat";
import { buildPoseidon } from "circomlibjs";
import { randomBytes, createCipheriv, pbkdf2Sync } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

const { ethers } = await network.connect();

const TREE_DEPTH = 10;
const KEYS_DIR = resolve(import.meta.dirname, "../keys");

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

function encryptSecret(secret: bigint, password: string) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = pbkdf2Sync(password, salt, 100000, 32, "sha256");
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(Buffer.from(secret.toString())),
        cipher.final(),
    ]);
    return {
        iv: iv.toString("hex"),
        salt: salt.toString("hex"),
        ciphertext: ciphertext.toString("hex"),
        tag: cipher.getAuthTag().toString("hex"),
    };
}

function generateSecret(): bigint {
    return BigInt("0x" + randomBytes(31).toString("hex"));
}

async function main() {
    await initPoseidon();

    const members = [
        { id: "alice", password: "alice-password-123" },
        { id: "bob", password: "bob-password-456" },
        { id: "charlie", password: "charlie-password-789" },
    ];

    console.log(`Registering ${members.length} members...\n`);
    mkdirSync(KEYS_DIR, { recursive: true });

    const commitments: bigint[] = [];

    for (const member of members) {
        const secret = generateSecret();
        const commitment = poseidonHash([secret]);
        commitments.push(commitment);

        writeFileSync(
            resolve(KEYS_DIR, `${member.id}.json`),
            JSON.stringify(
                { memberId: member.id, commitment: commitment.toString(), encrypted: encryptSecret(secret, member.password) },
                null,
                2
            )
        );

        console.log(`  ${member.id}: ${commitment.toString().slice(0, 20)}...  →  keys/${member.id}.json`);
    }

    const tree = buildMerkleTree(commitments);
    console.log(`\nMerkle root: ${tree.root}`);

    const registryAddress = process.env.REGISTRY_ADDRESS;
    if (registryAddress) {
        const registry = await ethers.getContractAt("WhistleblowerRegistry", registryAddress);
        const tx = await registry.addRoot(tree.root);
        await tx.wait();
        console.log("Root registered on-chain.");
    } else {
        console.log("REGISTRY_ADDRESS not set — skipping on-chain registration.");
    }

    writeFileSync(
        resolve(KEYS_DIR, "manifest.json"),
        JSON.stringify(
            { commitments: commitments.map((c) => c.toString()), root: tree.root.toString(), memberCount: members.length, treeDepth: TREE_DEPTH },
            null,
            2
        )
    );

    console.log("Manifest saved to keys/manifest.json");
}

main().catch(console.error);
