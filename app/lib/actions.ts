"use server";

// Server Actions. Reachable by direct POST, not only through the UI, so every
// one of these re-establishes who the caller is from the session cookie and
// never trusts an id arriving in the form body.

import { randomInt } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  count,
  insert,
  insertVoid,
  rpc,
  selectOne,
  DbError,
  dbMessage,
} from "./db";
import { looksLikeEmail, registrationMail, sendMail } from "./mail";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession, fingerprint } from "./session";
import { currentMembership, type Group, type User } from "./auth";
import { STARTING_POINTS } from "./points";

// A shared group password travels through a group chat and is guessable by
// anyone holding the link. Throttling is what stands between that and an
// online attack running at network speed.
const WINDOW_MINUTES = 15;
const MAX_FAILURES = 8;

const MIN_PASSWORD_LENGTH = 8;

export type FormState = { error?: string };

// ---------------------------------------------------------------------------
// Group IDs
// ---------------------------------------------------------------------------

// No I, L, O, 0 or 1: these get read aloud and typed in by hand from a group
// chat, and those four are where transcription goes wrong.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateGroupId(): string {
  const block = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${block()}-${block()}`;
}

/**
 * Identifies the caller for rate-limiting. x-forwarded-for is client-controlled
 * in general; behind Vercel the leftmost entry is set by the proxy and is
 * trustworthy. Self-hosting behind a different proxy needs this revisited.
 */
async function clientFingerprint(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fingerprint(forwarded || h.get("x-real-ip") || "unknown");
}

/** Grants the joining allowance. Idempotent: a partial unique index permits
 *  exactly one allocation per person per group, so a rejoin cannot mint more. */
async function allocateStartingPoints(groupId: string, userId: string) {
  try {
    await insertVoid("points_ledger", {
      group_id: groupId,
      user_id: userId,
      delta: STARTING_POINTS,
      reason: "allocation",
    });
  } catch (err) {
    if (!(err instanceof DbError && err.isConflict)) throw err;
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function createGroupImpl(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const groupName = String(formData.get("group_name") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!groupName || !name || !password || !email) {
    return {
      error: "Group name, your name, an email, and a password are all required.",
    };
  }
  if (!looksLikeEmail(email)) {
    return { error: "That email address doesn't look right." };
  }
  if (groupName.length > 60 || name.length > 40) {
    return { error: "That name is too long." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  const password_hash = await hashPassword(password);

  // The creator exists before the group does, so the group can record who
  // opened it in the same insert rather than needing a second write.
  const user = await insert<User>("users", { name });

  // Retry on the unique index rather than checking first — a check would race
  // against another group being created in the same instant.
  let group: Group | null = null;
  for (let attempt = 0; attempt < 5 && !group; attempt++) {
    try {
      group = await insert<Group>("groups", {
        name: groupName,
        link_id: generateGroupId(),
        password_hash,
        created_by: user.id,
        admin_email: email,
      });
    } catch (err) {
      if (!(err instanceof DbError && err.isConflict)) throw err;
    }
  }
  if (!group) {
    return { error: "Couldn't allocate a group ID. Try again." };
  }

  await insertVoid("group_members", { group_id: group.id, user_id: user.id });
  await allocateStartingPoints(group.id, user.id);
  await createSession(user.id, group.id);

  // Last, and never fatal. The group exists either way; a mail outage must not
  // read to the creator as a failed signup. sendMail already swallows its own
  // failures, so this only guards against something unexpected in composing.
  try {
    const mail = registrationMail({
      groupName: group.name,
      linkId: group.link_id,
      adminName: name,
    });
    await sendMail({ ...mail, to: email });
  } catch (err) {
    console.error("[createGroup] registration mail failed", err);
  }

  redirect("/group");
}

/**
 * Wraps an action so a database failure reaches the form as text instead of a
 * 500 page. redirect() throws NEXT_REDIRECT to do its work, so that has to pass
 * through untouched.
 */
async function reportingDbErrors(
  run: () => Promise<FormState>,
  fallback: string,
): Promise<FormState> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof DbError) {
      console.error("[action]", err.message);
      return { error: dbMessage(err, fallback) };
    }
    throw err;
  }
}

async function joinGroupImpl(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // Typed in by hand from a chat, so accept lowercase and a missing dash.
  const raw = String(formData.get("link_id") ?? "").trim().toUpperCase();
  const linkId = /^[A-Z0-9]{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!linkId || !password || !name) {
    return { error: "Group ID, password, and name are all required." };
  }
  if (name.length > 40) {
    return { error: "Name is too long." };
  }

  const client = await clientFingerprint();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const failures = await count("join_attempts", {
    link_id: `eq.${linkId}`,
    client_hash: `eq.${client}`,
    succeeded: "is.false",
    attempted_at: `gte.${since}`,
  });

  if (failures >= MAX_FAILURES) {
    return { error: `Too many attempts. Try again in ${WINDOW_MINUTES} minutes.` };
  }

  const group = await selectOne<Group & { password_hash: string }>("groups", {
    link_id: `eq.${linkId}`,
  });

  // Verify even when the group is missing, against a hash that cannot match, so
  // a bad ID and a bad password take the same time and give the same answer.
  // Otherwise the form enumerates which groups exist.
  const stored =
    group?.password_hash ??
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  const ok = await verifyPassword(password, stored);

  if (!group || !ok) {
    await insertVoid("join_attempts", {
      link_id: linkId,
      client_hash: client,
      succeeded: false,
    });
    return { error: "That group ID and password don't match." };
  }

  // Identity is the session cookie. There is no per-person credential yet, so a
  // returning member without a cookie becomes a new user row.
  const user = await insert<User>("users", { name });

  try {
    await insertVoid("group_members", { group_id: group.id, user_id: user.id });
  } catch (err) {
    // Composite PK — a duplicate just means they were already a member.
    if (!(err instanceof DbError && err.isConflict)) throw err;
  }

  await allocateStartingPoints(group.id, user.id);
  await insertVoid("join_attempts", {
    link_id: linkId,
    client_hash: client,
    succeeded: true,
  });

  await createSession(user.id, group.id);
  redirect("/group");
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/");
}

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

/**
 * Parses a datetime-local value into an absolute instant.
 *
 * `<input type="datetime-local">` submits wall-clock time with no zone
 * ("2026-08-18T10:00"), and Date.parse would read that in the *server's* zone —
 * UTC on most hosts. Someone in New York picking 10am would get 6am. The form
 * sends the browser's getTimezoneOffset() so the instant can be recovered.
 */
function parseWhen(
  value: FormDataEntryValue | null,
  offsetMinutes: number,
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Some browsers include seconds, some don't. Normalise, then read the wall
  // clock as if it were UTC and undo the browser's offset.
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?$/.exec(raw);
  if (!match) return null;

  const asUtc = Date.parse(`${match[1]}${match[2] ?? ":00"}Z`);
  if (Number.isNaN(asUtc)) return null;

  return new Date(asUtc + offsetMinutes * 60_000).toISOString();
}

export async function openMarket(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const membership = await currentMembership();
  if (!membership) return { error: "You're not signed in to a group." };

  const question = String(formData.get("question") ?? "").trim();
  const criteria = String(formData.get("criteria") ?? "").trim();
  // Sent by the browser; nonsense values fall back to UTC rather than throwing.
  const rawOffset = Number(formData.get("tz_offset"));
  const offset = Number.isFinite(rawOffset) && Math.abs(rawOffset) <= 900 ? rawOffset : 0;

  const revealAt = parseWhen(formData.get("reveal_at"), offset);
  const closeAt = parseWhen(formData.get("close_at"), offset);
  const resolveAt = parseWhen(formData.get("resolve_at"), offset);

  if (!question) return { error: "A market needs a question." };
  if (!criteria) return { error: "Say how it settles, or it will be argued about." };
  if (!revealAt || !closeAt || !resolveAt) {
    return { error: "All three dates are required." };
  }
  if (!(revealAt <= closeAt && closeAt <= resolveAt)) {
    return { error: "Dates must run in order: reveal, then close, then resolve." };
  }

  try {
    await rpc<string>("open_market", {
      p_group_id: membership.group.id,
      p_proposer_id: membership.user.id,
      p_question: question,
      p_criteria: criteria,
      p_reveal_at: revealAt,
      p_close_at: closeAt,
      p_resolve_at: resolveAt,
    });
  } catch (err) {
    return { error: dbMessage(err, "Couldn't open that market.") };
  }

  revalidatePath("/group");
  redirect("/group");
}

export async function placeStake(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const membership = await currentMembership();
  if (!membership) return { error: "You're not signed in to a group." };

  const marketId = String(formData.get("market_id") ?? "");
  const sideId = String(formData.get("side_id") ?? "");
  const amount = Number(formData.get("amount"));

  if (!marketId || !sideId) return { error: "Pick a side." };
  if (!Number.isInteger(amount) || amount <= 0) {
    return { error: "Stake a whole number of points." };
  }

  // The market must belong to the caller's group. place_stake re-checks
  // membership, but this keeps a foreign market id from even being attempted.
  const market = await selectOne<{ id: string }>("markets", {
    id: `eq.${marketId}`,
    group_id: `eq.${membership.group.id}`,
  });
  if (!market) return { error: "No such market in this group." };

  try {
    await rpc<string>("place_stake", {
      p_market_id: marketId,
      p_side_id: sideId,
      p_user_id: membership.user.id,
      p_amount: amount,
    });
  } catch (err) {
    return { error: dbMessage(err, "Couldn't place that stake.") };
  }

  revalidatePath(`/group/m/${marketId}`);
  revalidatePath("/group");
  return {};
}

export async function resolveMarket(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const membership = await currentMembership();
  if (!membership) return { error: "You're not signed in to a group." };

  const marketId = String(formData.get("market_id") ?? "");
  const rawSide = String(formData.get("outcome_side") ?? "");
  // An empty side is a deliberate void, not a missing field.
  const outcomeSide = rawSide === "" || rawSide === "void" ? null : rawSide;

  if (!marketId) return { error: "Which market?" };

  try {
    await rpc<string>("resolve_market", {
      p_market_id: marketId,
      p_user_id: membership.user.id,
      p_outcome_side: outcomeSide,
    });
  } catch (err) {
    return { error: dbMessage(err, "Couldn't resolve that market.") };
  }

  revalidatePath(`/group/m/${marketId}`);
  revalidatePath("/group");
  return {};
}

export async function createGroup(
  prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return reportingDbErrors(
    () => createGroupImpl(prev, formData),
    "Couldn't open that group.",
  );
}

export async function joinGroup(
  prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return reportingDbErrors(
    () => joinGroupImpl(prev, formData),
    "Couldn't join that group.",
  );
}
