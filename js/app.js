/* Arranque de la Academia: carga el contenido y el avance guardado, y pinta la pantalla.
   Orden de lectura del código: datos.js (contenido) → estado.js (avance) → nav.js (pantallas) → pantallas/*. */
import { $, h, add, iniciales, EQUIPO } from "./util.js";
import { cargarDatos } from "./datos.js";
import { ST, cargarEstado, hayPerfil, pedirPersistencia } from "./estado.js";
import { app, aplicarTema } from "./ui.js";
import { iniciarNav, render, alPintar, ir, pantallaActual } from "./nav.js";
import { iniciarPWA, alCambiarInstalacion, iniciarBotonInstalar } from "./pwa.js";
import "./quiz.js";
import "./pantallas/bienvenida.js";
import "./pantallas/ruta.js";
import "./pantallas/practicar.js";
import "./pantallas/mostrador.js";
import "./pantallas/yo.js";
import "./pantallas/supervisor.js";
import "./pantallas/revisar.js";
import "./pantallas/hablar.js";

function pintarCabecera(){
  var chip = $("#perfil-chip");
  chip.hidden = !hayPerfil();
  if (hayPerfil()){
    $("#perfil-ini").textContent = iniciales(ST.perfil.nombre);
    chip.setAttribute("aria-label", "Yo: " + ST.perfil.nombre);
  }
}

function sinCarga(){
  var off = navigator.onLine === false;
  app.textContent = "";
  add(app, h("div", { class: "vhead" },
    h("h1", null, off ? "Sin conexión" : "No se pudo cargar"),
    h("p", null, off
      ? "La primera vez la Academia necesita internet para guardarse en " + EQUIPO.este + ". Conéctate y ábrela de nuevo: después funciona sin señal."
      : "Revisa tu conexión y vuelve a intentar."),
    h("button", { class: "btn", style: "margin-top:18px", onclick: function(){ location.reload(); } }, "Reintentar")));
}

async function arrancar(){
  try { await cargarDatos(); }
  catch (e){ sinCarga(); iniciarPWA(); return; }
  cargarEstado();
  aplicarTema();
  iniciarNav();
  alPintar(pintarCabecera);
  $("#perfil-chip").addEventListener("click", function(){ ir("yo"); });
  render();
  iniciarPWA();
  iniciarBotonInstalar();
  /* si Chrome ofrece instalar la app, aparece el botón (sin mover al asesor si ya bajó por la pantalla) */
  alCambiarInstalacion(function(){
    var p = pantallaActual();
    if ((p === "ruta" || p === "yo") && window.scrollY < 40) render();
  });
  if (hayPerfil()) pedirPersistencia();
}
arrancar();
