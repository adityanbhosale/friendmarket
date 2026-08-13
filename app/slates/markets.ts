// Slate data for the /slates demo. Pulls real public markets from Polymarket's
// Gamma API (no auth), weights each trip's slate toward its region, and falls
// back to a fixed sample slate so a slate can never render empty.

import { cache } from "react";

const GAMMA_URL =
  process.env.POLYMARKET_GAMMA_URL ?? "https://gamma-api.polymarket.com/markets";

const PAGE_SIZE = 100; // Gamma caps a page at 100 regardless of what you ask for.
const PAGE_OFFSETS = [0, 100, 200, 300, 400, 500];
const FETCH_TIMEOUT_MS = 8000;

const POOL_WINDOW_DAYS = 35; // Must cover the furthest trip window below.
const SLATE_SIZE = 8;
const MAX_REGIONAL = 4;
const MIN_REGIONAL = 2; // Below this the slate carries a thin-coverage note.
const MIN_USABLE = 4; // Below this the pool is treated as unusable.

// Head-to-heads are the draw, so regional matches get a wider band than the
// national fill.
const REGIONAL_BAND = [0.03, 0.97] as const;
const NATIONAL_BAND = [0.05, 0.95] as const;

// Gamma exposes no category field, so these are derived from the question text.
const CATEGORIES = ["sports", "politics", "crypto", "pop culture"] as const;
type Category = (typeof CATEGORIES)[number] | "other";

const KEYWORDS: Record<Exclude<Category, "other">, string[]> = {
  sports: [
    "nfl", "nba", "mlb", "nhl", "ufc", "soccer", "premier league", "world cup",
    "champions league", "super bowl", "formula 1", " f1 ", "tennis", "golf",
    "olympic", "cricket", "boxing", "wimbledon", "playoff", "grand slam",
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

export type Origin = "regional" | "national";

export type SlateMarket = {
  question: string;
  /** The outcome the probability describes: "Yes", or a competitor's name. */
  side: string;
  /** Polymarket implied probability of `side`, 0-100. */
  probability: number;
  /** ISO timestamp of market close. */
  closes: string;
  category: Category;
  origin: Origin;
};

export type Trip = {
  slug: string;
  no: string;
  name: string;
  destination: string;
  note: string;
  startInDays: number;
  endInDays: number;
  /** Team names, city, state and figures used to weight the slate regionally. */
  keywords: string[];
  sampleRegional: SampleEntry[];
};

type SampleEntry = {
  question: string;
  side: string;
  probability: number;
  category: Category;
};

export type Slate = {
  trip: Trip;
  window: { start: string; end: string };
  markets: SlateMarket[];
  regionalCount: number;
  thinRegional: boolean;
  source: "polymarket" | "sample";
};

export const TRIPS: Trip[] = [
  {
    slug: "moab",
    no: "001",
    name: "Moab",
    destination: "Hiking — Moab, UT",
    note: "Four people who own boots and two who bought them last week.",
    startInDays: 3,
    endInDays: 10,
    keywords: [
      "utah", "utah jazz", "salt lake", "byu", "real salt lake", "spencer cox",
      "colorado", "denver", "denver nuggets", "denver broncos",
      "colorado avalanche", "colorado rockies", "jared polis",
    ],
    sampleRegional: [
      { question: "Utah Jazz vs. Denver Nuggets", side: "Utah Jazz", probability: 43, category: "sports" },
      { question: "Colorado Rockies vs. Arizona Diamondbacks", side: "Colorado Rockies", probability: 38, category: "sports" },
      { question: "Will Utah pass the public lands measure this session?", side: "Yes", probability: 57, category: "politics" },
    ],
  },
  {
    slug: "miami",
    no: "002",
    name: "Miami",
    destination: "Beach week — Miami, FL",
    note: "Nobody has confirmed where anybody is sleeping.",
    startInDays: 5,
    endInDays: 13,
    keywords: [
      "miami", "miami marlins", "miami dolphins", "miami heat",
      "florida panthers", "inter miami", "miami hurricanes", "florida",
      "ron desantis", "tampa", "orlando", "messi",
    ],
    sampleRegional: [
      { question: "Miami Marlins vs. Atlanta Braves", side: "Miami Marlins", probability: 41, category: "sports" },
      { question: "Inter Miami vs. Orlando City", side: "Inter Miami", probability: 62, category: "sports" },
      { question: "Will Florida call a special session before October?", side: "Yes", probability: 29, category: "politics" },
    ],
  },
  {
    slug: "la",
    no: "003",
    name: "Los Angeles",
    destination: "Los Angeles, CA",
    note: "Two of them are 'taking meetings' and will not elaborate.",
    startInDays: 8,
    endInDays: 15,
    keywords: [
      "los angeles", "dodgers", "los angeles angels", "lakers", "clippers",
      "los angeles rams", "los angeles chargers", "los angeles kings",
      "anaheim ducks", "lafc", "la galaxy", "usc", "ucla", "california",
      "gavin newsom",
    ],
    sampleRegional: [
      { question: "Los Angeles Dodgers vs. San Diego Padres", side: "Los Angeles Dodgers", probability: 58, category: "sports" },
      { question: "Los Angeles Lakers vs. Golden State Warriors", side: "Los Angeles Lakers", probability: 47, category: "sports" },
      { question: "Will Newsom announce before the end of the month?", side: "Yes", probability: 34, category: "politics" },
    ],
  },
  {
    slug: "nyc",
    no: "004",
    name: "New York",
    destination: "New York weekend",
    note: "The itinerary is one restaurant and a lot of walking.",
    startInDays: 10,
    endInDays: 17,
    keywords: [
      "new york", "nyc", "yankees", "mets", "knicks", "brooklyn nets",
      "new york giants", "new york jets", "new york rangers",
      "new york islanders", "mamdani", "kathy hochul", "eric adams",
      "andrew cuomo", "new york mayor", "brooklyn", "manhattan",
    ],
    sampleRegional: [
      { question: "New York Yankees vs. Boston Red Sox", side: "New York Yankees", probability: 55, category: "sports" },
      { question: "New York Mets vs. Philadelphia Phillies", side: "New York Mets", probability: 46, category: "sports" },
      { question: "Will the NYC mayoral race tighten to within 5 points?", side: "Yes", probability: 39, category: "politics" },
    ],
  },
  {
    slug: "austin",
    no: "005",
    name: "Austin",
    destination: "Austin, TX",
    note: "Booked around one show nobody else wanted to see.",
    startInDays: 12,
    endInDays: 21,
    keywords: [
      "texas", "longhorns", "astros", "texas rangers", "dallas cowboys",
      "dallas mavericks", "san antonio spurs", "houston rockets", "austin",
      "greg abbott", "ted cruz", "dallas", "houston",
    ],
    sampleRegional: [
      { question: "Houston Astros vs. Texas Rangers", side: "Houston Astros", probability: 52, category: "sports" },
      { question: "Dallas Cowboys vs. Philadelphia Eagles", side: "Dallas Cowboys", probability: 44, category: "sports" },
      { question: "Will Texas certify the new district map this month?", side: "Yes", probability: 63, category: "politics" },
    ],
  },
  {
    slug: "tahoe",
    no: "006",
    name: "Lake Tahoe",
    destination: "Lake Tahoe",
    note: "One car, six people, and a disputed playlist policy.",
    startInDays: 16,
    endInDays: 28,
    keywords: [
      "san francisco", "san francisco giants", "49ers", "golden state warriors",
      "san jose sharks", "oakland athletics", "las vegas athletics",
      "sacramento", "california", "gavin newsom", "nevada", "las vegas",
      "vegas golden knights", "las vegas raiders", "reno", "tahoe",
      "joe lombardo",
    ],
    sampleRegional: [
      { question: "San Francisco Giants vs. Los Angeles Dodgers", side: "San Francisco Giants", probability: 42, category: "sports" },
      { question: "Vegas Golden Knights vs. San Jose Sharks", side: "Vegas Golden Knights", probability: 66, category: "sports" },
      { question: "Will Nevada report turnout above 60% this cycle?", side: "Yes", probability: 48, category: "politics" },
    ],
  },
];

const SHARED_NATIONAL_SAMPLE: SampleEntry[] = [
  { question: "Will the government shutdown end before the end of the month?", side: "Yes", probability: 62, category: "politics" },
  { question: "Will Bitcoin close above $120,000 this month?", side: "Yes", probability: 38, category: "crypto" },
  { question: "Will the new Dune sequel open above $80M domestic?", side: "Yes", probability: 55, category: "pop culture" },
  { question: "Will the Fed cut rates at the next meeting?", side: "Yes", probability: 71, category: "politics" },
  { question: "Will Ethereum outperform Bitcoin over the next fortnight?", side: "Yes", probability: 44, category: "crypto" },
];

export function getTrip(slug: string): Trip | undefined {
  return TRIPS.find((t) => t.slug === slug);
}

export function tripWindow(trip: Trip, now: Date = new Date()) {
  const day = 24 * 60 * 60 * 1000;
  return {
    start: new Date(now.getTime() + trip.startInDays * day).toISOString(),
    end: new Date(now.getTime() + trip.endInDays * day).toISOString(),
  };
}

// --- pool ---------------------------------------------------------------

type GammaMarket = {
  question?: string;
  endDate?: string;
  outcomes?: string;
  outcomePrices?: string;
  closed?: boolean;
};

/** A parsed market plus the lowercased text used for regional scoring. */
type PoolMarket = Omit<SlateMarket, "origin"> & {
  price: number;
  haystack: string;
};

function classify(question: string): Category {
  const q = ` ${question.toLowerCase()} `;
  for (const category of CATEGORIES) {
    if (KEYWORDS[category].some((k) => q.includes(k))) return category;
  }
  return "other";
}

/** Collapses "…dip to $60,000" / "…dip to $57,500" style near-duplicates. */
function stem(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z ]/g, "") // drop digits too: the ladder differs only by price
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
}

function parseMarket(raw: GammaMarket): PoolMarket | null {
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

  return {
    question,
    side,
    price,
    probability: Math.round(price * 100),
    closes: endDate,
    category: classify(question),
    haystack: `${question} ${names.join(" ")}`.toLowerCase(),
  };
}

/** One shared read of the board, reused by every slate. */
const getPool = cache(async (): Promise<PoolMarket[]> => {
  const now = new Date();
  const end = new Date(now.getTime() + POOL_WINDOW_DAYS * 24 * 60 * 60 * 1000);

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
        end_date_min: now.toISOString(),
        end_date_max: end.toISOString(),
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

  const parsed = raw
    .map(parseMarket)
    .filter((m): m is PoolMarket => m !== null);

  if (parsed.length < MIN_USABLE) {
    throw new Error(`only ${parsed.length} usable markets`);
  }
  return parsed;
});

// --- selection ----------------------------------------------------------

// Substring matching produces false regional tags — "cruz" hits CF Cruz Azul,
// "giants" hits the San Francisco Giants on a New York slate. Match whole words
// only, and keep ambiguous names fully qualified in the keyword lists.
const matcherCache = new Map<string, RegExp[]>();

function matchers(trip: Trip): RegExp[] {
  let compiled = matcherCache.get(trip.slug);
  if (!compiled) {
    compiled = trip.keywords.map(
      (k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
    );
    matcherCache.set(trip.slug, compiled);
  }
  return compiled;
}

function regionalScore(market: PoolMarket, trip: Trip): number {
  return matchers(trip).reduce(
    (score, re) => (re.test(market.haystack) ? score + 1 : score),
    0,
  );
}

function dedupe(markets: PoolMarket[], used: Set<string>): PoolMarket[] {
  const out: PoolMarket[] = [];
  for (const m of markets) {
    const key = stem(m.question);
    if (used.has(key)) continue;
    used.add(key);
    out.push(m);
  }
  return out;
}

/** Round-robins across categories so one busy topic can't fill the slate. */
function pickVaried(markets: PoolMarket[], size: number): PoolMarket[] {
  const buckets = new Map<Category, PoolMarket[]>();
  for (const m of markets) {
    const bucket = buckets.get(m.category) ?? [];
    bucket.push(m);
    buckets.set(m.category, bucket);
  }

  const order: Category[] = [...CATEGORIES, "other"];
  const picked: PoolMarket[] = [];
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

function tag(markets: PoolMarket[], origin: Origin): SlateMarket[] {
  return markets.map((m) => ({
    question: m.question,
    side: m.side,
    probability: m.probability,
    closes: m.closes,
    category: m.category,
    origin,
  }));
}

export async function getSlate(trip: Trip): Promise<Slate> {
  const now = new Date();
  const window = tripWindow(trip, now);

  try {
    const pool = await getPool();

    // A slate wants markets that resolve while the group is away, but the
    // shared pool is volume-ranked and clusters in the near term, so later
    // windows can be thin. Prefer in-window markets, then top up from the rest
    // of the month rather than starve the slate.
    const inWindow = (m: PoolMarket) =>
      m.closes >= window.start && m.closes <= window.end;
    const windowFirst = [...pool.filter(inWindow), ...pool.filter((m) => !inWindow(m))];

    const used = new Set<string>();

    const regional = dedupe(
      windowFirst
        .filter(
          (m) => m.price >= REGIONAL_BAND[0] && m.price <= REGIONAL_BAND[1],
        )
        .map((m, i) => ({ m, i, score: regionalScore(m, trip) }))
        .filter(({ score }) => score > 0)
        // Strongest regional signal first, window order breaking ties.
        .sort((a, b) => b.score - a.score || a.i - b.i)
        .map(({ m }) => m),
      used,
    ).slice(0, MAX_REGIONAL);

    // `used` now holds every regional stem, so the national fill can't repeat
    // one. Reuse across *different* slates is fine and expected.
    const national = pickVaried(
      dedupe(
        windowFirst.filter(
          (m) => m.price >= NATIONAL_BAND[0] && m.price <= NATIONAL_BAND[1],
        ),
        used,
      ),
      SLATE_SIZE - regional.length,
    );

    const markets = [...tag(regional, "regional"), ...tag(national, "national")];
    if (markets.length < MIN_USABLE) {
      throw new Error(`only ${markets.length} markets inside the trip window`);
    }

    return {
      trip,
      window,
      markets,
      regionalCount: regional.length,
      thinRegional: regional.length < MIN_REGIONAL,
      source: "polymarket",
    };
  } catch (error) {
    console.error(`[/slates/${trip.slug}] falling back to sample:`, error);
    return sampleSlate(trip, window);
  }
}

/** Fixed slate used when the API is unreachable. Dates ride inside the trip
 *  window so the sample always looks like the real thing. */
function sampleSlate(trip: Trip, window: { start: string; end: string }): Slate {
  const start = new Date(window.start).getTime();
  const end = new Date(window.end).getTime();
  const spread = (i: number, total: number) =>
    new Date(start + ((end - start) * (i + 1)) / (total + 1)).toISOString();

  const entries: Array<SampleEntry & { origin: Origin }> = [
    ...trip.sampleRegional.map((e) => ({ ...e, origin: "regional" as const })),
    ...SHARED_NATIONAL_SAMPLE.map((e) => ({ ...e, origin: "national" as const })),
  ];

  const markets: SlateMarket[] = entries.map((e, i) => ({
    question: e.question,
    side: e.side,
    probability: e.probability,
    closes: spread(i, entries.length),
    category: e.category,
    origin: e.origin,
  }));

  const regionalCount = markets.filter((m) => m.origin === "regional").length;

  return {
    trip,
    window,
    markets,
    regionalCount,
    thinRegional: regionalCount < MIN_REGIONAL,
    source: "sample",
  };
}
