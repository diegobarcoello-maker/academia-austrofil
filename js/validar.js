/* Revisión del contenido (la misma que hacía tools/construir.py, ahora sin Python).
   Se ve en la app en #/revisar y la corren las pruebas de tests/pruebas.html.
   Comprueba:
   - que cada referencia al manual exista (bloque, tramo o clave del banco de respuestas);
   - que cada lección tenga de 3 a 5 preguntas y no pase de 400 palabras;
   - que cada pregunta tenga id único con el código de su línea, tipo válido, UNA sola correcta y su fuente;
   - que la «cita» esté, letra por letra, en el texto de su fuente;
   - que casos y objeciones tengan texto del manual y una explicación por opción (si traen explicaciones). */
import { DATA, MAN, expandir, textoFuente, leccionesLinea } from "./datos.js";
import { norm } from "./util.js";

var TIPOS = { opcion: 1, vf: 1, emparejar: 1 };
var MAX_PALABRAS = 400;

export function validarTodo(){
  var errores = [], ids = {}, resumen = [];
  function err(m){ errores.push(m); }
  var codigos = {};
  DATA.lineas.forEach(function(l){
    if (codigos[l.codigo]) err("lineas.json: el código " + l.codigo + " está repetido");
    codigos[l.codigo] = 1;
    if (l.error){ err("Línea " + l.codigo + ": no se pudo leer " + l.archivo + " (" + l.error + ")"); return; }
    if (!l.fuente) return;
    validarLinea(l, ids, err);
    var lec = leccionesLinea(l);
    resumen.push({ codigo: l.codigo, nombre: l.nombre, niveles: l.niveles.length, lecciones: lec.length,
                   preguntas: lec.reduce(function(a, x){ return a + x.preguntas.length; }, 0),
                   casos: l.casos.length, objeciones: l.objeciones.length });
  });
  return { errores: errores, resumen: resumen };
}

function validarLinea(l, ids, err){
  var src = l.fuente, pref = l.codigo + "-";
  if (src.codigo !== l.codigo) err(l.archivo + ": el código " + src.codigo + " no coincide con lineas.json (" + l.codigo + ")");
  function nuevoId(id, donde){
    if (!id){ err(donde + ": falta el id"); return; }
    if (ids[id]) err("id repetido " + id);
    ids[id] = 1;
    if (String(id).indexOf(pref) !== 0) err(id + ": el id tiene que empezar por " + pref);
  }
  (src.niveles || []).forEach(function(niv){
    nuevoId(niv.id, "nivel «" + niv.titulo + "»");
    (niv.modulos || []).forEach(function(mod){
      nuevoId(mod.id, "módulo «" + mod.titulo + "»");
      (mod.lecciones || []).forEach(function(lec){
        nuevoId(lec.id, "lección «" + lec.titulo + "»");
        var refs = expandir(lec.contenido, err, lec.id);
        if (!refs.length) err(lec.id + ": la lección no tiene contenido del manual");
        var x = leccionesLinea(l).filter(function(y){ return y.id === lec.id; })[0];
        if (x && x.palabras > MAX_PALABRAS) err(lec.id + ": " + x.palabras + " palabras (máximo " + MAX_PALABRAS + ")");
        var n = 0;
        (lec.preguntas || []).forEach(function(p){ if (validarPregunta(p, lec.id, ids, err, nuevoId)) n++; });
        if (n < 3 || n > 5) err(lec.id + ": tiene " + n + " preguntas válidas (van de 3 a 5)");
      });
    });
  });
  [["casos", "caso"], ["objeciones", "objeción"]].forEach(function(par){
    (src[par[0]] || []).forEach(function(ob){
      nuevoId(ob.id, par[1] + " «" + ob.titulo + "»");
      if (!ob.cliente || !ob.situacion) err(ob.id + ": falta «cliente» o «situacion»");
      if (!(ob.pasos || []).length) err(ob.id + ": no tiene pasos");
      (ob.pasos || []).forEach(function(paso){
        var q = Object.assign({ tipo: "opcion" }, paso);
        if (q.tipo !== "opcion") err(paso.id + ": los pasos son de opción múltiple");
        if (!paso.paso) err(paso.id + ": falta el nombre del paso");
        validarPregunta(q, ob.id, ids, err, nuevoId);
        var ex = paso.explicaciones || [];
        if (ex.length && ex.length !== (paso.opciones || []).length) err(paso.id + ": una explicación por opción");
      });
      if (!expandir(ob.manual || [], err, ob.id).length) err(ob.id + ": no tiene texto del manual («manual»)");
    });
  });
}

function validarPregunta(p, donde, ids, err, nuevoId){
  var pid = p.id;
  nuevoId(pid, donde + ": pregunta");
  if (!pid) return false;
  if (!TIPOS[p.tipo]){ err(pid + ": tipo inválido «" + p.tipo + "»"); return false; }
  if (!String(p.enunciado || "").trim()) err(pid + ": sin enunciado");
  if (p.tipo === "opcion"){
    var op = p.opciones || [];
    if (op.length < 3 || op.length > 4) err(pid + ": necesita 3 o 4 opciones");
    var vistas = {};
    op.forEach(function(o){ vistas[norm(o)] = 1; });
    if (Object.keys(vistas).length !== op.length) err(pid + ": opciones repetidas");
    if (typeof p.correcta !== "number" || !Number.isInteger(p.correcta) || p.correcta < 0 || p.correcta >= op.length)
      err(pid + ": «correcta» debe ser el índice de UNA opción");
  } else if (p.tipo === "vf"){
    if (typeof p.correcta !== "boolean") err(pid + ": en verdadero/falso «correcta» es true o false");
  } else {
    var pares = p.pares || [];
    if (pares.length < 3 || pares.length > 4 || pares.some(function(x){ return !Array.isArray(x) || x.length !== 2; }))
      err(pid + ": emparejar necesita 3 o 4 pares");
    else {
      var iz = {}, de = {};
      pares.forEach(function(x){ iz[norm(x[0])] = 1; de[norm(x[1])] = 1; });
      if (Object.keys(iz).length !== pares.length || Object.keys(de).length !== pares.length) err(pid + ": en emparejar no se repiten lados");
    }
  }
  var f = p.fuente || {};
  if (!("qa" in f || "bloque" in f || "bloques" in f)){ err(pid + ": sin fuente"); return false; }
  var src = textoFuente(f);
  if (src === null){ err(pid + ": la fuente " + JSON.stringify(f) + " no existe en el manual"); return false; }
  var cita = p.cita || ("bloques" in f ? src : "");
  if (cita.length < 12) err(pid + ": falta la cita del manual");
  else if (norm(src).indexOf(norm(cita)) < 0) err(pid + ": la cita no está en su fuente (" + (f.bloque || f.qa || f.bloques) + ")");
  return true;
}

/* para la pantalla de revisión: cuántos bloques y respuestas trae el manual */
export function resumenManual(){
  return { version: DATA.manual.version, fecha: DATA.manual.fecha, bloques: MAN.orden.length, qa: Object.keys(MAN.qa).length };
}
