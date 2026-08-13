// Slate data for the /card demo. Pulls real public markets from Polymarket's
// Gamma API (no auth) and falls back to a fixed sample slate so the page can
// never render empty.

const GAMMA_URL =
  process.env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com/markets";

const WINDOW_DAYS = 21;
const SLATE_SIZE = 8;
const FETCH_TIMEOUT_MS = 8000;
const PAGE_SIZE = 100; // Gamma caps a page at 100 regardless of what you ask for.
const PAGE_OFFSETS = [0, 100, 200];

// Below this many usable markets the slate looks broken, so we show the sample
// instead of a thin card.
const MIN_USABLE = 4;

// Gamma exposes no category field, so these are derived from the question text.
const CATEGORIES = ["sports", "politics", "crypto", "pop culture"] as const;
type Category = (typeof CATEGORIES)[number] | "other";

const KEYWORDS: Record<Exclude<Category, "other">, string[]> = {
  sports: [
    "nfl", "nba", "mlb", "nhl", "ufc", "soccer", "premier league", "world cup",
    "champions league", "super bowl", "formula 1", " f1 ", "tennis", "golf",
    "olympic", "cricket", "boxing", "wimbledon", "playoff", "grand slam",
    "manchester", "real madrid", "lakers", "yankees", "win the title",
    " vs ", " vs. ", "esports", "counter-strike", "league of legends", "open:",
  ],
  crypto: [
    "bitcoin", "btc", "ethereum", "eth ", "solana", "crypto", "coinbase",
    "binance", "xrp", "dogecoin", "stablecoin", "altcoin", "memecoin",
    "blockchain", "satoshi", "etf approval",
  ],
  politics: [
    "election", "president", "senate", "congress", "governor", "parliament",
    "prime minister", "nominee", "impeach", "cabinet", "fed chair", "supreme court",
    "government", "minister", "ceasefire", "treaty", "nuclear", "sanction",
    "shutdown", "tariff", "chancellor", "referendum", "nato", "war",
  ],
  "pop culture": [
    "movie", "film", "oscar", "grammy", "album", "taylor swift", "netflix",
    "box office", "spotify", "tv show", "rotten tomatoes", "billboard", "emmy",
    "drake", "mrbeast", "youtube", "tiktok", "celebrity", "single of the year",
    "streaming", "sequel",
  ],
};

export type SlateMarket = {
  question: string;
  /** The outcome the probability describes: "Yes", or a competitor's name. */
  side: string;
  /** Polymarket implied probability of `side`, 0-100. */
  probability: number;
  /** ISO timestamp of market close. */
  closes: string;
  category: Category;
};

export type Slate = {
  markets: SlateMarket[];
  source: "polymarket" | "sample";
  window: { start: string; end: string };
};

type GammaMarket = {
  question?: string;
  endDate?: string;
  outcomes?: string;
  outcomePrices?: string;
  active?: boolean;
  closed?: boolean;
};

function classify(question: string): Category {
  const q = ` ${question.toLowerCase()} `;
  for (const category of CATEGORIES) {
    if (KEYWORDS[category].some((k) => q.includes(k))) return category;
  }
  return "other";
}

/** Collapses "…by August 15" / "…by August 31" style near-duplicates. */
function stem(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z ]/g, "") // drop digits too: the ladder differs only by price
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
}

function parseMarket(raw: GammaMarket): SlateMarket | null {
  const { question, endDate, outcomes, outcomePrices } = raw;
  if (!question || !endDate || !outcomes || !outcomePrices) return null;
  if (raw.closed) return null;

  let names: unknown;
  let prices: unknown;
  try {
    names = JSON.parse(outcomes);
    prices = JSON.parse(outcomePrices);
  } catch {
    return null;
  }
  if (!Array.isArray(names) || !Array.isArray(prices)) return null;
  if (names.length !== 2 || prices.length !== 2) return null;
  if (!names.every((n) => typeof n === "string" && n.trim())) return null;

  // Binary means two outcomes, which on Polymarket is either Yes/No or a
  // head-to-head between two named competitors. Quote the Yes side when there
  // is one, otherwise the first competitor.
  const yesIndex = names.findIndex((n) => String(n).toLowerCase() === "yes");
  const sideIndex = yesIndex === -1 ? 0 : yesIndex;
  const side = String(names[sideIndex]);

  const price = Number(prices[sideIndex]);
  if (!Number.isFinite(price)) return null;

  // A slate of near-certainties is nothing to bet on, so keep the genuinely
  // uncertain ones.
  if (price < 0.05 || price > 0.95) return null;

  return {
    question,
    side,
    probability: Math.round(price * 100),
    closes: endDate,
    category: classify(question),
  };
}

/** Round-robins across categories so one busy topic can't fill the card. */
function pickVaried(markets: SlateMarket[], size: number): SlateMarket[] {
  const buckets = new Map<Category, SlateMarket[]>();
  for (const m of markets) {
    const bucket = buckets.get(m.category) ?? [];
    bucket.push(m);
    buckets.set(m.category, bucket);
  }

  const order: Category[] = [...CATEGORIES, "other"];
  const picked: SlateMarket[] = [];
  let exhausted = false;

  while (picked.length < size && !exhausted) {
    exhausted = true;
    for (const category of order) {
      if (picked.length >= size) break;
      const bucket = buckets.get(category);
      if (bucket?.length) {
        picked.push(bucket.shift()!);
        exhausted = false;
      }
    }
  }

  return picked;
}

function tripWindow(now: Date) {
  const end = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { start: now.toISOString(), end: end.toISOString() };
}

export async function getSlate(): Promise<Slate> {
  const now = new Date();
  const window = tripWindow(now);

  try {
    // One page is 100 markets and the busiest topics crowd out everything else,
    // so read a few pages deep to reach the rest of the board.
    const pages = await Promise.allSettled(
      PAGE_OFFSETS.map(async (offset) => {
        const params = new URLSearchParams({
          active: "true",
          closed: "false",
          limit: String(PAGE_SIZE),
          offset: String(offset),
          order: "volumeNum",
          ascending: "false",
          end_date_min: window.start,
          end_date_max: window.end,
        });

        const res = await fetch(`${GAMMA_URL}?${params}`, {
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) throw new Error(`Gamma responded ${res.status}`);

        const body: unknown = await res.json();
        if (!Array.isArray(body)) throw new Error("Gamma returned a non-array");
        return body as GammaMarket[];
      }),
    );

    const raw = pages.flatMap((p) => (p.status === "fulfilled" ? p.value : []));
    if (raw.length === 0) throw new Error("every page failed");

    const seen = new Set<string>();
    const usable: SlateMarket[] = [];
    for (const item of raw) {
      const parsed = parseMarket(item);
      if (!parsed) continue;
      const key = stem(parsed.question);
      if (seen.has(key)) continue;
      seen.add(key);
      usable.push(parsed);
    }

    if (usable.length < MIN_USABLE) {
      throw new Error(`only ${usable.length} usable markets`);
    }

    return {
      markets: pickVaried(usable, SLATE_SIZE),
      source: "polymarket",
      window,
    };
  } catch (error) {
    console.error("[/card] falling back to sample slate:", error);
    return { markets: sampleSlate(now), source: "sample", window };
  }
}

/** Fixed slate used when the API is unreachable. Dates ride off `now` so the
 *  sample always sits inside the trip window. */
function sampleSlate(now: Date): SlateMarket[] {
  const inDays = (d: number) =>
    new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString();

  return [
    { question: "Los Angeles Lakers vs. Boston Celtics", side: "Los Angeles Lakers", probability: 47, closes: inDays(4), category: "sports" },
    { question: "Will the government shutdown end before the end of the month?", side: "Yes", probability: 62, closes: inDays(9), category: "politics" },
    { question: "Will Bitcoin close above $120,000 this month?", side: "Yes", probability: 38, closes: inDays(14), category: "crypto" },
    { question: "Will the new Dune sequel open above $80M domestic?", side: "Yes", probability: 55, closes: inDays(11), category: "pop culture" },
    { question: "Manchester City vs. Arsenal", side: "Manchester City", probability: 41, closes: inDays(7), category: "sports" },
    { question: "Will the Fed cut rates at the next meeting?", side: "Yes", probability: 71, closes: inDays(18), category: "politics" },
    { question: "Will Ethereum outperform Bitcoin over the next fortnight?", side: "Yes", probability: 44, closes: inDays(16), category: "crypto" },
    { question: "Will the album debut at number one on the Billboard 200?", side: "Yes", probability: 66, closes: inDays(6), category: "pop culture" },
  ];
}
