export interface DemoMember {
  id: string;
  secret: string;
  commitment: string;
  joinedAt: string;
}

const DEMO_MEMBERS_KEY = "zk-whistleblower:demo-members";

function demoMembersKey(orgId: number): string {
  return `${DEMO_MEMBERS_KEY}:${orgId}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getDemoMembers(orgId = 0): DemoMember[] {
  if (!canUseStorage()) return [];

  const raw = window.localStorage.getItem(demoMembersKey(orgId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as DemoMember[];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((m) => m && m.id && m.secret && m.commitment)
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
  } catch {
    return [];
  }
}

function writeDemoMembers(orgId: number, members: DemoMember[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(demoMembersKey(orgId), JSON.stringify(members));
}

export function addDemoMember(orgId: number, newMember: Omit<DemoMember, "joinedAt">): DemoMember {
  const members = getDemoMembers(orgId);

  const duplicateId = members.some((m) => m.id.toLowerCase() === newMember.id.toLowerCase());
  if (duplicateId) {
    throw new Error("Member ID already exists in demo org list.");
  }

  const duplicateCommitment = members.some((m) => m.commitment === newMember.commitment);
  if (duplicateCommitment) {
    throw new Error("This commitment is already in the demo org list.");
  }

  const member: DemoMember = {
    ...newMember,
    joinedAt: new Date().toISOString(),
  };

  members.push(member);
  writeDemoMembers(orgId, members);
  return member;
}

export function removeDemoMember(orgId: number, id: string): void {
  const next = getDemoMembers(orgId).filter((m) => m.id !== id);
  writeDemoMembers(orgId, next);
}

export function clearDemoMembers(orgId: number): void {
  writeDemoMembers(orgId, []);
}

export function getDemoCommitments(orgId = 0): string[] {
  return getDemoMembers(orgId).map((m) => m.commitment);
}

export function findDemoMemberById(orgId: number, id: string): DemoMember | undefined {
  return getDemoMembers(orgId).find((m) => m.id === id);
}
