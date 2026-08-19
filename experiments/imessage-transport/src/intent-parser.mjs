const BOT_PREFIX = /^\s*@sidebar\b\s*[:,\-]?\s*/i;

const ACTIONS = new Set([
  "help",
  "list_markets",
  "show_market",
  "create_market",
  "place_bet",
  "resolve_market",
  "unknown",
]);

export function isAgentInvocation(text) {
  return BOT_PREFIX.test(text);
}

export function isStartRequest(text) {
  return BOT_PREFIX.test(text) && /^start\s*[.!?]*$/i.test(stripBotPrefix(text).trim());
}

export function parseDeterministicIntent(text, { now = new Date(), markets = [] } = {}) {
  const request = stripBotPrefix(text).trim();
  if (!request) return unknown("What would you like Sidebar to do?");

  if (/^(?:start|help|commands|what can you do)\??$/i.test(request)) {
    return intent("help");
  }

  if (/\b(?:add|remove)\b.*\b(?:person|member|market)\b/i.test(request)) {
    return unknown(
      "Market-specific membership is not implemented in Sidebar yet; group membership is unchanged.",
    );
  }
  if (/\bdelete\b.*\bmarket\b/i.test(request)) {
    return unknown("Deleting a market is not implemented in Sidebar yet.");
  }
  const bet = parseBet(request, markets);
  if (bet) return bet;

  const resolution = parseResolution(request, markets);
  if (resolution) return resolution;

  const create = parseCreateMarket(request, now);
  if (create) return create;

  const marketNumber = extractMarketNumber(request);
  if (/\b(?:odds?|pot|status|time|left|remaining|stakes?|payouts?)\b/i.test(request)) {
    if (marketNumber != null) return intent("show_market", { marketNumber });
    const matched = resolveMarketReference(request, markets);
    if (matched.intent) return intent("show_market", { marketNumber: matched.intent });
    return unknown(matched.clarification || "Which market should I show?");
  }

  if (/\b(?:show|list|current|open)\b.*\bmarkets?\b|^markets?\??$/i.test(request)) {
    return intent("list_markets");
  }

  if (/^\s*(?:show|describe)\b/i.test(request)) {
    const matched = resolveMarketReference(request, markets);
    if (matched.intent) return intent("show_market", { marketNumber: matched.intent });
    if (matched.clarification) return unknown(matched.clarification);
  }

  return null;
}

export async function parseNaturalLanguageIntent({
  text,
  now = new Date(),
  timezone = "America/New_York",
  markets = [],
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_INTENT_MODEL ?? "gpt-5.4-nano",
  fetchImpl = globalThis.fetch,
}) {
  if (!isAgentInvocation(text)) return null;

  const deterministic = parseDeterministicIntent(text, { now, markets });
  if (deterministic) return deterministic;

  if (!apiKey) {
    return unknown(
      "I understood that you were talking to Sidebar, but natural-language fallback is not configured yet.",
    );
  }

  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        {
          role: "system",
          content: buildSystemPrompt({ now, timezone, markets }),
        },
        { role: "user", content: stripBotPrefix(text) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "sidebar_market_intent",
          strict: true,
          schema: INTENT_SCHEMA,
        },
      },
      max_output_tokens: 500,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI intent parsing failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("OpenAI returned no structured intent output.");

  return validateModelIntent(JSON.parse(outputText));
}

export const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [...ACTIONS],
    },
    marketNumber: { type: ["integer", "null"] },
    side: { enum: ["yes", "no", "void", null] },
    amount: { type: ["integer", "null"] },
    question: { type: ["string", "null"] },
    criteria: { type: ["string", "null"] },
    revealAt: { type: ["string", "null"] },
    closeAt: { type: ["string", "null"] },
    resolveAt: { type: ["string", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    clarification: { type: ["string", "null"] },
  },
  required: [
    "action",
    "marketNumber",
    "side",
    "amount",
    "question",
    "criteria",
    "revealAt",
    "closeAt",
    "resolveAt",
    "confidence",
    "clarification",
  ],
};

function stripBotPrefix(text) {
  return String(text ?? "").replace(BOT_PREFIX, "");
}

function parseBet(request, markets) {
  const patterns = [
    /\b(?:bet|stake|put)\s+(\d+)(?:\s+points?)?\s+(?:on\s+)?(yes|no)\b.*?\b(?:market\s*)?#?(\d+)\b/i,
    /\b(?:market\s*)?#?(\d+)\b.*?\b(?:bet|stake|put)\s+(\d+)(?:\s+points?)?\s+(?:on\s+)?(yes|no)\b/i,
  ];
  const first = request.match(patterns[0]);
  if (first) {
    return intent("place_bet", {
      amount: Number(first[1]),
      side: first[2].toLowerCase(),
      marketNumber: Number(first[3]),
    });
  }
  const second = request.match(patterns[1]);
  if (second) {
    return intent("place_bet", {
      marketNumber: Number(second[1]),
      amount: Number(second[2]),
      side: second[3].toLowerCase(),
    });
  }

  const implicit = request.match(
    /\b(?:bet|stake|put)\s+(\d+)(?:\s+points?)?\s+(?:on\s+)?(?:(yes|no)\s+(?:on|for)\s+)?(.+)$/i,
  );
  if (implicit) {
    const matched = resolveMarketReference(implicit[3], markets);
    if (matched.intent) {
      return intent("place_bet", {
        amount: Number(implicit[1]),
        side: implicit[2]?.toLowerCase() ?? "yes",
        marketNumber: matched.intent,
      });
    }
    return unknown(matched.clarification || "Which market do you want to bet on?");
  }
  return null;
}

function parseResolution(request, markets) {
  if (!/\b(?:resolve|adjudicate|settle)\b/i.test(request)) return null;
  let marketNumber = extractMarketNumber(request);
  const side = request.match(/\b(yes|no|void|ambiguous)\b/i)?.[1]?.toLowerCase();
  if (!side) return unknown("Should I resolve that market as Yes, No, or Void?");
  if (marketNumber == null) {
    const matched = resolveMarketReference(request, markets);
    if (!matched.intent) {
      return unknown(matched.clarification || "Which market do you want to resolve?");
    }
    marketNumber = matched.intent;
  }
  return intent("resolve_market", {
    marketNumber,
    side: side === "ambiguous" ? "void" : side,
  });
}

function resolveMarketReference(reference, markets) {
  if (!Array.isArray(markets) || markets.length === 0) return {};
  const referenceTokens = meaningfulTokens(reference);
  if (referenceTokens.size === 0) return {};

  const ranked = markets
    .map((market) => {
      const questionTokens = meaningfulTokens(market.question);
      const overlap = [...questionTokens].filter((token) => referenceTokens.has(token)).length;
      const coverage = questionTokens.size ? overlap / questionTokens.size : 0;
      const precision = referenceTokens.size ? overlap / referenceTokens.size : 0;
      return {
        market,
        overlap,
        score: coverage * 0.75 + precision * 0.25,
      };
    })
    .filter(({ overlap, score }) => overlap >= 2 && score >= 0.5)
    .sort((a, b) => b.score - a.score || b.overlap - a.overlap);

  if (ranked.length === 0) return {};
  const [best, second] = ranked;
  if (second && best.score - second.score < 0.15) {
    return {
      clarification: `I found more than one possible market: ${ranked
        .slice(0, 3)
        .map(({ market }) => `#${market.display_num} “${market.question}”`)
        .join("; ")}. Which one?`,
    };
  }
  return { intent: Number(best.market.display_num) };
}

const MATCH_STOPWORDS = new Set([
  "a",
  "an",
  "as",
  "at",
  "bet",
  "for",
  "is",
  "market",
  "on",
  "points",
  "put",
  "resolve",
  "settle",
  "show",
  "stake",
  "that",
  "the",
  "to",
  "will",
  "yes",
  "no",
  "void",
]);

function meaningfulTokens(value) {
  return new Set(
    String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map(stemToken)
      .filter((token) => token.length >= 2 && !MATCH_STOPWORDS.has(token)),
  );
}

function stemToken(token) {
  if (token.length > 5 && token.endsWith("ing")) {
    const stem = token.slice(0, -3);
    return /(.)\1$/.test(stem) ? stem.slice(0, -1) : stem;
  }
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function parseCreateMarket(request, now) {
  const match = request.match(
    /^(?:create|open)(?:\s+a)?\s+market(?:\s*[:\-])?\s+(.+?)\s+(?:betting\s+)?closes?\s+(.+)$/i,
  );
  if (!match) return null;

  const closeAt = parseRelativeInstant(match[2], now);
  if (!closeAt) return null;

  const question = match[1].trim().replace(/^["“]|["”]$/g, "");
  const revealAt = new Date(now.getTime() + 1_000);
  const resolveAt = new Date(closeAt.getTime() + 1_000);
  return intent("create_market", {
    question,
    criteria: `Resolves Yes if “${question}” is true when betting closes.`,
    revealAt: revealAt.toISOString(),
    closeAt: closeAt.toISOString(),
    resolveAt: resolveAt.toISOString(),
  });
}

function parseRelativeInstant(value, now) {
  const relative = value.match(/\bin\s+(\d+)\s*(minutes?|mins?|hours?|hrs?|days?)\b/i);
  if (!relative) return null;
  const amount = Number(relative[1]);
  const unit = relative[2].toLowerCase();
  const multiplier = unit.startsWith("d")
    ? 86_400_000
    : unit.startsWith("h")
      ? 3_600_000
      : 60_000;
  return new Date(now.getTime() + amount * multiplier);
}

function extractMarketNumber(request) {
  const explicit = request.match(/\bmarket\s*#?(\d+)\b/i);
  if (explicit) return Number(explicit[1]);
  const hash = request.match(/#(\d+)\b/);
  return hash ? Number(hash[1]) : null;
}

function intent(action, fields = {}) {
  return {
    action,
    marketNumber: null,
    side: null,
    amount: null,
    question: null,
    criteria: null,
    revealAt: null,
    closeAt: null,
    resolveAt: null,
    confidence: 1,
    clarification: null,
    source: "deterministic",
    ...fields,
  };
}

function unknown(clarification) {
  return intent("unknown", { clarification });
}

function buildSystemPrompt({ now, timezone, markets }) {
  const marketContext = markets
    .slice(0, 20)
    .map((market) => `#${market.display_num}: ${market.question}`)
    .join("\n");
  return [
    "Convert one Sidebar group-chat request into exactly one structured market action.",
    "Do not execute anything and do not invent IDs, amounts, outcomes, or times.",
    "Use unknown with a short clarification when the request is ambiguous or incomplete.",
    "create_market needs a question and closeAt; preserve the user's meaning. criteria may summarize the stated resolution condition.",
    "place_bet needs marketNumber, side yes/no, and a positive whole-number amount.",
    "resolve_market needs marketNumber and side yes/no/void.",
    `Current time: ${now.toISOString()}`,
    `Group timezone: ${timezone}`,
    marketContext ? `Known markets:\n${marketContext}` : "Known markets: none",
  ].join("\n");
}

function extractOutputText(payload) {
  for (const item of payload?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function validateModelIntent(value) {
  if (!value || typeof value !== "object" || !ACTIONS.has(value.action)) {
    throw new Error("OpenAI returned an unsupported Sidebar action.");
  }
  if (typeof value.confidence !== "number" || value.confidence < 0.8) {
    return unknown(value.clarification || "Could you say that another way?");
  }
  return { ...value, source: "openai" };
}
