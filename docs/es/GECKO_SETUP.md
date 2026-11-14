# Configura Buttercup en Firefox, Zen y otros navegadores Gecko

Buttercup Revival es una extensión de navegador para **Chromium y Gecko**. Esta guía cubre la compilación Gecko en Windows y Linux, incluidas dos formas de conectar Zen Flatpak con el asistente local.

Instalarás dos partes: la extensión añade el botón BC a YouTube; el asistente prepara el audio en tu ordenador. Instalar una extensión sin firma y conectar el asistente son pasos distintos. Cambiar una preferencia de firma no elimina las restricciones de mensajería nativa de Flatpak.

## Elige tu ruta

| Tu navegador | Instalar la extensión | Conectar el asistente |
| --- | --- | --- |
| Zen nativo | Instalación permanente sin firma (más abajo) o instalación temporal | Haz clic en **Iniciar y conectar** |
| Firefox Release estándar | Paquete firmado por Mozilla para instalación permanente, o instalación temporal | Haz clic en **Iniciar y conectar** en una instalación nativa |
| Firefox ESR, Developer Edition, Nightly o una compilación sin marca | La instalación sin firma es posible en compilaciones compatibles; consulta la tabla de firmas | Haz clic en **Iniciar y conectar** en una instalación nativa |
| Zen Flatpak | Instala como en Zen | Elige **Método A: automático con Flatseal** o **Método B: conexión manual** |
| Otros derivados modernos de Gecko | Consulta la tabla de firmas y los requisitos del navegador | La mensajería nativa depende del navegador y del paquete; consulta los [detalles de compatibilidad](../firefox.md) |

Buttercup está destinado a Gecko 140 o superior. El mero soporte de firmas no demuestra que cada derivado o paquete se haya probado con Buttercup. Firefox nativo y Zen nativo/Flatpak tienen validación en ejecución; LibreWolf y Waterfox no se han probado individualmente en ejecución.

<a id="extract"></a>
## 1. Extrae el paquete correcto

1. Extrae el ZIP completo del proyecto Buttercup en una carpeta que pretendas conservar, como Documentos.
2. Abre la carpeta extraída. Debe contener `install.sh`, `scripts` y `dist`. Puede haber otra carpeta `Buttercup-Revival` dentro de la primera: abre la que contenga esos archivos.
3. Comprueba que existan `dist/firefox/manifest.json` y `dist/firefox-unsigned.zip`. Un paquete antiguo solo para Chromium no los contendrá. Descarga la **v0.6.0 o posterior**, o [compila desde el código fuente](../../README.es.md#developers).

El **ZIP completo del proyecto** contiene el asistente y los instaladores. El **`dist/firefox-unsigned.zip`**, más pequeño, contiene solo la extensión. Selecciona el ZIP pequeño al instalar el complemento; no selecciones el ZIP completo del proyecto.

Mantén la carpeta extraída del proyecto en su sitio después de la instalación. Moverla puede romper el lanzador del asistente.

## 2. Ejecuta el instalador

**Windows:** haz doble clic en `Install Buttercup.cmd` en esa carpeta.

**Linux:** abre un terminal **dentro de esa carpeta** y ejecuta:

```sh
sh install.sh
```

Usa la acción **Abrir en terminal** de tu gestor de archivos si está disponible. Si no, usa `cd` para entrar primero en la carpeta. Por ejemplo, si extrajiste directamente en Descargas:

```sh
cd "$HOME/Downloads/Buttercup-Revival"
```

Esa ruta es solo un ejemplo: usa tu carpeta real. Mantén las comillas en rutas con espacios o `(1)`. Si el indicador termina en `:~$`, normalmente sigues en tu carpeta personal, no en el proyecto.

El instalador crea `.venv` y registra automáticamente ambos motores de navegador. Volver a ejecutarlo reutiliza el entorno y busca dependencias actualizadas. Espera hasta que informe que la instalación ha terminado.

## 3. Instala la extensión

### Mantener una extensión sin firma instalada en Zen

Zen puede mantener instalada una extensión sin firma entre reinicios del navegador cuando la exigencia de firma está desactivada:

1. Abre una pestaña nueva e introduce `about:config`.
2. Acepta la advertencia de configuración.
3. Busca `xpinstall.signatures.required`.
4. Pon su valor en **`false`**.
5. Abre `about:addons` o pulsa **Ctrl+Shift+A**.
6. Abre el menú de engranaje y elige **Instalar complemento desde archivo…**.
7. Selecciona **`dist/firefox-unsigned.zip`** del proyecto extraído y aprueba la instalación.
8. Abre Buttercup desde el menú de extensiones; fija su icono si quieres tenerlo a mano.

Buttercup ya incluye el ID de complemento Gecko explícito necesario para la instalación persistente. El ZIP y la carpeta Firefox descomprimida usan el **mismo ID**. Renombrar un ZIP a `.xpi` no lo firma.

Esta preferencia desactiva la exigencia de firma para el perfil del navegador, así que usa extensiones de confianza. La [configuración oficial de compilación de Zen](https://github.com/zen-browser/desktop/blob/dev/configs/common/mozconfig) permite complementos sin firma, y esta ruta se ha probado con Zen. Es distinta de las compilaciones estándar de Firefox Release.

<a id="other-browsers"></a>
### ¿Qué otros navegadores lo permiten?

| Navegador/compilación | ¿La preferencia permite extensiones permanentes sin firma? | Evidencia |
| --- | --- | --- |
| **Zen** | Sí: pon `xpinstall.signatures.required` en `false` | Configuración oficial de compilación y pruebas en ejecución con Zen |
| **Firefox Release estándar** | **No.** Cambiar la preferencia no omite el requisito de firma de la compilación Release | Documentación de Mozilla |
| **Firefox ESR** | Sí, según Mozilla, en compilaciones ESR compatibles | Documentación de Mozilla; no probado aquí de forma independiente en ejecución |
| **Firefox Developer Edition / Nightly** | Sí, para pruebas | Documentación de Mozilla; no probado aquí de forma independiente en ejecución |
| **Compilaciones de Firefox sin marca** | Sí, cuando se compilan con la exigencia de firma desactivada | Documentación de Mozilla; no probado aquí de forma independiente en ejecución |
| **LibreWolf** | Su configuración oficial de compilación permite complementos sin firma; la preferencia puede controlar la exigencia | Verificado en el código fuente; no probado aquí de forma independiente en ejecución |
| **Waterfox moderno** | Su configuración oficial de compilación de escritorio permite complementos sin firma; la preferencia puede controlar la exigencia | Verificado en el código fuente; no probado aquí de forma independiente en ejecución |

Comprueba la edición y el paquete reales de tu navegador. El nombre de un derivado o la mera existencia de la preferencia no demuestran que un binario la respete. Los derivados antiguos, las compilaciones de terceros y las políticas de distribución pueden diferir. Esta tabla trata de firmas, no de compatibilidad garantizada con Buttercup ni de soporte de host nativo.

Fuentes: [Mozilla: firma de complementos](https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox), [configuración de compilación de Zen](https://github.com/zen-browser/desktop/blob/dev/configs/common/mozconfig), [configuración de compilación de LibreWolf](https://librewolf.dev/librewolf/source/src/branch/main/assets/mozconfig.new), [configuración compartida de compilación de escritorio de Waterfox](https://github.com/BrowserWorks/Waterfox/blob/current/waterfox/build/mozconfig.common). Comprobado el 13/11/2026.

### Instalación temporal, incluido Firefox estándar

Si no quieres cambiar la configuración de firmas, o tu compilación exige firmas:

1. Abre `about:debugging#/runtime/this-firefox`.
2. Haz clic en **Cargar complemento temporal…**.
3. Selecciona **`dist/firefox/manifest.json`**.

Esta instalación se elimina cuando el navegador se cierra. Para la instalación permanente en Firefox Release estándar, obtén un paquete firmado por Mozilla. Los mantenedores pueden usar el [proceso de firma para autodistribución](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) de Mozilla sin publicar la extensión públicamente.

<a id="connect"></a>
## 4. Conecta el asistente

**Instalación nativa del navegador:** abre Buttercup y haz clic en **Iniciar y conectar**. El indicador debería cambiar a **Conectado**. No necesitas ninguno de los métodos Flatpak siguientes.

**Zen Flatpak:** elige uno de los métodos siguientes. Ambos usan el mismo asistente y conservan tus ajustes de proveedor.

<a id="flatseal"></a>
### Método A: conexión automática con Flatseal

Elige esto si quieres que **Iniciar y conectar** inicie el asistente, incluso después de reiniciar el ordenador.

#### A1. Prepara el lanzador una vez

Abre un terminal **en la carpeta del proyecto Buttercup instalado**, como en el paso 2. Ejecuta:

```sh
.venv/bin/python scripts/setup-assistant.py --flatpak-bridge app.zen_browser.zen
```

Espera **Flatpak launcher prepared**. El comando crea el puente pero no cambia los permisos de Flatpak. Ejecutarlo de nuevo actualiza el lanzador.

#### A2. Añade las dos entradas de Flatseal

Abre **Flatseal** y selecciona **Zen** (`app.zen_browser.zen`) en la lista de aplicaciones, no Todas las aplicaciones.

| Busca esta sección | Añade este valor exacto |
| --- | --- |
| **Session Bus → Talks** | `org.freedesktop.Flatpak` |
| **Persistent → Files** | `.mozilla` |

Para cada entrada, usa el botón **+** o de añadir de la sección, introduce el valor y confírmalo. Mantén las entradas existentes, como `.zen`.

**Estas son entradas de texto, no los interruptores de D-Bus de la sección Socket.** No necesitas habilitar todo el bus de sesión, todo el bus del sistema, Todos los archivos del usuario ni Todos los archivos del sistema. El primer valor distingue mayúsculas y minúsculas; el segundo empieza por punto y no tiene barra.

El permiso del bus de sesión permite a Zen ejecutar programas del host en general, no solo Buttercup. Usa el Método B si prefieres dejar ese permiso desactivado. La ruta probada usa los permisos de archivos predeterminados de Zen; las anulaciones amplias del directorio personal pueden interferir con el mapeo de persistencia. Consulta la [referencia de permisos de Flatseal](https://github.com/tchx84/Flatseal/blob/master/DOCUMENTATION.md).

#### A3. Reinicia y conecta

1. Cierra Zen por completo, incluidas sus otras ventanas e instancias en segundo plano.
2. Abre Zen de nuevo.
3. Abre Buttercup y haz clic en **Iniciar y conectar**.
4. Confirma que el indicador dice **Conectado**.

De ahora en adelante, usa **Iniciar y conectar** con normalidad. Después de reiniciar el ordenador, puede iniciar el asistente de nuevo; no se necesita archivo de conexión ni terminal.

<a id="manual"></a>
### Método B: conexión manual sin permisos Flatpak adicionales

Elige esto si quieres mantener los permisos de sandbox predeterminados de Zen. Preparas un archivo de conexión una vez y luego inicias el asistente con su auxiliar tras reiniciar el ordenador.

#### B1. Copia el origen de conexión del navegador

1. Abre Buttercup en el perfil del navegador que quieras usar.
2. Expande **Conectar sin mensajería nativa**.
3. Haz clic en **Copiar origen**.

Usa el valor de ese botón. No copies el **Extension ID** de How to connect: el origen de conexión empieza por `moz-extension://` e identifica este perfil del navegador.

#### B2. Crea el archivo de conexión privado

1. En la carpeta del proyecto extraído, ejecuta **Set up Buttercup assistant.sh**. Si tu gestor de archivos abre el script como texto, ejecuta `sh "Set up Buttercup assistant.sh"` en un terminal abierto en esa carpeta.
2. Busca **Flatpak / Snap: connect manually** en la ventana de configuración.
3. Pega el origen en su campo.
4. Haz clic en **Start assistant and save connection file**.
5. Guarda el archivo JSON en un lugar fácil de encontrar, como Descargas.

El auxiliar inicia el asistente en segundo plano. No tienes que dejar el terminal abierto.

#### B3. Importa y comprueba la conexión

1. Vuelve a Buttercup → **Conectar sin mensajería nativa**.
2. Haz clic en **Abrir editor de conexión**. Se abre una pestaña para que el selector de archivos pueda permanecer abierto cuando se cierre la ventana emergente.
3. Elige el archivo JSON que acabas de guardar.
4. Haz clic en **Importar conexión**.
5. Comprueba que aparezca **Assistant connected** / **Conectado**.
6. Elimina el archivo JSON después: contiene el token privado de tu asistente local.

La conexión importada permanece guardada para ese perfil. Cambiar los ajustes de proveedor o subtítulos no la elimina. Un nuevo perfil del navegador necesita un archivo nuevo. Las copias de seguridad de ajustes excluyen intencionadamente la conexión local.

#### B4. Después de reiniciar el ordenador

Ejecuta **Start Buttercup assistant.sh** desde la misma carpeta del proyecto. Si es necesario, abre un terminal allí y ejecuta:

```sh
sh "Start Buttercup assistant.sh"
```

Luego haz clic en **Comprobar conexión** en Buttercup. No tienes que crear ni importar el archivo JSON de nuevo tras cada reinicio. Con este método, **Iniciar y conectar** sigue intentando la mensajería nativa; usa el auxiliar y **Comprobar conexión** en su lugar.

## 5. Genera tus primeros subtítulos

1. Elige un proveedor en **Transcripción** e introduce su clave de API.
2. Abre un vídeo de YouTube.
3. Haz clic en el botón **BC** del reproductor, o en **Generar subtítulos** en Buttercup.
4. Espera el mensaje de finalización.

**Generate** reutiliza una transcripción en caché cuando está disponible. **Regenerar subtítulos** solicita explícitamente una transcripción nueva y puede generar cargos del proveedor. En **Empezar un subtítulo nuevo**, elige los segmentos originales del proveedor o deja que Buttercup los reagrupe. Los cambios de diseño pueden usar la caché existente.

## Si algo va mal

| Qué ves | Qué hacer |
| --- | --- |
| `.venv/bin/python: No such file or directory` | Estás en la carpeta equivocada, o el instalador no ha terminado. Abre la carpeta que contiene `install.sh` y `scripts`, abre un terminal allí y ejecuta `sh install.sh` si falta `.venv`. No ejecutes el comando relativo desde `~`. |
| `unrecognized arguments: --flatpak-bridge` | Estás ejecutando un paquete antiguo o un script de otra copia extraída. Usa el paquete actualizado para ambos navegadores y su carpeta de proyecto. |
| La extensión sin firma es rechazada | Selecciona `dist/firefox-unsigned.zip`, no el archivo completo del proyecto. Comprueba la tabla de navegadores/compilaciones y la preferencia de firma. Firefox Release estándar necesita un paquete firmado o carga temporal. |
| La extensión desaparece tras reiniciar el navegador | Se cargó temporalmente. Usa una instalación permanente compatible con ese navegador, o un paquete firmado. |
| La extensión está instalada pero el asistente no conecta | Es un problema distinto de la firma. Los usuarios de navegadores nativos deben volver a ejecutar el instalador; los usuarios de Flatpak deben completar el Método A o B. |
| El Método A sigue sin conectar | Confirma que el comando del lanzador se ejecutó correctamente, que ambas entradas de Flatseal se añadieron a Zen y que Zen se reinició por completo. Mantén la carpeta del proyecto en su sitio. Las anulaciones personalizadas del sistema de archivos pueden requerir volver a la ruta manual. |
| El Método B dice que el archivo pertenece a otro perfil | Copia el origen del perfil actual y genera un nuevo archivo de conexión. |
| El Método B funcionaba antes de reiniciar el ordenador | Ejecuta `Start Buttercup assistant.sh` y luego **Comprobar conexión**. Normalmente no hace falta volver a importar. |

Para versiones probadas, limitaciones, opciones manuales de CLI y el diseño de seguridad, consulta las [notas técnicas y de compatibilidad de Gecko](../firefox.md).
