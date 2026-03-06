// Circuit compilation and trusted setup script
// Run: npx tsx scripts/compile-circuit.ts

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const CIRCUITS_DIR = resolve(ROOT, "circuits");
const OUT_DIR = resolve(ROOT, "circuits-artifacts");
const CIRCUIT_NAME = "membership";
const PTAU_FILE = "pot14_final.ptau";
const PTAU_URL = "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau";

function run(cmd: string) {
    console.log(`\n> ${cmd}`);
    execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// 1. Compile circuit
console.log("\n=== Compiling circuit ===");
run(`circom ${CIRCUITS_DIR}/${CIRCUIT_NAME}.circom --r1cs --wasm --sym -o ${OUT_DIR}/`);

// 2. Download ptau if needed
if (!existsSync(resolve(OUT_DIR, PTAU_FILE))) {
    console.log("\n=== Downloading Powers of Tau ===");
    run(`curl -L -o ${OUT_DIR}/${PTAU_FILE} ${PTAU_URL}`);
} else {
    console.log("\n=== Powers of Tau already downloaded ===");
}

// 3. Groth16 setup
console.log("\n=== Running Groth16 setup ===");
run(`npx snarkjs groth16 setup ${OUT_DIR}/${CIRCUIT_NAME}.r1cs ${OUT_DIR}/${PTAU_FILE} ${OUT_DIR}/${CIRCUIT_NAME}_0000.zkey`);

// 4. Contribute randomness
console.log("\n=== Contributing to ceremony ===");
run(`npx snarkjs zkey contribute ${OUT_DIR}/${CIRCUIT_NAME}_0000.zkey ${OUT_DIR}/${CIRCUIT_NAME}_final.zkey --name="dev contribution" -e="$(date)"`);

// 5. Export verification key
console.log("\n=== Exporting verification key ===");
run(`npx snarkjs zkey export verificationkey ${OUT_DIR}/${CIRCUIT_NAME}_final.zkey ${OUT_DIR}/verification_key.json`);

// 6. Export Solidity verifier
console.log("\n=== Exporting Solidity verifier ===");
run(`npx snarkjs zkey export solidityverifier ${OUT_DIR}/${CIRCUIT_NAME}_final.zkey ${ROOT}/contracts/Groth16Verifier.sol`);

console.log("\n=== Done! Artifacts in circuits-artifacts/ ===");
