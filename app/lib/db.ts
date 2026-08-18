// Server-only Supabase access.
//
// Everything here runs under the secret key, which carries a BYPASSRLS role.
// That is deliberate: with no Supabase Auth there is no auth.uid() for a policy
// to key on, so authorization lives in this codebase rather than in SQL. The
// rule that makes it safe is that the browser never talks to PostgREST at all.
//
// SUPABASE_SECRET_KEY has no NEXT_PUBLIC_ prefix, so importing this module from
// a Client Component fails the build instead of leaking the key.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;

if (!URL || !KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. See .env.local.",
  );
}

const REST = `${URL}/rest/v1`;

type Query = Record<string, string | number | undefined>;

function qs(query: Query = {}): string {
  const params = new global.URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function request<T>(
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<T> {
  const { prefer, ...rest } = init;

  const res = await fetch(`${REST}${path}`, {
    ...rest,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY!}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
      ...rest.headers,
    },
    // Auth and staking are never served from a cache.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    // Surfaces the PostgREST code (23505 unique violation, 42501 RLS, ...) so
    // callers can branch on it without re-parsing.
    throw new DbError(`${res.status} ${path}: ${body}`, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class DbError extends Error {
  status: number;
  body: string;
  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "DbError";
    this.status = status;
    this.body = body;
  }
  /** True when the failure was a unique-constraint violation. */
  get isConflict(): boolean {
    return this.status === 409 || this.body.includes('"23505"');
  }
}

/** SELECT. Returns every matching row. */
export function select<T>(table: string, query: Query = {}): Promise<T[]> {
  return request<T[]>(`/${table}${qs({ select: "*", ...query })}`);
}

/** SELECT expecting at most one row. Returns null rather than throwing. */
export async function selectOne<T>(
  table: string,
  query: Query = {},
): Promise<T | null> {
  const rows = await select<T>(table, { ...query, limit: 1 });
  return rows[0] ?? null;
}

/** INSERT, returning the created row. */
export async function insert<T>(
  table: string,
  row: Record<string, unknown>,
): Promise<T> {
  const rows = await request<T[]>(`/${table}`, {
    method: "POST",
    body: JSON.stringify(row),
    prefer: "return=representation",
  });
  return rows[0];
}

/** INSERT with no row returned. Cheaper when the result is not needed. */
export async function insertVoid(
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  await request<void>(`/${table}`, {
    method: "POST",
    body: JSON.stringify(row),
    prefer: "return=minimal",
  });
}

/** Exact row count matching a filter, without transferring the rows. */
export async function count(table: string, query: Query = {}): Promise<number> {
  const res = await fetch(`${REST}/${table}${qs({ select: "id", ...query })}`, {
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${KEY!}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
    cache: "no-store",
  });
  const range = res.headers.get("content-range"); // "0-0/57"
  const total = range?.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}

/**
 * Calls a Postgres function. Used for the operations that must be atomic —
 * opening a market, placing a stake, resolving — where PostgREST's one-request-
 * one-transaction model is the only thing keeping a check and its write together.
 */
export function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  return request<T>(`/rpc/${fn}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

/**
 * Pulls the human-readable half out of a Postgres error raised with RAISE
 * EXCEPTION, so "insufficient points: have 40, staked 100" reaches the user
 * instead of a wall of JSON.
 */
export function dbMessage(error: unknown, fallback: string): string {
  if (error instanceof DbError) {
    try {
      const parsed = JSON.parse(error.body) as { message?: string };
      if (parsed.message) return parsed.message;
    } catch {
      // Not JSON — fall through.
    }
  }
  return fallback;
}
