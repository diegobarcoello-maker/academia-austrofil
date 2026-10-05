/* Sesiones de preguntas.
   - leccion: retroalimentación en cada pregunta; se aprueba con 75 %.
   - examen:  20 preguntas al azar del banco fijo de la línea, sin retroalimentación hasta el final; 80 %.
   - prueba:  prueba de nivel, 10 preguntas del nivel; con 80 % se aprueban todas sus lecciones.
   - repaso:  las preguntas que tocan hoy según el repaso espaciado.
   - rapido:  quiz rápido de 5 preguntas de lo ya aprobado; lo que falla vuelve mañana al repaso.
   - ia:      preguntas creadas por la IA: no cuentan para aprobar, para el examen ni para el certificado. */
import { $, h, add, rich, icon, barajar, pct, hoy } from "./util.js";
import { PREG, leccionesDe, leccionesLinea, preguntasDe, preguntasLinea, textoLeccion } from "./datos.js";
import { ST, REGLAS, guardar, lecOk, nivelOk, lineaOk, siguienteLeccion, aCaja1, entrarCaja2, moverCaja,
         vencidas, cupoRepaso, contarHecha, anotar, marcarEstudio, rachaActual } from "./estado.js";
import { app, barra, toast, confirmar } from "./ui.js";
import { registrar, ir, ruta, render, ponerGuardia } from "./nav.js";
import { hayIA, explicarIA, generarPreguntas, textoErrorIA } from "./ia.js";

var SES = null;
var COLORES = ["#B4550F", "#2C4A5C", "#7A4E9C", "#2F6B45"];
var reducido = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function prep(p){
  var it = { p: p, sel: null, pares: {}, izqSel: null, hecho: false, ok: null };
  if (p.tipo === "opcion") it.orden = barajar(p.opciones.map(function(_, i){ return i; }));
  if (p.tipo === "emparejar"){
    it.izq = barajar(p.pares.map(function(_, i){ return i; }));
    it.der = barajar(p.pares.map(function(_, i){ return i; }));
  }
  return it;
}
function iniciar(tipo, preguntas, extra){
  SES = { tipo: tipo, items: preguntas.map(prep), i: 0, res: [], fin: false, arriba: true, feedback: tipo !== "examen" && tipo !== "prueba" };
  Object.keys(extra || {}).forEach(function(k){ SES[k] = extra[k]; });
  if (location.hash === "#/quiz") render(); else location.hash = "#/quiz";
}
function ordenDistinto(lista, previo){
  if (lista.length < 2) return lista.slice();
  for (var t = 0; t < 10; t++){
    var o = barajar(lista);
    if (o.map(function(p){ return p.id; }).join() !== previo) return o;
  }
  return lista.slice().reverse();
}

/* ============ EMPEZAR ============ */
export function empezarLeccion(x, previo){ iniciar("leccion", ordenDistinto(x.preguntas, previo || ""), { leccion: x }); }
export function empezarExamen(l){
  var banco = preguntasLinea(l);   /* solo el banco fijo, nunca preguntas de IA */
  iniciar("examen", barajar(banco).slice(0, Math.min(REGLAS.PREGUNTAS_EXAMEN, banco.length)), { linea: l });
}
export function empezarPrueba(n){
  var banco = preguntasDe(leccionesDe(n));
  iniciar("prueba", barajar(banco).slice(0, Math.min(REGLAS.PREGUNTAS_PRUEBA, banco.length)), { nivel: n, linea: n.linea });
}
export function empezarRepaso(){
  var cupo = cupoRepaso();
  if (cupo <= 0){ toast("Ya hiciste tus " + REGLAS.MAX_REPASO_DIA + " preguntas de repaso de hoy. Vuelve mañana."); return; }
  var ids = vencidas().slice(0, cupo);
  if (!ids.length){ toast("Hoy no te toca repasar nada. Prueba un quiz rápido."); return; }
  iniciar("repaso", ids.map(function(id){ return PREG[id]; }));
}
export function poolAprobado(l){ return preguntasDe(leccionesLinea(l).filter(function(x){ return lecOk(x.id); })); }
export function empezarRapido(l){
  var pool = poolAprobado(l);
  if (!pool.length){ toast("Aprueba tu primera lección y se abre el quiz rápido."); return; }
  iniciar("rapido", barajar(pool).slice(0, Math.min(REGLAS.QUIZ_RAPIDO, pool.length)), { linea: l });
}
export async function practicarIA(x, btn, estado){
  if (!hayIA()){ toast("Activa la IA (gratis) en Yo › Ajustes e IA."); return; }
  if (btn){ btn.disabled = true; btn.textContent = "Creando preguntas con IA…"; }
  if (estado){ estado.className = "ianote"; estado.textContent = ""; }
  try {
    var qs = await generarPreguntas(x, textoLeccion(x));
    iniciar("ia", qs, { leccion: x });
  } catch (e){
    if (e && e.name === "AbortError") return;
    var msg = textoErrorIA(e, "Sigue con las preguntas del manual.");
    if (estado && estado.isConnected){ estado.className = "ianote err"; estado.textContent = msg; } else toast(msg);
  } finally {
    if (btn && btn.isConnected){ btn.disabled = false; btn.textContent = "Practicar con preguntas de IA"; }
  }
}

/* ============ RESPONDER ============ */
function respondida(it){
  if (it.p.tipo === "emparejar") return Object.keys(it.pares).length === it.p.pares.length;
  return it.sel !== null;
}
function evaluar(it){
  var p = it.p;
  if (p.tipo === "emparejar") return p.pares.every(function(_, i){ return it.pares[i] === i; });
  return it.sel === p.correcta;
}
export function correctaTexto(p){
  if (p.tipo === "opcion") return p.opciones[p.correcta];
  if (p.tipo === "vf") return p.correcta ? "Verdadero" : "Falso";
  return p.pares.map(function(x){ return x[0] + " → " + x[1]; }).join(" · ");
}
function dadaTexto(it){
  var p = it.p;
  if (p.tipo === "opcion") return it.sel === null ? "" : p.opciones[it.sel];
  if (p.tipo === "vf") return it.sel === null ? "" : (it.sel ? "Verdadero" : "Falso");
  /* en emparejar se muestran solo las parejas equivocadas */
  return p.pares.map(function(x, i){ var j = it.pares[i]; return j === i ? "" : x[0] + " → " + (j === undefined ? "?" : p.pares[j][1]); })
    .filter(Boolean).join(" · ");
}
function comprobar(){
  var it = SES.items[SES.i];
  if (!respondida(it) || it.hecho) return;
  it.hecho = true;
  it.ok = evaluar(it);
  SES.res.push({ id: it.p.id, ok: it.ok, it: it });
  if (!it.p.ia){
    anotar(it.p.id, it.ok);
    if (SES.tipo === "repaso"){ moverCaja(it.p.id, it.ok); contarHecha(); }
    else if (SES.tipo === "rapido" && !it.ok) aCaja1(it.p.id);
    guardar();
  }
  if (!SES.feedback){ siguiente(); return; }
  SES.verFb = true;
  render();
}
function siguiente(){
  if (SES.i < SES.items.length - 1){ SES.i++; SES.arriba = true; render(); return; }
  terminar();
}
function terminar(){
  var bien = SES.res.filter(function(r){ return r.ok; }).length, total = SES.items.length, P = ST.d.progreso;
  SES.bien = bien; SES.total = total; SES.pct = pct(bien, total); SES.fin = true;
  if (SES.tipo === "leccion"){
    var x = SES.leccion, r = P.lecciones[x.id] || { ok: false, mejor: 0, intentos: 0 };
    var nivelAntes = nivelOk(x.nivel);
    SES.aprobado = bien / total >= REGLAS.NOTA_MINIMA;
    r.intentos = (r.intentos || 0) + 1; r.total = total; r.mejor = Math.max(r.mejor || 0, bien); r.ultimo = hoy();
    if (SES.aprobado && !r.ok){ r.ok = true; r.fecha = hoy(); }
    P.lecciones[x.id] = r;
    SES.res.forEach(function(q){ if (!q.ok) aCaja1(q.id); else if (SES.aprobado) entrarCaja2(q.id); });
    SES.nivelNuevo = !nivelAntes && nivelOk(x.nivel);
  } else if (SES.tipo === "examen"){
    var l = SES.linea, e = P.examenes[l.codigo] || { intentos: 0, mejor: 0 };
    SES.aprobado = bien / total >= REGLAS.NOTA_EXAMEN;
    e.intentos = (e.intentos || 0) + 1; e.total = total; e.mejor = Math.max(e.mejor || 0, bien);
    e.ultimo = { bien: bien, total: total, pct: SES.pct, fecha: hoy() };
    if (SES.aprobado){
      e.aprobado = true;
      if (!e.cert || SES.pct > e.cert.pct) e.cert = { bien: bien, total: total, pct: SES.pct, fecha: hoy() };
    }
    P.examenes[l.codigo] = e;
    SES.res.forEach(function(q){ if (!q.ok) aCaja1(q.id); });
  } else if (SES.tipo === "prueba"){
    var n = SES.nivel, pr = P.pruebas[n.id] || { intentos: 0, mejor: 0 };
    SES.aprobado = bien / total >= REGLAS.NOTA_PRUEBA;
    pr.intentos = (pr.intentos || 0) + 1; pr.mejor = Math.max(pr.mejor || 0, SES.pct); pr.ultimo = hoy();
    if (SES.aprobado){
      pr.aprobado = hoy();
      leccionesDe(n).forEach(function(x){
        var r = P.lecciones[x.id] || { mejor: 0, intentos: 0 };
        if (r.ok) return;
        r.ok = true; r.prueba = true; r.fecha = hoy(); r.ultimo = hoy(); r.total = r.total || x.preguntas.length;
        P.lecciones[x.id] = r;
      });
    }
    P.pruebas[n.id] = pr;
    SES.res.forEach(function(q){ if (!q.ok) aCaja1(q.id); else if (SES.aprobado) entrarCaja2(q.id); });
  } else if (SES.tipo === "repaso"){
    ST.d.repaso.hecho = hoy();
  }
  marcarEstudio();
  guardar();
  SES.arriba = true;
  render();
}
function vuelta(){
  if (!SES) return "ruta";
  if (SES.leccion) return "leccion/" + SES.leccion.id;
  if (SES.tipo === "repaso" || SES.tipo === "rapido") return "practicar";
  if (SES.tipo === "examen") return "examen/" + SES.linea.codigo;
  return "ruta";
}
function salirSesion(){ ir(vuelta()); }

/* salir a mitad de un examen o de una prueba pide confirmación: se pierde el intento */
var salidaPendiente = false;
ponerGuardia(function(){
  if (!SES || salidaPendiente || ruta()[0] === "quiz") return true;
  if (SES.fin){ SES = null; return true; }
  if ((SES.tipo === "examen" || SES.tipo === "prueba") && SES.res.length){
    salidaPendiente = true;
    confirmar(SES.tipo === "examen" ? "¿Salir del examen?" : "¿Salir de la prueba de nivel?",
      "Se pierde este intento. Puedes empezar otro cuando quieras.", "Salir", "Seguir")
      .then(function(ok){
        salidaPendiente = false;
        if (ok){ SES = null; render(true); }
        else location.hash = "#/quiz";
      });
    return false;
  }
  SES = null;
  return true;
});

/* ============ PANTALLA DE UNA PREGUNTA ============ */
/* re-pinta sin perder el foco del teclado ni la posición */
function repintar(sel){
  render();
  if (sel){ var el = $(sel); if (el && !el.disabled) try { el.focus({ preventScroll: true }); } catch (e){} }
}
var PILL = { examen: "Examen final", prueba: "Prueba de nivel", repaso: "Repaso", rapido: "Quiz rápido" };
function pantallaPregunta(){
  if (!SES){ ir("ruta"); return; }
  /* cada pregunta nueva (y el resultado) empieza arriba; al comprobar se mantiene la posición */
  if (SES.arriba){ SES.arriba = false; window.scrollTo(0, 0); }
  if (SES.fin){ pantallaResultado(); return; }
  var it = SES.items[SES.i], p = it.p, n = SES.items.length, hechas = SES.i + (it.hecho ? 1 : 0);
  var tipoTx = { opcion: "Opción múltiple", vf: "Verdadero o falso", emparejar: "Empareja" }[p.tipo];
  add(app, [
    h("div", { class: "qtop" },
      h("button", { class: "qx", "aria-label": "Salir", onclick: salirSesion }, icon("cerrar")),
      h("div", { class: "qbar", role: "progressbar", "aria-label": "Avance de la sesión", "aria-valuemin": "0",
        "aria-valuemax": String(n), "aria-valuenow": String(hechas) }, h("i", { style: "width:" + pct(hechas, n) + "%" })),
      h("span", { class: "qn" }, (SES.i + 1) + "/" + n)),
    h("div", { class: "meta qtipo" },
      h("span", { class: "pill" }, tipoTx),
      p.ia ? h("span", { class: "pill ia" }, "Pregunta IA") : null,
      PILL[SES.tipo] ? h("span", { class: "pill amber" }, PILL[SES.tipo]) : null,
      SES.tipo === "leccion" ? h("span", { class: "pill" }, SES.leccion.titulo) : null),
    h("p", { class: "qtext", id: "enunciado", "data-pid": p.id }, p.enunciado),
    p.tipo === "opcion" ? opcionesUI(it) : p.tipo === "vf" ? vfUI(it) : emparejarUI(it)
  ]);
  var fb = null;
  if (it.hecho && SES.feedback){ fb = feedbackUI(it); app.appendChild(fb); }
  var ultima = SES.i === n - 1;
  if (!it.hecho || !SES.feedback){
    barra(h("button", { class: "btn", id: "comprobar", disabled: !respondida(it), onclick: comprobar },
      SES.feedback ? "Comprobar" : ultima ? (SES.tipo === "examen" ? "Terminar el examen" : "Terminar la prueba") : "Siguiente"));
  } else {
    barra(h("button", { class: "btn", id: "siguiente", onclick: siguiente }, ultima ? "Ver resultado" : "Siguiente"));
  }
  /* la respuesta queda a la vista, sin que la tape la barra de abajo */
  if (fb && SES.verFb){
    SES.verFb = false;
    requestAnimationFrame(function(){ fb.scrollIntoView({ block: "nearest", behavior: reducido ? "auto" : "smooth" }); });
  }
}
function opcionesUI(it){
  var p = it.p, box = h("div", { class: "opts", role: "radiogroup", "aria-labelledby": "enunciado" });
  it.orden.forEach(function(oi, k){
    var cls = "opt";
    if (it.hecho && SES.feedback){ if (oi === p.correcta) cls += " ok"; else if (oi === it.sel) cls += " bad"; }
    else if (it.sel === oi) cls += " sel";
    box.appendChild(h("button", { class: cls, role: "radio", "aria-checked": it.sel === oi ? "true" : "false",
      disabled: it.hecho, "data-op": String(oi), onclick: function(){ it.sel = oi; repintar('[data-op="' + oi + '"]'); } },
      h("span", { class: "k" }, "ABCD".charAt(k)), h("span", null, p.opciones[oi])));
  });
  return box;
}
function vfUI(it){
  var p = it.p, box = h("div", { class: "vf", role: "radiogroup", "aria-labelledby": "enunciado" });
  [true, false].forEach(function(v){
    var cls = "opt";
    if (it.hecho && SES.feedback){ if (v === p.correcta) cls += " ok"; else if (v === it.sel) cls += " bad"; }
    else if (it.sel === v) cls += " sel";
    box.appendChild(h("button", { class: cls, role: "radio", "aria-checked": it.sel === v ? "true" : "false",
      disabled: it.hecho, "data-vf": String(v), onclick: function(){ it.sel = v; repintar('[data-vf="' + v + '"]'); } }, v ? "Verdadero" : "Falso"));
  });
  return box;
}
function izqDe(it, j){
  for (var k in it.pares) if (it.pares[k] === j) return +k;
  return null;
}
function marca(it, i){
  var pos = it.izq.indexOf(i);
  return h("span", { class: "tagn", style: "background:" + COLORES[pos % COLORES.length] }, String(pos + 1));
}
function emparejarUI(it){
  var p = it.p, izq = h("div", { class: "mcol" }), der = h("div", { class: "mcol" });
  var ver = it.hecho && SES.feedback;
  it.izq.forEach(function(i){
    var par = it.pares[i] !== undefined;
    var cls = "mi" + (it.izqSel === i ? " sel" : "") + (par ? " paired" : "") + (ver ? (it.pares[i] === i ? " ok" : " bad") : "");
    izq.appendChild(h("button", { class: cls, disabled: it.hecho, "data-izq": String(i), "aria-pressed": it.izqSel === i ? "true" : "false",
      onclick: function(){
        if (par){ delete it.pares[i]; it.izqSel = null; }
        else it.izqSel = it.izqSel === i ? null : i;
        repintar('[data-izq="' + i + '"]');
      } }, p.pares[i][0], par ? marca(it, i) : null));
  });
  it.der.forEach(function(j){
    var quien = izqDe(it, j);
    var cls = "mi" + (quien !== null ? " paired" : "") + (ver && quien !== null ? (quien === j ? " ok" : " bad") : "");
    der.appendChild(h("button", { class: cls, disabled: it.hecho, "data-der": String(j),
      onclick: function(){
        if (quien !== null){ delete it.pares[quien]; repintar('[data-der="' + j + '"]'); return; }
        if (it.izqSel === null){ toast("Primero toca un elemento de la izquierda."); return; }
        it.pares[it.izqSel] = j; it.izqSel = null; repintar('[data-der="' + j + '"]');
      } }, p.pares[j][1], quien !== null ? marca(it, quien) : null));
  });
  return h("div", null, h("div", { class: "match" }, izq, der),
    it.hecho ? null : h("p", { class: "mhint" }, "Toca uno de la izquierda y después su pareja de la derecha. Para deshacer, toca la pareja."));
}
export function citaUI(p){
  return h("div", { class: "cita" }, h("b", null, "Así lo dice el manual: "), rich(p.cita),
    p.origen && p.origen.texto ? h("small", null, "Fuente: " + p.origen.texto) : null);
}
function feedbackUI(it){
  var p = it.p;
  var fb = h("div", { class: "fb " + (it.ok ? "ok" : "bad"), role: "status", id: "feedback" },
    h("h3", null, icon(it.ok ? "check" : "cerrar"), it.ok ? "¡Bien!" : "No es así"));
  if (!it.ok) fb.appendChild(h("p", null, h("b", null, "Correcta: "), correctaTexto(p)));
  if (p.ia){
    if (p.cita) fb.appendChild(h("div", { class: "cita" }, h("b", null, "Explicación de la IA: "), p.cita,
      h("small", null, "Pregunta de práctica: confírmala con el texto de la lección.")));
  } else fb.appendChild(citaUI(p));
  if (!it.ok && !p.ia){
    if (hayIA()){
      var box = h("div", { class: "stack" });
      if (it.iaTexto) box.appendChild(h("div", { class: "iabox" }, it.iaTexto));
      else fb.appendChild(h("button", { class: "btn sec small", id: "ia-porque", onclick: function(){
        this.remove();
        var x = p.leccion;
        explicarIA({ enunciado: p.enunciado, opciones: p.tipo === "opcion" ? p.opciones : null, dada: dadaTexto(it),
          correcta: correctaTexto(p), cita: p.cita, leccion: x ? { titulo: x.titulo, texto: textoLeccion(x) } : null }, box)
          .then(function(t){ if (t) it.iaTexto = t; });
      } }, "¿Por qué fallé? Explícame con IA"));
      fb.appendChild(box);
    }
  }
  return fb;
}

/* ============ RESULTADO ============ */
function fallosUI(){
  var malos = SES.res.filter(function(r){ return !r.ok; });
  if (!malos.length) return null;
  return h("div", { class: "stack" }, h("h2", { class: "hlabel" }, "Repasa lo que fallaste"),
    malos.map(function(r){
      var p = r.it.p;
      return h("div", { class: "fallo" }, h("p", { class: "q" }, p.enunciado),
        h("p", { class: "a" }, (p.tipo === "emparejar" ? "Parejas equivocadas: " : "Respondiste: ") + (dadaTexto(r.it) || "—")),
        h("p", { class: "a" }, h("b", null, "Correcta: "), correctaTexto(p)),
        p.ia ? (p.cita ? h("div", { class: "cita" }, p.cita) : null) : citaUI(p));
    }));
}
function pantallaResultado(){
  var S = SES, ok = S.tipo === "leccion" || S.tipo === "examen" || S.tipo === "prueba" ? S.aprobado : true;
  var titulo, texto, botones = [];
  if (S.tipo === "leccion"){
    var x = S.leccion, sig = siguienteLeccion(x.linea);
    if (S.aprobado){
      titulo = "¡Lección aprobada!";
      texto = S.nivelNuevo
        ? (x.nivel.idx + 1 < x.linea.niveles.length ? "Aprobaste el nivel " + (x.nivel.idx + 1) + ". Se abrió el nivel " + (x.nivel.idx + 2) + "."
          : "Aprobaste todos los niveles. Ya puedes rendir el examen final.")
        : "Sus preguntas pasan a tu repaso para que no se te olviden.";
      if (sig) botones.push(h("button", { class: "btn", id: "sig-leccion", onclick: function(){ ir("leccion/" + sig.id); } }, "Siguiente: " + sig.titulo));
      else if (lineaOk(x.linea)) botones.push(h("button", { class: "btn", onclick: function(){ ir("examen/" + x.linea.codigo); } }, "Ir al examen final"));
      botones.push(h("button", { class: "btn sec", onclick: function(){ ir("ruta"); } }, "Volver a la ruta"));
    } else {
      titulo = "Te faltó poco";
      texto = "Necesitas " + Math.ceil(REGLAS.NOTA_MINIMA * S.total - 1e-9) + " de " + S.total + ". Lo que fallaste pasa a tu repaso. Repite con las preguntas en otro orden.";
      var previo = S.items.map(function(it){ return it.p.id; }).join();
      botones.push(h("button", { class: "btn", id: "repetir", onclick: function(){ empezarLeccion(x, previo); } }, "Repetir el quiz (otro orden)"));
      botones.push(h("button", { class: "btn sec", onclick: function(){ ir("leccion/" + x.id); } }, "Releer la lección"));
    }
  } else if (S.tipo === "examen"){
    var l = S.linea;
    titulo = S.aprobado ? "¡Aprobaste el examen!" : "Todavía no";
    texto = S.aprobado ? "Tu certificado de " + l.nombre + " está listo." :
      "Necesitas " + Math.ceil(REGLAS.NOTA_EXAMEN * S.total - 1e-9) + " de " + S.total + " (" + Math.round(REGLAS.NOTA_EXAMEN * 100) + " %). Repasa lo que fallaste y vuelve a intentarlo.";
    if (S.aprobado) botones.push(h("button", { class: "btn", id: "ver-cert", onclick: function(){ ir("certificado/" + l.codigo); } }, "Ver mi certificado"));
    else botones.push(h("button", { class: "btn", id: "repetir-examen", onclick: function(){ empezarExamen(l); } }, "Repetir el examen"));
    botones.push(h("button", { class: "btn sec", onclick: function(){ ir("ruta"); } }, "Volver a la ruta"));
  } else if (S.tipo === "prueba"){
    var n = S.nivel, ultimo = n.idx + 1 >= n.linea.niveles.length;
    titulo = S.aprobado ? "¡Nivel " + (n.idx + 1) + " aprobado!" : "Todavía no";
    texto = S.aprobado
      ? "Se aprobaron sus " + leccionesDe(n).length + " lecciones. " + (ultimo ? "Ya puedes rendir el examen final." : "Se abrió el nivel " + (n.idx + 2) + ".")
      : "Necesitas " + Math.ceil(REGLAS.NOTA_PRUEBA * S.total - 1e-9) + " de " + S.total + ". Sigue lección por lección: lo que fallaste pasa a tu repaso.";
    botones.push(h("button", { class: "btn", id: "volver-ruta", onclick: function(){ ir("ruta"); } }, S.aprobado ? "Seguir con la ruta" : "Volver a la ruta"));
    if (!S.aprobado) botones.push(h("button", { class: "btn sec", onclick: function(){ empezarPrueba(n); } }, "Repetir la prueba"));
  } else if (S.tipo === "repaso"){
    var ra = rachaActual();
    titulo = "Repaso hecho";
    texto = "Racha: " + ra + (ra === 1 ? " día." : " días seguidos.") + " Lo que acertaste vuelve más adelante; lo que fallaste, mañana.";
    botones.push(h("button", { class: "btn", onclick: function(){ ir("practicar"); } }, "Volver a Practicar"));
  } else if (S.tipo === "rapido"){
    titulo = "Quiz rápido hecho";
    texto = "Acertaste " + S.bien + " de " + S.total + "." + (S.bien < S.total ? " Lo que fallaste vuelve mañana a tu repaso." : " ¡Todo bien!");
    var lr = S.linea;
    botones.push(h("button", { class: "btn", id: "otro-rapido", onclick: function(){ empezarRapido(lr); } }, "Otro quiz rápido"));
    botones.push(h("button", { class: "btn sec", onclick: function(){ ir("practicar"); } }, "Volver a Practicar"));
  } else {
    titulo = "Práctica con IA";
    texto = "Estas preguntas son de práctica: no cuentan para aprobar lecciones, para el examen ni para el certificado.";
    var lx = S.leccion;
    botones.push(h("button", { class: "btn", onclick: function(){ practicarIA(lx); } }, "Otra ronda con IA"));
    botones.push(h("button", { class: "btn sec", onclick: function(){ ir("leccion/" + lx.id); } }, "Volver a la lección"));
  }
  add(app, [
    h("div", { class: "score", id: "resultado" },
      h("div", { class: "score-ico " + (ok ? "ok" : "bad") }, icon(ok ? "check" : "repaso")),
      h("div", { class: "big " + (ok ? "ok" : "bad") }, S.bien + "/" + S.total),
      h("div", { class: "mono score-pct" }, S.pct + " %"),
      h("h1", null, titulo), h("p", null, texto)),
    fallosUI()
  ]);
  barra.apply(null, botones);
}

registrar("quiz", pantallaPregunta, { tab: "ruta", sesion: true, scroll: false });
