/* IA del equipo para la Academia Austrofil — Cloudflare Worker «academia-ia».
   Los asesores usan la IA (pestaña Hablar, explicaciones, preguntas de práctica) sin sacar ninguna clave:
   - Responde con Gemini usando el secreto GEMINI_KEY (la clave de Google AI Studio de Diego, guardada solo en Cloudflare).
   - Si Gemini no responde o se acaba su cupo gratis del día y el Worker tiene conectada la IA de Cloudflare
     (binding «AI»), responde con ella. Sin GEMINI_KEY, usa directamente la IA de Cloudflare.
   - Si se agrega el secreto CODIGO_EQUIPO, solo atiende a quien manda ese código (encabezado x-academia-equipo).
   Solo acepta pedidos desde los sitios de la Academia y limita los pedidos por minuto de cada conexión.
   No guarda nada: recibe la conversación, pide la respuesta a la IA y la devuelve.

   Pedido (POST, JSON):  { "sistema": "instrucción", "mensajes": [{ "rol": "user" | "model", "texto": "…" }], "max": 1024 }
   Respuesta (JSON):     { "texto": "…", "ia": "cloudflare" | "gemini" }   o   { "error": "…", "mensaje": "…" }
   GET /                 { "ok": true, "ia": "cloudflare" | "gemini", "respaldo": true | false }  (para comprobar que está vivo)
   GET /probar           revisa la clave de Gemini sin gastar cupo y dice qué modelos de la lista tiene */

const ORIGENES = [
  "https://academia-austrofil.pages.dev",
  "https://diegobarcoello-maker.github.io",
  "http://localhost:8765"
];
const MODELOS_CF = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/meta/llama-3.1-8b-instruct-fast"
];
/* los mismos que usa la app con clave propia; si uno no existe o no tiene cupo, pasa al siguiente */
const MODELOS_GEMINI = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash-lite"];
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/";
const POR_MINUTO = 30;
const visitas = new Map();   /* ip → { minuto, n } (por instancia; frena el abuso casual) */

function permitido(origen){
  return ORIGENES.indexOf(origen) > -1 || /^https:\/\/[a-z0-9-]+\.academia-austrofil\.pages\.dev$/.test(origen);
}
function respuesta(obj, estado, cors){
  return new Response(JSON.stringify(obj), { status: estado, headers: Object.assign({ "content-type": "application/json; charset=utf-8" }, cors) });
}
function demasiados(ip){
  const minuto = Math.floor(Date.now() / 60000);
  const v = visitas.get(ip);
  if (!v || v.minuto !== minuto){ visitas.set(ip, { minuto: minuto, n: 1 }); if (visitas.size > 5000) visitas.clear(); return false; }
  v.n++;
  return v.n > POR_MINUTO;
}

async function conCloudflare(ai, sistema, mensajes, max){
  if (!ai) throw new Error("Falta conectar la IA de Cloudflare al Worker (Configuración › Enlaces › Workers AI, nombre AI).");
  const messages = [{ role: "system", content: sistema }].concat(mensajes.map(function(m){
    return { role: m.rol === "model" ? "assistant" : "user", content: m.texto };
  }));
  let ultimo = null;
  for (const modelo of MODELOS_CF){
    try {
      const r = await ai.run(modelo, { messages: messages, max_tokens: max, temperature: 0.7 });
      const texto = r && (typeof r.response === "string" ? r.response : r.response && r.response.text) || "";
      if (String(texto).trim()) return String(texto).trim();
      ultimo = new Error("La IA de Cloudflare no devolvió texto.");
    } catch (e){ ultimo = e; }
  }
  throw ultimo || new Error("La IA de Cloudflare no respondió.");
}

/* el motivo que da Google cuando algo falla (nunca trae la clave) */
async function motivo(r){
  try { const d = await r.json(); return String((d && d.error && d.error.message) || "").slice(0, 200); } catch (e){ return ""; }
}
function pedirGemini(clave, modelo, sistema, mensajes, pensar){
  const cfg = { maxOutputTokens: 4096 };   /* holgado: en los modelos que piensan, lo que piensan también cuenta */
  if (pensar) cfg.thinkingConfig = { thinkingLevel: "low" };
  return fetch(GEMINI + "models/" + encodeURIComponent(modelo) + ":generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": clave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sistema }] },
      contents: mensajes.map(function(m){ return { role: m.rol === "model" ? "model" : "user", parts: [{ text: m.texto }] }; }),
      generationConfig: cfg
    })
  });
}
async function conGemini(clave, sistema, mensajes){
  let ultimo = null;
  for (const modelo of MODELOS_GEMINI){
    const pensar = !/lite/.test(modelo);
    let r = await pedirGemini(clave, modelo, sistema, mensajes, pensar);
    let porque = r.ok ? "" : await motivo(r);
    if (!r.ok && pensar && r.status === 400 && /think/i.test(porque)){   /* modelo que no acepta «thinkingLevel»: otra vez sin esa opción */
      r = await pedirGemini(clave, modelo, sistema, mensajes, false);
      porque = r.ok ? "" : await motivo(r);
    }
    if (!r.ok){
      ultimo = Object.assign(new Error("Gemini respondió " + r.status + (porque ? ": " + porque : "")), { estado: r.status });
      const sinModelo = r.status === 404 || (r.status === 400 && /model|not (found|supported)/i.test(porque) && !/api key/i.test(porque));
      if (r.status === 429 || r.status >= 500 || sinModelo) continue;   /* sin cupo, saturado o modelo no disponible: prueba el siguiente */
      throw ultimo;   /* clave mala o sin permiso: no sirve probar otro modelo */
    }
    const d = await r.json();
    const partes = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
    const texto = partes.filter(function(p){ return p && !p.thought && typeof p.text === "string"; }).map(function(p){ return p.text; }).join("").trim();
    if (texto) return texto;
    ultimo = new Error("Gemini no devolvió texto.");
  }
  throw ultimo || new Error("Gemini no respondió.");
}

/* GET /probar: pregunta a Google la lista de modelos (no gasta cupo) para saber si la clave sirve */
async function probar(env){
  const info = { ia: env.GEMINI_KEY ? "gemini" : "cloudflare", respaldo: !!env.AI };
  if (!env.GEMINI_KEY) return info;
  const r = await fetch(GEMINI + "models?pageSize=1000", { headers: { "x-goog-api-key": env.GEMINI_KEY } });
  if (!r.ok){ info.gemini = { estado: r.status, mensaje: await motivo(r) }; return info; }
  const d = await r.json();
  const hay = ((d && d.models) || []).map(function(m){ return String((m && m.name) || "").replace(/^models\//, ""); });
  info.gemini = { estado: 200, modelos: MODELOS_GEMINI.filter(function(m){ return hay.indexOf(m) > -1; }) };
  return info;
}

export default {
  async fetch(req, env){
    const origen = req.headers.get("Origin") || "";
    const ok = permitido(origen);
    const cors = {
      "Access-Control-Allow-Origin": ok ? origen : ORIGENES[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, x-academia-equipo",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const ip = req.headers.get("CF-Connecting-IP") || "local";
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method === "GET"){
      if (new URL(req.url).pathname !== "/probar") return respuesta({ ok: true, ia: env.GEMINI_KEY ? "gemini" : "cloudflare", respaldo: !!env.AI }, 200, cors);
      if (demasiados(ip)) return respuesta({ error: "cupo", mensaje: "Demasiados pedidos seguidos. Espera un minuto." }, 429, cors);
      return respuesta(await probar(env), 200, cors);
    }
    if (req.method !== "POST") return respuesta({ error: "metodo" }, 405, cors);
    if (!ok) return respuesta({ error: "origen", mensaje: "Este servicio es solo para la Academia Austrofil." }, 403, cors);
    if (env.CODIGO_EQUIPO && req.headers.get("x-academia-equipo") !== env.CODIGO_EQUIPO)
      return respuesta({ error: "codigo", mensaje: "Falta el código del equipo." }, 401, cors);
    if (demasiados(ip)) return respuesta({ error: "cupo", mensaje: "Demasiados pedidos seguidos. Espera un minuto." }, 429, cors);
    let d;
    try { d = await req.json(); } catch (e){ return respuesta({ error: "formato" }, 400, cors); }
    const sistema = String((d && d.sistema) || "").slice(0, 16000);
    const mensajes = (Array.isArray(d && d.mensajes) ? d.mensajes : []).slice(-40).map(function(m){
      return { rol: m && m.rol === "model" ? "model" : "user", texto: String((m && m.texto) || "").slice(0, 10000) };
    }).filter(function(m){ return m.texto; });
    if (!mensajes.length) return respuesta({ error: "formato" }, 400, cors);
    const max = Math.max(64, Math.min(Number(d.max) || 1024, 2048));
    let fallo = null;
    if (env.GEMINI_KEY){
      try { return respuesta({ texto: await conGemini(env.GEMINI_KEY, sistema, mensajes), ia: "gemini" }, 200, cors); }
      catch (e){ fallo = e; }
    }
    if (env.AI || !env.GEMINI_KEY){
      try { return respuesta({ texto: await conCloudflare(env.AI, sistema, mensajes, max), ia: "cloudflare" }, 200, cors); }
      catch (e){ fallo = fallo || e; }
    }
    const mensaje = String((fallo && fallo.message) || fallo).slice(0, 300);
    console.warn("IA del equipo sin respuesta:", mensaje);
    return respuesta({ error: "ia", mensaje: mensaje }, fallo && fallo.estado === 429 ? 429 : 502, cors);
  }
};
