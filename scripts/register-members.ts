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

// AES-256-GCM encryption using password-derived key
function encryptSecret(secret: bigint, password: string) {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = pbkdf2Sync(password, salt, 100000, 32, "sha256");

    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const secretBytes = Buffer.from(secret.toString());
    const ciphertext = Buffer.concat([cipher.update(secretBytes), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        iv: iv.toString("hex"),
        salt: salt.toString("hex"),
        ciphertext: ciphertext.toString("hex"),
        tag: tag.toString("hex"),
    };
}

// generates a random 31-byte secret (fits inside BN128 field)
function generateSecret(): bigint {
    const bytes = randomBytes(31);
    return BigInt("0x" + bytes.toString("hex"));
}

async function main() {
    await initPoseidon();

    // define your organization members here
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

        const encrypted = encryptSecret(secret, member.password);

        const keyFile = {
            memberId: member.id,
            commitment: commitment.toString(),
            encrypted,
        };

        const filePath = resolve(KEYS_DIR, `${member.id}.json`);
        writeFileSync(filePath, JSON.stringify(keyFile, null, 2));

        console.log(`  ${member.id}:`);
        console.log(`    commitment: ${commitment.toString().slice(0, 20)}...`);
        console.log(`    key file:   keys/${member.id}.json`);
    }

    // build Merkle tree
    console.log("\nBuilding Merkle tree...");
    const tree = buildMerkleTree(commitments);
    console.log(`Root: ${tree.root}`);

    // register root on-chain
    const registryAddress = process.env.REGISTRY_ADDRESS;
    if (registryAddress) {
        const registry = await ethers.getContractAt("WhistleblowerRegistry", registryAddress);
        console.log("\nRegistering root on-chain...");
        const tx = await registry.addRoot(tree.root);
        await tx.wait();
        console.log("Root registered!");
    } else {
        console.log("\nNo REGISTRY_ADDRESS set — skipping on-chain registration.");
        console.log("Set REGISTRY_ADDRESS env var to auto-register the root.");
    }

    // save a commitments manifest for reference
    const manifest = {
        commitments: commitments.map((c) => c.toString()),
        root: tree.root.toString(),
        memberCount: members.length,
        treeDepth: TREE_DEPTH,
    };
    writeFileSync(resolve(KEYS_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log("\nManifest saved to keys/manifest.json");

    console.log("\n=== Registration complete ===");
    console.log(`Give each member their key file (keys/<id>.json).`);
    console.log(`They decrypt it with their password to get their secret.`);
}

main().catch(console.error);
