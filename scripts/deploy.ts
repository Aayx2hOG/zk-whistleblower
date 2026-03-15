import { network } from "hardhat";

const { ethers } = await network.connect();

async function main() {
    const verifier = await ethers.deployContract("Groth16Verifier");
    const verifierAddr = await verifier.getAddress();
    console.log("Groth16Verifier:", verifierAddr);

    const registry = await ethers.deployContract("WhistleblowerRegistry", [verifierAddr]);
    const registryAddr = await registry.getAddress();
    console.log("WhistleblowerRegistry:", registryAddr);
}

main().catch(console.error);
