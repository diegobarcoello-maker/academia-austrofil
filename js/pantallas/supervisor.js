/* Panel del supervisor: junta los avances que los asesores mandan por WhatsApp.
   Cada asesor toca «Enviar mi avance al supervisor» (en Yo) y su mensaje trae un código AV1.…
   Aquí se pegan uno o varios mensajes a la vez y queda la tabla del equipo, guardada solo en este celular.
   No hay servidor: funciona sin internet y nadie más ve los datos. */
import { h, add, icon, lsSet, leerJSON, fechaEc, haceCuanto, pct, iniciales, hoy, diasEntre, EQUIPO } from "../util.js";
import { CLAVES, hayPerfil } from "../estado.js";
import { app, barra, toast, confirmar, encabezado, barraProgreso } from "../ui.js";
import { registrar, render } from "../nav.js";
import { leerReportes } from "../codigos.js";

function cargarEquipo(){ var e = leerJSON(CLAVES.equipo) || {}; return { v: 1, asesores: e.asesores || {} }; }
function guardarEquipo(e){ lsSet(CLAVES.equipo, JSON.stringify(e)); }
function avanceTotal(a){
  var la = 0, lt = 0;
  a.l.forEach(function(x){ la += x.la; lt += x.lt; });
  return pct(la, lt);
}
function examenTx(x){ return x.e ? "aprobado con " + x.e.p + " %" : x.ei ? "no aprobado (mejor " + x.em + " %)" : "no rendido"; }

function pantallaSupervisor(){
  var eq = cargarEquipo();
  var lista = Object.keys(eq.asesores).map(function(k){ return eq.asesores[k]; });
  lista.sort(function(a, b){ return avanceTotal(b) - avanceTotal(a) || (a.n < b.n ? -1 : 1); });
  var ta = h("textarea", { class: "inp", id: "reportes-texto", rows: "4", "aria-label": "Mensajes de avance",
    placeholder: "Pega aquí los mensajes de avance (traen un código que empieza con AV1.)" });
  var est = h("p", { class: "stt", id: "reportes-estado", role: "status" });
  add(app, [
    h("div", { class: "lhead" }, hayPerfil() ? h("a", { class: "volver", href: "#/yo" }, icon("atras"), "Yo") : h("a", { class: "volver", href: "#/bienvenida" }, icon("atras"), "Inicio")),
    encabezado("Panel del supervisor", "Mi equipo",
      "Pide a cada asesor que toque «Enviar mi avance al supervisor» en Yo. Copia sus mensajes de WhatsApp y pégalos aquí, uno o varios a la vez. Todo queda solo en " + EQUIPO.este + "."),
    h("div", { class: "field" }, ta, h("button", { class: "btn", id: "agregar-reportes", onclick: agregar }, "Agregar al panel"), est)
  ]);
  async function agregar(){
    est.className = "stt"; est.textContent = "Leyendo…";
    var r = await leerReportes(ta.value);
    if (!r.reportes.length){
      est.className = "stt err";
      est.textContent = r.malos ? "El código está incompleto: pide que te reenvíen el mensaje y cópialo completo." : "No encontré códigos de avance. Copia el mensaje completo (trae un código que empieza con AV1.).";
      return;
    }
    var nuevos = 0, act = 0, viejos = 0;
    r.reportes.forEach(function(o){
      var ya = eq.asesores[o.id];
      o.recibido = hoy();
      if (!ya){ nuevos++; eq.asesores[o.id] = o; }
      else if (o.f >= ya.f){ act++; eq.asesores[o.id] = o; }
      else viejos++;
    });
    guardarEquipo(eq);
    var partes = [];
    if (nuevos) partes.push(nuevos + (nuevos === 1 ? " asesor nuevo" : " asesores nuevos"));
    if (act) partes.push(act + (act === 1 ? " actualizado" : " actualizados"));
    if (viejos) partes.push(viejos + (viejos === 1 ? " reporte más viejo que el que ya tenías" : " reportes más viejos que los que ya tenías"));
    if (r.malos) partes.push(r.malos + " incompleto" + (r.malos === 1 ? "" : "s"));
    toast("Listo: " + partes.join(", ") + ".");
    render();
  }
  if (!lista.length){
    app.appendChild(h("div", { class: "vacio" }, icon("equipo"), h("p", null, "Todavía no hay reportes. Cuando pegues el primero, aquí ves el avance de cada asesor.")));
    return;
  }
  var cert = lista.filter(function(a){ return a.l.some(function(x){ return x.e; }); }).length;
  var prom = Math.round(lista.reduce(function(s, a){ return s + avanceTotal(a); }, 0) / lista.length);
  add(app, [
    h("h2", { class: "hlabel" }, "Resumen"),
    h("dl", { class: "stats equipo-kpi" },
      h("div", null, h("dt", null, "Asesores"), h("dd", null, String(lista.length))),
      h("div", null, h("dt", null, "Avance promedio"), h("dd", null, prom + " %")),
      h("div", null, h("dt", null, "Certificados"), h("dd", null, String(cert)))),
    h("h2", { class: "hlabel" }, "Asesores")
  ]);
  var cont = h("div", { class: "stack", id: "equipo" });
  lista.forEach(function(a){ cont.appendChild(tarjetaAsesor(a, eq)); });
  app.appendChild(cont);
  barra(h("button", { class: "btn sec", id: "copiar-equipo", onclick: function(){
    var t = textoEquipo(lista);
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function(){ toast("Resumen del equipo copiado."); },
      function(){ toast("No pude copiar en este navegador."); });
  } }, "Copiar el resumen del equipo"));
}

function tarjetaAsesor(a, eq){
  var dias = diasEntre(a.f, hoy()), viejo = dias > 7;
  return h("section", { class: "card asesor" + (viejo ? " viejo" : ""), "data-asesor": a.id },
    h("div", { class: "row" },
      h("span", { class: "avatar" }, iniciales(a.n)),
      h("div", { class: "asesor-tx" }, h("b", null, a.n),
        h("span", null, "Reporte del " + fechaEc(a.f) + " (" + haceCuanto(a.f) + ")" + (viejo ? " · pídele uno nuevo" : ""))),
      h("button", { class: "aviso-x", "aria-label": "Quitar a " + a.n + " del panel", onclick: function(){
        confirmar("¿Quitar a " + a.n + " del panel?", "Solo se borra de este panel. Si te manda otro reporte, vuelve a aparecer.", "Quitar", "Cancelar")
          .then(function(ok){ if (!ok) return; delete eq.asesores[a.id]; guardarEquipo(eq); render(); });
      } }, icon("cerrar"))),
    a.l.map(function(x){
      return h("div", { class: "asesor-linea" },
        h("div", { class: "row" }, h("span", { class: "code" }, String(x.c)), h("b", null, x.n), h("span", { class: "spacer" }), h("b", null, pct(x.la, x.lt) + " %")),
        barraProgreso(x.la, x.lt, "Avance de " + a.n + " en " + x.n, "fina"),
        h("p", { class: "small" }, "Lecciones " + x.la + "/" + x.lt + " · niveles " + x.na + "/" + x.nt + " · examen " + examenTx(x)),
        h("p", { class: "small muted" }, "Casos " + x.ca + "/" + x.ct + " · objeciones " + x.oa + "/" + x.ot),
        x.fl && x.fl.length ? h("p", { class: "small" }, h("b", null, "Reforzar: "), x.fl.join(" · ")) : null);
    }),
    h("p", { class: "tiny" }, "Racha: " + (a.r || 0) + " · días de estudio en 30 días: " + (a.ds || 0) +
      (a.ue ? " · último estudio: " + haceCuanto(a.ue) : "") + " · app v" + a.app));
}
function textoEquipo(lista){
  var out = ["ACADEMIA AUSTROFIL · AVANCE DEL EQUIPO", "Fecha: " + fechaEc(hoy()), ""];
  lista.forEach(function(a){
    out.push(a.n + " — " + avanceTotal(a) + " % (reporte " + fechaEc(a.f) + ")");
    a.l.forEach(function(x){
      out.push("  Línea " + x.c + " " + x.n + ": " + x.la + "/" + x.lt + " lecciones · niveles " + x.na + "/" + x.nt + " · examen " + examenTx(x) +
        (x.fl && x.fl.length ? " · reforzar: " + x.fl.join("; ") : ""));
    });
  });
  return out.join("\n");
}

registrar("supervisor", pantallaSupervisor, { tab: "yo" });
