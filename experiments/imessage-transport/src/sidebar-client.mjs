export class SidebarDbError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "SidebarDbError";
    this.status = status;
    this.body = body;
  }

  get publicMessage() {
    try {
      const parsed = JSON.parse(this.body);
      if (typeof parsed?.message === "string") return parsed.message;
    } catch {
      // PostgREST did not return JSON.
    }
    return null;
  }
}

export function createSidebarClient({
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Configure them in the root .env.local.",
    );
  }

  const rest = `${url.replace(/\/$/, "")}/rest/v1`;

  async function request(path, init = {}) {
    const { prefer, ...requestInit } = init;
    const response = await fetchImpl(`${rest}${path}`, {
      ...requestInit,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
        ...requestInit.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new SidebarDbError(
        `Sidebar database request failed (${response.status})`,
        response.status,
        body,
      );
    }
    const body = await response.text();
    if (!body) return undefined;
    return JSON.parse(body);
  }

  const select = (table, query = {}) =>
    request(`/${table}${queryString({ select: "*", ...query })}`);
  const selectOne = async (table, query = {}) =>
    (await select(table, { ...query, limit: 1 }))[0] ?? null;
  const insert = (table, row) =>
    request(`/${table}`, {
      method: "POST",
      body: JSON.stringify(row),
      prefer: "return=minimal",
    });
  const rpc = (name, args) =>
    request(`/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });

  async function requireMembership(groupId, userId) {
    const membership = await selectOne("group_members", {
      group_id: `eq.${groupId}`,
      user_id: `eq.${userId}`,
    });
    if (!membership) throw new Error("That iMessage sender is not a member of this Sidebar group.");
    return membership;
  }

  async function resolveImessageBinding(conversationHash, senderHash) {
    const conversation = await selectOne("imessage_conversations", {
      conversation_hash: `eq.${conversationHash}`,
    });
    if (!conversation) return { status: "unbound_group" };
    const identity = await selectOne("imessage_identities", {
      conversation_hash: `eq.${conversationHash}`,
      sender_hash: `eq.${senderHash}`,
    });
    if (!identity) return { status: "unbound_sender", groupId: conversation.group_id };
    return {
      status: "bound",
      groupId: conversation.group_id,
      userId: identity.user_id,
    };
  }

  async function createImessageSetup({
    tokenHash,
    conversationHash,
    senderHash,
    groupId = null,
    expiresAt,
  }) {
    await insert("imessage_setup_tokens", {
      token_hash: tokenHash,
      conversation_hash: conversationHash,
      sender_hash: senderHash,
      group_id: groupId,
      expires_at: expiresAt,
    });
  }

  async function stageImessageWebLink({
    senderHash,
    groupLinkId,
    phoneHash,
    expiresAt,
  }) {
    const result = await rpc("stage_imessage_web_link", {
      p_sender_hash: senderHash,
      p_group_link_id: groupLinkId,
      p_phone_hash: phoneHash,
      p_expires_at: expiresAt,
    });
    return {
      groupId: result.group_id,
      userId: result.user_id,
      groupName: result.group_name,
    };
  }

  async function claimImessageWebLink({ senderHash, conversationHash }) {
    const result = await rpc("claim_imessage_web_link", {
      p_sender_hash: senderHash,
      p_conversation_hash: conversationHash,
    });
    if (!result) return null;
    return {
      status: "bound",
      groupId: result.group_id,
      userId: result.user_id,
    };
  }

  async function listMarkets(groupId, userId) {
    const markets = await select("markets", {
      group_id: `eq.${groupId}`,
      order: "display_num.desc",
    });
    if (markets.length === 0) return [];

    const adjudicatorIds = [
      ...new Set(markets.map((market) => market.adjudicator_id).filter(Boolean)),
    ];
    const [totals, adjudicators, participation] = await Promise.all([
      select("market_totals", {
        market_id: `in.(${markets.map((market) => market.id).join(",")})`,
      }),
      adjudicatorIds.length
        ? select("users", { id: `in.(${adjudicatorIds.join(",")})` })
        : [],
      userId
        ? select("market_participants", {
            market_id: `in.(${markets.map((market) => market.id).join(",")})`,
            user_id: `eq.${userId}`,
          })
        : [],
    ]);
    const totalsByMarket = new Map(totals.map((total) => [total.market_id, total]));
    const adjudicatorById = new Map(adjudicators.map((user) => [user.id, user.name]));
    const joinedIds = new Set(participation.map((row) => row.market_id));
    return markets.map((market) => ({
      market,
      totals: totalsByMarket.get(market.id) ?? null,
      adjudicatorName: adjudicatorById.get(market.adjudicator_id) ?? "Unknown member",
      joined: joinedIds.has(market.id),
    }));
  }

  async function getMarketByNumber(groupId, marketNumber, userId) {
    const market = await selectOne("markets", {
      group_id: `eq.${groupId}`,
      display_num: `eq.${marketNumber}`,
    });
    if (!market) return null;

    const [sides, pools, totals, myStakes, payouts, adjudicator] = await Promise.all([
      select("market_sides", { market_id: `eq.${market.id}`, order: "ordinal.asc" }),
      select("market_pools_sealed", { market_id: `eq.${market.id}` }),
      selectOne("market_totals", { market_id: `eq.${market.id}` }),
      select("stakes", { market_id: `eq.${market.id}`, user_id: `eq.${userId}` }),
      getPayouts(market.id),
      market.adjudicator_id
        ? selectOne("users", { id: `eq.${market.adjudicator_id}` })
        : null,
    ]);
    return {
      market,
      sides,
      pools,
      totals,
      myStakes,
      payouts,
      adjudicatorName: adjudicator?.name ?? "Unknown member",
    };
  }

  async function openMarket({
    groupId,
    userId,
    question,
    criteria,
    revealAt,
    closeAt,
    resolveAt,
    subjectName = null,
    subjectPhoneHash = null,
  }) {
    await requireMembership(groupId, userId);
    const marketId = await rpc("open_market_with_subject", {
      p_group_id: groupId,
      p_proposer_id: userId,
      p_question: question,
      p_criteria: criteria,
      p_reveal_at: revealAt,
      p_close_at: closeAt,
      p_resolve_at: resolveAt,
      p_subject_name: subjectName,
      p_subject_phone_hash: subjectPhoneHash,
    });
    return selectOne("markets", { id: `eq.${marketId}`, group_id: `eq.${groupId}` });
  }

  async function stageMarketDraft({
    groupId,
    userId,
    question,
    criteria,
    revealAt,
    closeAt,
    resolveAt,
    subjectName,
    expiresAt,
  }) {
    await rpc("stage_imessage_market_draft", {
      p_group_id: groupId,
      p_user_id: userId,
      p_question: question,
      p_criteria: criteria,
      p_reveal_at: revealAt,
      p_close_at: closeAt,
      p_resolve_at: resolveAt,
      p_subject_name: subjectName,
      p_expires_at: expiresAt,
    });
  }

  async function completeMarketDraft({
    groupId,
    userId,
    subjectName = null,
    subjectPhoneHash = null,
  }) {
    const marketId = await rpc("complete_imessage_market_draft", {
      p_group_id: groupId,
      p_user_id: userId,
      p_subject_name: subjectName,
      p_subject_phone_hash: subjectPhoneHash,
    });
    return selectOne("markets", { id: `eq.${marketId}`, group_id: `eq.${groupId}` });
  }

  async function placeBet({ groupId, userId, marketNumber, side, amount }) {
    await requireMembership(groupId, userId);
    const market = await getMarketByNumber(groupId, marketNumber, userId);
    if (!market) throw new Error(`Market #${marketNumber} does not exist in this group.`);
    const selectedSide = market.sides.find(
      (candidate) => candidate.label.toLowerCase() === side.toLowerCase(),
    );
    if (!selectedSide) throw new Error(`Market #${marketNumber} has no ${side} side.`);
    await rpc("place_stake_joined", {
      p_market_id: market.market.id,
      p_side_id: selectedSide.id,
      p_user_id: userId,
      p_amount: amount,
    });
    return getMarketByNumber(groupId, marketNumber, userId);
  }

  async function joinMarket({ groupId, userId, marketNumber }) {
    await requireMembership(groupId, userId);
    const market = await selectOne("markets", {
      group_id: `eq.${groupId}`,
      display_num: `eq.${marketNumber}`,
    });
    if (!market) throw new Error(`Market #${marketNumber} does not exist in this group.`);
    await rpc("join_market", { p_market_id: market.id, p_user_id: userId });
  }

  async function leaveMarket({ groupId, userId, marketNumber }) {
    await requireMembership(groupId, userId);
    const market = await selectOne("markets", {
      group_id: `eq.${groupId}`,
      display_num: `eq.${marketNumber}`,
    });
    if (!market) throw new Error(`Market #${marketNumber} does not exist in this group.`);
    await rpc("leave_market", { p_market_id: market.id, p_user_id: userId });
  }

  async function resolveMarket({ groupId, userId, marketNumber, side }) {
    await requireMembership(groupId, userId);
    const market = await getMarketByNumber(groupId, marketNumber, userId);
    if (!market) throw new Error(`Market #${marketNumber} does not exist in this group.`);
    if (market.market.adjudicator_id !== userId) {
      throw new Error("Permission denied: only this market's adjudicator can resolve it.");
    }
    const outcomeSide =
      side === "void"
        ? null
        : market.sides.find(
            (candidate) => candidate.label.toLowerCase() === side.toLowerCase(),
          )?.id;
    if (side !== "void" && !outcomeSide) {
      throw new Error(`Market #${marketNumber} has no ${side} side.`);
    }
    const result = await rpc("resolve_market", {
      p_market_id: market.market.id,
      p_user_id: userId,
      p_outcome_side: outcomeSide,
    });
    const refreshed = await getMarketByNumber(groupId, marketNumber, userId);
    return { result, market: refreshed, payouts: refreshed?.payouts ?? [] };
  }

  async function getPayouts(marketId) {
    const ledger = await select("points_ledger", {
      market_id: `eq.${marketId}`,
      reason: "in.(payout,refund)",
      order: "id.asc",
    });
    if (ledger.length === 0) return [];
    const userIds = [...new Set(ledger.map((entry) => entry.user_id))];
    const users = await select("users", { id: `in.(${userIds.join(",")})` });
    const names = new Map(users.map((user) => [user.id, user.name]));
    const totals = new Map();
    for (const entry of ledger) {
      const current = totals.get(entry.user_id) ?? {
        userId: entry.user_id,
        name: names.get(entry.user_id) ?? "Unknown member",
        amount: 0,
        reason: entry.reason,
      };
      current.amount += entry.delta;
      totals.set(entry.user_id, current);
    }
    return [...totals.values()];
  }

  return {
    createImessageSetup,
    completeMarketDraft,
    claimImessageWebLink,
    getMarketByNumber,
    joinMarket,
    leaveMarket,
    listMarkets,
    openMarket,
    placeBet,
    requireMembership,
    resolveImessageBinding,
    resolveMarket,
    stageImessageWebLink,
    stageMarketDraft,
  };
}

function queryString(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}
