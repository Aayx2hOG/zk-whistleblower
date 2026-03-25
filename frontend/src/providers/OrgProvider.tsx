"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface OrgContextValue {
  selectedOrgId: number;
  knownOrgIds: number[];
  setSelectedOrgId: (orgId: number) => void;
  rememberOrgId: (orgId: number) => void;
}

const ORG_SELECTED_KEY = "zk-whistleblower:selected-org-id";
const ORG_KNOWN_KEY = "zk-whistleblower:known-org-ids";

const OrgContext = createContext<OrgContextValue | null>(null);

function sanitizeOrgId(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
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
          parsedKnown = Array.from(
            new Set(parsed.map((id) => sanitizeOrgId(Number(id))).filter((id) => id >= 0))
          );
          if (!parsedKnown.includes(0)) parsedKnown.push(0);
          parsedKnown.sort((a, b) => a - b);
        }
      } catch {
        parsedKnown = [0];
      }
    }

    if (!parsedKnown.includes(selected)) parsedKnown.push(selected);
    parsedKnown.sort((a, b) => a - b);

    setSelectedOrgIdState(selected);
    setKnownOrgIds(parsedKnown);
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
