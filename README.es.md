# 🌼 Buttercup Revival

[English](README.md) · [Português (Brasil)](README.pt-BR.md) · Español · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

> Esta guía traducida resume el README; encontrarás más detalles técnicos en la [versión completa en inglés](README.md).

**Transcripción de YouTube a demanda para navegadores Chromium y Gecko.**

Buttercup Revival transcribe el audio del vídeo que estás viendo con el modelo de voz que elijas. Muestra los subtítulos en el reproductor, envíalos a [asbplayer](https://github.com/asbplayer/asbplayer) o guárdalos como archivos `.srt` y `.vtt`. El audio se prepara en tu ordenador y se envía al proveedor de transcripción seleccionado.

[Descargar la última versión](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip) · [Guía de Firefox y Zen (inglés)](docs/GECKO_SETUP.md) · [Documentación en inglés](README.md)

## Funciones

- Crea subtítulos para vídeos sin ellos o con subtítulos automáticos deficientes mediante DeepInfra, Groq, OpenRouter o una API compatible con OpenAI.
- Ajusta la segmentación al habla y permite configurar la longitud y los saltos de línea.
- Reutiliza transcripciones en caché para cambiar el diseño o volver a exportar sin solicitar otra transcripción. **Regenerar** realiza una solicitud nueva.
- Prepara el audio localmente con `yt-dlp` y FFmpeg. El asistente local se comunica con la extensión; el audio y la clave necesarios se envían al proveedor elegido.
- La interfaz está disponible en inglés, portugués brasileño, español, japonés, chino simplificado y chino tradicional.

## Requisitos

Windows 10/11 o Linux; un navegador de escritorio Chromium 120+ o Gecko 140+; una clave de API de un proveedor de voz; y aproximadamente 1 GB de espacio libre. Los instaladores instalan Python, Node.js y FFmpeg cuando es necesario. Consulta la [compatibilidad Chromium](docs/BROWSERS.md) y la [guía Gecko](docs/GECKO_SETUP.md).

## Instalación

1. [Descarga el paquete completo](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip), descomprímelo y guarda la carpeta en un lugar permanente, como Documentos. Si la mueves o eliminas, Buttercup puede dejar de funcionar.
2. **Windows:** haz doble clic en `Install Buttercup.cmd`. Si Windows bloquea el script, selecciona **Más información → Ejecutar de todas formas**. Autoriza la instalación de Node.js si se solicita.
3. **Linux:** abre un terminal en la carpeta extraída y ejecuta:

   ```sh
   sh install.sh
   ```

   El instalador usa `apt`, `dnf`, `pacman` o `zypper` y solicita la contraseña para instalar los paquetes que falten.
4. **Chromium, Chrome, Edge, Brave y derivados:** abre `chrome://extensions`, activa el modo de desarrollador, selecciona **Cargar descomprimida** y elige `dist/chromium`. Fija Buttercup a la barra del navegador.
5. **Firefox, Zen y otros navegadores Gecko:** sigue la [guía de instalación Gecko](docs/GECKO_SETUP.md). El paquete incluye `dist/firefox` y `dist/firefox-unsigned.zip`. Zen puede conservar la extensión sin firmar si `xpinstall.signatures.required` está en `false` en `about:config`; Firefox Release estándar exige firma. La guía explica las ediciones y los métodos Flatpak. En Linux, Helium usa la versión Chromium; se registran las rutas del asistente, pero aún no se ha probado Helium en ejecución.
6. Crea una clave en [Groq](https://console.groq.com/keys), [DeepInfra](https://deepinfra.com/dash/api_keys), [OpenRouter](https://openrouter.ai/keys) u otro proveedor compatible. Abre Buttercup, pulsa **Start and connect** y elige el proveedor y pega la clave en **Transcription**.

Los navegadores nativos se conectan al asistente mediante mensajería nativa. Snap y Flatpak pueden bloquearla. En Zen Flatpak, usa la [conexión automática con Flatseal](docs/GECKO_SETUP.md#method-a-automatic-connection-with-flatseal) o la [conexión manual](docs/GECKO_SETUP.md#method-b-manual-connection-without-extra-flatpak-permissions). La guía está en inglés.

## Primeros subtítulos

Abre un vídeo de YouTube y pulsa el botón rosa **BC** del reproductor. El aviso muestra el progreso y aparecen los subtítulos; vuelve a pulsarlo para ocultarlos o mostrarlos. El tiempo inicial depende del proveedor. En visitas posteriores se puede utilizar la caché. Tras reiniciar el ordenador, abre Buttercup y pulsa **Start and connect**.

Para sustituir subtítulos humanos, desactiva **Prefer human captions**. Para vídeos doblados, selecciona **Original audio** en **Audio track for transcription**.

## Uso con asbplayer

El servidor WebSocket de asbplayer es independiente de Buttercup y debe iniciarse en cada sesión. Instala [Go](https://go.dev/dl/) y [Git](https://git-scm.com/downloads) y ejecuta:

```sh
git clone https://github.com/asbplayer/asbplayer.git
cd asbplayer/scripts/web-socket-server
go run .
```

Deja abierto el terminal. En asbplayer, activa **Misc → WebSocket client**. En Buttercup, abre **Integrations → asbplayer**, comprueba la conexión y activa el envío automático. Para ver solo los subtítulos de asbplayer, desactiva los de Buttercup en el vídeo. Más detalles en la [guía de asbplayer](https://docs.asbplayer.dev/docs/guides/web-socket-server).

## Archivos y ajustes

Usa **Download SRT** o **Download VTT** para guardar los subtítulos actuales; el guardado automático crea un SRT después de la generación. Selecciona una carpeta existente o deja el campo vacío para usar Descargas. Los archivos con el mismo nombre se reemplazan.

El menú superior cambia el idioma; **Auto** sigue el navegador. En **Transcription**, selecciona proveedor, clave y modelo. Solicitar marcas de tiempo por palabra ayuda a crear subtítulos cortos cuando el modelo las ofrece. En **Subtitle layout**, ajusta segmentación, límite de palabras y saltos de línea. Si solo hay marcas de segmentos, los límites internos pueden estimarse. **Keep provider segments (original timing)** conserva los segmentos originales e ignora el límite de palabras; establece el salto de línea en `0` para mantener el diseño recibido. Para japonés y chino se cuentan caracteres, preservando palabras latinas y grafemas.

En **Audio upload (advanced)**, elige envío por partes o audio completo. El formato predeterminado es MP3 mono, 16 kHz y 64 kbps; también hay FLAC mono, 16 kHz y 16 bits. FLAC suele ser más grande y no garantiza mayor precisión; la compatibilidad depende del proveedor y modelo. La elección se guarda por configuración de proveedor/modelo y se incluye en las copias de seguridad. Actualiza y reinicia el asistente para usar FLAC. Ambos formatos comparten la caché: usa **Regenerate subtitles** para enviar audio nuevo en el formato elegido; pueden aplicarse cargos. La prueba de muestra envía el archivo seleccionado sin convertirlo.

El envío por partes usa 1,5 segundos de solapamiento y respeta el límite configurado, que por defecto es 24 MB. Para vídeos restringidos, importa un `cookies.txt` en **YouTube Authentication / Cookies**; solo se aceptan cookies de YouTube y Google, que permanecen en tu ordenador.

Los atajos predeterminados son **Alt+Shift+G** para generar y **Alt+Shift+U** para regenerar. Personalízalos en **Keyboard shortcuts → Configure shortcuts**; el navegador los guarda por separado de la copia de ajustes. Algunas combinaciones pueden estar reservadas.

## Actualización e importación

Descarga el [ZIP más reciente](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip), extráelo sobre la misma carpeta y ejecuta de nuevo el instalador. En Chromium, recarga la extensión en `chrome://extensions`. En Gecko, instala el nuevo ZIP sobre la extensión existente según la [guía](docs/GECKO_SETUP.md), sin eliminarla primero. Los ID son estables, pero no hay canal de actualización automática. Exporta los ajustes antes de actualizar para tener una copia de seguridad.

La importación de ajustes, cookies y conexión, así como la prueba de audio, abre una página persistente. Selecciona allí el archivo y pulsa el botón correspondiente; seleccionarlo no lo envía automáticamente. La persistencia de cookies es opcional y está desactivada por defecto.

## Solución de problemas

- **Asistente desconectado:** ejecuta el instalador en la carpeta correcta y usa **Start and connect**. En Zen Flatpak, completa uno de los métodos de la guía; con conexión manual, ejecuta `Start Buttercup assistant.sh` y pulsa **Check connection**.
- **Falta el botón BC:** recarga YouTube y comprueba que Buttercup está activado.
- **Error de clave:** pega la clave del proveedor seleccionado. Ante errores de autenticación o 403 de YouTube, prueba a importar cookies actualizadas.
- **Subtítulos demasiado largos:** usa un modo de segmentación de Buttercup y reduce el límite de palabras; los segmentos originales del proveedor ignoran ese límite.
- **Archivo demasiado grande:** selecciona envío por partes. Para problemas con asbplayer, inicia su servidor WebSocket y activa el cliente.
- Si necesitas ayuda, [abre una incidencia](https://github.com/arrow-poppa/buttercup-revival/issues) con el mensaje y los pasos para reproducirla.

## Privacidad, desarrollo y créditos

El audio se convierte localmente y se envía al proveedor elegido. Las claves se guardan en el almacenamiento privado de la extensión; el asistente acepta conexiones locales autorizadas mediante un token. La caché comunitaria es opcional y está desactivada por defecto. **La copia de ajustes contiene tus claves de API: protégela como una contraseña.**

Para desinstalar, ejecuta `Uninstall Buttercup.cmd` en Windows o `.venv/bin/python scripts/setup-assistant.py --uninstall` en Linux, elimina la extensión del navegador y borra la carpeta. Las dependencias compartidas permanecen instaladas.

Consulta el [README en inglés](README.md#-for-developers) para la estructura, los comandos de compilación/prueba y la arquitectura. Cada ejecución del instalador intenta actualizar `yt-dlp` y `pytubefix` a las últimas versiones estables compatibles.

### Compilar y probar

Para desarrollar, instala Python 3.11+, Node.js 22+ y FFmpeg. Ejecuta estos comandos en la raíz del proyecto. Las dos versiones comparten el código; Gecko utiliza una página de procesamiento en segundo plano. El asistente registra ambos ID estables y utiliza mensajería nativa. Las solicitudes de pago fallidas no se repiten ni redirigen automáticamente.

```sh
python -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
npm ci
npm run build
npm run package
npm test
.venv/bin/python -m pytest tests/backend -q
```

Buttercup Revival es una versión modernizada de [Buttercup, de iGerman00](https://github.com/iGerman00/buttercup-chrome), y utiliza [yt-dlp](https://github.com/yt-dlp/yt-dlp), [pytubefix](https://github.com/JuanBindez/pytubefix), [FFmpeg](https://ffmpeg.org/) y [FastAPI](https://fastapi.tiangolo.com/). El proyecto original no declara licencia y este fork no añade una; consulta [UPSTREAM](docs/UPSTREAM.md).
