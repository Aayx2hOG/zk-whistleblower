const SCOPE =
  `${(process.env.NEXT_PUBLIC_NETWORK_NAME ?? "local").toLowerCase()}` +
  `:${(process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ?? "0x0000000000000000000000000000000000000000").toLowerCase()}`;

function leaguesKey(orgId: number) {
  return `zk-whistleblower:leagues:${SCOPE}:org${orgId}`;
}

function membersKey(orgId: number) {
  return `zk-whistleblower:league-members:${SCOPE}:org${orgId}`;
}

export interface League {
  id: string;
  name: string;
  createdAt: string;
}

export interface LeagueMember {
  address: string;
  leagueId: string;
  assignedAt: string;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getLeagues(orgId: number): League[] {
  return read<League[]>(leaguesKey(orgId), []);
}

export function saveLeague(orgId: number, league: League): League[] {
  const leagues = getLeagues(orgId);
  const idx = leagues.findIndex((l) => l.id === league.id);
  const next = idx >= 0
    ? leagues.map((l) => (l.id === league.id ? league : l))
    : [...leagues, league];
  write(leaguesKey(orgId), next);
  return next;
}

export function renameLeague(orgId: number, leagueId: string, name: string): League[] {
  const leagues = getLeagues(orgId).map((l) =>
    l.id === leagueId ? { ...l, name: name.trim() } : l
  );
  write(leaguesKey(orgId), leagues);
  return leagues;
}

export function deleteLeague(orgId: number, leagueId: string): League[] {
  const leagues = getLeagues(orgId).filter((l) => l.id !== leagueId);
  write(leaguesKey(orgId), leagues);
  const members = getLeagueMembers(orgId).filter((m) => m.leagueId !== leagueId);
  write(membersKey(orgId), members);
  return leagues;
}

export function getLeagueMembers(orgId: number): LeagueMember[] {
  return read<LeagueMember[]>(membersKey(orgId), []);
}

export function addLeagueMember(orgId: number, member: LeagueMember): LeagueMember[] {
  const members = getLeagueMembers(orgId).filter(
    (m) => m.address.toLowerCase() !== member.address.toLowerCase()
  );
  const next = [...members, member];
  write(membersKey(orgId), next);
  return next;
}

export function removeLeagueMember(orgId: number, address: string): LeagueMember[] {
  const next = getLeagueMembers(orgId).filter(
    (m) => m.address.toLowerCase() !== address.toLowerCase()
  );
  write(membersKey(orgId), next);
  return next;
}
