/* Ruta de aprendizaje: avance de la línea, niveles como etapas, lecciones, prueba de nivel,
   examen final y certificado. */
import { h, add, icon, fechaEc, primerNombre, rich, plano, lsGet, lsSet, hoy, EQUIPO } from "../util.js";
import { DATA, LEC, lineaPorCodigo, leccionesDe, preguntasDe, preguntasLinea, numeroLeccion, leccionesLinea } from "../datos.js";
import { ST, REGLAS, lineaActual, elegirLinea, lecOk, lecRegistro, nivelOk, nivelAbierto, aprobadasEn, lineaOk,
         examen, nivelActual, siguienteLeccion, avanceLinea, rachaActual, nombre } from "../estado.js";
import { app, barra, toast, encabezado, barraProgreso } from "../ui.js";
import { registrar, ir } from "../nav.js";
import { empezarLeccion, empezarExamen, empezarPrueba, practicarIA } from "../quiz.js";
import { hayIA } from "../ia.js";
import { datosCert, dibujarCertificado, compartirCert, blobDe, descargarBlob } from "../certificado.js";
import { puedeInstalar, instalar } from "../pwa.js";

/* niveles que el asesor abrió o cerró a mano (por defecto solo se ve abierto el nivel en curso) */
var desplegados = {};

/* ============ RUTA ============ */
function pantallaRuta(args){
  var pedida = args[0] && lineaPorCodigo(args[0]);
  if (pedida && pedida.activa && ST.d.linea !== pedida.codigo) elegirLinea(pedida.codigo);
  var l = lineaActual();
  if (!l || !l.activa){ add(app, encabezado("Ruta de aprendizaje", "Sin contenido", "Todavía no hay líneas activas.")); return; }
  var a = avanceLinea(l), sig = siguienteLeccion(l), actual = nivelActual(l);
  add(app, [
    h("div", { class: "vhead" },
      h("div", { class: "kicker" }, "Hola, " + primerNombre(nombre()) + " · Ruta de aprendizaje"),
      h("h1", null, "Línea " + l.codigo + " · " + l.nombre),
      l.intro ? h("p", null, l.intro) : null),
    chipsLineas(l),
    hero(l, a, actual),
    tarjetaInstalar()
  ]);
  var etapas = h("div", { class: "etapas" });
  l.niveles.forEach(function(n){ etapas.appendChild(etapa(n, sig, actual)); });
  etapas.appendChild(metaExamen(l, a));
  app.appendChild(etapas);
  if (sig) barra(h("button", { class: "btn", id: "continuar", onclick: function(){ ir("leccion/" + sig.id); } },
    (a.lecciones ? "Continuar: " : "Empezar: ") + sig.titulo));
  else if (lineaOk(l) && !a.aprobado) barra(h("button", { class: "btn", id: "ir-examen", onclick: function(){ ir("examen/" + l.codigo); } }, "Rendir el examen final"));
  else if (a.aprobado) barra(h("button", { class: "btn sec", onclick: function(){ ir("certificado/" + l.codigo); } }, "Ver mi certificado"));
}

function chipsLineas(l){
  var chips = h("div", { class: "lineas", role: "group", "aria-label": "Líneas de producto" });
  DATA.lineas.forEach(function(x){
    var a = x.activa ? avanceLinea(x) : null;
    chips.appendChild(h("button", { class: "lchip" + (x === l ? " on" : "") + (x.activa ? "" : " soon"),
      "aria-current": x === l ? "true" : null, "aria-disabled": x.activa ? null : "true",
      onclick: function(){
        if (!x.activa){ toast("Línea " + x.codigo + " · " + x.nombre + ": próximamente."); return; }
        ir("ruta/" + x.codigo);
      } },
      h("span", { class: "code" }, String(x.codigo)), h("span", null, x.nombre),
      h("small", null, x.activa ? a.pct + " %" : "Pronto")));
  });
  return chips;
}

function hero(l, a, actual){
  var e = a.examen, r = rachaActual(), estado;
  if (a.aprobado) estado = "Certificado con " + e.cert.pct + " %. Sigue practicando para no olvidar.";
  else if (lineaOk(l)) estado = "Ruta completa: te falta el examen final.";
  else estado = "En curso: nivel " + (actual.idx + 1) + " de " + l.niveles.length + " · " + actual.titulo;
  return h("section", { class: "hero", "aria-label": "Tu avance en " + l.nombre },
    h("div", { class: "hero-top" },
      h("div", { class: "hero-num" }, h("b", null, a.pct + " %"), h("span", null, a.lecciones + " de " + a.total + " lecciones")),
      h("div", { class: "hero-racha", title: "Días seguidos estudiando" }, icon("llama"),
        h("b", null, String(r)), h("span", null, r === 1 ? "día" : "días"))),
    barraProgreso(a.lecciones, a.total, "Lecciones aprobadas de " + l.nombre),
    h("p", { class: "hero-estado" }, estado));
}

var OCULTAR = "academia.instalarOculto";
function tarjetaInstalar(){
  if (!puedeInstalar() || lsGet(OCULTAR)) return null;
  var card = h("div", { class: "aviso", id: "instalar-card" },
    icon("celular"),
    h("p", null, h("b", null, "Instálala en " + EQUIPO.tu + ". "),
      "Se abre como app" + (EQUIPO.tactil ? " desde la pantalla de inicio" : "") + " y funciona sin internet."),
    h("button", { class: "btn small", onclick: instalar }, "Instalar"),
    h("button", { class: "aviso-x", "aria-label": "No mostrar más", onclick: function(){ lsSet(OCULTAR, hoy()); card.remove(); } }, icon("cerrar")));
  return card;
}

function etapa(n, sig, actual){
  var ls = leccionesDe(n), ok = aprobadasEn(ls), esOk = nivelOk(n), abierto = nivelAbierto(n), esActual = n === actual;
  var abiertoUI = desplegados[n.id] !== undefined ? desplegados[n.id] : esActual;
  var cls = "etapa" + (esOk ? " ok" : esActual ? " actual" : abierto ? "" : " lock");
  var est = esOk ? "Aprobado" : esActual ? "En curso · " + ok + " de " + ls.length + " lecciones" : "Se abre al aprobar el nivel " + n.idx;
  var idCuerpo = "etapa-" + n.id;
  var box = h("section", { class: cls, "data-nivel": n.id, "aria-label": "Nivel " + (n.idx + 1) + ": " + n.titulo });
  box.appendChild(h("button", { class: "etapa-cab", "aria-expanded": abiertoUI ? "true" : "false", "aria-controls": idCuerpo,
    onclick: function(){
      desplegados[n.id] = !abiertoUI;
      box.replaceWith(etapa(n, sig, actual));
    } },
    h("span", { class: "etapa-n" }, esOk ? icon("check") : abierto ? String(n.idx + 1) : icon("candado")),
    h("span", { class: "etapa-tx" }, h("small", null, "Nivel " + (n.idx + 1)), h("b", null, n.titulo), h("span", null, est)),
    h("span", { class: "etapa-cnt mono" }, ok + "/" + ls.length),
    icon("abajo", "etapa-chev")));
  if (esActual) box.appendChild(h("div", { class: "etapa-prog" }, barraProgreso(ok, ls.length, "Lecciones aprobadas del nivel " + (n.idx + 1), "fina")));
  if (abiertoUI){
    var cuerpo = h("div", { class: "etapa-cuerpo", id: idCuerpo });
    if (!abierto) cuerpo.appendChild(h("p", { class: "lockmsg" }, "Así se ve lo que viene. Se abre cuando apruebes todas las lecciones del nivel " + n.idx + "."));
    n.modulos.forEach(function(m){
      cuerpo.appendChild(h("h3", { class: "mod-tit" }, m.titulo));
      var camino = h("div", { class: "camino" });
      m.lecciones.forEach(function(x){ camino.appendChild(nodo(x, abierto, x === sig)); });
      cuerpo.appendChild(camino);
    });
    if (esActual && abierto) cuerpo.appendChild(ctaPrueba(n));
    box.appendChild(cuerpo);
  }
  return box;
}

function nodo(x, abierto, esSig){
  var r = lecRegistro(x.id), ok = lecOk(x.id);
  var est = ok ? (r.prueba ? "Aprobada en la prueba de nivel" : "Aprobada · " + r.mejor + "/" + r.total)
    : r && r.intentos ? "Por aprobar · mejor " + r.mejor + "/" + r.total
    : "≈ " + x.minutos + " min · " + x.preguntas.length + " preguntas";
  return h("button", { class: "nodo" + (ok ? " ok" : "") + (esSig ? " sig" : "") + (abierto ? "" : " lock"), "data-lec": x.id,
      disabled: !abierto, onclick: function(){ ir("leccion/" + x.id); } },
    h("span", { class: "bola" }, ok ? icon("check") : abierto ? numeroLeccion(x) : icon("candado")),
    h("span", { class: "tx" }, esSig ? h("small", null, "Sigue aquí") : null, h("b", null, x.titulo), h("span", null, est)),
    abierto ? icon("flecha", "nodo-fl") : null);
}

function ctaPrueba(n){
  var pr = ST.d.progreso.pruebas[n.id], cant = Math.min(REGLAS.PREGUNTAS_PRUEBA, preguntasDe(leccionesDe(n)).length);
  return h("div", { class: "prueba-cta" },
    h("div", null, h("b", null, "¿Ya dominas este nivel?"),
      h("span", null, "Haz la prueba de nivel: " + cant + " preguntas. Con " + Math.round(REGLAS.NOTA_PRUEBA * 100) + " % apruebas el nivel completo." +
        (pr && pr.intentos ? " Tu mejor intento: " + pr.mejor + " %." : ""))),
    h("button", { class: "btn sec small", id: "ir-prueba", onclick: function(){ ir("prueba/" + n.id); } }, "Hacer la prueba"));
}

function metaExamen(l, a){
  var listo = lineaOk(l), e = a.examen;
  var est = a.aprobado ? "Aprobado con " + e.cert.pct + " % el " + fechaEc(e.cert.fecha)
    : listo ? REGLAS.PREGUNTAS_EXAMEN + " preguntas al azar · apruebas con " + Math.round(REGLAS.NOTA_EXAMEN * 100) + " %"
    : "Se habilita al aprobar los " + l.niveles.length + " niveles";
  return h("section", { class: "etapa meta" + (a.aprobado ? " ok" : listo ? " actual" : " lock"), id: "examcard" },
    h("div", { class: "etapa-cab" },
      h("span", { class: "etapa-n" }, icon(a.aprobado ? "check" : "medalla")),
      h("span", { class: "etapa-tx" }, h("small", null, "Meta"), h("b", null, "Examen final y certificado"), h("span", null, est))),
    listo ? h("div", { class: "etapa-cuerpo btns" },
      a.aprobado ? h("button", { class: "btn", onclick: function(){ ir("certificado/" + l.codigo); } }, "Ver mi certificado") : null,
      h("button", { class: "btn" + (a.aprobado ? " sec" : ""), onclick: function(){ ir("examen/" + l.codigo); } },
        e && e.intentos ? "Repetir el examen" : "Rendir el examen")) : null);
}

/* ============ LECCIÓN ============ */
function pintarCuerpo(cuerpo){
  var out = h("div", { class: "cuerpo" }), i = 0;
  while (i < cuerpo.length){
    var b = cuerpo[i];
    if (b.t === "li"){
      var ul = h("ul");
      while (i < cuerpo.length && cuerpo[i].t === "li"){ ul.appendChild(h("li", null, rich(cuerpo[i].f))); i++; }
      out.appendChild(ul); continue;
    }
    if (b.t === "fila"){
      var box = h("div", { class: "filas" }), cols = JSON.stringify(b.cols || []);
      while (i < cuerpo.length && cuerpo[i].t === "fila" && JSON.stringify(cuerpo[i].cols || []) === cols){
        var f = cuerpo[i], cells = f.cells || [f.f], c0 = (f.cols || [])[0];
        /* "I" a secas no dice nada: con el encabezado de la columna queda "Grupo I" */
        var fila = h("div", { class: "fila" }, h("b", null, c0 && plano(cells[0]).length <= 4 ? c0 + " " : "", rich(cells[0])));
        cells.slice(1).forEach(function(c, k){
          var lbl = cells.length > 2 ? (f.cols || [])[k + 1] : "";
          fila.appendChild(h("span", { class: "c" }, lbl ? h("i", null, lbl) : null, rich(c)));
        });
        box.appendChild(fila); i++;
      }
      out.appendChild(box); continue;
    }
    if (b.t === "nota"){
      var call = h("div", { class: "call" + (b.k === "err" ? " err" : b.k === "src" ? " src" : "") });
      if (b.lbl) call.appendChild(h("span", { class: "lbl" }, b.lbl));
      var lbl0 = b.lbl;
      while (i < cuerpo.length && cuerpo[i].t === "nota" && cuerpo[i].lbl === lbl0){ call.appendChild(h("p", null, rich(cuerpo[i].f))); i++; }
      out.appendChild(call); continue;
    }
    if (b.t === "p") out.appendChild(h("p", { class: /lead/.test(b.cls || "") ? "lead" : null }, rich(b.f)));
    else if (b.t === "h3") out.appendChild(h("h3", null, plano(b.f)));
    else if (b.t === "h4") out.appendChild(h("h4", null, plano(b.f)));
    else if (b.t === "dato") out.appendChild(h("div", { class: "dato" }, rich(b.f)));
    else if (b.t === "def") out.appendChild(h("p", null, rich(b.f)));
    else if (b.t === "cabecera"){
      var partes = plano(b.f).split(" · ");
      out.appendChild(h("div", { class: "cab" }, partes[0], partes.slice(1).map(function(x){ return h("small", null, x); })));
    } else if (b.t === "marcas"){
      var mm = h("div", { class: "marcas" });
      (b.marcas || plano(b.f).split(", ")).forEach(function(x){
        mm.appendChild(h("span", { class: "marca" + ((b.own || []).indexOf(x) > -1 ? " own" : (b.grp || []).indexOf(x) > -1 ? " grp" : "") }, x));
      });
      out.appendChild(mm);
    } else if (b.t === "qa"){
      out.appendChild(h("div", { class: "call qa" }, h("span", { class: "lbl" }, "Del banco de respuestas del manual"), h("p", null, rich(b.f))));
    } else out.appendChild(h("p", null, rich(b.f)));
    i++;
  }
  return out;
}
function pantallaLeccion(args){
  var x = LEC[args[0]];
  if (!x){ ir("ruta"); return; }
  if (!nivelAbierto(x.nivel)){
    add(app, encabezado("Nivel " + (x.nivel.idx + 1) + " · " + x.modulo.titulo, x.titulo,
      "Esta lección se abre cuando apruebes todo el nivel " + x.nivel.idx + "."));
    barra(h("button", { class: "btn", onclick: function(){ ir("ruta"); } }, "Volver a la ruta"));
    return;
  }
  var r = lecRegistro(x.id), todas = leccionesLinea(x.linea), pos = todas.indexOf(x) + 1;
  var estadoIA = h("p", { class: "ianote", id: "ia-estado", role: "status" });
  add(app, [
    h("div", { class: "lhead" },
      h("a", { class: "volver", href: "#/ruta" }, icon("atras"), "Ruta"),
      h("div", { class: "crumb" }, "Nivel " + (x.nivel.idx + 1) + " · " + x.modulo.titulo + " · lección " + pos + " de " + todas.length),
      h("h1", null, x.titulo),
      h("div", { class: "meta" },
        h("span", { class: "pill amber" }, "≈ " + x.minutos + " min"),
        h("span", { class: "pill" }, x.preguntas.length + " preguntas"),
        lecOk(x.id) ? h("span", { class: "pill ok" }, r.prueba ? "Aprobada en la prueba" : "Aprobada " + r.mejor + "/" + r.total) : null)),
    pintarCuerpo(x.cuerpo),
    h("p", { class: "fuentes" }, "Fuente: " + x.fuentes.map(function(f){ return f.qa ? "Banco de respuestas («" + f.qa + "»)" : f.texto; }).join(" · ") +
      " · Manual de Campo v" + (DATA.manual.version || "")),
    estadoIA
  ]);
  var practica = hayIA()
    ? h("button", { class: "btn ghost", id: "practicar-ia", onclick: function(){ practicarIA(x, this, estadoIA); } }, "Practicar con preguntas de IA")
    : null;
  barra(h("button", { class: "btn", id: "hacer-quiz", onclick: function(){ empezarLeccion(x); } },
    (lecOk(x.id) ? "Repasar el quiz" : "Hacer el quiz") + " (" + x.preguntas.length + " preguntas)"), practica);
}

/* ============ PRUEBA DE NIVEL ============ */
function pantallaPrueba(args){
  var n = null;
  DATA.lineas.forEach(function(l){ l.niveles.forEach(function(x){ if (x.id === args[0]) n = x; }); });
  if (!n){ ir("ruta"); return; }
  var cant = Math.min(REGLAS.PREGUNTAS_PRUEBA, preguntasDe(leccionesDe(n)).length), pr = ST.d.progreso.pruebas[n.id];
  add(app, [
    h("div", { class: "lhead" }, h("a", { class: "volver", href: "#/ruta" }, icon("atras"), "Ruta")),
    encabezado("Prueba de nivel · línea " + n.linea.codigo, "Nivel " + (n.idx + 1) + " · " + n.titulo,
      "Para quien ya sabe: " + cant + " preguntas al azar de las " + leccionesDe(n).length + " lecciones del nivel, sin ayuda hasta el final. " +
      "Con " + Math.round(REGLAS.NOTA_PRUEBA * 100) + " % o más se aprueban todas sus lecciones y se abre el siguiente nivel. Si no llegas, sigues lección por lección."),
    pr && pr.intentos ? h("div", { class: "card" }, h("p", null, "Intentos: " + pr.intentos + " · mejor nota: " + pr.mejor + " %")) : null
  ]);
  if (nivelOk(n)) barra(h("button", { class: "btn sec", onclick: function(){ ir("ruta"); } }, "Este nivel ya está aprobado"));
  else if (!nivelAbierto(n)) barra(h("button", { class: "btn sec", onclick: function(){ ir("ruta"); } }, "Primero aprueba el nivel " + n.idx));
  else barra(h("button", { class: "btn", id: "empezar-prueba", onclick: function(){ empezarPrueba(n); } }, "Empezar la prueba"),
    h("button", { class: "btn ghost", onclick: function(){ ir("ruta"); } }, "Mejor sigo lección por lección"));
}

/* ============ EXAMEN FINAL ============ */
function pantallaExamen(args){
  var l = lineaPorCodigo(args[0]) || lineaActual();
  if (!l || !l.activa){ ir("ruta"); return; }
  var e = examen(l), listo = lineaOk(l), banco = preguntasLinea(l).length;
  add(app, [
    h("div", { class: "lhead" }, h("a", { class: "volver", href: "#/ruta" }, icon("atras"), "Ruta")),
    encabezado("Examen final · línea " + l.codigo, "Certifícate en " + l.nombre, listo
      ? Math.min(REGLAS.PREGUNTAS_EXAMEN, banco) + " preguntas al azar del banco fijo de la línea (" + banco + " preguntas, ninguna de IA). Apruebas con " +
        Math.round(REGLAS.NOTA_EXAMEN * 100) + " %. Si no llegas, lo repites con otras preguntas."
      : "Se habilita cuando apruebes todas las lecciones de los " + l.niveles.length + " niveles.")
  ]);
  if (e && e.intentos) app.appendChild(h("div", { class: "card stack" },
    h("p", null, "Intentos: " + e.intentos + " · mejor nota: " + e.mejor + "/" + e.total),
    e.aprobado ? h("p", null, "Aprobado con " + e.cert.pct + " % el " + fechaEc(e.cert.fecha) + ".") : null));
  if (listo){
    barra(h("button", { class: "btn", id: "empezar-examen", onclick: function(){ empezarExamen(l); } }, e && e.intentos ? "Empezar otro intento" : "Empezar el examen"),
      e && e.aprobado ? h("button", { class: "btn sec", onclick: function(){ ir("certificado/" + l.codigo); } }, "Ver mi certificado") : null);
  } else barra(h("button", { class: "btn sec", onclick: function(){ ir("ruta"); } }, "Volver a la ruta"));
}

/* ============ CERTIFICADO ============ */
function pantallaCertificado(args){
  var l = lineaPorCodigo(args[0]), e = l && examen(l);
  if (!e || !e.aprobado){ ir(l ? "examen/" + l.codigo : "ruta"); return; }
  var d = datosCert(l);
  var cv = h("canvas", { class: "cert", id: "cert", width: "1600", height: "1131", role: "img",
    "aria-label": "Certificado de " + d.nombre + ", línea " + d.linea + ", " + d.pct + " %, " + d.fecha });
  add(app, [
    h("div", { class: "lhead" }, h("a", { class: "volver", href: "#/ruta" }, icon("atras"), "Ruta")),
    encabezado("Certificado · línea " + l.codigo, "¡Felicitaciones!",
      "Aprobaste el examen final de " + l.nombre + " con " + d.bien + " de " + d.total + " (" + d.pct + " %)."),
    cv,
    h("p", { class: "tiny", style: "margin-top:10px" }, "¿Tu nombre está mal? Corrígelo en ", h("a", { href: "#/ajustes" }, "Ajustes"), " y vuelve aquí.")
  ]);
  var listo = dibujarCertificado(cv, d);
  barra(h("button", { class: "btn", id: "cert-compartir", onclick: function(){ listo.then(function(){ return compartirCert(cv, d); }); } }, "Compartir por WhatsApp"),
    h("button", { class: "btn sec", id: "cert-descargar", onclick: function(){
      listo.then(function(){ return blobDe(cv); }).then(function(b){ descargarBlob(b, d.archivo); });
    } }, "Descargar imagen"));
}

registrar("ruta", pantallaRuta, { tab: "ruta" });
registrar("leccion", pantallaLeccion, { tab: "ruta" });
registrar("prueba", pantallaPrueba, { tab: "ruta" });
registrar("examen", pantallaExamen, { tab: "ruta" });
registrar("certificado", pantallaCertificado, { tab: "ruta" });
