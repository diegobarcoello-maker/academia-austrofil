/* Piezas de interfaz compartidas: barra de acción al alcance del pulgar, avisos, hojas de confirmación y tema. */
import { $, h, add, icon, pct } from "./util.js";
import { ST } from "./estado.js";

export var app = document.getElementById("app");
var root = document.documentElement;

/* barra de acción fija abajo; el contenido deja su alto libre (--barra-h) para que nada quede tapado */
var accionBar = null, nHoja = 0;
export function barra(){
  if (accionBar){ accionBar.remove(); accionBar = null; }
  var hijos = [].slice.call(arguments).filter(Boolean);
  if (!hijos.length){ root.style.setProperty("--barra-h", "0px"); return; }
  accionBar = h("div", { class: "actionbar" }, h("div", { class: "actionbar-in" }, hijos));
  document.body.appendChild(accionBar);
  root.style.setProperty("--barra-h", accionBar.offsetHeight + "px");
}

var toastT = 0;
export function toast(t){
  var el = $("#toast");
  el.textContent = t;
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(function(){ el.hidden = true; }, 3600);
}

/* hoja inferior propia (sin diálogos del navegador): se cierra con «Cancelar», tocando afuera o con Escape */
export function hoja(contenido, alCerrar){
  var previo = document.activeElement;
  var bg = h("div", { class: "sheet-bg" });
  var caja = h("div", { class: "sheet", role: "dialog", "aria-modal": "true" }, contenido);
  var tit = caja.querySelector("h2");
  if (tit){ tit.id = "hoja-" + (++nHoja); caja.setAttribute("aria-labelledby", tit.id); }
  function cerrar(v){
    document.removeEventListener("keydown", tecla);
    bg.remove();
    if (previo && previo.focus) try { previo.focus({ preventScroll: true }); } catch (e){}
    if (alCerrar) alCerrar(v);
  }
  function tecla(e){ if (e.key === "Escape") cerrar(false); }
  bg.addEventListener("click", function(e){ if (e.target === bg) cerrar(false); });
  document.addEventListener("keydown", tecla);
  bg.appendChild(caja);
  document.body.appendChild(bg);
  var foco = caja.querySelector("input, textarea, .btn");
  if (foco) foco.focus();
  return cerrar;
}
export function confirmar(titulo, texto, si, no){
  return new Promise(function(res){
    var cerrar = hoja([
      h("h2", null, titulo),
      texto ? h("p", { class: "muted" }, texto) : null,
      h("div", { class: "btns" },
        h("button", { class: "btn", onclick: function(){ cerrar(true); } }, si || "Sí"),
        h("button", { class: "btn sec", onclick: function(){ cerrar(false); } }, no || "Cancelar"))
    ], function(v){ res(!!v); });
  });
}

export function aplicarTema(){
  var t = ST.ajustes.tema;
  if (t === "claro") root.setAttribute("data-theme", "light");
  else if (t === "oscuro") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
}

/* ---------- piezas ---------- */
export function encabezado(kicker, titulo, texto){
  return h("div", { class: "vhead" },
    kicker ? h("div", { class: "kicker" }, kicker) : null,
    h("h1", null, titulo),
    texto ? h("p", null, texto) : null);
}
export function barraProgreso(valor, max, etiqueta, cls){
  var p = pct(valor, max);
  return h("div", { class: "prog" + (cls ? " " + cls : ""), role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100",
    "aria-valuenow": String(p), "aria-label": etiqueta || "Avance" }, h("i", { style: "width:" + p + "%" }));
}
/* fila de menú: ícono, texto, detalle y flecha */
export function filaMenu(ico, texto, detalle, accion, extra){
  var at = Object.assign({ class: "mrow" }, extra || {});
  var hijos = [h("span", { class: "mrow-ico" }, icon(ico)),
               h("span", { class: "mrow-tx" }, h("b", null, texto), detalle ? h("span", null, detalle) : null),
               icon("flecha", "mrow-fl")];
  if (typeof accion === "string"){ at.href = accion; return h("a", at, hijos); }
  at.onclick = accion;
  return h("button", at, hijos);
}
/* bloque de error amable cuando algo no se pudo mostrar */
export function errorPantalla(e, volver){
  add(app, h("div", { class: "vhead" }, h("h1", null, "Algo salió mal"),
    h("p", null, "Vuelve a la ruta e intenta otra vez. Tu avance está guardado."),
    h("p", { class: "tiny" }, String(e && e.message || e))));
  barra(h("button", { class: "btn", onclick: volver }, "Volver a la ruta"));
}
