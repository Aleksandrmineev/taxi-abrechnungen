const API = "https://YOUR_VERCEL_DOMAIN.vercel.app/api/gas";

async function api(action, payload = {}, method = "POST") {
  const res = await fetch(
    API + (method === "GET" ? `?action=${encodeURIComponent(action)}` : ""),
    {
      method,
      headers: { "Content-Type": "application/json" },
      body:
        method === "POST" ? JSON.stringify({ action, ...payload }) : undefined,
    }
  );
  const data = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));
  if (!res.ok || data.ok === false)
    throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

window.TaxiApi = { api };
