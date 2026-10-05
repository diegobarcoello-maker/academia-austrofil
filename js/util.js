/* Ayudas sin dependencias: DOM, texto del manual, fechas y códigos compactos. */

export function $(sel, el){ return (el || document).querySelector(sel); }

/* se usa en celular y en computadora: los textos nombran el equipo donde se está usando */
var tactil = (function(){ try { return window.matchMedia("(pointer: coarse)").matches; } catch (e){ return true; } })();
export var EQUIPO = tactil
  ? { tactil: true, este: "este celular", Este: "Este celular", tu: "tu celular" }
  : { tactil: false, este: "esta computadora", Este: "Esta computadora", tu: "tu computadora" };
export function $$(sel, el){ return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

/* ---------- DOM ---------- */
export function add(el, c){
  if (c === null || c === undefined || c === false) return;
  if (Array.isArray(c)){ c.forEach(function(x){ add(el, x); }); return; }
  if (typeof c === "string" || typeof c === "number") el.appendChild(document.createTextNode(String(c)));
  else el.appendChild(c);
}
/* h("button", { class: "btn", onclick: fn }, "Texto", otroNodo) — nunca usa innerHTML */
export function h(tag, at){
  var el = document.createElement(tag);
  if (at) Object.keys(at).forEach(function(k){
    var v = at[k];
    if (v === null || v === undefined || v === false) return;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  });
  for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
  return el;
}
/* ícono del sprite SVG de index.html */
export function icon(id, cls){
  var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("class", "ico" + (cls ? " " + cls : ""));
  s.setAttribute("aria-hidden", "true");
  var u = document.createElementNS("http://www.w3.org/2000/svg", "use");
  u.setAttribute("href", "#i-" + id);
  s.appendChild(u);
  return s;
}

/* ---------- texto del manual ---------- */
/* el manual marca las negritas con **…** */
export function rich(t){
  var f = document.createDocumentFragment();
  String(t || "").split("**").forEach(function(part, i){
    if (!part) return;
    f.appendChild(i % 2 ? h("b", null, part) : document.createTextNode(part));
  });
  return f;
}
export function plano(t){ return String(t || "").replace(/\*\*/g, ""); }
/* misma normalización que usa la validación: sin negritas, comillas iguales, espacios simples, minúsculas */
export function norm(t){
  return String(t || "").replace(/\*\*/g, "").replace(/[“”«»"]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
}
export function palabras(t){
  var m = String(t || "").replace(/\*\*/g, "").match(/[\p{L}\p{N}_]+(?:[-'’][\p{L}\p{N}_]+)*/gu);
  return m ? m.length : 0;
}
export function limpio(t, max){
  return String(t === undefined || t === null ? "" : t).replace(/\s+/g, " ").trim().slice(0, max || 400);
}
export function iniciales(nombre){
  var p = limpio(nombre, 60).split(" ").filter(Boolean);
  return ((p[0] || "?").charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : "")).toUpperCase();
}
export function primerNombre(nombre){ return limpio(nombre, 60).split(" ")[0] || ""; }

/* ---------- números y azar ---------- */
export function barajar(a){
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--){
    var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
export function pct(a, b){ return b ? Math.round(a * 100 / b) : 0; }
export function uid(){ return Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 7); }

/* ---------- fechas (siempre la fecha local del celular, en ISO aaaa-mm-dd) ---------- */
function pad(n){ return (n < 10 ? "0" : "") + n; }
export function isoLocal(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
export function hoy(){ return isoLocal(new Date()); }
export function sumarDias(iso, n){
  var p = iso.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2], 12);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}
export function diasEntre(a, b){
  var pa = a.split("-"), pb = b.split("-");
  return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 864e5);
}
/* 2026-10-05 → 05-10-2026, como se escriben las fechas en Ecuador */
export function fechaEc(iso){ var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "-" + p[1] + "-" + p[0] : ""; }
export function haceCuanto(iso){
  if (!iso) return "";
  var d = diasEntre(iso, hoy());
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  return "hace " + d + " días";
}

/* ---------- códigos compactos: PREFIJO.<base64url(deflate(JSON))>.<suma> ---------- */
export function b64url(bytes){
  var s = "", i;
  for (i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function deB64url(t){
  t = t.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  var s = atob(t), out = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
/* suma de control corta (FNV-1a) para detectar códigos copiados a medias */
export function suma(t){
  var x = 0x811c9dc5;
  for (var i = 0; i < t.length; i++){ x ^= t.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
  return ("000000" + x.toString(36)).slice(-6);
}
async function tubo(bytes, Stream){
  var r = new Blob([bytes]).stream().pipeThrough(new Stream("deflate-raw"));
  return new Uint8Array(await new Response(r).arrayBuffer());
}
/* empaqueta un objeto; "comprimido" dice si se pudo usar deflate (casi todos los Chrome actuales) */
export async function empaquetar(obj){
  var bytes = new TextEncoder().encode(JSON.stringify(obj)), comprimido = false;
  if (window.CompressionStream){
    try { bytes = await tubo(bytes, CompressionStream); comprimido = true; }
    catch (e){ bytes = new TextEncoder().encode(JSON.stringify(obj)); }
  }
  var cuerpo = b64url(bytes);
  return { cuerpo: cuerpo, comprimido: comprimido, suma: suma(cuerpo) };
}
export async function desempaquetar(cuerpo, comprimido){
  var bytes = deB64url(cuerpo);
  if (comprimido){
    if (!window.DecompressionStream) throw new Error("Este navegador no puede leer el código. Actualiza Chrome.");
    bytes = await tubo(bytes, DecompressionStream);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* ---------- guardado local seguro (modo incógnito o almacenamiento bloqueado no rompen la app) ---------- */
export function lsGet(k){ try { return localStorage.getItem(k) || ""; } catch (e){ return ""; } }
export function lsSet(k, v){
  try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); return true; }
  catch (e){ return false; }
}
export function leerJSON(k){
  try { var v = JSON.parse(lsGet(k) || "null"); return v && typeof v === "object" ? v : null; }
  catch (e){ return null; }
}
