// server.js — локальный прокси -> Google Apps Script
import express from "express";
import fetch from "node-fetch";

const app = express();
// ВСТАВЬ свой GAS URL:
const GAS_URL =
  "https://script.google.com/macros/s/AKfycbyvowhGMM-nFRO79WkVWbUyt-b9Y1DzkEwnWWQzX6L-GTybh8s-4tKvA_F_LzTPLFZRNA/exec";

// Принимаем тело как текст (мы шлём text/plain дальше на GAS)
app.use(express.text({ type: "*/*" }));

// CORS для твоего фронта на localhost (Live Server и т.п.)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// POST -> прокидываем на GAS как text/plain
app.post("/api", async (req, res) => {
  try {
    const r = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: req.body || "{}",
    });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// GET (для простых запросов типа dashboard через GET, если нужно)
app.get("/api", async (req, res) => {
  try {
    const url =
      GAS_URL + (req.url.includes("?") ? req.url.replace("/api", "") : "");
    const r = await fetch(url, { method: "GET" });
    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log("Proxy on http://localhost:" + PORT));
