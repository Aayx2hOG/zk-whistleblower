export interface RelayResponse {
    txHash: `0x${string}`;
    settled?: boolean;
    receiptStatus?: "success" | "reverted";
    blockNumber?: string;
}

type RelayRequest =
    | { action: "addRoot"; payload: { root: string } }
    | { action: "addRootForOrg"; payload: { orgId: string; root: string } }
    | { action: "revokeRoot"; payload: { root: string } }
    | { action: "revokeRootForOrg"; payload: { orgId: string; root: string } }
    | { action: "createOrganization"; payload: { orgId: string; name: string } }
    | { action: "setOrganizationActive"; payload: { orgId: string; active: boolean } }
    | { action: "grantOrgAdmin"; payload: { orgId: string; account: string } }
    | { action: "revokeOrgAdmin"; payload: { orgId: string; account: string } }
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
    }
    | {
        action: "submitReportForOrg";
        payload: {
            orgId: string;
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
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    const apiKey = process.env.NEXT_PUBLIC_RELAY_API_KEY;
    if (apiKey) {
        headers["x-api-key"] = apiKey;
    }

    const res = await fetch("/api/relay", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as {
        txHash?: `0x${string}`;
        settled?: boolean;
        receiptStatus?: "success" | "reverted";
        blockNumber?: string;
        error?: string;
    };

    if (!res.ok || !data.txHash) {
        throw new Error(data.error || `Relayer failed (${res.status})`);
    }

    return {
        txHash: data.txHash,
        settled: data.settled,
        receiptStatus: data.receiptStatus,
        blockNumber: data.blockNumber,
    };
}

export function relayAddRoot(root: string) {
    return relayTx({ action: "addRoot", payload: { root } });
}

export function relayAddRootForOrg(orgId: number, root: string) {
    return relayTx({ action: "addRootForOrg", payload: { orgId: String(orgId), root } });
}

export function relayRevokeRoot(root: string) {
    return relayTx({ action: "revokeRoot", payload: { root } });
}

export function relayRevokeRootForOrg(orgId: number, root: string) {
    return relayTx({ action: "revokeRootForOrg", payload: { orgId: String(orgId), root } });
}

export function relayCreateOrganization(orgId: number, name: string) {
    return relayTx({ action: "createOrganization", payload: { orgId: String(orgId), name } });
}

export function relaySetOrganizationActive(orgId: number, active: boolean) {
    return relayTx({ action: "setOrganizationActive", payload: { orgId: String(orgId), active } });
}

export function relayGrantOrgAdmin(orgId: number, account: string) {
    return relayTx({ action: "grantOrgAdmin", payload: { orgId: String(orgId), account } });
}

export function relayRevokeOrgAdmin(orgId: number, account: string) {
    return relayTx({ action: "revokeOrgAdmin", payload: { orgId: String(orgId), account } });
}

export function relaySubmitReport(
    payload: Extract<RelayRequest, { action: "submitReport" }>['payload']
) {
    return relayTx({ action: "submitReport", payload });
}

export function relaySubmitReportForOrg(
    payload: Extract<RelayRequest, { action: "submitReportForOrg" }>['payload']
) {
    return relayTx({ action: "submitReportForOrg", payload });
}
