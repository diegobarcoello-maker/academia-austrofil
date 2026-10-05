/* #/revisar: revisión del contenido para quien arma las lecciones (reemplaza tools/construir.py).
   Lista los errores que impedirían publicar: referencias al manual que no existen, citas que no están
   letra por letra en su fuente, preguntas con más de una correcta, ids repetidos… */
import { h, add, icon } from "../util.js";
import { validarTodo, resumenManual } from "../validar.js";
import { app, encabezado } from "../ui.js";
import { registrar } from "../nav.js";

function pantallaRevisar(){
  var r = validarTodo(), m = resumenManual();
  add(app, [
    encabezado("Revisión del contenido", r.errores.length ? r.errores.length + " cosas por corregir" : "Todo en orden",
      "Manual de Campo v" + m.version + " (" + m.fecha + ") · " + m.bloques + " bloques · " + m.qa + " respuestas del banco."),
    h("div", { class: "stack", id: "revision", "data-errores": String(r.errores.length) },
      r.resumen.map(function(x){
        return h("div", { class: "card" }, h("b", null, "Línea " + x.codigo + " · " + x.nombre),
          h("p", { class: "small muted" }, x.niveles + " niveles · " + x.lecciones + " lecciones · " + x.preguntas + " preguntas · " +
            x.casos + " casos · " + x.objeciones + " objeciones"));
      }),
      r.errores.length
        ? h("ul", { class: "errores" }, r.errores.map(function(e){ return h("li", null, e); }))
        : h("p", { class: "stt ok" }, icon("check"), " Ninguna referencia rota, todas las citas están en su fuente y cada pregunta tiene una sola correcta."))
  ]);
}

registrar("revisar", pantallaRevisar, { tab: "yo" });
