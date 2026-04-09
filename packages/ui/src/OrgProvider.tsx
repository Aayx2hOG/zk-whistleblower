"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPublicClient, http } from "viem";
import { hardhat, sepolia } from "viem/chains";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@zk-whistleblower/shared/src/contracts";

interface OrgContextValue {
  selectedOrgId: number;
  knownOrgIds: number[];
  setSelectedOrgId: (orgId: number) => void;
  rememberOrgId: (orgId: number) => void;
}

const ORG_STORAGE_SCOPE = `${(process.env.NEXT_PUBLIC_NETWORK_NAME ?? "local").toLowerCase()}:${(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000").toLowerCase()}`;
const ORG_SELECTED_KEY = `zk-whistleblower:selected-org-id:${ORG_STORAGE_SCOPE}`;
const ORG_KNOWN_KEY = `zk-whistleblower:known-org-ids:${ORG_STORAGE_SCOPE}`;

const APP_NETWORK = process.env.NEXT_PUBLIC_NETWORK_NAME?.toLowerCase();
const APP_CHAIN = APP_NETWORK === "sepolia" ? sepolia : hardhat;
const APP_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL?.trim() ||
  (APP_NETWORK === "sepolia" ? "https://rpc.sepolia.org" : "http://127.0.0.1:8545");
const appPublicClient = createPublicClient({
  chain: APP_CHAIN,
  transport: http(APP_RPC_URL),
});

const OrgContext = createContext<OrgContextValue | null>(null);

function sanitizeOrgId(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function normalizeOrgIdList(ids: number[]): number[] {
  const normalized = Array.from(
    new Set(ids.map((id) => sanitizeOrgId(Number(id))).filter((id) => id >= 0))
  );
  if (!normalized.includes(0)) normalized.push(0);
  normalized.sort((a, b) => a - b);
  return normalized;
}

async function filterExistingOrgIds(ids: number[]): Promise<number[]> {
  const normalized = normalizeOrgIdList(ids);
  const candidates = normalized.filter((id) => id !== 0);
  if (candidates.length === 0) return normalized;

  const checks = await Promise.allSettled(
    candidates.map((orgId) =>
      appPublicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "organizationExists",
        args: [BigInt(orgId)],
      })
    )
  );

  const hasSuccessfulCheck = checks.some((result) => result.status === "fulfilled");
  if (!hasSuccessfulCheck) {
    // Keep cached list if RPC is unavailable.
    return normalized;
  }

  const existing = checks
    .map((result, index) => {
      if (result.status !== "fulfilled") return null;
      return result.value ? candidates[index] : null;
    })
    .filter((id): id is number => id !== null);

  return normalizeOrgIdList([0, ...existing]);
}

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [selectedOrgId, setSelectedOrgIdState] = useState(0);
  const [knownOrgIds, setKnownOrgIds] = useState<number[]>([0]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedSelected = window.localStorage.getItem(ORG_SELECTED_KEY);
    const selected = sanitizeOrgId(Number(storedSelected ?? "0"));

    const rawKnown = window.localStorage.getItem(ORG_KNOWN_KEY);
    let parsedKnown: number[] = [0];
    if (rawKnown) {
      try {
        const parsed = JSON.parse(rawKnown) as number[];
        if (Array.isArray(parsed)) {
          parsedKnown = normalizeOrgIdList(parsed);
        }
      } catch {
        parsedKnown = [0];
      }
    }

    if (!parsedKnown.includes(selected)) parsedKnown.push(selected);
    parsedKnown = normalizeOrgIdList(parsedKnown);

    let canceled = false;
    void (async () => {
      const validatedKnown = await filterExistingOrgIds(parsedKnown);
      if (canceled) return;

      const validatedSelected = validatedKnown.includes(selected) ? selected : 0;
      setSelectedOrgIdState(validatedSelected);
      setKnownOrgIds(validatedKnown);
      window.localStorage.setItem(ORG_SELECTED_KEY, String(validatedSelected));
      window.localStorage.setItem(ORG_KNOWN_KEY, JSON.stringify(validatedKnown));
    })();

    return () => {
      canceled = true;
    };
  }, []);

  const rememberOrgId = useCallback((orgId: number) => {
    const normalized = sanitizeOrgId(orgId);
    setKnownOrgIds((prev) => {
      if (prev.includes(normalized)) return prev;
      const next = [...prev, normalized].sort((a, b) => a - b);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ORG_KNOWN_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const setSelectedOrgId = useCallback(
    (orgId: number) => {
      const normalized = sanitizeOrgId(orgId);
      setSelectedOrgIdState(normalized);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ORG_SELECTED_KEY, String(normalized));
      }
      rememberOrgId(normalized);
    },
    [rememberOrgId]
  );

  const value = useMemo<OrgContextValue>(
    () => ({ selectedOrgId, knownOrgIds, setSelectedOrgId, rememberOrgId }),
    [selectedOrgId, knownOrgIds, setSelectedOrgId, rememberOrgId]
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) {
    throw new Error("useOrg must be used within OrgProvider");
  }
  return ctx;
}
