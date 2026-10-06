/* Yo: mi avance, enviarlo al supervisor, respaldo, ajustes e IA, y los asesores de este celular o computadora. */
import { h, add, icon, iniciales, primerNombre, fechaEc, limpio, haceCuanto, pct, EQUIPO } from "../util.js";
import { DATA, lineasActivas } from "../datos.js";
import { ST, guardar, nombre, renombrar, borrarAvance, borrarPerfil, crearPerfil, cambiarPerfil, restaurarPerfil,
         datosDe, avanceLinea, temasFlojos, rachaActual, diasEstudiados, ultimoEstudio, hayPerfil, pedirPersistencia,
         almacen, marcarElegido } from "../estado.js";
import { app, barra, toast, confirmar, hoja, encabezado, barraProgreso, filaMenu, aplicarTema } from "../ui.js";
import { registrar, ir, render } from "../nav.js";
import { panelIA } from "../ia.js";
import { crearRespaldo, leerRespaldo, crearCodigoAvance, textoAvance } from "../codigos.js";
import { instalada, abrirInstalar } from "../pwa.js";

var MANUAL_URL = "https://diegobarcoello-maker.github.io/manual-austrofil/";
function wa(t){ return "https://wa.me/?text=" + encodeURIComponent(t); }

/* ============ YO ============ */
function pantallaYo(){
  var r = rachaActual(), ds = diasEstudiados(30);
  add(app, [
    h("div", { class: "perfil-cab" },
      h("span", { class: "avatar", "aria-hidden": "true" }, iniciales(nombre())),
      h("div", null, h("div", { class: "kicker" }, "Mi avance"), h("h1", null, nombre()),
        h("p", { class: "small muted" }, "Racha: " + r + (r === 1 ? " día" : " días") + " · " + ds + (ds === 1 ? " día" : " días") + " de estudio en los últimos 30")))
  ]);
  lineasActivas().forEach(function(l){ app.appendChild(tarjetaLinea(l)); });

  app.appendChild(h("h2", { class: "hlabel" }, "Compartir y respaldar"));
  var enviar = filaMenu("enviar", "Enviar mi avance al supervisor", "Por WhatsApp, con el código para su panel", "#", { id: "enviar-avance", target: "_blank", rel: "noopener" });
  enviar.setAttribute("aria-disabled", "true");
  enviar.addEventListener("click", function(e){
    if (enviar.getAttribute("aria-disabled") === "true"){ e.preventDefault(); toast("Preparando tu código…"); }
  });
  crearCodigoAvance().then(function(cod){
    enviar.href = wa(textoAvance() + "\n\nCódigo para el panel del supervisor:\n" + cod);
    enviar.removeAttribute("aria-disabled");
  }).catch(function(){ enviar.href = wa(textoAvance()); enviar.removeAttribute("aria-disabled"); });
  add(app, h("div", { class: "menu" }, enviar,
    filaMenu("respaldo", "Respaldo y cambio de equipo", "Guarda tu código o recupera tu avance en otro celular o computadora", function(){ ir("respaldo"); })));

  app.appendChild(h("h2", { class: "hlabel" }, EQUIPO.Este));
  var otros = ST.perfiles.lista.length - 1;
  add(app, h("div", { class: "menu" },
    filaMenu("personas", otros > 0 ? "Cambiar de asesor" : "Agregar otro asesor", otros > 0 ? (otros + 1) + " asesores en " + EQUIPO.este : "Si comparten " + EQUIPO.este, function(){ ir("perfiles/todos"); }),
    instalada() ? null : filaMenu("descargar", "Descargar la app", "Con su ícono en " + EQUIPO.tu + " y sin internet", abrirInstalar, { id: "yo-instalar" }),
    filaMenu("ajustes", "Ajustes e IA", "Nombre, tema claro u oscuro, IA gratis", function(){ ir("ajustes"); }),
    filaMenu("equipo", "Panel del supervisor", "Junta los avances que te mandan los asesores", function(){ ir("supervisor"); }),
    filaMenu("libro", "Abrir el Manual de Campo", "Necesita internet", MANUAL_URL, { target: "_blank", rel: "noopener" })));
  app.appendChild(h("p", { class: "version", id: "dver" }, "Versión ", h("b", null, String(window.VERSION.n)), " · " + window.VERSION.fecha +
    " · Manual de Campo v" + (DATA.manual.version || "")));
}
function tarjetaLinea(l){
  var a = avanceLinea(l), e = a.examen, flojos = temasFlojos(l);
  return h("section", { class: "card linea-card", "aria-label": "Avance en " + l.nombre },
    h("div", { class: "row" }, h("span", { class: "code" }, String(l.codigo)), h("b", { class: "lc-nom" }, l.nombre), h("span", { class: "spacer" }),
      h("b", { class: "lc-pct" }, a.pct + " %")),
    barraProgreso(a.lecciones, a.total, "Lecciones aprobadas de " + l.nombre),
    h("dl", { class: "stats" },
      h("div", null, h("dt", null, "Lecciones"), h("dd", null, a.lecciones + "/" + a.total)),
      h("div", null, h("dt", null, "Niveles"), h("dd", null, a.niveles + "/" + a.nivelesTotal)),
      h("div", null, h("dt", null, "Casos"), h("dd", null, a.casos + "/" + a.casosTotal)),
      h("div", null, h("dt", null, "Objeciones"), h("dd", null, a.objeciones + "/" + a.objecionesTotal))),
    h("p", { class: "small" }, h("b", null, "Examen final: "), a.aprobado ? "aprobado con " + e.cert.pct + " % (" + fechaEc(e.cert.fecha) + ")"
      : e && e.intentos ? "no aprobado todavía (mejor " + pct(e.mejor, e.total) + " %)" : "no rendido"),
    flojos.length ? h("p", { class: "small" }, h("b", null, "Para reforzar: "), flojos.map(function(m){ return m.titulo; }).join(" · ")) : null,
    a.aprobado ? h("button", { class: "btn sec small", onclick: function(){ ir("certificado/" + l.codigo); } }, "Ver mi certificado") : null);
}

/* ============ ASESORES DE ESTE CELULAR ============ */
function pantallaPerfiles(args){
  var desdeYo = args[0] === "todos";
  add(app, encabezado(EQUIPO.Este, "¿Quién estudia?",
    "Cada asesor tiene su propio avance. Si comparten " + EQUIPO.este + ", cada uno entra con su nombre."));
  var lista = h("div", { class: "stack" });
  ST.perfiles.lista.forEach(function(p){
    var d = p.id === (ST.perfil && ST.perfil.id) ? ST.d : datosDe(p.id);
    var lec = 0, tot = 0;
    lineasActivas().forEach(function(l){
      l.niveles.forEach(function(n){ n.modulos.forEach(function(m){ m.lecciones.forEach(function(x){
        tot++; if (d.progreso.lecciones[x.id] && d.progreso.lecciones[x.id].ok) lec++;
      }); }); });
    });
    var activo = ST.perfil && p.id === ST.perfil.id;
    var ue = ultimoEstudio(d);
    lista.appendChild(h("button", { class: "perfil-fila" + (activo ? " on" : ""), "data-perfil": p.id, onclick: function(){
      cambiarPerfil(p.id); pedirPersistencia(); toast("Hola, " + primerNombre(p.nombre) + "."); ir("ruta");
    } },
      h("span", { class: "avatar" }, iniciales(p.nombre)),
      h("span", { class: "mrow-tx" }, h("b", null, p.nombre),
        h("span", null, pct(lec, tot) + " % de avance" + (ue ? " · estudió " + haceCuanto(ue) : "") + (activo ? " · activo" : ""))),
      icon("flecha", "mrow-fl")));
  });
  app.appendChild(lista);
  barra(h("button", { class: "btn sec", id: "agregar-asesor", onclick: hojaNuevoAsesor }, "Agregar asesor"),
    desdeYo ? h("button", { class: "btn ghost", onclick: function(){ marcarElegido(); ir("yo"); } }, "Volver") : null);
}
function hojaNuevoAsesor(){
  var inp = h("input", { class: "inp", id: "nuevo-nombre", type: "text", maxlength: "60", autocomplete: "name", placeholder: "Nombre y apellido", enterkeyhint: "done" });
  var aviso = h("p", { class: "stt", role: "status" });
  function crear(){
    var n = limpio(inp.value, 60);
    if (n.length < 3){ aviso.className = "stt err"; aviso.textContent = "Escribe nombre y apellido: va en el certificado."; inp.focus(); return; }
    cerrar(true);
    crearPerfil(n); pedirPersistencia();
    toast("Listo: " + primerNombre(n) + " ya tiene su propio avance.");
    ir("ruta");
  }
  inp.addEventListener("keydown", function(e){ if (e.key === "Enter"){ e.preventDefault(); crear(); } });
  var cerrar = hoja([h("h2", null, "Nuevo asesor"), h("div", { class: "field" }, h("label", { for: "nuevo-nombre" }, "Nombre y apellido"), inp), aviso,
    h("div", { class: "btns" }, h("button", { class: "btn", id: "crear-asesor", onclick: crear }, "Crear"),
      h("button", { class: "btn sec", onclick: function(){ cerrar(false); } }, "Cancelar"))]);
}

/* ============ RESPALDO (y restaurar sin haber entrado) ============ */
function pantallaRespaldo(){
  var con = hayPerfil();
  add(app, [
    h("div", { class: "lhead" }, h("a", { class: "volver", href: con ? "#/yo" : "#/bienvenida" }, icon("atras"), con ? "Yo" : "Inicio")),
    encabezado("Respaldo", con ? "Respaldo y cambio de equipo" : "Recuperar mi avance",
      con ? "Tu avance vive en " + EQUIPO.este + ". Guarda tu código (por ejemplo, mándatelo por WhatsApp) y en otro celular o computadora lo pegas para recuperarlo todo."
          : "Pega el código de respaldo que guardaste y recuperas tu avance en " + EQUIPO.este + ".")
  ]);
  if (con){
    var caja = h("div", { class: "codebox", id: "codigo", hidden: true });
    var acciones = h("div", { class: "btns2", hidden: true });
    var codigo = "";
    var mandar = h("a", { class: "btn small sec", id: "enviar-codigo", href: "#", target: "_blank", rel: "noopener" }, "Mandármelo");
    add(acciones, [h("button", { class: "btn small sec", onclick: function(){
      (navigator.clipboard ? navigator.clipboard.writeText(codigo) : Promise.reject()).then(function(){ toast("Código copiado."); },
        function(){ toast("Mantén presionado el código para copiarlo."); });
    } }, "Copiar"), mandar]);
    add(app, [
      h("h2", { class: "hlabel" }, "Mi código de respaldo"),
      h("div", { class: "btns" }, h("button", { class: "btn sec", id: "crear-codigo", onclick: async function(){
        try { codigo = await crearRespaldo(); } catch (e){ toast("No pude crear el código."); return; }
        caja.textContent = codigo; caja.hidden = false; acciones.hidden = false;
        mandar.href = wa("Mi código de respaldo de la Academia Austrofil (guárdalo):\n" + codigo);
      } }, "Crear mi código de respaldo")),
      caja, acciones
    ]);
    caja.style.marginTop = "10px"; acciones.style.marginTop = "10px";
  }
  var inp = h("textarea", { class: "inp", id: "restaurar-texto", rows: "3", placeholder: "Pega aquí tu código (empieza con AA1.)", "aria-label": "Código de respaldo" });
  var est = h("p", { class: "stt", id: "restaurar-estado", role: "status" });
  add(app, [
    h("h2", { class: "hlabel" }, con ? "Restaurar en " + EQUIPO.este : "Tu código"),
    h("div", { class: "field" }, inp, h("button", { class: "btn" + (con ? " sec" : ""), id: "restaurar", onclick: async function(){
      est.className = "stt"; est.textContent = "Leyendo el código…";
      var o;
      try { o = await leerRespaldo(inp.value); }
      catch (e){ est.className = "stt err"; est.textContent = e.message || "No pude leer el código."; return; }
      var ya = o.perfil.id && ST.perfiles.lista.some(function(p){ return p.id === o.perfil.id; });
      var si = await confirmar("¿Restaurar este avance?",
        (ya ? "Reemplaza el avance de " : "Agrega a ") + o.perfil.nombre + (o.fecha ? " (código del " + fechaEc(o.fecha) + ")" : "") +
        (ya ? " en " + EQUIPO.este + "." : " a " + EQUIPO.este + " con su avance."), "Restaurar", "Cancelar");
      if (!si){ est.textContent = ""; return; }
      restaurarPerfil(o.perfil, o.datos); pedirPersistencia();
      toast("Listo: avance de " + primerNombre(o.perfil.nombre) + " restaurado.");
      ir("ruta");
    } }, "Restaurar con el código"), est),
    con ? h("p", { class: "tiny", style: "margin-top:18px" }, almacen.persistente === true
      ? "Almacenamiento persistente activado: el navegador no borra tu avance para liberar espacio."
      : "Si " + EQUIPO.este + " se queda sin espacio, el navegador podría borrar datos: guarda tu código de respaldo.") : null
  ]);
}

/* ============ AJUSTES ============ */
function pantallaAjustes(args){
  var inp = h("input", { class: "inp", id: "ajuste-nombre", type: "text", maxlength: "60", value: nombre(), autocomplete: "name" });
  var est = h("p", { class: "stt", role: "status" });
  function guardarNombre(){
    var n = limpio(inp.value, 60);
    if (n.length < 3){ est.className = "stt err"; est.textContent = "Escribe nombre y apellido."; return; }
    renombrar(n); est.className = "stt ok"; est.textContent = "Nombre guardado. Así sale en tu certificado.";
  }
  var seg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Tema" });
  [["auto", "Automático"], ["claro", "Claro"], ["oscuro", "Oscuro"]].forEach(function(t){
    seg.appendChild(h("button", { class: ST.ajustes.tema === t[0] ? "on" : "", role: "radio", "aria-checked": ST.ajustes.tema === t[0] ? "true" : "false",
      "data-tema": t[0], onclick: function(){ ST.ajustes.tema = t[0]; guardar(); aplicarTema(); render(); } }, t[1]));
  });
  var varios = ST.perfiles.lista.length > 1;
  add(app, [
    h("div", { class: "lhead" }, h("a", { class: "volver", href: "#/yo" }, icon("atras"), "Yo")),
    encabezado("Ajustes", "Ajustes e IA"),
    h("div", { class: "card stack" },
      h("div", { class: "field" }, h("label", { for: "ajuste-nombre" }, "Tu nombre (va en el certificado)"), inp),
      h("button", { class: "btn sec", id: "guardar-nombre", onclick: guardarNombre }, "Guardar nombre"), est),
    h("h2", { class: "hlabel" }, "Tema"), seg,
    h("h2", { class: "hlabel", id: "ia" }, "Inteligencia artificial"),
    panelIA(),
    h("h2", { class: "hlabel" }, "Mi avance en " + EQUIPO.este),
    h("div", { class: "card stack" },
      h("p", { class: "small muted" }, "Versión " + window.VERSION.n + " · " + window.VERSION.fecha + " · contenido del Manual de Campo v" + (DATA.manual.version || "") + "."),
      h("button", { class: "btn sec", id: "borrar-avance", onclick: function(){
        confirmar("¿Borrar tu avance?", "Se borran lecciones, exámenes, repaso y racha de " + nombre() + " en " + EQUIPO.este + ". La clave de IA no se toca.", "Borrar", "Cancelar")
          .then(function(ok){ if (!ok) return; borrarAvance(); toast("Avance borrado."); render(); });
      } }, "Borrar mi avance"),
      varios ? h("button", { class: "btn ghost", id: "borrar-perfil", onclick: function(){
        confirmar("¿Quitar a " + nombre() + " de " + EQUIPO.este + "?", "Se borra su avance de " + EQUIPO.este + ". Si tiene un código de respaldo, lo puede recuperar.", "Quitar", "Cancelar")
          .then(function(ok){ if (!ok) return; borrarPerfil(ST.perfil.id); toast("Asesor quitado."); ir("perfiles/todos"); });
      } }, "Quitar este asesor de " + EQUIPO.este) : null),
    h("p", { class: "tiny", style: "margin-top:16px" }, h("a", { href: "#/revisar" }, "Revisar el contenido"), " (para quien arma las lecciones)")
  ]);
  if (args[0] === "ia") setTimeout(function(){ var el = document.getElementById("ia"); if (el) el.scrollIntoView(); }, 30);
}

registrar("yo", pantallaYo, { tab: "yo" });
registrar("avance", pantallaYo, { tab: "yo" });   /* enlace de la v1 */
registrar("perfiles", pantallaPerfiles, { tab: "yo" });
registrar("respaldo", pantallaRespaldo, { tab: "yo" });
registrar("restaurar", pantallaRespaldo, { tab: "yo" });
registrar("ajustes", pantallaAjustes, { tab: "yo" });
