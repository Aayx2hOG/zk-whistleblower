import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat, sepolia } from "viem/chains";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@zk-whistleblower/shared/src/contracts";

export const runtime = "nodejs";

type RelayAction =
    | "addRoot"
    | "addRootForOrg"
    | "revokeRoot"
    | "revokeRootForOrg"
    | "createOrganization"
    | "setOrganizationActive"
    | "grantOrgAdmin"
    | "revokeOrgAdmin"
    | "submitReport"
    | "submitReportForOrg";

function asBigInt(value: unknown, field: string): bigint {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${field} must be a non-empty string`);
    }
    return BigInt(value);
}

function asAddress(value: unknown, field: string): `0x${string}` {
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
        throw new Error(`${field} must be a valid 20-byte hex address`);
    }
    return value as `0x${string}`;
}

function readConfig() {
    const rpcUrl = process.env.RELAYER_RPC_URL || process.env.SEPOLIA_RPC_URL;
    const privateKey = process.env.RELAYER_PRIVATE_KEY || process.env.SEPOLIA_PRIVATE_KEY;

    if (!rpcUrl) throw new Error("Missing RELAYER_RPC_URL");
    if (!privateKey) throw new Error("Missing RELAYER_PRIVATE_KEY");

    const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    return { rpcUrl, privateKey: normalizedKey as `0x${string}` };
}

function readChain() {
    const chainIdRaw = process.env.RELAYER_CHAIN_ID?.trim();
    const networkRaw = process.env.NEXT_PUBLIC_NETWORK_NAME?.trim().toLowerCase();

    if (chainIdRaw) {
        const chainId = Number(chainIdRaw);
        if (chainId === hardhat.id) return hardhat;
        if (chainId === sepolia.id) return sepolia;
        throw new Error(`Unsupported RELAYER_CHAIN_ID: ${chainIdRaw}. Use ${hardhat.id} (hardhat) or ${sepolia.id} (sepolia).`);
    }

    if (networkRaw === "sepolia") return sepolia;
    return hardhat;
}

async function ensureOrganizationApisAvailable(publicClient: ReturnType<typeof createPublicClient>) {
    try {
        await publicClient.readContract({
            address: REGISTRY_ADDRESS,
            abi: REGISTRY_ABI,
            functionName: "organizationExists",
            args: [0n],
        });
    } catch {
        throw new Error(
            "This deployed registry does not support organization APIs. Redeploy the latest WhistleblowerRegistry and update NEXT_PUBLIC_REGISTRY_ADDRESS."
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        // --- API key authentication ---
        const expectedKey = process.env.RELAY_API_KEY;
        if (expectedKey) {
            const providedKey = req.headers.get("x-api-key");
            if (!providedKey || providedKey !== expectedKey) {
                return NextResponse.json(
                    { error: "Unauthorized — invalid or missing API key" },
                    { status: 401 }
                );
            }
        }

        const { rpcUrl, privateKey } = readConfig();
        const body = (await req.json()) as {
            action?: RelayAction;
            payload?: Record<string, unknown>;
        };

        if (!body?.action || !body.payload) {
            return NextResponse.json({ error: "Invalid relayer payload" }, { status: 400 });
        }

        const account = privateKeyToAccount(privateKey);
        const chain = readChain();
        const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
        const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

        let txHash: `0x${string}`;

        if (body.action === "addRoot") {
            txHash = await walletClient.writeContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "addRoot",
                args: [asBigInt(body.payload.root, "root")],
                account,
            });
        } else if (body.action === "addRootForOrg") {
            await ensureOrganizationApisAvailable(publicClient);
            txHash = await walletClient.writeContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "addRootForOrg",
                args: [
                    asBigInt(body.payload.orgId, "orgId"),
                    asBigInt(body.payload.root, "root"),
                ],
                account,
            });
        } else if (body.action === "revokeRoot") {
            txHash = await walletClient.writeContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "revokeRoot",
                args: [asBigInt(body.payload.root, "root")],
                account,
            });
        } else if (body.action === "revokeRootForOrg") {
            await ensureOrganizationApisAvailable(publicClient);
            txHash = await walletClient.writeContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "revokeRootForOrg",
                args: [
                    asBigInt(body.payload.orgId, "orgId"),
                    asBigInt(body.payload.root, "root"),
                ],
                account,
            });
        } else if (body.action === "createOrganization") {
            await ensureOrganizationApisAvailable(publicClient);
            const name = body.payload.name;
            if (typeof name !== "string" || !name.trim()) {
                return NextResponse.json({ error: "Invalid organization name" }, { status: 400 });
            }

            const orgId = asBigInt(body.payload.orgId, "orgId");
            const exists = await publicClient.readContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "organizationExists",
                args: [orgId],
            });
            if (exists) {
                return NextResponse.json(
                    { error: `Organization ${orgId.toString()} already exists` },
                    { status: 409 }
                );
            }

            txHash = await walletClient.writeContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "createOrganization",
                args: [orgId, name.trim()],
                account,
            });
        } else if (body.action === "setOrganizationActive") {
            await ensureOrganizationApisAvailable(publicClient);
            const active = body.payload.active;
            if (typeof active !== "boolean") {
                return NextResponse.json({ error: "Invalid active flag" }, { status: 400 });
            }
            txHash = await walletClient.writeContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "setOrganizationActive",
                args: [asBigInt(body.payload.orgId, "orgId"), active],
                account,
            });
        } else if (body.action === "grantOrgAdmin") {
            await ensureOrganizationApisAvailable(publicClient);
            txHash = await walletClient.writeContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "grantOrgAdmin",
                args: [
                    asBigInt(body.payload.orgId, "orgId"),
                    asAddress(body.payload.account, "account"),
                ],
                account,
            });
        } else if (body.action === "revokeOrgAdmin") {
            await ensureOrganizationApisAvailable(publicClient);
            txHash = await walletClient.writeContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "revokeOrgAdmin",
                args: [
                    asBigInt(body.payload.orgId, "orgId"),
                    asAddress(body.payload.account, "account"),
                ],
                account,
            });
        } else {
            const pA = body.payload.pA as [string, string];
            const pB = body.payload.pB as [[string, string], [string, string]];
            const pC = body.payload.pC as [string, string];
            const category = body.payload.category;
            const encryptedCIDHex = body.payload.encryptedCIDHex;

            if (!Array.isArray(pA) || pA.length !== 2) {
                return NextResponse.json({ error: "Invalid pA" }, { status: 400 });
            }
            if (!Array.isArray(pB) || pB.length !== 2 || !Array.isArray(pB[0]) || !Array.isArray(pB[1])) {
                return NextResponse.json({ error: "Invalid pB" }, { status: 400 });
            }
            if (!Array.isArray(pC) || pC.length !== 2) {
                return NextResponse.json({ error: "Invalid pC" }, { status: 400 });
            }
            if (typeof category !== "number" || category < 0 || category > 3) {
                return NextResponse.json({ error: "Invalid category" }, { status: 400 });
            }
            if (typeof encryptedCIDHex !== "string" || !/^0x[0-9a-fA-F]*$/.test(encryptedCIDHex)) {
                return NextResponse.json({ error: "Invalid encryptedCIDHex" }, { status: 400 });
            }

            const commonArgs = [
                [asBigInt(pA[0], "pA[0]"), asBigInt(pA[1], "pA[1]")],
                [
                    [asBigInt(pB[0][0], "pB[0][0]"), asBigInt(pB[0][1], "pB[0][1]")],
                    [asBigInt(pB[1][0], "pB[1][0]"), asBigInt(pB[1][1], "pB[1][1]")],
                ],
                [asBigInt(pC[0], "pC[0]"), asBigInt(pC[1], "pC[1]")],
                asBigInt(body.payload.root, "root"),
                asBigInt(body.payload.nullifierHash, "nullifierHash"),
                asBigInt(body.payload.externalNullifier, "externalNullifier"),
                encryptedCIDHex as `0x${string}`,
                category,
            ] as const;

            if (body.action === "submitReportForOrg") {
                await ensureOrganizationApisAvailable(publicClient);
                txHash = await walletClient.writeContract({
                    address: REGISTRY_ADDRESS,
                    abi: REGISTRY_ABI,
                    functionName: "submitReportForOrg",
                    args: [asBigInt(body.payload.orgId, "orgId"), ...commonArgs],
                    account,
                });
            } else {
                txHash = await walletClient.writeContract({
                    address: REGISTRY_ADDRESS,
                    abi: REGISTRY_ABI,
                    functionName: "submitReport",
                    args: commonArgs,
                    account,
                });
            }
        }

        const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            timeout: 120_000,
        });

        if (receipt.status !== "success") {
            return NextResponse.json(
                { error: "Transaction reverted", txHash, receiptStatus: receipt.status },
                { status: 500 }
            );
        }

        return NextResponse.json({
            txHash,
            receiptStatus: receipt.status,
            blockNumber: receipt.blockNumber.toString(),
            settled: true,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Relayer failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
