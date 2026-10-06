# Academia Austrofil

Tutor para que los asesores de Austrofil aprendan la canasta de productos con el texto del
[Manual de Campo](https://diegobarcoello-maker.github.io/manual-austrofil/), practiquen casos de mostrador y se certifiquen.
Arranca con la línea 11 (Lubricantes); las demás líneas se suman como datos.
Sitio: https://diegobarcoello-maker.github.io/academia-austrofil/

## Qué hace

- **Ruta por niveles**: lecciones cortas con el texto del manual, quiz al final de cada una (aprueba con 75 %),
  prueba de nivel para quien ya sabe (80 %) y examen final de 20 preguntas con certificado (80 %).
- **Practicar**: repaso espaciado (lo fallado vuelve mañana; lo acertado a los 2, 4, 8 y 16 días), quiz rápido y racha.
- **Mostrador**: casos técnicos (qué preguntar, qué recomendar, qué más vender) y objeciones, en tres pasos.
- **Hablar**: conversación con un cliente simulado por la IA (lubricadora, lubricentro, ferretería, lavadora de autos,
  taller, repuestos de motos, flota, gasolinera), en tres dificultades. Se le escribe o se le habla con el micrófono, y el
  cliente puede contestar en voz alta. Cada cliente tiene una necesidad que solo cuenta si le preguntan bien. Un coach da
  pistas y al final califica con el método del manual (apertura, preguntas, argumento, objeciones, canasta y cierre).
  Los clientes están en `datos/clientes.json`: para sumar uno, se copia uno y se cambian sus datos.
- **Descargar app**: botón siempre a la vista. Si el navegador lo permite, instala con un toque; si no, muestra los pasos
  para Android, iPhone o computadora.
- **Avance de cada asesor**: varios asesores pueden compartir un celular (cada uno con su nombre y su avance).
  Cada asesor manda su avance por WhatsApp y el supervisor lo pega en el **Panel del supervisor** (Yo › Panel del supervisor),
  que arma la tabla del equipo. No hay servidor: todo queda en el celular de cada uno.
- **Sin internet**: después de abrirla una vez con señal, funciona completa sin conexión (service worker).
  En Android se puede instalar en la pantalla de inicio.
- **IA opcional** (Gemini, gratis con clave propia): explica errores, califica respuestas libres y crea preguntas de práctica
  que no cuentan para aprobar. Sin clave todo funciona con el banco fijo.

## Cómo está armado

```
index.html                 página base: cabecera, pestañas y la constante VERSION
css/app.css                estilos (mismo sistema visual del Manual de Campo)
fonts/                     Archivo, IBM Plex Sans e IBM Plex Mono (sin depender de Google)
js/app.js                  arranque
js/datos.js                carga el catálogo, cada línea y el manual; resuelve las referencias al texto
js/validar.js              revisión del contenido (citas letra por letra, una sola correcta, ids…)
js/estado.js               avance por asesor (localStorage academia.*), repaso, racha, migración de la v1
js/nav.js, js/ui.js        navegación por #/… y piezas comunes
js/quiz.js                 sesiones de preguntas (lección, examen, prueba de nivel, repaso, quiz rápido, IA)
js/codigos.js              códigos de respaldo (AA1.…) y de avance para el supervisor (AV1.…)
js/ia.js                   IA opcional con Gemini (bloque copiado del manual)
js/pwa.js, sw.js           sin internet, aviso «Actualizar» e instalación
js/pantallas/*.js          ruta, practicar, mostrador, hablar, yo, supervisor, bienvenida, revisar
js/voz.js                  dictado con el micrófono y lectura en voz alta (pestaña Hablar)
datos/clientes.json        clientes y dificultades para conversar con la IA
datos/lineas.json          orden y códigos de las líneas; sin "archivo" una línea sale como «Pronto»
datos/linea-11-lubricantes.json   niveles → módulos → lecciones → preguntas, casos y objeciones
datos/manual.json          extracción del Manual de Campo (tools/extraer_manual.py)
tests/pruebas.html         pruebas en el navegador
tools/servidor.ps1         servidor local para Windows (solo PowerShell)
```

No hay paso de compilación: la app lee los JSON de `datos/` y el service worker los guarda para usarlos sin internet.

## Probar en la PC (Windows, sin instalar nada)

1. `powershell -NoProfile -ExecutionPolicy Bypass -File tools\servidor.ps1`
2. App: http://localhost:8765/ — para ver cambios sin caché: http://localhost:8765/?sinsw
3. Revisión del contenido: http://localhost:8765/?sinsw#/revisar (debe decir «Todo en orden»).
4. Pruebas: http://localhost:8765/tests/pruebas.html (el título de la pestaña dice «OK n/n»).
   Guardan y devuelven el avance que haya en ese navegador.

## Agregar una línea nueva (ejemplo: 10 Filtros)

1. Si el contenido está en una vista del manual que todavía no se extrae, agrégala y vuelve a extraer (necesita Python):
   `python3 tools/extraer_manual.py ../manual-austrofil/index.html datos/manual.json --vistas v-lubricantes,v-motos,v-marcas,v-vender,v-mercado,v-glosario,v-filtros`
   Cada bloque queda con un id (`fi1.3`, `fi2.1`…): búscalos en `datos/manual.json`.
2. Crea `datos/linea-10-filtros.json` con la misma forma que `linea-11-lubricantes.json`:
   - `niveles` → `modulos` → `lecciones` → `preguntas`, con ids que empiecen por el código (`10-N1`, `10-M01`, `10-L01`, `10-L01-P1`);
   - `contenido` de cada lección: ids de bloques (`"fi1.1..fi1.9"` para un tramo) o `{"qa": "clave del banco"}`;
   - cada pregunta: `tipo` (`opcion`, `vf` o `emparejar`), una sola correcta y su `fuente`
     (`{"bloque": id}`, `{"bloques": [ids]}` o `{"qa": clave}`) con la `cita` copiada letra por letra;
   - `casos` y `objeciones` son opcionales: tres pasos de opción múltiple, cada uno con `paso`, `fuente`, `cita`
     y, si quieres, una explicación por opción; `manual` lista el texto que la IA usa para calificar.
3. En `datos/lineas.json`, ponle `"archivo": "linea-10-filtros.json"` a la línea 10.
4. Abre `#/revisar` y corre `tests/pruebas.html`: todo tiene que estar en orden.
5. Sube la versión en `index.html` (`var VERSION = { n: …, fecha: "DD-MM-AAAA" }`): nombra la caché y avisa a los celulares.
6. Publica: commit y push a `main` (GitHub Pages publica la raíz).

Si agregas un archivo de código o de estilo, súmalo a `ARCHIVOS` en `sw.js` y a los `modulepreload` de `index.html`
(la prueba «El service worker guarda todo…» avisa si falta).

## Reglas de contenido

- Solo texto del Manual de Campo. Lo que el manual no trae no se inventa: se pide a quien lo mantiene.
- Cada pregunta y cada paso llevan su cita del manual, comprobada letra por letra.

No pongas claves, tokens ni teléfonos en el repo: es público. Cada asesor pega su clave de Gemini en la app y queda solo en su navegador.
