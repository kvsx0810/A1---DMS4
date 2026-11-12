// Hẻm Vô Tận chat backend: the game's customers talk through Gemini without the API key ever reaching the browser.
// POST /chat  { messages: [{ role: "user" | "assistant", content: string }], lang: "vi" | "en" }  ->  { text: string | null }

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

    // Gemini calls the assistant side "model"
    const contents = msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content.slice(0, MAX_CHARS) }] }));
    const model = env.MODEL || "gemini-2.5-flash";
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM + (body.lang === "en" ? "\nAlways answer in English." : "\nLuôn trả lời bằng tiếng Việt.") }] },
          contents,
          generationConfig: { maxOutputTokens: 1024, temperature: 0.9 },
        }),
      });
    } catch { return json({ error: "upstream unreachable" }, 502, h); }
    if (r.status === 429) return json({ error: "busy" }, 429, h);
    if (!r.ok) return json({ error: "upstream error", status: r.status }, 502, h);

    const data = await r.json();
    const cand = (data.candidates || [])[0];
    // blocked or cut off by a safety filter: return nothing, the game swaps in a written line
    if (!cand || data.promptFeedback?.blockReason || cand.finishReason === "SAFETY") return json({ text: null }, 200, h);
    const text = (cand.content?.parts || []).map(p => p.text || "").join("").trim();
    return json({ text: text || null }, 200, h);
  },
};
