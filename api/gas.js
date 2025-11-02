export default async function handler(req, res) {
  const GAS_URL = process.env.GAS_URL; // храним в переменных окружения!
  if (!GAS_URL)
    return res.status(500).json({ ok: false, error: "GAS_URL not set" });

  // CORS для твоего фронта (можно "*" или конкретный домен)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // На GAS всегда шлём text/plain (без preflight на их стороне)
    const init =
      req.method === "POST"
        ? {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(req.body || {}),
          }
        : { method: "GET" };

    const r = await fetch(
      GAS_URL + (req.url.includes("?") ? req.url.replace("/api/gas", "") : ""),
      init
    );
    const text = await r.text();

    res
      .status(r.status)
      .setHeader("Content-Type", "application/json")
      .send(text);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
