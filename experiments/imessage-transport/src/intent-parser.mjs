const BOT_PREFIX = /^\s*(?:hey\s+)?@?sidebar\s*[:,\-]?\s*/i;

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

export function parseDeterministicIntent(text, { now = new Date() } = {}) {
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
  if (/\b(?:adjudicator|judge)\b/i.test(request)) {
    return unknown(
      "Random adjudicators are not implemented yet. The current backend allows only the market proposer to resolve it.",
    );
  }

  const bet = parseBet(request);
  if (bet) return bet;

  const resolution = parseResolution(request);
  if (resolution) return resolution;

  const create = parseCreateMarket(request, now);
  if (create) return create;

  const marketNumber = extractMarketNumber(request);
  if (/\b(?:odds?|pot|status|time|left|remaining|stakes?|payouts?)\b/i.test(request)) {
    if (marketNumber == null) {
      return unknown("Which market number should I show?");
    }
    return intent("show_market", { marketNumber });
  }

  if (/\b(?:show|list|current|open)\b.*\bmarkets?\b|^markets?\??$/i.test(request)) {
    return intent("list_markets");
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

  const deterministic = parseDeterministicIntent(text, { now });
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

function parseBet(request) {
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
  return null;
}

function parseResolution(request) {
  if (!/\b(?:resolve|adjudicate|settle)\b/i.test(request)) return null;
  const marketNumber = extractMarketNumber(request);
  const side = request.match(/\b(yes|no|void|ambiguous)\b/i)?.[1]?.toLowerCase();
  if (marketNumber == null || !side) return null;
  return intent("resolve_market", {
    marketNumber,
    side: side === "ambiguous" ? "void" : side,
  });
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
