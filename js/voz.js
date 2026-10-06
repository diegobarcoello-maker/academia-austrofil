/* Voz para la pestaña Hablar.
   - Dictado: el asesor toca el micrófono y habla (reconocimiento de voz del navegador). Funciona en Chrome
     de Android y de computadora; usa un servicio en línea, así que necesita internet como la IA.
   - Lectura: el celular o la computadora lee en voz alta lo que responde el cliente (voces del equipo).
   Si el navegador no tiene dictado, se escribe o se usa el micrófono del teclado del celular. */
var Reco = window.SpeechRecognition || window.webkitSpeechRecognition || null;
export var voz = { dictado: !!Reco, lectura: "speechSynthesis" in window };

var IDIOMAS = ["es-EC", "es-419", "es-ES"];
var activo = null;

/* op: { alParcial(texto), alTerminar(textoFinal), alError(mensaje) }; devuelve { parar() } */
export function dictar(op){
  if (!Reco) return null;
  callarCliente();
  var idioma = 0, final = "", reintentar = false, parado = false;
  function arrancar(){
    var r = new Reco();
    activo = r;
    r.lang = IDIOMAS[idioma];
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = function(e){
      var parcial = "";
      for (var i = e.resultIndex; i < e.results.length; i++){
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += (final ? " " : "") + t.trim(); else parcial += t;
      }
      op.alParcial((final + " " + parcial).trim());
    };
    r.onerror = function(e){
      if (e.error === "language-not-supported" && idioma < IDIOMAS.length - 1){ reintentar = true; return; }
      if (e.error === "aborted") return;
      op.alError({
        "not-allowed": "Permite el micrófono para esta página (toca el candado de la barra de direcciones).",
        "service-not-allowed": "Este navegador no deja usar el dictado aquí. Escribe tu respuesta o usa el micrófono del teclado.",
        "no-speech": "No te escuché. Toca el micrófono y habla cerca del celular.",
        "audio-capture": "No encuentro un micrófono en este equipo.",
        "network": "El dictado necesita internet."
      }[e.error] || "No pude usar el micrófono. Escribe tu respuesta.");
    };
    r.onend = function(){
      if (reintentar && !parado){ reintentar = false; idioma++; arrancar(); return; }
      activo = null;
      op.alTerminar(final.trim());
    };
    try { r.start(); } catch (e){ activo = null; op.alError("No pude usar el micrófono. Escribe tu respuesta."); op.alTerminar(""); }
  }
  arrancar();
  return { parar: function(){ parado = true; if (activo) try { activo.stop(); } catch (e){} } };
}

var vozElegida = null;
function elegirVoz(){
  var vs = speechSynthesis.getVoices() || [];
  var preferidas = ["es-ec", "es-419", "es-us", "es-mx", "es-co", "es-pe", "es-es"];
  for (var i = 0; i < preferidas.length; i++){
    var v = vs.filter(function(x){ return String(x.lang || "").replace("_", "-").toLowerCase() === preferidas[i]; })[0];
    if (v) return v;
  }
  return vs.filter(function(x){ return /^es/i.test(x.lang || ""); })[0] || null;
}
if (voz.lectura) try { speechSynthesis.addEventListener("voiceschanged", function(){ vozElegida = null; }); } catch (e){}

export function leerCliente(texto){
  if (!voz.lectura || !texto) return;
  try {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(texto);
    var v = vozElegida || (vozElegida = elegirVoz());
    if (v){ u.voice = v; u.lang = v.lang; } else u.lang = "es-419";
    u.rate = 1;
    speechSynthesis.speak(u);
  } catch (e){}
}
export function callarCliente(){
  if (voz.lectura) try { speechSynthesis.cancel(); } catch (e){}
}
