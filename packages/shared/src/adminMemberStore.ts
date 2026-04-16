/**
 * localStorage-backed cumulative member store for the Admin panel.
 *
 * Each stored member represents a previously generated secret whose commitment
 * was included in a Merkle root. The store is scoped by org + network + registry
 * so separate deployments / networks never collide.
 */

import type { EncryptedSecret } from "./secretGen";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface StoredMember {
  memberId: string;
  commitment: string;
  encrypted: EncryptedSecret;
  /** ISO-8601 timestamp of when this member was first generated */
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Scoping key – mirrors OrgProvider.tsx:15-17                        */
/* ------------------------------------------------------------------ */

const STORAGE_SCOPE =
  `${(process.env.NEXT_PUBLIC_NETWORK_NAME ?? "local").toLowerCase()}:${(
    process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ??
    "0x0000000000000000000000000000000000000000"
  ).toLowerCase()}`;

function storageKey(orgId: number): string {
  return `zk-whistleblower:admin-members:${STORAGE_SCOPE}:${orgId}`;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function canUseStorage(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Return all previously stored members for this org (sorted by creation time). */
export function getStoredMembers(orgId: number): StoredMember[] {
  if (!canUseStorage()) return [];

  const raw = window.localStorage.getItem(storageKey(orgId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as StoredMember[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((m) => m && m.memberId && m.commitment && m.encrypted)
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  } catch {
    return [];
  }
}

/** Persist the full member list. */
function writeStoredMembers(orgId: number, members: StoredMember[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(storageKey(orgId), JSON.stringify(members));
}

/**
 * Append new members to the stored list, skipping any whose memberId already
 * exists (duplicate rejection). Returns the merged cumulative list.
 */
export function appendMembers(
  orgId: number,
  newMembers: StoredMember[]
): StoredMember[] {
  const existing = getStoredMembers(orgId);
  const existingIds = new Set(existing.map((m) => m.memberId.toLowerCase()));

  const toAdd = newMembers.filter(
    (m) => !existingIds.has(m.memberId.toLowerCase())
  );

  const merged = [...existing, ...toAdd];
  writeStoredMembers(orgId, merged);
  return merged;
}

/** Remove a single member by ID (e.g. admin wants to drop someone). */
export function removeStoredMember(orgId: number, memberId: string): void {
  const next = getStoredMembers(orgId).filter(
    (m) => m.memberId.toLowerCase() !== memberId.toLowerCase()
  );
  writeStoredMembers(orgId, next);
}

/** Wipe all members for an org. */
export function clearStoredMembers(orgId: number): void {
  writeStoredMembers(orgId, []);
}
