export const EPOCH_LENGTH_MS = 24 * 60 * 60 * 1000;

export function getCurrentEpoch(): number {
    return Math.floor(Date.now() / EPOCH_LENGTH_MS);
}

export function getEpochStartTime(epoch: number): Date {
    return new Date(epoch * EPOCH_LENGTH_MS);
}

export function getEpochEndTime(epoch: number): Date {
    return new Date((epoch + 1) * EPOCH_LENGTH_MS);
}

export function formatEpochRange(epoch: number): string {
    const start = getEpochStartTime(epoch);
    const end = getEpochEndTime(epoch);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
}
