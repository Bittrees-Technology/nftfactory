export type SessionPayload = { purpose: string; address: string; exp: number; message?: string };
export function issueToken(payload: SessionPayload, secret: string | undefined): string;
export function readToken(token: string | undefined, secret: string | undefined, purpose: string, now?: number): SessionPayload | null;
