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
    console.log(`> ${cmd}`);
    execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

run(`circom ${CIRCUITS_DIR}/${CIRCUIT_NAME}.circom --r1cs --wasm --sym -o ${OUT_DIR}/`);

if (!existsSync(resolve(OUT_DIR, PTAU_FILE))) {
    run(`curl -L -o ${OUT_DIR}/${PTAU_FILE} ${PTAU_URL}`);
}

run(`npx snarkjs groth16 setup ${OUT_DIR}/${CIRCUIT_NAME}.r1cs ${OUT_DIR}/${PTAU_FILE} ${OUT_DIR}/${CIRCUIT_NAME}_0000.zkey`);
run(`npx snarkjs zkey contribute ${OUT_DIR}/${CIRCUIT_NAME}_0000.zkey ${OUT_DIR}/${CIRCUIT_NAME}_final.zkey --name="dev contribution" -e="$(date)"`);
run(`npx snarkjs zkey export verificationkey ${OUT_DIR}/${CIRCUIT_NAME}_final.zkey ${OUT_DIR}/verification_key.json`);
run(`npx snarkjs zkey export solidityverifier ${OUT_DIR}/${CIRCUIT_NAME}_final.zkey ${ROOT}/contracts/Groth16Verifier.sol`);

console.log("Done. Artifacts in circuits-artifacts/");
