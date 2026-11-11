// Hẻm Vô Tận chat backend: the game's customers talk through Claude without the API key ever reaching the browser.
// POST /chat  { messages: [{ role: "user" | "assistant", content: string }], lang: "vi" | "en" }  ->  { text: string | null }
import Anthropic from "@anthropic-ai/sdk";

const MAX_TURNS = 10, MAX_CHARS = 1500, PER_MINUTE = 12;
const hits = new Map();     // best-effort per-IP limit, per Worker instance

const SYSTEM = `You voice customers in "Hẻm Vô Tận", an educational game that teaches players to read Saigon alley addresses. Every person, order and address in the game is fictional.
Write exactly one short chat message (under 30 words) as the customer described in the conversation: an ordinary, friendly person waiting for a food delivery.
Write the way people really text: casual, lowercase, no full stop at the end, no emoji. Reply only with the message itself, or with the JSON object if one is asked for.`;

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
  return { "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Vary": "Origin" };
}
const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "", h = cors(origin, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (req.method !== "POST" || new URL(req.url).pathname !== "/chat") return json({ error: "not found" }, 404, h);
    if (h["Access-Control-Allow-Origin"] !== origin) return json({ error: "origin not allowed" }, 403, h);

    // a small rate limit so one visitor cannot run up the bill
    const ip = req.headers.get("CF-Connecting-IP") || "?", now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < 60000);
    if (recent.length >= PER_MINUTE) return json({ error: "slow down" }, 429, h);
    recent.push(now); hits.set(ip, recent);

    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400, h); }
    const msgs = Array.isArray(body.messages) ? body.messages.slice(-MAX_TURNS) : [];
    if (!msgs.length || msgs[0].role !== "user" || !msgs.every((m, k) => (m.role === (k % 2 ? "assistant" : "user")) && typeof m.content === "string"))
      return json({ error: "bad messages" }, 400, h);
    const messages = msgs.map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const res = await client.beta.messages.create({
        model: env.MODEL || "claude-opus-5-5",
        max_tokens: 1024,
        output_config: { effort: "low" },          // short in-character lines: little reasoning needed
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",                      // if a request is declined, the API retries it on a fallback model
        system: SYSTEM + (body.lang === "en" ? "\nAlways answer in English." : "\nLuôn trả lời bằng tiếng Việt."),
        messages,
      });
      if (res.stop_reason === "refusal") return json({ text: null }, 200, h);   // the game swaps in a written line
      const text = res.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
      return json({ text: text || null }, 200, h);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429, h);
      if (e instanceof Anthropic.APIConnectionError) return json({ error: "upstream unreachable" }, 502, h);
      if (e instanceof Anthropic.APIError) return json({ error: "upstream error", status: e.status }, 502, h);
      return json({ error: "server error" }, 500, h);
    }
  },
};
