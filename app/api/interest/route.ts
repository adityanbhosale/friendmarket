const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const KV_KEY = "friendmarket:interest";

const MAX_NAME_LENGTH = 40;

type Signup = { name: string; at: string };

// TODO: in-memory fallback, used only when KV isn't configured. It's per-instance
// and resets on every cold start, so signups WILL be lost. Set KV_REST_API_URL and
// KV_REST_API_TOKEN (Vercel KV / Upstash Redis) before sending the link to anyone.
let memory: Signup[] = [];

const kvConfigured = Boolean(KV_URL && KV_TOKEN);

async function readSignups(): Promise<Signup[]> {
  if (!kvConfigured) return memory;

  const res = await fetch(`${KV_URL}/get/${KV_KEY}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV read failed: ${res.status}`);

  // The REST API wraps the stored value: { result: "<json string>" | null }.
  const { result } = (await res.json()) as { result: string | null };
  if (!result) return [];

  const parsed: unknown = JSON.parse(result);
  return Array.isArray(parsed) ? (parsed as Signup[]) : [];
}

async function writeSignups(signups: Signup[]): Promise<void> {
  if (!kvConfigured) {
    memory = signups;
    return;
  }

  const res = await fetch(`${KV_URL}/set/${KV_KEY}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(signups),
  });
  if (!res.ok) throw new Error(`KV write failed: ${res.status}`);
}

export async function POST(request: Request) {
  let name: string;
  try {
    const body = (await request.json()) as { name?: unknown };
    name = typeof body.name === "string" ? body.name.trim() : "";
  } catch {
    return Response.json({ error: "Send some JSON." }, { status: 400 });
  }

  if (!name) {
    return Response.json({ error: "Need a name." }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    name = name.slice(0, MAX_NAME_LENGTH);
  }

  try {
    // Read-modify-write on a single blob. Two people submitting in the same
    // instant could clobber each other — acceptable for a group-chat waitlist.
    const signups = await readSignups();

    // Already signed up? Hand back the original spot instead of burning a new one
    // so a double-tap doesn't bump anyone.
    const existing = signups.findIndex(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing !== -1) {
      return Response.json({ position: existing + 1, returning: true });
    }

    signups.push({ name, at: new Date().toISOString() });
    await writeSignups(signups);

    return Response.json({ position: signups.length, returning: false });
  } catch (error) {
    console.error("[/api/interest]", error);
    return Response.json(
      { error: "Couldn't save that. Try again." },
      { status: 500 },
    );
  }
}
