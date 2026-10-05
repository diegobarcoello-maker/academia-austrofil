/* Mostrador: casos técnicos y objeciones, en tres pasos con el texto del manual.
   - Caso: qué preguntar, qué recomendar (viscosidad, norma, aplicación) y qué más vender (venta cruzada).
   - Objeción: preguntar antes de opinar, argumentar con el manual y cerrar con una propuesta. */
import { h, add, icon, barajar, hoy } from "../util.js";
import { SIM } from "../datos.js";
import { ST, guardar, lineaActual, simHecho, marcarEstudio } from "../estado.js";
import { app, barra, toast, encabezado, barraProgreso } from "../ui.js";
import { registrar, ir, render } from "../nav.js";
import { citaUI } from "../quiz.js";
import { hayIA, calificarIA, CRITERIOS, textoErrorIA } from "../ia.js";

var EST = {};   /* simulaciones en curso: { paso, sel, hecho, orden, libre, nota } */
var reducido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var NOMBRE = { caso: "caso", objecion: "objeción" };

/* ============ LISTA ============ */
function pantallaMostrador(args){
  var l = lineaActual(), vista = args[0] === "objeciones" ? "objeciones" : "casos";
  var lista = l ? l[vista] : [];
  var hechos = lista.filter(function(s){ return simHecho(s.id); }).length;
  add(app, [
    encabezado("Simulador de mostrador" + (l ? " · " + l.nombre : ""), "Mostrador",
      "Lo que pasa frente al cliente, en tres pasos y con el texto del manual."),
    h("div", { class: "seg2", role: "tablist", "aria-label": "Tipo de práctica" },
      pestana("casos", "Casos", l ? l.casos.length : 0, vista), pestana("objeciones", "Objeciones", l ? l.objeciones.length : 0, vista)),
    h("p", { class: "small muted seg-nota" },
      vista === "casos" ? "Situaciones técnicas: qué preguntar, qué recomendar y qué más ofrecer." : "Lo que dice el cliente para no comprar y cómo responder con el manual.",
      lista.length ? h("b", null, " " + hechos + " de " + lista.length + " hechos.") : null)
  ]);
  var cont = h("div", { class: "stack", role: "tabpanel" });
  lista.forEach(function(s){ cont.appendChild(tarjeta(s)); });
  if (!lista.length) cont.appendChild(h("p", { class: "muted" }, "Esta línea todavía no tiene " + (vista === "casos" ? "casos." : "objeciones.")));
  app.appendChild(cont);
  app.appendChild(h("p", { class: "tiny", style: "margin-top:14px" }, hayIA()
    ? "Con IA: al final de cada uno escribes tu respuesta con tus palabras y la IA te la califica."
    : "Sin IA practicas con opciones. Con la IA activada (gratis, en Yo › Ajustes e IA) también escribes tu respuesta y te la califica."));
  var pend = lista.filter(function(s){ return !simHecho(s.id); })[0];
  if (pend) barra(h("button", { class: "btn", id: "sim-siguiente", onclick: function(){ ir("sim/" + pend.id); } },
    (hechos ? (vista === "casos" ? "Siguiente caso: " : "Siguiente objeción: ") : "Empezar: ") + pend.titulo));
}
function pestana(clave, texto, n, vista){
  var on = clave === vista;
  return h("button", { class: on ? "on" : "", role: "tab", "aria-selected": on ? "true" : "false", "data-vista": clave,
    onclick: function(){ if (!on) ir("mostrador/" + clave); } }, texto, h("span", { class: "seg-n" }, String(n)));
}
function tarjeta(s){
  var hecho = simHecho(s.id);
  return h("button", { class: "simcard" + (hecho ? " ok" : ""), "data-sim": s.id, onclick: function(){ ir("sim/" + s.id); } },
    h("span", { class: "simcard-ico" }, icon(s.icono || (s.tipo === "objecion" ? "chat" : "caso"))),
    h("span", { class: "simcard-tx" }, h("b", null, s.titulo), h("span", null, "«" + s.cliente + "»")),
    h("span", { class: "simcard-st" }, hecho ? [icon("check"), " " + hecho.bien + "/" + hecho.total] : s.pasos.length + " pasos"));
}

/* ============ UNA SIMULACIÓN ============ */
function repintar(sel){
  render();
  if (sel){ var el = app.querySelector(sel); if (el && !el.disabled) try { el.focus({ preventScroll: true }); } catch (e){} }
}
function listaDe(s){ return s.tipo === "caso" ? s.linea.casos : s.linea.objeciones; }
function siguientePendiente(s){
  var lista = listaDe(s), i = lista.indexOf(s);
  var orden = lista.slice(i + 1).concat(lista.slice(0, i));
  return orden.filter(function(x){ return !simHecho(x.id); })[0] || null;
}
function pantallaSim(args, navegando){
  var s = SIM[args[0]];
  if (!s){ ir("mostrador"); return; }
  if (navegando) window.scrollTo(0, 0);
  var est = EST[s.id] || (EST[s.id] = { paso: 0, sel: {}, hecho: {}, orden: {} });
  var n = s.pasos.length, hechos = Object.keys(est.hecho).length;
  var volverA = "mostrador" + (s.tipo === "objecion" ? "/objeciones" : "");
  add(app, [
    h("div", { class: "qtop" },
      h("button", { class: "qx", "aria-label": "Salir", onclick: function(){ ir(volverA); } }, icon("cerrar")),
      h("div", { class: "qbar" }, barraProgreso(hechos, n, "Pasos resueltos")),
      h("span", { class: "qn" }, hechos + "/" + n)),
    h("div", { class: "sim-head" },
      h("div", { class: "kicker" }, (s.tipo === "caso" ? "Caso de mostrador" : "Objeción") + " · " + s.titulo),
      h("p", { class: "muted" }, s.situacion),
      h("div", { class: "cliente" }, h("span", { class: "cliente-quien" }, icon("chat"), "El cliente"), "«" + s.cliente + "»"))
  ]);
  var fbNuevo = null, ultimaSec = null;
  s.pasos.forEach(function(p, k){
    if (k > est.paso) return;
    if (!est.orden[k]) est.orden[k] = barajar(p.opciones.map(function(_, i){ return i; }));
    var sec = h("section", { class: "paso" },
      h("div", { class: "kicker" }, "Paso " + (k + 1) + " de " + n + " · " + p.paso),
      h("p", { class: "qtext", id: "paso-" + k }, p.enunciado));
    var ops = h("div", { class: "opts", role: "radiogroup", "aria-labelledby": "paso-" + k });
    est.orden[k].forEach(function(oi, j){
      var cls = "opt";
      if (est.hecho[k]){ if (oi === p.correcta) cls += " ok"; else if (oi === est.sel[k]) cls += " bad"; }
      else if (est.sel[k] === oi) cls += " sel";
      ops.appendChild(h("button", { class: cls, role: "radio", "aria-checked": est.sel[k] === oi ? "true" : "false",
        disabled: !!est.hecho[k], "data-op": String(oi), onclick: function(){ est.sel[k] = oi; repintar('[data-op="' + oi + '"]'); } },
        h("span", { class: "k" }, "ABCD".charAt(j)), h("span", null, p.opciones[oi])));
    });
    sec.appendChild(ops);
    if (est.hecho[k]){
      var bien = est.sel[k] === p.correcta;
      var fb = h("div", { class: "fb " + (bien ? "ok" : "bad"), role: "status" },
        h("h3", null, icon(bien ? "check" : "cerrar"), bien ? "¡Así se hace!" : "Mejor no"));
      var ex = (p.explicaciones || [])[est.sel[k]];
      if (ex) fb.appendChild(h("p", null, ex));
      if (!bien) fb.appendChild(h("p", null, h("b", null, "Lo que va: "), p.opciones[p.correcta]));
      fb.appendChild(citaUI(p));
      sec.appendChild(fb);
      if (k === est.paso) fbNuevo = fb;
    }
    app.appendChild(sec);
    ultimaSec = sec;
  });
  var k = est.paso;
  if (!est.hecho[k]){
    barra(h("button", { class: "btn", id: "sim-comprobar", disabled: est.sel[k] === undefined, onclick: function(){
      est.hecho[k] = true;
      if (k === n - 1) registrar_(s, est);
      est.verFb = true;
      render();
    } }, "Comprobar"));
  } else if (k < n - 1){
    barra(h("button", { class: "btn", id: "sim-paso", onclick: function(){ est.paso++; est.irPaso = true; render(); } }, "Siguiente paso"));
  } else {
    app.appendChild(cierre(s, est));
    app.appendChild(libreUI(s, est));
    var sig = siguientePendiente(s);
    barra(sig
      ? h("button", { class: "btn", id: "sim-otro", onclick: function(){ delete EST[sig.id]; ir("sim/" + sig.id); } },
          (s.tipo === "caso" ? "Siguiente caso: " : "Siguiente objeción: ") + sig.titulo)
      : h("button", { class: "btn", id: "sim-todos", onclick: function(){ ir(volverA); } }, "Ver todos"),
      h("button", { class: "btn ghost", id: "sim-repetir", onclick: function(){ delete EST[s.id]; render(); window.scrollTo(0, 0); } },
        "Repetir este " + NOMBRE[s.tipo]));
  }
  /* lo nuevo queda a la vista: la respuesta del paso o el paso siguiente */
  var mover = reducido ? "auto" : "smooth";
  if (fbNuevo && est.verFb){ est.verFb = false; requestAnimationFrame(function(){ fbNuevo.scrollIntoView({ block: "nearest", behavior: mover }); }); }
  if (ultimaSec && est.irPaso){ est.irPaso = false; requestAnimationFrame(function(){ ultimaSec.scrollIntoView({ block: "start", behavior: mover }); }); }
}
function registrar_(s, est){
  var bien = s.pasos.filter(function(p, i){ return est.sel[i] === p.correcta; }).length;
  var antes = simHecho(s.id);
  ST.d.progreso.sims[s.id] = { bien: Math.max(bien, antes ? antes.bien : 0), total: s.pasos.length, fecha: hoy(), ultimo: bien };
  est.resultado = bien;
  marcarEstudio();
  guardar();
}
function cierre(s, est){
  var b = est.resultado !== undefined ? est.resultado : s.pasos.filter(function(p, i){ return est.sel[i] === p.correcta; }).length;
  var todo = b === s.pasos.length;
  return h("section", { class: "card cierre" + (todo ? " ok" : ""), id: "sim-resultado" },
    h("div", { class: "row" }, icon(todo ? "check" : "repaso"), h("b", null, b + " de " + s.pasos.length + " pasos bien")),
    h("p", { class: "small muted" }, todo ? "Lo resolviste como lo enseña el manual." : "Repásalo: en el mostrador cada paso cuenta."));
}

/* respuesta libre calificada por la IA (opcional) */
function libreUI(s, est){
  var sec = h("section", { class: "paso stack", id: "libre" }, h("div", { class: "kicker" }, "Ahora dilo con tus palabras"));
  if (!hayIA()){
    sec.appendChild(h("p", { class: "ianote" }, "Sin IA: la respuesta libre necesita la IA (gratis) e internet. Actívala en Yo › Ajustes e IA; mientras tanto practica con las opciones."));
    return sec;
  }
  var crit = CRITERIOS[s.tipo] || CRITERIOS.objecion;
  var ta = h("textarea", { class: "inp", id: "libre-texto", maxlength: "1200", placeholder: "Escribe lo que le dirías al cliente…", "aria-label": "Tu respuesta" });
  if (est.libre) ta.value = est.libre;
  ta.addEventListener("input", function(){ est.libre = ta.value; });
  var res = h("div", { class: "stack", id: "libre-res" });
  if (est.nota) res.appendChild(notaUI(est.nota, crit));
  var btn = h("button", { class: "btn", id: "calificar", onclick: async function(){
    var t = ta.value.trim();
    if (t.length < 15){ toast("Escribe tu respuesta completa (al menos una frase)."); return; }
    btn.disabled = true; btn.textContent = "Calificando…"; res.textContent = "";
    try {
      est.nota = await calificarIA(s, t);
      res.appendChild(notaUI(est.nota, crit));
    } catch (e){
      if (e && e.name === "AbortError") return;
      res.appendChild(h("p", { class: "ianote err", id: "ia-error" }, textoErrorIA(e, "Tu práctica con opciones sigue valiendo.")));
    } finally { btn.disabled = false; btn.textContent = "Calificar con IA"; }
  } }, "Calificar con IA");
  add(sec, [h("p", { class: "small muted" }, "La IA te califica en tres cosas: " + crit.map(function(c){ return c[1].toLowerCase(); }).join(", ") +
    ". No escribas nombres ni datos de clientes."), ta, btn, res]);
  return sec;
}
function notaUI(nota, crit){
  return h("div", { class: "card stack", id: "nota-ia" },
    h("div", { class: "row" }, h("span", { class: "pill ia" }, "Calificación IA"), h("span", { class: "spacer" }),
      h("b", { class: "mono", style: "font-size:22px" }, nota.nota + "/10")),
    h("div", { class: "crit" }, crit.map(function(c){
      var ok = nota.criterios[c[0]];
      return h("div", null, h("span", { class: "s " + (ok ? "ok" : "bad") }, icon(ok ? "check" : "cerrar")), h("span", null, c[1]));
    })),
    nota.bien ? h("p", null, h("b", null, "Qué estuvo bien: "), nota.bien) : null,
    nota.falto ? h("p", null, h("b", null, "Qué faltó: "), nota.falto) : null,
    nota.manual ? h("div", { class: "cita" }, h("b", null, "Cómo lo dice el manual: "), nota.manual) : null);
}

registrar("mostrador", pantallaMostrador, { tab: "mostrador" });
registrar("sim", pantallaSim, { tab: "mostrador", sesion: true, scroll: false });
/* enlaces de la v1 */
registrar("simulador", function(){ ir("mostrador/objeciones"); }, { tab: "mostrador" });
registrar("objecion", function(args){ ir("sim/" + args[0]); }, { tab: "mostrador" });
