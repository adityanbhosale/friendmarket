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
  insertVoid,
  rpc,
  selectOne,
  DbError,
  dbMessage,
} from "./db";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession, fingerprint } from "./session";
import { currentMembership, type Group, type User } from "./auth";
import { STARTING_POINTS } from "./points";
import { parseLocalDateTime } from "./datetime";
import {
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from "./recovery-code";
import {
  hashImessageSetupToken,
  normalizeImessageSetupToken,
} from "./imessage-token";

// A shared group password travels through a group chat and is guessable by
// anyone holding the link. Throttling is what stands between that and an
// online attack running at network speed.
const WINDOW_MINUTES = 15;
const MAX_FAILURES = 8;

const MIN_PASSWORD_LENGTH = 8;

export type FormState = {
  error?: string;
  recoveryCode?: string;
  groupId?: string;
  imessageLinked?: boolean;
};

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

function normalizeGroupId(value: FormDataEntryValue | null): string {
  const raw = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
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

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

type CreatedGroup = { group_id: string; user_id: string };

async function createGroupImpl(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const groupName = String(formData.get("group_name") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!groupName || !name || !password) {
    return { error: "Group name, your name, and a password are all required." };
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
  const imessageToken = normalizeImessageSetupToken(formData.get("imessage_token"));
  if (formData.has("imessage_token") && !imessageToken) {
    return { error: "That iMessage setup link is invalid or expired." };
  }

  // The RPC makes group, owner, membership and allocation one transaction.
  // Retry the generated credentials on the vanishingly unlikely unique clash.
  let created: CreatedGroup | null = null;
  let recoveryCode = "";
  let linkId = "";
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    linkId = generateGroupId();
    recoveryCode = generateRecoveryCode();
    const normalizedCode = normalizeRecoveryCode(recoveryCode)!;
    try {
      created = await rpc<CreatedGroup>(
        imessageToken
          ? "create_group_with_owner_imessage"
          : "create_group_with_owner",
        {
          ...(imessageToken
            ? { p_token_hash: hashImessageSetupToken(imessageToken) }
            : {}),
          p_group_name: groupName,
          p_link_id: linkId,
          p_password_hash: password_hash,
          p_user_name: name,
          p_recovery_code_hash: hashRecoveryCode(normalizedCode),
          p_starting_points: STARTING_POINTS,
        },
      );
    } catch (err) {
      if (!(err instanceof DbError && isGeneratedCredentialConflict(err))) throw err;
    }
  }
  if (!created) {
    return { error: "Couldn't allocate a group ID. Try again." };
  }

  await createSession(created.user_id, created.group_id);
  return { recoveryCode, groupId: linkId };
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
  const linkId = normalizeGroupId(formData.get("link_id"));
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const imessageToken = normalizeImessageSetupToken(formData.get("imessage_token"));

  if (formData.has("imessage_token") && !imessageToken) {
    return { error: "That iMessage setup link is invalid or expired." };
  }
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
    method: "eq.password",
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

  let userId = "";
  let recoveryCode = "";
  for (let attempt = 0; attempt < 3 && !userId; attempt++) {
    recoveryCode = generateRecoveryCode();
    const normalizedCode = normalizeRecoveryCode(recoveryCode)!;
    try {
      userId = await rpc<string>(
        imessageToken ? "join_group_member_imessage" : "join_group_member",
        {
          ...(imessageToken
            ? { p_token_hash: hashImessageSetupToken(imessageToken) }
            : {}),
          p_group_id: group.id,
          p_user_name: name,
          p_recovery_code_hash: hashRecoveryCode(normalizedCode),
          p_starting_points: STARTING_POINTS,
        },
      );
    } catch (err) {
      if (!(err instanceof DbError && isGeneratedCredentialConflict(err))) throw err;
    }
  }
  if (!userId) return { error: "Couldn't create your membership. Try again." };

  try {
    await insertVoid("join_attempts", {
      link_id: linkId,
      client_hash: client,
      method: "password",
      succeeded: true,
    });
  } catch (error) {
    console.error("[join audit]", error);
  }

  await createSession(userId, group.id);
  return { recoveryCode, groupId: linkId };
}

export async function recoverGroup(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const linkId = normalizeGroupId(formData.get("link_id"));
  const normalizedCode = normalizeRecoveryCode(
    String(formData.get("recovery_code") ?? ""),
  );
  if (!linkId || !normalizedCode) {
    return { error: "Enter your group ID and recovery code." };
  }

  const client = await clientFingerprint();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const failures = await count("join_attempts", {
    link_id: `eq.${linkId}`,
    client_hash: `eq.${client}`,
    method: "eq.recovery",
    succeeded: "is.false",
    attempted_at: `gte.${since}`,
  });
  if (failures >= MAX_FAILURES) {
    return { error: `Too many attempts. Try again in ${WINDOW_MINUTES} minutes.` };
  }

  const [group, user] = await Promise.all([
    selectOne<Group>("groups", { link_id: `eq.${linkId}` }),
    selectOne<User>("users", {
      recovery_code_hash: `eq.${hashRecoveryCode(normalizedCode)}`,
    }),
  ]);
  const membership =
    group && user
      ? await selectOne<{ group_id: string }>("group_members", {
          group_id: `eq.${group.id}`,
          user_id: `eq.${user.id}`,
        })
      : null;

  if (!group || !user || !membership) {
    await insertVoid("join_attempts", {
      link_id: linkId,
      client_hash: client,
      method: "recovery",
      succeeded: false,
    });
    return { error: "That group ID and recovery code don't match." };
  }

  try {
    await insertVoid("join_attempts", {
      link_id: linkId,
      client_hash: client,
      method: "recovery",
      succeeded: true,
    });
  } catch (error) {
    console.error("[recovery audit]", error);
  }

  await createSession(user.id, group.id);
  redirect("/group");
}

export async function generateNewRecoveryCode(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  void _prev;
  void _formData;
  const membership = await currentMembership();
  if (!membership) return { error: "You're not signed in to a group." };

  const recoveryCode = generateRecoveryCode();
  const normalizedCode = normalizeRecoveryCode(recoveryCode)!;
  try {
    await rpc<void>("set_recovery_code", {
      p_group_id: membership.group.id,
      p_user_id: membership.user.id,
      p_recovery_code_hash: hashRecoveryCode(normalizedCode),
    });
  } catch (error) {
    return { error: dbMessage(error, "Couldn't generate a recovery code.") };
  }

  revalidatePath("/group");
  return { recoveryCode, groupId: membership.group.link_id };
}

export async function linkCurrentGroupToImessage(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const membership = await currentMembership();
  if (!membership) {
    return { error: "Sign in to the Sidebar group you want to link." };
  }
  const token = normalizeImessageSetupToken(formData.get("imessage_token"));
  if (!token) return { error: "That iMessage setup link is invalid or expired." };

  try {
    await rpc<void>("consume_imessage_setup", {
      p_token_hash: hashImessageSetupToken(token),
      p_group_id: membership.group.id,
      p_user_id: membership.user.id,
    });
  } catch (error) {
    return {
      error: dbMessage(error, "Couldn't link that iMessage conversation."),
    };
  }
  return { imessageLinked: true };
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

  const revealAt = parseLocalDateTime(formData.get("reveal_at"), offset);
  const closeAt = parseLocalDateTime(formData.get("close_at"), offset);
  const resolveAt = parseLocalDateTime(formData.get("resolve_at"), offset);

  if (!question) return { error: "A market needs a question." };
  if (!criteria) return { error: "Say how it settles, or it will be argued about." };
  if (!revealAt || !closeAt || !resolveAt) {
    return { error: "All three dates are required." };
  }
  if (!(revealAt < closeAt && closeAt < resolveAt)) {
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

  const market = await selectOne<{ id: string }>("markets", {
    id: `eq.${marketId}`,
    group_id: `eq.${membership.group.id}`,
  });
  if (!market) return { error: "No such market in this group." };

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

function isGeneratedCredentialConflict(error: DbError): boolean {
  return (
    error.isConflict &&
    (error.body.includes("groups_link_id_key") ||
      error.body.includes("users_recovery_code_hash_uniq"))
  );
}
