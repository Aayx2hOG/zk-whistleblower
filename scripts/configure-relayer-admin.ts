import { network } from "hardhat";

function parseAddress(value: string | undefined, field: string): `0x${string}` {
    if (!value) throw new Error(`Missing ${field}`);
    const normalized = value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(normalized)) {
        throw new Error(`${field} must be a valid 20-byte address`);
    }
    return normalized as `0x${string}`;
}

function parseOrgIds(value: string | undefined): bigint[] {
    if (!value || !value.trim()) return [0n];
    const parsed = value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => BigInt(v));

    if (!parsed.includes(0n)) parsed.unshift(0n);
    return Array.from(new Set(parsed));
}

async function main() {
    const { ethers } = (await network.connect()) as any;

    const registryAddress = parseAddress(process.env.REGISTRY_ADDRESS, "REGISTRY_ADDRESS");
    const relayerAddress = parseAddress(process.env.RELAYER_ADDRESS, "RELAYER_ADDRESS");
    const orgIds = parseOrgIds(process.env.RELAYER_ORG_IDS);

    const registry = await ethers.getContractAt("WhistleblowerRegistry", registryAddress);
    const superAdminRole = await registry.SUPER_ADMIN_ROLE();
    const signer = await ethers.provider.getSigner();
    const signerAddress = await signer.getAddress();

    const signerIsSuperAdmin = await registry.hasRole(superAdminRole, signerAddress);
    if (!signerIsSuperAdmin) {
        throw new Error(`Signer ${signerAddress} is not SUPER_ADMIN_ROLE on ${registryAddress}`);
    }

    const relayerIsSuperAdmin = await registry.hasRole(superAdminRole, relayerAddress);
    if (!relayerIsSuperAdmin) {
        const tx = await registry.grantRole(superAdminRole, relayerAddress);
        await tx.wait();
        console.log(`Granted SUPER_ADMIN_ROLE to ${relayerAddress}: ${tx.hash}`);
    } else {
        console.log(`Relayer already has SUPER_ADMIN_ROLE: ${relayerAddress}`);
    }

    for (const orgId of orgIds) {
        const exists = await registry.organizationExists(orgId);
        if (!exists) {
            console.log(`Skipped org ${orgId.toString()} (does not exist)`);
            continue;
        }

        const isAdmin = await registry.isOrgAdmin(orgId, relayerAddress);
        if (isAdmin) {
            console.log(`Relayer already org admin for ${orgId.toString()}`);
            continue;
        }

        const tx = await registry.grantOrgAdmin(orgId, relayerAddress);
        await tx.wait();
        console.log(`Granted org admin for org ${orgId.toString()} to ${relayerAddress}: ${tx.hash}`);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
