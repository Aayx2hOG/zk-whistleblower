export interface DemoMember {
  id: string;
  secret: string;
  commitment: string;
  joinedAt: string;
}

const DEMO_MEMBERS_KEY = "zk-whistleblower:demo-members";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getDemoMembers(): DemoMember[] {
  if (!canUseStorage()) return [];

  const raw = window.localStorage.getItem(DEMO_MEMBERS_KEY);
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

function writeDemoMembers(members: DemoMember[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(DEMO_MEMBERS_KEY, JSON.stringify(members));
}

export function addDemoMember(newMember: Omit<DemoMember, "joinedAt">): DemoMember {
  const members = getDemoMembers();

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
  writeDemoMembers(members);
  return member;
}

export function removeDemoMember(id: string): void {
  const next = getDemoMembers().filter((m) => m.id !== id);
  writeDemoMembers(next);
}

export function clearDemoMembers(): void {
  writeDemoMembers([]);
}

export function getDemoCommitments(): string[] {
  return getDemoMembers().map((m) => m.commitment);
}

export function findDemoMemberById(id: string): DemoMember | undefined {
  return getDemoMembers().find((m) => m.id === id);
}
