/* Bienvenida: el asesor escribe su nombre (va en el certificado) y empieza. Sin cuentas ni contraseñas. */
import { h, add, icon, limpio, EQUIPO } from "../util.js";
import { hayPerfil, crearPerfil, pedirPersistencia } from "../estado.js";
import { app, barra } from "../ui.js";
import { registrar, ir } from "../nav.js";
import { abrirInstalar, instalada } from "../pwa.js";

function pantallaBienvenida(){
  if (hayPerfil()){ ir("ruta"); return; }
  var inp = h("input", { class: "inp", id: "nombre", type: "text", autocomplete: "name", maxlength: "60",
    placeholder: "Nombre y apellido", enterkeyhint: "done" });
  var aviso = h("p", { class: "stt", role: "status" });
  function seguir(){
    var n = limpio(inp.value, 60);
    if (n.length < 3){ aviso.textContent = "Escribe tu nombre y apellido: va en tu certificado."; aviso.className = "stt err"; inp.focus(); return; }
    crearPerfil(n);
    pedirPersistencia();
    ir("ruta");
  }
  inp.addEventListener("keydown", function(e){ if (e.key === "Enter"){ e.preventDefault(); seguir(); } });
  add(app, h("div", { class: "welcome" },
    icon("gota", "gota-grande"),
    h("div", { class: "kicker" }, "Academia Austrofil"),
    h("h1", null, "Aprende lo que vendes y certifícate"),
    h("p", { class: "muted" }, "Lecciones cortas con el texto del Manual de Campo, quizzes, casos de mostrador y un examen con certificado."),
    h("ul", { class: "ventajas" },
      h("li", null, icon("ruta"), "Una ruta por niveles, de lo básico a vender"),
      h("li", null, icon("sin-senal"), "Funciona sin internet"),
      h("li", null, icon("check"), "Tu avance queda en " + EQUIPO.este)),
    instalada() ? null : h("button", { class: "btn sec small", id: "bienvenida-instalar", type: "button", onclick: abrirInstalar },
      icon("descargar"), "Descargar la app en " + EQUIPO.tu),
    h("div", { class: "field" }, h("label", { for: "nombre" }, "¿Cómo te llamas?"), inp,
      h("p", { class: "tiny" }, "Va en tu certificado y en el reporte de avance que mandas a tu supervisor.")),
    aviso));
  barra(h("button", { class: "btn", id: "empezar", onclick: seguir }, "Empezar"),
    h("div", { class: "btns2" },
      h("button", { class: "btn ghost small", id: "tengo-codigo", onclick: function(){ ir("restaurar"); } }, "Tengo un código"),
      h("button", { class: "btn ghost small", id: "soy-supervisor", onclick: function(){ ir("supervisor"); } }, "Soy supervisor")));
}

/* sin pestañas: antes de escribir el nombre no hay a dónde ir */
registrar("bienvenida", pantallaBienvenida, { tab: "ruta", sesion: true });
