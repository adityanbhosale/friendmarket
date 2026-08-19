import {
  isAgentInvocation,
  isStartRequest,
  parseNaturalLanguageIntent,
} from "./intent-parser.mjs";
import { SidebarDbError } from "./sidebar-client.mjs";
import { fingerprint } from "./transport-core.mjs";

export function createSidebarAgent({
  client,
  resolveBinding,
  parseIntent = parseNaturalLanguageIntent,
  now = () => new Date(),
  timezone = process.env.SIDEBAR_GROUP_TIMEZONE ?? "America/New_York",
  issueSetupLink,
  dryRun = false,
} = {}) {
  if (!client || !resolveBinding) throw new Error("Sidebar agent needs a client and binding resolver.");
  assertTimeZone(timezone);

  return async function handleMessage(envelope) {
    if (!isAgentInvocation(envelope.text)) return null;
    const conversationHash = fingerprint(envelope.conversationId);
    const senderHash = fingerprint(envelope.senderId);
    const binding = await resolveBinding(conversationHash, senderHash, {
      conversationId: envelope.conversationId,
      senderId: envelope.senderId,
    });

    if (isStartRequest(envelope.text)) {
      if (binding.status === "bound") {
        return "This conversation and your iMessage identity are already connected to Sidebar. Send “@sidebar, help” to see what I can do.";
      }
      if (!issueSetupLink) {
        return "iMessage setup is not configured on this Sidebar agent yet.";
      }
      if (dryRun) {
        return "Would create a private, 15-minute Sidebar setup link for this iMessage identity.";
      }
      try {
        await issueSetupLink({
          conversationId: envelope.conversationId,
          senderId: envelope.senderId,
          groupId: binding.status === "unbound_sender" ? binding.groupId : null,
        });
        return "I sent you a one-time Sidebar setup link directly. It expires in 15 minutes.";
      } catch (error) {
        return `I couldn't start setup: ${safeErrorMessage(error)}`;
      }
    }

    if (binding.status === "unbound_group") {
      return "This iMessage group is not connected to Sidebar. Send “@sidebar, start” to create or connect a group.";
    }
    if (binding.status === "unbound_sender") {
      return "I recognize this group, but your iMessage identity is not connected. Send “@sidebar, start” for a private setup link.";
    }

    try {
      await client.requireMembership(binding.groupId, binding.userId);
      const marketRows = await client.listMarkets(binding.groupId);
      const intent = await parseIntent({
        text: envelope.text,
        now: now(),
        timezone,
        markets: marketRows.map(({ market }) => market),
      });
      if (!intent) return null;
      return executeIntent({
        client,
        intent,
        binding,
        marketRows,
        now: now(),
        timezone,
        dryRun,
      });
    } catch (error) {
      const message = safeErrorMessage(error);
      return `I couldn't complete that: ${message}`;
    }
  };
}

export async function executeIntent({
  client,
  intent,
  binding,
  marketRows = [],
  now,
  timezone = "America/New_York",
  dryRun,
}) {
  switch (intent.action) {
    case "help":
      return [
        "I can create and list markets, show odds/pot/time, place Yes or No bets, and resolve markets.",
        "Try: “@sidebar, create a market: Will Dan be late? closes in 2 hours”",
        "Or: “@sidebar, put 40 points on Dan being late”",
      ].join("\n");
    case "list_markets":
      return formatMarketList(marketRows, now);
    case "show_market": {
      requirePositiveInteger(intent.marketNumber, "market number");
      const result = await client.getMarketByNumber(
        binding.groupId,
        intent.marketNumber,
        binding.userId,
      );
      if (!result) return `Market #${intent.marketNumber} does not exist in this group.`;
      return formatMarket(result, now, timezone);
    }
    case "create_market": {
      const input = validateCreateIntent(intent, now);
      if (dryRun) return `Would create market: ${input.question}`;
      const market = await client.openMarket({
        groupId: binding.groupId,
        userId: binding.userId,
        ...input,
      });
      return `Created market #${market.display_num}: ${market.question}\nBetting closes ${formatInstant(market.close_at, timezone)}.`;
    }
    case "place_bet": {
      requirePositiveInteger(intent.marketNumber, "market number");
      requirePositiveInteger(intent.amount, "bet amount");
      if (!new Set(["yes", "no"]).has(intent.side)) {
        throw new Error("Choose Yes or No.");
      }
      if (dryRun) {
        return `Would bet ${intent.amount} points on ${titleCase(intent.side)} in market #${intent.marketNumber}.`;
      }
      const result = await client.placeBet({
        groupId: binding.groupId,
        userId: binding.userId,
        marketNumber: intent.marketNumber,
        side: intent.side,
        amount: intent.amount,
      });
      return `Bet placed: ${intent.amount} points on ${titleCase(intent.side)} in market #${intent.marketNumber}.\n${formatOdds(result)}`;
    }
    case "resolve_market": {
      requirePositiveInteger(intent.marketNumber, "market number");
      if (!new Set(["yes", "no", "void"]).has(intent.side)) {
        throw new Error("Resolve the market as Yes, No, or Void.");
      }
      if (dryRun) return `Would resolve market #${intent.marketNumber} as ${titleCase(intent.side)}.`;
      const resolved = await client.resolveMarket({
        groupId: binding.groupId,
        userId: binding.userId,
        marketNumber: intent.marketNumber,
        side: intent.side,
      });
      return formatResolution(intent.marketNumber, intent.side, resolved);
    }
    case "unknown":
      return intent.clarification || "Could you say what you want me to do with the market?";
    default:
      throw new Error("That Sidebar action is not supported.");
  }
}

function validateCreateIntent(intent, now) {
  const question = String(intent.question ?? "").trim();
  if (!question) throw new Error("A market needs a question.");
  if (question.length > 200) throw new Error("The market question must be 200 characters or fewer.");

  const closeAt = validDate(intent.closeAt, "betting close time");
  const revealAt = intent.revealAt ? validDate(intent.revealAt, "reveal time") : new Date(now.getTime() + 1_000);
  const resolveAt = intent.resolveAt ? validDate(intent.resolveAt, "resolve time") : new Date(closeAt.getTime() + 1_000);
  if (closeAt <= now) throw new Error("Betting must close in the future.");
  if (!(revealAt < closeAt && closeAt < resolveAt)) {
    throw new Error("Times must run in order: reveal, close, then resolve.");
  }

  const criteria = String(
    intent.criteria || `Resolves Yes if “${question}” is true when betting closes.`,
  ).trim();
  if (criteria.length > 500) throw new Error("Resolution criteria must be 500 characters or fewer.");
  return {
    question,
    criteria,
    revealAt: revealAt.toISOString(),
    closeAt: closeAt.toISOString(),
    resolveAt: resolveAt.toISOString(),
  };
}

function formatMarketList(rows, now) {
  if (rows.length === 0) return "There are no markets in this Sidebar group yet.";
  return rows
    .slice(0, 10)
    .map(({ market, totals, adjudicatorName }) => {
      const state = marketState(market, now);
      const pot = totals?.revealed ? ` · ${totals.total_pool ?? 0} point pot` : " · pot sealed";
      return `#${market.display_num} ${market.question} — ${titleCase(state)}${pot} · adjudicator ${adjudicatorName}`;
    })
    .join("\n");
}

function formatMarket(result, now, timezone) {
  const { market, totals } = result;
  const lines = [
    `#${market.display_num} ${market.question}`,
    `${titleCase(marketState(market, now))} · ${timeDescription(market, now, timezone)}`,
    `Adjudicator: ${result.adjudicatorName}`,
    formatOdds(result),
  ];
  const myStake = result.myStakes.reduce((sum, stake) => sum + stake.amount, 0);
  if (myStake > 0) lines.push(`Your stake: ${myStake} points`);
  if (totals?.revealed) lines.push(`Participants: ${totals.participants}`);
  if (market.resolved_at) {
    lines.push(
      result.payouts?.length
        ? `Final payouts: ${result.payouts
            .map((payout) => `${payout.name} ${payout.amount}`)
            .join(" · ")}`
        : "No payouts were due.",
    );
  }
  return lines.join("\n");
}

function formatOdds({ sides, pools, totals }) {
  if (!totals?.revealed) return "Odds and stakes are sealed until the reveal time.";
  const total = totals.total_pool ?? 0;
  const poolBySide = new Map(pools.map((pool) => [pool.side_id, pool.pool ?? 0]));
  const sideText = sides.map((side) => {
    const pool = poolBySide.get(side.id) ?? 0;
    const probability = total > 0 ? Math.round((pool / total) * 100) : 0;
    return `${side.label} ${probability}% (${pool})`;
  });
  return `${sideText.join(" · ")} · Pot ${total} points`;
}

function formatResolution(marketNumber, side, resolved) {
  const outcome = resolved.result === "resolved" ? titleCase(side) : "Void";
  const lines = [`Resolved market #${marketNumber}: ${outcome}.`];
  if (resolved.payouts.length === 0) lines.push("No payouts were due.");
  else {
    lines.push(
      `Final payouts: ${resolved.payouts
        .map((payout) => `${payout.name} ${payout.amount}`)
        .join(" · ")}`,
    );
  }
  return lines.join("\n");
}

function marketState(market, now) {
  if (market.resolved_at) return market.void_reason ? "void" : "resolved";
  if (now < new Date(market.reveal_at)) return "seeding";
  if (now < new Date(market.close_at)) return "open";
  return "closed";
}

function timeDescription(market, now, timezone) {
  if (market.resolved_at) return `resolved ${formatInstant(market.resolved_at, timezone)}`;
  const target = new Date(market.close_at);
  if (target <= now) return `betting closed ${formatInstant(target, timezone)}`;
  return `${formatDuration(target.getTime() - now.getTime())} until betting closes`;
}

function formatDuration(milliseconds) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatInstant(value, timezone) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(new Date(value));
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`Enter a valid ${label}.`);
}

function validDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Enter a valid ${label}.`);
  return date;
}

function titleCase(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function safeErrorMessage(error) {
  if (error instanceof SidebarDbError) {
    return error.publicMessage || "the Sidebar database rejected the request.";
  }
  if (error instanceof Error) return error.message;
  return "an unexpected error occurred.";
}

function assertTimeZone(timezone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new Error(`Invalid SIDEBAR_GROUP_TIMEZONE: ${timezone}`);
  }
}
