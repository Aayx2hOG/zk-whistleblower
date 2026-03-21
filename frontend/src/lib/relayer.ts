export interface RelayResponse {
    txHash: `0x${string}`;
}

type RelayRequest =
    | { action: "addRoot"; payload: { root: string } }
    | { action: "revokeRoot"; payload: { root: string } }
    | {
        action: "submitReport";
        payload: {
            pA: [string, string];
            pB: [[string, string], [string, string]];
            pC: [string, string];
            root: string;
            nullifierHash: string;
            externalNullifier: string;
            encryptedCIDHex: `0x${string}`;
            category: number;
        };
    };

async function relayTx(body: RelayRequest): Promise<RelayResponse> {
    const res = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as {
        txHash?: `0x${string}`;
        error?: string;
    };

    if (!res.ok || !data.txHash) {
        throw new Error(data.error || `Relayer failed (${res.status})`);
    }

    return { txHash: data.txHash };
}

export function relayAddRoot(root: string) {
    return relayTx({ action: "addRoot", payload: { root } });
}

export function relayRevokeRoot(root: string) {
    return relayTx({ action: "revokeRoot", payload: { root } });
}

export function relaySubmitReport(
    payload: Extract<RelayRequest, { action: "submitReport" }>['payload']
) {
    return relayTx({ action: "submitReport", payload });
}
