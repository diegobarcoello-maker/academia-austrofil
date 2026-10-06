/* IA opcional y gratis con Google Gemini. Sin clave, todo funciona con el banco fijo del manual (y sin internet).
   Usa las mismas claves del navegador que el Manual de Campo (austrofil.geminiKey y austrofil.geminiModelos):
   mismo dominio, misma clave. La Academia nunca toca la clave de Claude del manual: por eso storeKey() no hace nada.
   La IA nunca recibe el nombre del asesor (quitarNombre) y sus preguntas no cuentan para aprobar nada. */
import { $, h, limpio, plano, lsGet, lsSet } from "./util.js";
import { DATA } from "./datos.js";
import { ST } from "./estado.js";

var GEM_STORE = "austrofil.geminiKey", GEM_MODELS = "austrofil.geminiModelos";
var gemKey = lsGet(GEM_STORE);
var apiKey = "", turns = [];
function storeKey(){ return true; }
var chatlog = document.createElement("div");   /* contenedor que streamGem desplaza mientras escribe */
var ckeyin = null, ckeysave = null, ckeydel = null, ckeyst = null;
var alCambiar = [];

/* IA del equipo: un Worker de Cloudflare guarda la clave de Gemini de Diego (tools/worker-ia/worker.js).
   Sin clave propia, la app le pregunta a ese servidor: ningún asesor tiene que sacar clave.
   Con clave propia (Yo › Ajustes e IA), la app habla directo con Gemini y usa su propio cupo. */
export var IA_EQUIPO = "https://academia-ia.diegobarcoello.workers.dev";
export function hayIA(){ return !!gemKey || !!IA_EQUIPO; }
export function usaIAEquipo(){ return !gemKey && !!IA_EQUIPO; }
export function cuandoCambieIA(fn){ alCambiar.push(fn); }
function setMode(){ alCambiar.forEach(function(f){ f(!!gemKey); }); }
window.addEventListener("storage", function(e){
  if (!e.key || e.key === GEM_STORE){ gemKey = lsGet(GEM_STORE); setMode(); }
});

/* Lo de abajo, entre los marcadores, es el código de IA del Manual de Campo v20 copiado tal cual. */
/* <IA-DEL-MANUAL> */
var COPY = {
  not_granted: "Para usar la IA hay que permitirle a esta página consultar a Claude. Mientras tanto respondo con el manual.",
  sampling_disabled: "La IA no está disponible en esta cuenta. Respondo con el manual.",
  rate_limited: "Demasiadas consultas seguidas. Espera un momento.",
  session_expired: "Tu sesión expiró. Vuelve a entrar.",
  refused: "No puedo responder eso. Plantéalo de otra forma.",
  empty_completion: "No salió respuesta. Prueba con una pregunta más corta.",
  prompt_too_large: "La conversación se hizo larga. Recarga la página para empezar de nuevo.",
  upstream_error: "Se cortó la conexión. Intenta otra vez."
};
var GEM_URL = "https://generativelanguage.googleapis.com/v1beta/";
var GEM_DEFAULT = ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite"];
var gemCool = {}, gemNoThink = {};
function gemModels(){
  try {
    var m = JSON.parse(lsGet(GEM_MODELS) || "null");
    if (Array.isArray(m) && m.length) return m;
  } catch (_){}
  return GEM_DEFAULT.slice();
}
function dropGemModel(m){
  var list = gemModels().filter(function(x){ return x !== m; });
  lsSet(GEM_MODELS, list.length ? JSON.stringify(list) : "");
}
function pickGemModels(list){
  var flash = [], lite = [], alias = [];
  (list || []).forEach(function(m){
    var id = String((m && m.name) || "").replace(/^models\//, "");
    if (((m && m.supportedGenerationMethods) || []).indexOf("generateContent") < 0) return;
    var r = id.match(/^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/);
    if (r) (r[2] ? lite : flash).push({ id: id, v: parseFloat(r[1]) });
    else if (/^gemini-flash(-lite)?-latest$/.test(id)) alias.push(id);
  });
  function byV(a, b){ return b.v - a.v; }
  function ids(a){ return a.map(function(x){ return x.id; }); }
  flash.sort(byV); lite.sort(byV);
  var out = ids(flash.slice(0, 3))
    .concat(alias.filter(function(a){ return a.indexOf("lite") < 0; }))
    .concat(ids(lite.slice(0, 2)))
    .concat(alias.filter(function(a){ return a.indexOf("lite") > -1; }));
  return out.length ? out : null;
}
function gemError(status, body){
  var er = (body && body.error) || {};
  var e = new Error(er.message || ("HTTP " + status));
  var det = JSON.stringify(er.details || []);
  e.status = status || er.code || 0;
  e.gstatus = er.status || "";
  e.reason = (det.match(/"reason":\s*"([A-Z_]+)"/) || [])[1] || "";
  e.daily = /PerDay/i.test(det) || /per day/i.test(e.message);
  e.zero = /limit:\s*0(?!\d)/.test(e.message) || /"quotaValue":\s*"0"/.test(det);
  var rd = det.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  e.retry = rd ? parseFloat(rd[1]) : 0;
  return e;
}
var GEM_DAILY = "Se acabó el cupo gratis de Gemini por hoy; se renueva de madrugada, hora de Ecuador. Mientras tanto respondo con el manual.";
function gemErrorText(e){
  var m = String((e && e.message) || "");
  if (e.gem === "refused") return COPY.refused;
  if (e.gem === "empty") return COPY.empty_completion;
  if (e.gem === "quota") return e.daily ? GEM_DAILY : COPY.rate_limited;
  if (e.reason === "API_KEY_INVALID" || /api key not valid/i.test(m))
    return "Google rechazó la clave de Gemini. Revísala con el botón de IA, arriba a la derecha.";
  if (/REFERRER|referer/i.test(e.reason + " " + m))
    return "Tu clave de Gemini tiene restringidos los sitios web y no permite esta página. Quita la restricción o crea otra clave en aistudio.google.com/apikey.";
  if (/location is not supported|not supported in your|country/i.test(m))
    return "Google no ofrece Gemini gratis desde tu ubicación.";
  if (e.status === 429 && e.zero)
    return "Tu clave no tiene cupo gratis en los modelos de Gemini que probé. Vuelve a guardarla con el botón de IA para actualizar la lista.";
  if (e.status === 429) return e.daily ? GEM_DAILY : COPY.rate_limited;
  if (e.status === 403 || e.gstatus === "PERMISSION_DENIED")
    return "Tu clave de Gemini no tiene permiso para usar la IA. Crea una nueva en aistudio.google.com/apikey.";
  if (e.status === 404)
    return "Ningún modelo gratis de Gemini respondió con tu clave. Vuelve a guardarla con el botón de IA para actualizar la lista.";
  if (e.status >= 500) return "Gemini está saturado en este momento. Intenta en un rato.";
  if (!e.status) return "No hay conexión con Gemini. Respondo con el manual.";
  return "No pude consultar a Gemini: " + (m || e.status);
}
function plainAI(t){
  return String(t || "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/__([^_\n]+)__/g, "$1")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^([ \t]*)[*•][ \t]+/gm, "$1- ")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1");
}
async function streamGem(model, contents, deep, out, signal, st){
  var cfg = { maxOutputTokens: deep ? 8192 : 4096 };
  if (!gemNoThink[model] && (deep || !/lite/.test(model)))
    cfg.thinkingConfig = { thinkingLevel: deep ? "medium" : "low" };
  var res = await fetch(GEM_URL + "models/" + encodeURIComponent(model) + ":streamGenerateContent?alt=sse", {
    method: "POST", signal: signal,
    headers: { "content-type": "application/json", "x-goog-api-key": gemKey },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: iaInstr() }] },
                           contents: contents, generationConfig: cfg })
  });
  if (!res.ok){
    var body = null;
    try { body = await res.json(); } catch (_){}
    throw gemError(res.status, body);
  }
  var reader = res.body.getReader(), dec = new TextDecoder(), buf = "", fin = "", blocked = "";
  function feed(chunk){
    var data = chunk.split("\n").filter(function(l){ return l.indexOf("data:") === 0; })
      .map(function(l){ return l.slice(5).replace(/^ /, ""); }).join("\n");
    if (!data) return;
    var ev;
    try { ev = JSON.parse(data); } catch (_){ return; }
    if (ev.error) throw gemError(ev.error.code || 500, ev);
    if (ev.promptFeedback && ev.promptFeedback.blockReason) blocked = ev.promptFeedback.blockReason;
    var c = ev.candidates && ev.candidates[0];
    if (!c) return;
    if (c.finishReason) fin = c.finishReason;
    ((c.content && c.content.parts) || []).forEach(function(p){
      if (p && !p.thought && typeof p.text === "string") st.text += p.text;
    });
    if (st.text){
      out.classList.remove("dots");
      out.textContent = plainAI(st.text);
      chatlog.scrollTop = chatlog.scrollHeight;
    }
  }
  for (;;){
    var r = await reader.read();
    if (r.done) break;
    buf += dec.decode(r.value, { stream: true }).replace(/\r/g, "");
    var parts = buf.split("\n\n");
    buf = parts.pop();
    for (var i = 0; i < parts.length; i++) feed(parts[i]);
  }
  if (buf.trim()) feed(buf);
  return { fin: fin, blocked: blocked };
}
function maskKey(k){ return k.slice(0, 10) + "…" + k.slice(-4); }
function keptNote(kept){ return kept ? "" : " Ojo: este navegador no permite guardarla y se perderá al cerrar la página."; }
async function saveGemKey(k){
  if (!/^[A-Za-z0-9_.-]{30,}$/.test(k)){ keyMsg("Eso no parece una clave de Gemini: empieza con AIza y tiene 39 caracteres.", "err"); return; }
  ckeysave.disabled = true;
  keyMsg("Verificando la clave con Google…");
  var verdict = "unknown", models = null, why = "";
  try {
    var r = await fetch(GEM_URL + "models?pageSize=1000", { headers: { "x-goog-api-key": k } });
    var body = null;
    try { body = await r.json(); } catch (_){}
    if (r.ok){ verdict = "ok"; models = pickGemModels(body && body.models); }
    else {
      var e = gemError(r.status, body);
      if (e.reason === "API_KEY_INVALID" || /api key not valid/i.test(e.message)){
        verdict = "bad"; why = "Google rechazó la clave. Cópiala completa desde aistudio.google.com/apikey y vuelve a pegarla.";
      } else if (r.status === 403){ verdict = "bad"; why = gemErrorText(e); }
    }
  } catch (_){}
  ckeysave.disabled = false;
  if (verdict === "bad"){ keyMsg(why, "err"); return; }
  gemKey = k; apiKey = ""; turns = []; gemCool = {}; gemNoThink = {};
  var kept = lsSet(GEM_STORE, k);
  storeKey("");
  lsSet(GEM_MODELS, models ? JSON.stringify(models) : "");
  setMode(); syncSet();
  keyMsg((verdict === "ok" ? "Listo: clave verificada. El chat ya responde con IA gratis" + (models ? " (" + models[0] + ")." : ".") :
          "Clave guardada. No pude verificarla ahora; se probará con la primera pregunta.") + keptNote(kept), "ok");
}
/* </IA-DEL-MANUAL> */

/* ============ TUTOR ============ */
var iaModo = "explicar";
var IA_BASE = "Eres el tutor de la Academia Austrofil: enseñas a los asesores de ventas de Austrofil S.A. (Cuenca, Ecuador) la línea de lubricantes con el texto del Manual de Campo. " +
  "REGLAS: responde siempre en español de Ecuador, tuteando, con frases cortas de mostrador. Apóyate solo en el texto del manual que te paso; si algo no está ahí, dilo. " +
  "No inventes precios, stock, códigos, márgenes ni clientes de Austrofil. No pidas datos personales.";
/* criterios con que la IA califica la respuesta libre de cada simulación */
export var CRITERIOS = {
  objecion: [["pregunta", "Pregunta antes de opinar"], ["argumento", "Argumento técnico según el manual"], ["cierre", "Cierre con propuesta"]],
  caso: [["pregunta", "Pregunta antes de recomendar"], ["recomendacion", "Recomendación técnica según el manual"], ["venta", "Ofrece la venta cruzada"]]
};
var tareaCalificar = "";
var IA_TAREA = {
  explicar: "TAREA: el asesor falló una pregunta. Explícale en 2 a 4 frases por qué su respuesta no es la correcta y por qué la correcta sí lo es, con el extracto del manual. Termina con una frase corta que pueda decir en el mostrador. Texto plano, sin markdown.",
  generar: "TAREA: crea preguntas de práctica usando SOLO el texto de la lección que te paso; no agregues datos que no estén ahí. Responde SOLO con un arreglo JSON válido, sin texto antes ni después. " +
    "Cada elemento es uno de estos: {\"tipo\":\"opcion\",\"enunciado\":\"…\",\"opciones\":[\"…\",\"…\",\"…\"],\"correcta\":0,\"explicacion\":\"…\"} (3 o 4 opciones distintas y una sola correcta; \"correcta\" es su índice desde 0), " +
    "{\"tipo\":\"vf\",\"enunciado\":\"…\",\"correcta\":true,\"explicacion\":\"…\"} o {\"tipo\":\"emparejar\",\"enunciado\":\"…\",\"pares\":[[\"…\",\"…\"],[\"…\",\"…\"],[\"…\",\"…\"]],\"explicacion\":\"…\"} (3 o 4 pares). \"explicacion\" es una frase con el dato del texto que la responde."
};
function instruccionCalificar(tipo){
  var c = CRITERIOS[tipo] || CRITERIOS.objecion;
  var que = tipo === "caso" ? "a un caso de mostrador" : "a una objeción de mostrador";
  return "TAREA: califica la respuesta libre de un asesor " + que + " con tres criterios: " +
    c.map(function(x, i){ return "(" + (i + 1) + ") " + x[1].toLowerCase(); }).join("; ") +
    ". Como enseña el manual, primero se pregunta y después se vende («Pregunta: … Vendes: …»). " +
    "Responde SOLO con un objeto JSON válido, sin texto antes ni después, con esta forma: {\"nota\": entero de 0 a 10, \"criterios\": {" +
    c.map(function(x){ return "\"" + x[0] + "\": true o false"; }).join(", ") +
    "}, \"bien\": \"qué estuvo bien, 1 o 2 frases\", \"falto\": \"qué faltó, 1 o 2 frases\", \"manual\": \"cómo lo dice el manual, con sus palabras\"}.";
}
var tareaLibre = "";   /* instrucción completa para el cliente simulado y el coach (pestaña Hablar) */
function iaInstr(){
  if (iaModo === "libre") return tareaLibre;
  var base = IA_BASE + "\n" + (iaModo === "calificar" ? tareaCalificar : IA_TAREA[iaModo] || "");
  if (iaModo === "generar") return base;
  return base + "\n\nAPOYO (del mismo manual):\n" + (DATA.contextoIA || []).join("\n");
}
function keyMsg(t, cls){ if (!ckeyst) return; ckeyst.textContent = t || ""; ckeyst.className = "stt" + (cls ? " " + cls : ""); }
function syncSet(){
  if (!ckeyin) return;
  ckeydel.hidden = !gemKey;
  ckeyin.value = "";
  ckeyin.placeholder = gemKey ? maskKey(gemKey) : "Pega aquí tu clave (AIza…)";
  keyMsg(gemKey ? "Tu clave de Gemini está activa en este navegador: usas tu propio cupo." :
    IA_EQUIPO ? "Sin clave propia: usas la IA del equipo." : "Sin clave: todo funciona con el banco fijo del manual.", gemKey || IA_EQUIPO ? "ok" : "");
}
/* panel de Ajustes para pegar o quitar la clave */
export function panelIA(){
  ckeyin = h("input", { id: "ckeyin", class: "inp", type: "password", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
    placeholder: "Pega aquí tu clave (AIza…)", "aria-label": "Clave de Gemini" });
  ckeysave = h("button", { class: "btn", id: "ckeysave" }, "Guardar");
  ckeydel = h("button", { class: "btn sec", id: "ckeydel", hidden: true }, "Quitar clave");
  ckeyst = h("p", { class: "stt", id: "ckeyst", role: "status" });
  var guia = h("ol", { class: "pasos-lista" },
    h("li", null, "Abre ", h("a", { href: "https://aistudio.google.com/apikey", target: "_blank", rel: "noopener" }, "aistudio.google.com/apikey"),
      " y entra con tu cuenta de Google (Gmail)."),
    h("li", null, "Toca ", h("b", null, "Create API key"), " (Crear clave de API) y copia la clave."),
    h("li", null, "Pégala aquí abajo y toca ", h("b", null, "Guardar"), "."));
  var propia = [h("p", null, h("b", null, "Gratis con Google Gemini."), " Necesita internet y se configura una sola vez:"), guia,
    ckeyin, h("div", { class: "btns2" }, ckeysave, ckeydel), ckeyst];
  var box = h("div", { class: "card stack", id: "cset" },
    IA_EQUIPO ? [
      h("p", null, h("b", null, "IA del equipo activa."), " No tienes que hacer nada: la IA funciona con internet y sin clave."),
      h("details", { class: "propia", open: gemKey ? true : null }, h("summary", null, "Usar mi propia clave de Gemini (opcional)"), h("div", { class: "stack" }, propia))
    ] : propia,
    h("p", { class: "tiny" }, "Con IA: conversas con clientes en Hablar, te explica por qué fallaste, califica tus respuestas libres en el Mostrador y crea preguntas de práctica (marcadas «Pregunta IA», que no cuentan para aprobar). " +
      "Una clave propia queda solo en este navegador y es la misma que usa aquí el Manual de Campo. La IA nunca recibe tu nombre; en el plan gratis Google puede usar lo que envías para mejorar sus productos: no escribas datos de clientes."));
  ckeysave.addEventListener("click", saveKey);
  ckeyin.addEventListener("keydown", function(e){ if (e.key === "Enter"){ e.preventDefault(); saveKey(); } });
  ckeydel.addEventListener("click", function(){
    gemKey = ""; gemCool = {}; gemNoThink = {};
    lsSet(GEM_STORE, ""); lsSet(GEM_MODELS, "");
    setMode(); syncSet();
    keyMsg("Clave borrada de este navegador (también la del Manual de Campo aquí). " + (IA_EQUIPO ? "Sigues con la IA del equipo." : "Todo sigue con el banco fijo."));
  });
  syncSet();
  return box;
}
function saveKey(){
  var k = (ckeyin.value || "").replace(/\s+/g, "");
  if (!k){ keyMsg("Pega la clave primero.", "err"); return; }
  if (/^sk-ant-/.test(k)){ keyMsg("Esa es una clave de Claude. La Academia usa Gemini, que es gratis: sigue los pasos de arriba.", "err"); return; }
  return saveGemKey(k);
}

/* una consulta con respaldo de modelos: si uno no tiene cupo, prueba el siguiente (igual que el chat del manual) */
var ctl = null;
function pedirGem(modo, texto, out, caja){
  return consultar(modo, [{ role: "user", parts: [{ text: texto }] }], out, caja);
}
async function consultar(modo, contents, out, caja){
  iaModo = modo;
  chatlog = caja || out;
  if (usaIAEquipo()) return consultarEquipo(contents, out);
  var st = { text: "" }, res = null, last = null;
  if (ctl) try { ctl.abort(); } catch (_){}
  ctl = new AbortController();
  var now = Date.now();
  var models = gemModels().filter(function(m){ return !(gemCool[m] && gemCool[m].until > now); });
  if (!models.length){
    throw { gem: "quota", daily: Object.keys(gemCool).some(function(m){ return gemCool[m].daily && gemCool[m].until > now; }) };
  }
  for (var i = 0; i < models.length; i++){
    var m = models[i];
    try {
      res = await streamGem(m, contents, false, out, ctl.signal, st);
      last = null;
      break;
    } catch (e){
      if ((e && e.name === "AbortError") || ctl.signal.aborted) throw e;
      last = e;
      if (st.text) break;
      if (e.status === 400 && /thinking/i.test(e.message) && !gemNoThink[m]){ gemNoThink[m] = 1; i--; continue; }
      if (e.status === 429){
        if (e.zero) dropGemModel(m);
        else gemCool[m] = { until: Date.now() + (e.daily ? 3600e3 : Math.max(20, e.retry || 60) * 1e3), daily: e.daily };
        continue;
      }
      if (e.status === 404 || (e.status === 400 && /model|not (found|supported)/i.test(e.message) && !/api key/i.test(e.message))){
        dropGemModel(m);
        continue;
      }
      if (e.status >= 500) continue;
      break;
    }
  }
  if (last && !st.text) throw last;
  if (!st.text.trim()) throw { gem: res && (res.blocked || /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/.test(res.fin)) ? "refused" : "empty" };
  return { text: st.text, fin: res && res.fin, cut: !!last };
}
/* misma consulta, pero al servidor del equipo (responde de una vez, sin ir escribiendo) */
async function consultarEquipo(contents, out){
  if (ctl) try { ctl.abort(); } catch (_){}
  ctl = new AbortController();
  var cuerpo = {
    sistema: iaInstr(),
    mensajes: contents.map(function(c){
      return { rol: c.role === "model" ? "model" : "user", texto: (c.parts || []).map(function(p){ return p.text || ""; }).join("") };
    }),
    max: iaModo === "libre" || iaModo === "generar" ? 1500 : 1024
  };
  var r, d = null;
  try {
    r = await fetch(IA_EQUIPO, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo), signal: ctl.signal });
  } catch (e){
    if (e && e.name === "AbortError") throw e;
    throw { equipo: true, status: 0 };
  }
  try { d = await r.json(); } catch (_){}
  if (!r.ok || !d || !d.texto) throw { equipo: true, status: r.status, codigo: d && d.error };
  out.classList.remove("dots");
  out.textContent = plainAI(d.texto);
  return { text: d.texto, fin: "STOP", cut: false };
}
function textoErrorEquipo(e){
  if (!e.status) return "No hay conexión con la IA del equipo. Revisa tu internet.";
  if (e.status === 429) return "La IA del equipo está muy pedida en este momento. Espera un minuto e intenta otra vez.";
  if (e.status === 401) return "La IA del equipo pide un código. Avísale a tu supervisor.";
  if (e.status === 403) return "Esta página no está autorizada para usar la IA del equipo. Ábrela desde el link oficial.";
  return "La IA del equipo no respondió. Intenta en un rato.";
}
function sacarJSON(t){
  t = String(t || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  var a = t.search(/[\[{]/), z = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}"));
  if (a < 0 || z < a) throw { formato: true };
  try { return JSON.parse(t.slice(a, z + 1)); } catch (e){ throw { formato: true }; }
}
function quitarNombre(t){
  var n = (ST.perfil && ST.perfil.nombre) || "";
  if (!n) return t;
  [n].concat(n.split(/\s+/).filter(function(w){ return w.length >= 3; })).forEach(function(w){
    var re = new RegExp("(^|[^\\p{L}])" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=$|[^\\p{L}])", "giu");
    t = t.replace(re, "$1[nombre]");
  });
  return t;
}
function mensajeError(e, extra){
  if (e && e.formato) return "La IA respondió en un formato que no pude leer. Intenta otra vez." + (extra ? " " + extra : "");
  if (e && e.equipo) return textoErrorEquipo(e) + (extra ? " " + extra : "");
  /* los textos vienen del manual, donde la IA se configura con un botón arriba; aquí está en Yo › Ajustes e IA */
  var t = gemErrorText(e || {}).replace(/con el botón de IA(, arriba a la derecha)?/g, "en Yo › Ajustes e IA");
  return t + (extra ? " " + extra : "");
}
/* preguntas de IA: tipo válido y una sola correcta; si no cumple, se descarta */
function validarIA(arr, x){
  if (arr && !Array.isArray(arr) && Array.isArray(arr.preguntas)) arr = arr.preguntas;
  if (!Array.isArray(arr)) return [];
  var out = [], sello = Date.now().toString(36);
  arr.forEach(function(q, i){
    if (!q || typeof q !== "object") return;
    var en = limpio(q.enunciado, 260), ex = limpio(q.explicacion, 300),
        base = { id: "ia-" + sello + "-" + i, enunciado: en, ia: true, cita: ex, leccion: x, origen: { texto: "" } };
    if (en.length < 8) return;
    if (q.tipo === "opcion"){
      if (!Array.isArray(q.opciones)) return;
      var op = q.opciones.map(function(o){ return limpio(o, 160); });
      if (op.length < 3 || op.length > 4 || op.some(function(o){ return !o; })) return;
      if (new Set(op.map(function(o){ return o.toLowerCase(); })).size !== op.length) return;
      if (typeof q.correcta !== "number" || !Number.isInteger(q.correcta) || q.correcta < 0 || q.correcta >= op.length) return;
      out.push(Object.assign(base, { tipo: "opcion", opciones: op, correcta: q.correcta }));
    } else if (q.tipo === "vf"){
      if (typeof q.correcta !== "boolean") return;
      out.push(Object.assign(base, { tipo: "vf", correcta: q.correcta }));
    } else if (q.tipo === "emparejar"){
      if (!Array.isArray(q.pares) || q.pares.length < 3 || q.pares.length > 4) return;
      var pares = q.pares.map(function(p){ return Array.isArray(p) && p.length === 2 ? [limpio(p[0], 90), limpio(p[1], 140)] : null; });
      if (pares.some(function(p){ return !p || !p[0] || !p[1]; })) return;
      var iz = new Set(pares.map(function(p){ return p[0].toLowerCase(); })), de = new Set(pares.map(function(p){ return p[1].toLowerCase(); }));
      if (iz.size !== pares.length || de.size !== pares.length) return;
      out.push(Object.assign(base, { tipo: "emparejar", pares: pares }));
    }
  });
  return out.slice(0, 5);
}
function validarNota(o, tipo){
  if (!o || typeof o !== "object" || Array.isArray(o)) throw { formato: true };
  var n = Number(o.nota);
  if (!isFinite(n) || !o.criterios || typeof o.criterios !== "object") throw { formato: true };
  var crit = {};
  (CRITERIOS[tipo] || CRITERIOS.objecion).forEach(function(c){ crit[c[0]] = o.criterios[c[0]] === true; });
  return { nota: Math.max(0, Math.min(10, Math.round(n))), criterios: crit,
           bien: limpio(o.bien, 400), falto: limpio(o.falto, 400), manual: limpio(o.manual, 600) };
}

/* «¿Por qué fallé?»: d = { enunciado, opciones, dada, correcta, cita, leccion: {titulo, texto} } */
export async function explicarIA(d, caja){
  var out = h("div", { class: "iabox dots", id: "ia-explicacion" }, "Pensando…");
  caja.textContent = "";
  caja.appendChild(out);
  var texto = "PREGUNTA: " + d.enunciado + "\n" + (d.opciones ? "OPCIONES: " + d.opciones.join(" | ") + "\n" : "") +
    "RESPUESTA DEL ASESOR: " + d.dada + "\nRESPUESTA CORRECTA: " + d.correcta +
    "\n\nEXTRACTO DEL MANUAL QUE LA RESPONDE:\n" + plano(d.cita) +
    (d.leccion ? "\n\nTEXTO DE LA LECCIÓN «" + d.leccion.titulo + "»:\n" + d.leccion.texto.slice(0, 5000) : "");
  try {
    var r = await pedirGem("explicar", texto, out, out);
    var t = plainAI(r.text).trim() + (r.cut || r.fin === "MAX_TOKENS" ? "…" : "");
    out.classList.remove("dots");
    out.textContent = t;
    return t;
  } catch (e){
    out.remove();
    if (e && e.name === "AbortError") return "";
    caja.appendChild(h("p", { class: "ianote err", id: "ia-error" }, mensajeError(e, "Sigues con el texto del manual.")));
    return "";
  }
}
/* califica la respuesta libre de una simulación (caso u objeción) */
export async function calificarIA(sim, respuesta){
  tareaCalificar = instruccionCalificar(sim.tipo);
  var oculto = document.createElement("div");
  var texto = (sim.tipo === "caso" ? "CASO DE MOSTRADOR: " : "OBJECIÓN DEL CLIENTE: ") + "«" + sim.cliente + "»\nSITUACIÓN: " + sim.situacion +
    "\n\nTEXTO DEL MANUAL PARA ESTE " + (sim.tipo === "caso" ? "CASO" : "OBJECIÓN") + ":\n" +
    sim.manual.map(function(m){ return "- " + plano(m.f); }).join("\n") +
    "\n\nRESPUESTA DEL ASESOR:\n" + quitarNombre(limpio(respuesta, 1200));
  var r = await pedirGem("calificar", texto, oculto, oculto);
  return validarNota(sacarJSON(r.text), sim.tipo);
}
/* crea 3 preguntas de práctica con el texto de una lección */
export async function generarPreguntas(x, textoLeccion){
  var oculto = document.createElement("div");
  var texto = "LECCIÓN «" + x.titulo + "»:\n" + textoLeccion +
    "\n\nCrea 3 preguntas: una de opción múltiple, una de verdadero o falso y una de emparejar.";
  var r = await pedirGem("generar", texto, oculto, oculto);
  var qs = validarIA(sacarJSON(r.text), x);
  if (!qs.length) throw { formato: true };
  return qs;
}
export function textoErrorIA(e, extra){ return mensajeError(e, extra); }
export function nombreSeguro(t){ return quitarNombre(t); }

/* ============ CONVERSACIÓN CON UN CLIENTE (pestaña Hablar) ============ */
/* turnos: [{ quien: "asesor" | "cliente", texto }]. El cliente lo hace la IA (rol «model») y el asesor es el usuario.
   La API pide que la conversación empiece por el usuario: va primero una acotación de la escena.
   El texto del asesor pasa por quitarNombre: la IA nunca recibe su nombre. */
export async function responderCliente(sistema, escena, turnos, out, caja){
  tareaLibre = sistema;
  var contents = [{ role: "user", parts: [{ text: escena }] }];
  turnos.forEach(function(t){
    contents.push({ role: t.quien === "cliente" ? "model" : "user",
                    parts: [{ text: t.quien === "asesor" ? quitarNombre(t.texto) : t.texto }] });
  });
  var r = await consultar("libre", contents, out, caja);
  return plainAI(r.text).trim();
}
/* una consulta al coach (pista o evaluación) con su propia instrucción */
export async function preguntarCoach(sistema, pedido){
  tareaLibre = sistema;
  var oculto = document.createElement("div");
  var r = await consultar("libre", [{ role: "user", parts: [{ text: quitarNombre(pedido) }] }], oculto, oculto);
  return r.text;
}
export function jsonDeIA(t){ return sacarJSON(t); }
export function textoPlanoIA(t){ return plainAI(t); }
