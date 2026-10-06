/* Hablar: conversación con un cliente simulado por la IA y un coach que evalúa.
   - El cliente (lubricadora, ferretería, taller…) sale de datos/clientes.json; la dificultad cambia cómo responde.
     Cada cliente tiene una necesidad que no cuenta de entrada: se descubre preguntando, como enseña el manual.
   - El asesor escribe o habla con el micrófono, y puede escuchar al cliente en voz alta.
   - El coach da pistas durante la charla y al final califica con el método del Manual de Campo:
     preguntar antes de vender, argumento técnico, objeciones, canasta (venta cruzada) y cierre.
   Necesita la IA (Gemini, gratis) e internet. No cuenta para aprobar; sí para la racha y el reporte al supervisor. */
import { h, add, icon, limpio, hoy, lsGet, lsSet } from "../util.js";
import { DATA, MAN } from "../datos.js";
import { guardar, marcarEstudio, guardarCharla, resumenCharlas, mejorCharla } from "../estado.js";
import { app, barra, toast, encabezado } from "../ui.js";
import { registrar, ir, render } from "../nav.js";
import { hayIA, responderCliente, preguntarCoach, jsonDeIA, textoPlanoIA, textoErrorIA } from "../ia.js";
import { voz, dictar, leerCliente, callarCliente } from "../voz.js";

var CRITERIOS = [
  ["apertura", "Saludo y confianza"],
  ["preguntas", "Preguntó antes de ofrecer"],
  ["argumento", "Argumento técnico según el manual"],
  ["objeciones", "Respondió las objeciones"],
  ["canasta", "Ofreció la canasta (venta cruzada)"],
  ["cierre", "Cerró con una propuesta concreta"]
];
var MAX_TURNOS = 14;
var VOZ_PREF = "academia.vozCliente";
var elegido = { cliente: "", dificultad: "normal" };
var CH = null;            /* conversación en curso */
var micro = null;         /* dictado en curso */
var reducido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function vozOn(){ return lsGet(VOZ_PREF) === "1"; }
function ponerVoz(on){ lsSet(VOZ_PREF, on ? "1" : ""); if (!on) callarCliente(); }
function clientePorId(id){ return DATA.clientes.clientes.filter(function(c){ return c.id === id; })[0] || null; }
function dificultadPorId(id){
  var ds = DATA.clientes.dificultades;
  return ds.filter(function(d){ return d.id === id; })[0] || ds[1] || ds[0];
}
function turnosAsesor(){ return CH ? CH.turnos.filter(function(t){ return t.quien === "asesor"; }).length : 0; }
function bajar(){ requestAnimationFrame(function(){ window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reducido ? "auto" : "smooth" }); }); }

/* ============ INSTRUCCIONES PARA LA IA ============ */
function sistemaCliente(c, dif){
  return [
    "Eres " + c.nombre + ", " + c.rol + ", en Ecuador. Un asesor comercial de Austrofil S.A. (distribuidor de lubricantes, filtros, aditivos y productos automotrices) llega a tu negocio a venderte.",
    "TU NEGOCIO: " + c.contexto,
    "LO QUE NO CUENTAS DE ENTRADA (solo lo revelas si el asesor te hace buenas preguntas sobre tu negocio y tus clientes): " + c.secreto,
    "CÓMO ERES: " + dif.texto,
    "REGLAS: responde SIEMPRE como " + c.nombre + ", en español de Ecuador, con 1 a 3 frases cortas y naturales, de mostrador. Sin listas, sin markdown y sin emojis. " +
      "Nunca digas que eres una IA ni des consejos de venta: tú eres el cliente. No inventes precios, códigos ni promociones de Austrofil; si el asesor no te da un dato, pídeselo o duda. " +
      "Puedes nombrar marcas de la competencia como lo haría un cliente. Si el asesor es irrespetuoso o se va del tema, reacciona como un cliente real.",
    "FINAL: cuando decidas comprar (aceptas un pedido concreto) o cuando te canses y quieras terminar, responde y agrega al final la marca [FIN]."
  ].join("\n");
}
function metodoManual(){
  var t = [];
  ["ve1.1", "ve1.2", "ve1.3", "ve1.4", "ve1.5", "ve1.6", "ve1.7", "ve1.8"].forEach(function(id){ if (MAN.bloques[id]) t.push("- " + MAN.bloques[id].texto); });
  ["objecion mas barato competencia precio caro cliente dice otro economico",
   "argumento subir sintetico convencer kilometro protegido escalon",
   "canasta vender vendo vendes lineas ticket subir venta cruzada como"].forEach(function(k){ if (MAN.qa[k]) t.push("- " + MAN.qa[k].a); });
  return t.join("\n");
}
function sistemaCoach(){
  return "Eres el coach comercial de la Academia Austrofil. Entrenas a los asesores de ventas de Austrofil S.A. (Cuenca, Ecuador), distribuidor de lubricantes, filtros, aditivos y productos automotrices. " +
    "Evalúas con el método del Manual de Campo y te apoyas solo en este texto; no inventes precios, códigos ni promociones de Austrofil. " +
    "Responde en español de Ecuador, tuteando, directo y amable.\n\nMÉTODO DEL MANUAL:\n" + metodoManual();
}
function transcripcion(){
  return CH.turnos.map(function(t){ return (t.quien === "cliente" ? "Cliente: " : "Asesor: ") + t.texto; }).join("\n");
}
var ESCENA = "(Un asesor comercial de Austrofil entra a tu negocio y te saluda. Respóndele como el cliente.)";

/* ============ LISTA: ELEGIR CLIENTE Y DIFICULTAD ============ */
function pantallaHablar(){
  var cs = DATA.clientes.clientes, difs = DATA.clientes.dificultades;
  add(app, encabezado("Hablar con un cliente", "Practica una visita de verdad",
    "La IA hace de cliente de distintos negocios. Le hablas o le escribes como en una visita, y al final un coach te califica con el método del manual."));
  if (!cs.length){ app.appendChild(h("p", { class: "muted" }, "Todavía no hay clientes para practicar.")); return; }
  if (!hayIA()) app.appendChild(avisoIA());
  else if (navigator.onLine === false) app.appendChild(h("div", { class: "aviso" }, icon("sin-senal"),
    h("p", null, h("b", null, "Sin conexión. "), "Conversar con la IA necesita internet. Lo demás de la Academia sigue funcionando.")));
  var rs = resumenCharlas();
  if (rs.n) app.appendChild(h("dl", { class: "stats charla-stats" },
    h("div", null, h("dt", null, "Conversaciones"), h("dd", null, String(rs.n))),
    h("div", null, h("dt", null, "Promedio"), h("dd", null, rs.prom + "/10")),
    h("div", null, h("dt", null, "Mejor nota"), h("dd", null, rs.mejor + "/10"))));

  app.appendChild(h("h2", { class: "hlabel" }, "¿Qué tan difícil?"));
  var seg = h("div", { class: "seg seg-dif", role: "radiogroup", "aria-label": "Dificultad del cliente" });
  difs.forEach(function(d){
    var on = elegido.dificultad === d.id;
    seg.appendChild(h("button", { class: on ? "on" : "", role: "radio", "aria-checked": on ? "true" : "false", "data-dif": d.id,
      onclick: function(){ elegido.dificultad = d.id; render(); } }, h("b", null, d.nombre), h("small", null, d.detalle)));
  });
  app.appendChild(seg);

  app.appendChild(h("h2", { class: "hlabel" }, "Elige el cliente"));
  var grid = h("div", { class: "clientes", role: "radiogroup", "aria-label": "Cliente" });
  cs.forEach(function(c){
    var on = elegido.cliente === c.id, mejor = mejorCharla(c.id);
    grid.appendChild(h("button", { class: "cliente-card" + (on ? " on" : ""), role: "radio", "aria-checked": on ? "true" : "false", "data-cliente": c.id,
      onclick: function(){ elegido.cliente = c.id; render(); } },
      h("span", { class: "cc-ico" }, icon(c.icono || "chat")),
      h("span", { class: "cc-tx" }, h("b", null, c.negocio), h("span", null, c.descripcion)),
      mejor !== null ? h("span", { class: "cc-nota", title: "Tu mejor nota con este cliente" }, mejor + "/10") : null));
  });
  app.appendChild(grid);

  if (voz.lectura) app.appendChild(h("label", { class: "interruptor" },
    h("input", { type: "checkbox", id: "voz-pref", checked: vozOn(), onchange: function(){ ponerVoz(this.checked); } }),
    h("span", null, "Escuchar al cliente en voz alta")));
  app.appendChild(h("p", { class: "tiny", style: "margin-top:12px" },
    (voz.dictado ? "Puedes hablarle con el micrófono o escribirle. " : "Escríbele; en el celular también puedes dictar con el micrófono del teclado. ") +
    "No uses nombres ni datos de clientes reales: lo que escribes lo procesa la IA de Google."));

  var c = clientePorId(elegido.cliente);
  var botones = [];
  if (CH && !CH.eval && turnosAsesor() > 0)
    botones.push(h("button", { class: "btn sec", id: "seguir-charla", onclick: function(){ ir("charla"); } }, "Seguir la conversación con " + CH.c.nombre));
  botones.push(h("button", { class: "btn", id: "empezar-charla", disabled: !c || !hayIA(), onclick: function(){ empezar(c, dificultadPorId(elegido.dificultad)); } },
    !hayIA() ? "Activa la IA para conversar" : c ? "Hablar con " + c.nombre + " · " + c.negocio : "Elige un cliente"));
  barra.apply(null, botones);
}
function avisoIA(){
  return h("div", { class: "card stack aviso-ia" },
    h("div", { class: "row" }, icon("chat"), h("b", null, "Para conversar hay que activar la IA (gratis, una sola vez)")),
    h("p", { class: "small muted" }, "Se usa la IA de Google (Gemini) con una clave gratuita que se crea en dos minutos con una cuenta de Gmail. Necesita internet."),
    h("button", { class: "btn sec small", id: "activar-ia", onclick: function(){ ir("ajustes/ia"); } }, "Activar la IA"));
}

/* ============ CONVERSACIÓN ============ */
function empezar(c, dif){
  if (!c) return;
  pararMicro(); callarCliente();
  CH = { c: c, dif: dif, turnos: [{ quien: "cliente", texto: c.abre }], fin: false, finTexto: "", eval: null,
         pensando: false, evaluando: false, pidiendoPista: false, pista: "", error: "", borrador: "" };
  if (vozOn()) leerCliente(c.abre);
  ir("charla");
}
function burbuja(t){
  return h("div", { class: "msg " + (t.quien === "cliente" ? "msg-cliente" : "msg-asesor") },
    h("span", { class: "msg-quien" }, t.quien === "cliente" ? CH.c.nombre : "Tú"), h("p", null, t.texto));
}
function pantallaCharla(args, navegando){
  if (!CH){ ir("hablar"); return; }
  var c = CH.c;
  add(app, h("div", { class: "qtop charla-top" },
    h("button", { class: "qx", "aria-label": "Volver a Hablar", onclick: salir }, icon("atras")),
    h("div", { class: "charla-quien" }, h("span", { class: "cc-ico" }, icon(c.icono || "chat")),
      h("div", null, h("b", null, c.nombre), h("span", null, c.negocio + " · " + CH.dif.nombre))),
    voz.lectura ? h("button", { class: "qx" + (vozOn() ? " on" : ""), id: "voz-cliente", "aria-pressed": vozOn() ? "true" : "false",
      "aria-label": "Escuchar al cliente en voz alta", title: "Escuchar al cliente", onclick: function(){ ponerVoz(!vozOn()); render(); } },
      icon(vozOn() ? "parlante" : "parlante-no")) : null,
    !CH.eval ? h("button", { class: "qx", id: "pista", "aria-label": "Pedir una pista al coach", title: "Pista del coach",
      disabled: CH.pidiendoPista || CH.pensando, onclick: pedirPista }, icon("bombilla")) : null));

  var lista = h("div", { class: "chat", id: "chat", role: "log", "aria-live": "polite" },
    h("p", { class: "nota-sistema" }, "Visita a " + c.negocio.toLowerCase() + " · " + c.rol));
  CH.turnos.forEach(function(t){ lista.appendChild(burbuja(t)); });
  if (CH.pidiendoPista) lista.appendChild(h("p", { class: "nota-sistema" }, "El coach está pensando una pista…"));
  if (CH.pista) lista.appendChild(h("div", { class: "pista" }, icon("bombilla"), h("p", null, h("b", null, "Coach: "), CH.pista)));
  if (CH.error) lista.appendChild(h("p", { class: "ianote err", id: "charla-error", role: "alert" }, CH.error));
  if (CH.fin && !CH.eval) lista.appendChild(h("p", { class: "nota-sistema fuerte" }, CH.finTexto));
  if (CH.evaluando) lista.appendChild(h("p", { class: "nota-sistema" }, "El coach está revisando tu conversación…"));
  if (CH.eval) lista.appendChild(evaluacionUI(CH.eval));
  app.appendChild(lista);

  if (CH.eval){
    barra(h("button", { class: "btn", id: "otra-charla", onclick: function(){ CH = null; ir("hablar"); } }, "Otra conversación"),
      h("button", { class: "btn sec", id: "repetir-charla", onclick: function(){ empezar(c, CH.dif); } }, "Repetir con " + c.nombre));
  } else if (CH.evaluando){
    barra(h("button", { class: "btn", disabled: true }, "El coach está revisando…"));
  } else if (CH.fin){
    barra(h("button", { class: "btn", id: "evaluar-charla", onclick: evaluar }, "Ver la evaluación del coach"));
  } else {
    barra(turnosAsesor() >= 2 ? h("button", { class: "btn ghost small chat-terminar", id: "terminar-charla", onclick: evaluar }, "Terminar y que el coach me califique") : null,
      compositor());
  }
  if (navegando || CH.bajar){ CH.bajar = false; bajar(); }
}
function compositor(){
  var ta = h("textarea", { class: "inp chat-inp", id: "chat-texto", rows: "1", maxlength: "600", enterkeyhint: "send",
    placeholder: voz.dictado ? "Escribe o habla…" : "Escribe tu respuesta…", "aria-label": "Tu respuesta al cliente" });
  ta.value = CH.borrador || "";
  function alto(){
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
    var bar = document.querySelector(".actionbar");
    if (bar) document.documentElement.style.setProperty("--barra-h", bar.offsetHeight + "px");
  }
  ta.addEventListener("input", function(){ CH.borrador = ta.value; alto(); });
  ta.addEventListener("keydown", function(e){
    if (e.key === "Enter" && !e.shiftKey && !EQUIPO_TACTIL){ e.preventDefault(); enviar(ta.value); }
  });
  var mic = voz.dictado ? h("button", { class: "chat-btn mic" + (micro ? " on" : ""), id: "mic", type: "button",
    "aria-label": micro ? "Dejar de escuchar" : "Hablar con el micrófono", "aria-pressed": micro ? "true" : "false",
    disabled: CH.pensando, onclick: function(){ alternarMicro(ta); } }, icon("mic")) : null;
  var env = h("button", { class: "chat-btn enviar", id: "chat-enviar", type: "button", "aria-label": "Enviar", disabled: CH.pensando,
    onclick: function(){ enviar(ta.value); } }, icon("enviar"));
  setTimeout(alto, 0);
  return h("div", { class: "chat-fila" }, ta, mic, env);
}
var EQUIPO_TACTIL = (function(){ try { return window.matchMedia("(pointer: coarse)").matches; } catch (e){ return true; } })();

function alternarMicro(ta){
  if (micro){ pararMicro(); return; }
  micro = dictar({
    alParcial: function(t){ ta.value = t; CH.borrador = t; },
    alError: function(m){ toast(m); },
    alTerminar: function(t){
      micro = null;
      var b = document.getElementById("mic");
      if (b){ b.classList.remove("on"); b.setAttribute("aria-pressed", "false"); }
      if (t) enviar(t, true);
    }
  });
  var b = document.getElementById("mic");
  if (micro && b){ b.classList.add("on"); b.setAttribute("aria-pressed", "true"); b.setAttribute("aria-label", "Dejar de escuchar"); }
}
function pararMicro(){ if (micro){ var m = micro; micro = null; m.parar(); } }

async function enviar(texto, porVoz){
  texto = limpio(texto, 600);
  if (!CH || !texto || CH.pensando || CH.fin) return;
  if (!hayIA()){ toast("Activa la IA (gratis) en Yo › Ajustes e IA."); return; }
  if (navigator.onLine === false){ toast("Sin conexión: conversar con la IA necesita internet."); return; }
  if (porVoz && voz.lectura && !vozOn()) ponerVoz(true);   /* si le hablas, el cliente te contesta en voz alta */
  pararMicro(); callarCliente();
  CH.turnos.push({ quien: "asesor", texto: texto });
  CH.borrador = ""; CH.error = ""; CH.pista = ""; CH.pensando = true;
  /* se pinta a mano (sin repintar la pantalla) para que la respuesta aparezca mientras llega */
  var lista = document.getElementById("chat");
  var viva = h("p", { class: "dots" }, "…");
  if (lista){
    lista.appendChild(burbuja({ quien: "asesor", texto: texto }));
    lista.appendChild(h("div", { class: "msg msg-cliente" }, h("span", { class: "msg-quien" }, CH.c.nombre), viva));
  }
  ["chat-enviar", "mic", "pista"].forEach(function(id){ var b = document.getElementById(id); if (b) b.disabled = true; });
  var ta = document.getElementById("chat-texto");
  if (ta){ ta.value = ""; ta.style.height = "auto"; }
  bajar();
  var obs = new MutationObserver(function(){ window.scrollTo(0, document.documentElement.scrollHeight); });
  obs.observe(viva, { childList: true, characterData: true, subtree: true });
  try {
    var r = await responderCliente(sistemaCliente(CH.c, CH.dif), ESCENA, CH.turnos, viva, document.createElement("div"));
    var fin = /\[FIN\]/i.test(r);
    r = r.replace(/\s*\[FIN\]\s*/gi, " ").trim() || "…";
    CH.turnos.push({ quien: "cliente", texto: r });
    if (fin){ CH.fin = true; CH.finTexto = "El cliente terminó la conversación. Mira qué opina el coach."; }
    else if (turnosAsesor() >= MAX_TURNOS){ CH.fin = true; CH.finTexto = "Ya van " + MAX_TURNOS + " intervenciones tuyas: es hora de ver cómo te fue."; }
    if (vozOn()) leerCliente(r);
  } catch (e){
    if (e && e.name === "AbortError"){ obs.disconnect(); return; }
    CH.turnos.pop();
    CH.borrador = texto;
    CH.error = textoErrorIA(e, "Tu mensaje quedó escrito abajo: intenta enviarlo otra vez.");
  } finally {
    obs.disconnect();
    CH.pensando = false;
    CH.bajar = true;
    render();
  }
}

async function pedirPista(){
  if (!CH || CH.pensando || CH.pidiendoPista || CH.eval) return;
  if (!hayIA()){ toast("Activa la IA (gratis) en Yo › Ajustes e IA."); return; }
  CH.pidiendoPista = true; CH.pista = ""; CH.error = ""; CH.bajar = true;
  render();
  try {
    var t = await preguntarCoach(sistemaCoach(), "CLIENTE: " + CH.c.nombre + ", " + CH.c.rol + ".\nCONVERSACIÓN HASTA AHORA:\n" + transcripcion() +
      "\n\nTAREA: dale al asesor UNA pista corta (máximo 2 frases, texto plano) de qué preguntar o decir ahora, siguiendo el método del manual. No hables como el cliente.");
    CH.pista = textoPlanoIA(t).trim();
  } catch (e){
    if (!(e && e.name === "AbortError")) CH.error = textoErrorIA(e);
  } finally {
    CH.pidiendoPista = false; CH.bajar = true;
    render();
  }
}

function validarEval(o){
  if (!o || typeof o !== "object" || Array.isArray(o)) throw { formato: true };
  var n = Number(o.nota);
  if (!isFinite(n)) throw { formato: true };
  var crit = {}, c = o.criterios || {};
  CRITERIOS.forEach(function(k){ crit[k[0]] = c[k[0]] === true; });
  var res = String(o.resultado || "").toLowerCase();
  return { nota: Math.max(0, Math.min(10, Math.round(n))), criterios: crit, descubrio: o.descubrio === true,
           resultado: /no compr/.test(res) ? "no compró" : /compr/.test(res) ? "compró" : "pendiente",
           bien: limpio(o.bien, 400), mejorar: limpio(o.mejorar, 400), frase: limpio(o.frase, 400) };
}
async function evaluar(){
  if (!CH || CH.evaluando || CH.eval) return;
  if (!turnosAsesor()){ toast("Primero conversa con el cliente."); return; }
  if (!hayIA()){ toast("Activa la IA (gratis) en Yo › Ajustes e IA."); return; }
  pararMicro(); callarCliente();
  CH.evaluando = true; CH.error = ""; CH.bajar = true;
  render();
  try {
    var t = await preguntarCoach(sistemaCoach(),
      "CLIENTE SIMULADO: " + CH.c.nombre + ", " + CH.c.rol + " (" + CH.c.negocio + "). Dificultad: " + CH.dif.nombre + ".\n" +
      "NECESIDAD QUE EL CLIENTE NO CONTABA DE ENTRADA: " + CH.c.secreto + "\n\nCONVERSACIÓN:\n" + transcripcion() +
      "\n\nTAREA: califica al asesor con el método del manual. Responde SOLO con un objeto JSON válido, sin texto antes ni después, con esta forma: " +
      "{\"nota\": entero de 0 a 10, \"criterios\": {" + CRITERIOS.map(function(k){ return "\"" + k[0] + "\": true o false"; }).join(", ") + "}, " +
      "\"descubrio\": true si el asesor descubrió la necesidad oculta, \"resultado\": \"compró\" o \"no compró\" o \"pendiente\", " +
      "\"bien\": \"qué hizo bien, 1 o 2 frases\", \"mejorar\": \"qué mejorar, 1 o 2 frases concretas\", \"frase\": \"una frase modelo que pudo decir, según el manual\"}.");
    CH.eval = validarEval(jsonDeIA(t));
    guardarCharla({ c: CH.c.id, d: CH.dif.id, n: CH.eval.nota, f: hoy(), r: CH.eval.resultado });
    marcarEstudio();
    guardar();
  } catch (e){
    if (!(e && e.name === "AbortError")) CH.error = e && e.formato ? "El coach respondió en un formato que no pude leer. Toca otra vez para pedir la evaluación." : textoErrorIA(e);
  } finally {
    CH.evaluando = false; CH.bajar = true;
    render();
  }
}
function evaluacionUI(ev){
  return h("section", { class: "card stack evaluacion", id: "evaluacion", "aria-label": "Evaluación del coach" },
    h("div", { class: "row" }, h("span", { class: "pill ia" }, "Coach"), h("span", { class: "pill " + (ev.resultado === "compró" ? "ok" : "") }, "Resultado: " + ev.resultado),
      h("span", { class: "spacer" }), h("b", { class: "mono eval-nota" }, ev.nota + "/10")),
    h("div", { class: "crit" }, CRITERIOS.map(function(k){
      var ok = ev.criterios[k[0]];
      return h("div", null, h("span", { class: "s " + (ok ? "ok" : "bad") }, icon(ok ? "check" : "cerrar")), h("span", null, k[1]));
    })),
    h("p", { class: "small" }, ev.descubrio ? h("b", null, "Descubriste la necesidad oculta. ") : h("b", null, "No descubriste lo que el cliente no contaba: "),
      ev.descubrio ? "" : CH.c.secreto),
    ev.bien ? h("p", null, h("b", null, "Qué hiciste bien: "), ev.bien) : null,
    ev.mejorar ? h("p", null, h("b", null, "Qué mejorar: "), ev.mejorar) : null,
    ev.frase ? h("div", { class: "cita" }, h("b", null, "Pudiste decir: "), ev.frase) : null);
}
function salir(){
  pararMicro(); callarCliente();
  ir("hablar");
}

registrar("hablar", pantallaHablar, { tab: "hablar" });
registrar("charla", pantallaCharla, { tab: "hablar", sesion: true, scroll: false });
