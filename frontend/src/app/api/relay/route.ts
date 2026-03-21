import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";

export const runtime = "nodejs";

type RelayAction = "addRoot" | "revokeRoot" | "submitReport";

function asBigInt(value: unknown, field: string): bigint {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${field} must be a non-empty string`);
    }
    return BigInt(value);
}

function readConfig() {
    const rpcUrl = process.env.RELAYER_RPC_URL || process.env.SEPOLIA_RPC_URL;
    const privateKey = process.env.RELAYER_PRIVATE_KEY || process.env.SEPOLIA_PRIVATE_KEY;

    if (!rpcUrl) throw new Error("Missing RELAYER_RPC_URL (or SEPOLIA_RPC_URL)");
    if (!privateKey) throw new Error("Missing RELAYER_PRIVATE_KEY (or SEPOLIA_PRIVATE_KEY)");

    const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    return { rpcUrl, privateKey: normalizedKey as `0x${string}` };
}

export async function POST(req: NextRequest) {
    try {
        const { rpcUrl, privateKey } = readConfig();
        const body = (await req.json()) as {
            action?: RelayAction;
            payload?: Record<string, unknown>;
        };

        if (!body?.action || !body.payload) {
            return NextResponse.json({ error: "Invalid relayer payload" }, { status: 400 });
        }

        const account = privateKeyToAccount(privateKey);
        const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
        const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

        let txHash: `0x${string}`;

        if (body.action === "addRoot") {
            txHash = await walletClient.writeContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "addRoot",
                args: [asBigInt(body.payload.root, "root")],
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

            txHash = await walletClient.writeContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "submitReport",
                args: [
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
                ],
                account,
            });
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
