/* Practicar: racha de la semana, repaso del día, quiz rápido y temas para reforzar. */
import { h, add, icon } from "../util.js";
import { ST, REGLAS, lineaActual, rachaActual, semana, vencidas, cupoRepaso, hechasHoy, enRepaso, dominadas,
         temasFlojos, lecOk } from "../estado.js";
import { app, barra, encabezado } from "../ui.js";
import { registrar, ir } from "../nav.js";
import { empezarRepaso, empezarRapido, poolAprobado } from "../quiz.js";

var DIAS = ["L", "M", "M", "J", "V", "S", "D"];

function pantallaPracticar(){
  var l = lineaActual(), r = rachaActual(), sem = semana();
  var due = vencidas().length, cupo = cupoRepaso(), toca = Math.min(due, cupo), hechas = hechasHoy();
  var aprobadas = l ? poolAprobado(l).length : 0, flojos = l ? temasFlojos(l) : [];
  add(app, encabezado("Practicar", "Cinco minutos al día",
    "Lo que fallas vuelve mañana; lo que aciertas vuelve a los 2, 4, 8 y 16 días hasta quedar dominado. Así no se olvida."));

  /* racha y semana */
  app.appendChild(h("section", { class: "card racha-card", "aria-label": "Racha" },
    h("div", { class: "racha" }, h("span", { class: "racha-ico" }, icon("llama")),
      h("div", null, h("b", { class: "racha-n", id: "racha-n" }, String(r)),
        h("span", null, r === 1 ? " día seguido" : " días seguidos"),
        h("div", { class: "tiny" }, "Mejor racha: " + (ST.d.racha.mejor || 0) + " · cuenta cualquier lección, repaso o caso del día"))),
    h("ol", { class: "semana", "aria-label": "Días que estudiaste esta semana" }, sem.map(function(d, i){
      return h("li", { class: (d.hecho ? "hecho" : "") + (d.hoy ? " hoy" : "") + (d.futuro ? " futuro" : ""),
        "aria-label": DIAS[i] + (d.hecho ? ": estudiaste" : ": sin estudio") }, h("span", null, DIAS[i]), d.hecho ? icon("check") : h("i"));
    }))));

  /* repaso del día */
  var titRepaso = !aprobadas ? "Todavía no hay repaso" : toca ? "Hoy te " + (toca === 1 ? "toca 1 pregunta" : "tocan " + toca + " preguntas")
    : due && !cupo ? "Listo por hoy" : "¡Al día!";
  var txtRepaso = !aprobadas ? "Aprueba tu primera lección: sus preguntas entran a tu repaso."
    : toca ? "Son preguntas que fallaste o que ya toca recordar."
    : due && !cupo ? "Hiciste tus " + REGLAS.MAX_REPASO_DIA + " preguntas de hoy. Mañana sigues." : "Hoy no vence nada. Haz un quiz rápido para no perder la racha.";
  app.appendChild(h("section", { class: "card prac" },
    h("div", { class: "prac-top" }, h("span", { class: "prac-ico" }, icon("repaso")),
      h("div", null, h("h2", null, titRepaso), h("p", { class: "small muted" }, txtRepaso))),
    h("dl", { class: "stats" },
      h("div", null, h("dt", null, "Para hoy"), h("dd", null, String(toca))),
      h("div", null, h("dt", null, "En repaso"), h("dd", null, String(enRepaso()))),
      h("div", null, h("dt", null, "Dominadas"), h("dd", null, String(dominadas())))),
    hechas ? h("p", { class: "tiny" }, "Hoy llevas " + hechas + " de " + REGLAS.MAX_REPASO_DIA + " preguntas de repaso.") : null));

  /* quiz rápido */
  app.appendChild(h("section", { class: "card prac" },
    h("div", { class: "prac-top" }, h("span", { class: "prac-ico" }, icon("rayo")),
      h("div", null, h("h2", null, "Quiz rápido"),
        h("p", { class: "small muted" }, aprobadas ? REGLAS.QUIZ_RAPIDO + " preguntas al azar de lo que ya aprobaste" + (l ? " en " + l.nombre : "") + "."
          : "Se abre cuando apruebes tu primera lección."))),
    /* el botón principal va en la barra de abajo: aquí solo cuando la barra la ocupa el repaso */
    toca && aprobadas ? h("button", { class: "btn sec", id: "empezar-rapido", onclick: function(){ empezarRapido(l); } }, "Hacer un quiz rápido") : null));

  /* temas flojos */
  if (flojos.length){
    app.appendChild(h("h2", { class: "hlabel" }, "Temas para reforzar"));
    var lista = h("div", { class: "stack" });
    flojos.forEach(function(m){
      var x = m.lecciones.filter(function(y){ return lecOk(y.id); })[0] || m.lecciones[0];
      lista.appendChild(h("button", { class: "mrow", onclick: function(){ ir("leccion/" + x.id); } },
        h("span", { class: "mrow-ico warn" }, icon("alerta")),
        h("span", { class: "mrow-tx" }, h("b", null, m.titulo), h("span", null, "Nivel " + (m.nivel.idx + 1) + " · releer: " + x.titulo)),
        icon("flecha", "mrow-fl")));
    });
    app.appendChild(lista);
  }

  if (!aprobadas) barra(h("button", { class: "btn sec", onclick: function(){ ir("ruta"); } }, "Ir a mi primera lección"));
  else if (toca) barra(h("button", { class: "btn", id: "empezar-repaso", onclick: empezarRepaso }, "Repasar " + toca + (toca === 1 ? " pregunta" : " preguntas")));
  else barra(h("button", { class: "btn", id: "empezar-rapido", onclick: function(){ empezarRapido(l); } }, "Quiz rápido (" + Math.min(REGLAS.QUIZ_RAPIDO, aprobadas) + " preguntas)"));
}

registrar("practicar", pantallaPracticar, { tab: "practicar" });
/* la v1 tenía #/repaso: sigue funcionando */
registrar("repaso", pantallaPracticar, { tab: "practicar" });
