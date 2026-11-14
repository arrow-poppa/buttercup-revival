# Configuración en navegadores Chromium

Para Firefox, Zen, LibreWolf y otros navegadores Gecko, usa `dist/firefox` y la [guía de configuración de Gecko](GECKO_SETUP.md). Esta página trata de Chromium.

Buttercup está destinado a navegadores Chromium de escritorio en Windows y Linux que admitan extensiones Manifest V3 descomprimidas, documentos offscreen y mensajería nativa (Chromium 120 o superior). Un derivado puede desactivar estas API o restringir extensiones; compartir el mismo motor de renderizado no garantiza la compatibilidad. Los navegadores móviles y los instaladores para macOS no son compatibles.

## Registro automático

Ejecuta `Install Buttercup.cmd` en Windows o `sh install.sh` en Linux, y luego carga `dist/chromium` desde la página de extensiones de tu navegador (`chrome://extensions`, o su equivalente específico). Haz clic en **Start and connect** en Buttercup.

En Linux, el instalador registra estos directorios de configuración bajo `$XDG_CONFIG_HOME` (predeterminado: `~/.config`):

| Familia | Directorios |
| --- | --- |
| Chrome | `google-chrome`, `google-chrome-beta`, `google-chrome-unstable`, `google-chrome-for-testing` |
| Chromium | `chromium`, `chromium-browser`, `ungoogled-chromium` |
| Edge | `microsoft-edge`, `microsoft-edge-beta`, `microsoft-edge-dev` |
| Brave | `BraveSoftware/Brave-Browser`, `BraveSoftware/Brave-Browser-Beta`, `BraveSoftware/Brave-Browser-Nightly` |
| Brave Origin | `BraveSoftware/Brave-Origin`, `BraveSoftware/Brave-Origin-Beta`, `BraveSoftware/Brave-Origin-Nightly` |
| Vivaldi | `vivaldi`, `vivaldi-snapshot` |
| Opera | `opera`, `opera-beta`, `opera-developer` |
| Thorium | `thorium` |

En Windows, el registro usa las claves del usuario actual de Chrome, Chromium y Edge. Brave, Vivaldi y muchos otros derivados reutilizan el registro de Chrome. Consulta la [especificación de mensajería nativa de Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) y la [implementación de registro de navegadores de KeePassXC](https://github.com/keepassxreboot/keepassxc/blob/develop/src/browser/NativeMessageInstaller.cpp) para las convenciones de registro subyacentes.

Esta lista describe la cobertura del instalador, no afirma que cada navegador y canal se haya probado de extremo a extremo. No se modifican archivos del sistema ni ajustes del navegador para todos los usuarios.

## Otros derivados e instalaciones portátiles

Busca la ubicación del host de mensajería nativa documentada por tu navegador. En Linux, añade su **directorio NativeMessagingHosts** usando una ruta absoluta:

```sh
.venv/bin/python scripts/setup-assistant.py \
  --native-host-dir "$HOME/.config/MyChromiumFork/NativeMessagingHosts"
```

En Windows, si un navegador usa una clave de registro propia, pasa la ruta específica del navegador **relativa a `HKEY_CURRENT_USER\Software`**:

```powershell
.venv\Scripts\python.exe scripts/setup-assistant.py --browser-registry-key 'Vendor\Browser'
```

Esto crea `HKCU\Software\Vendor\Browser\NativeMessagingHosts\app.buttercup.assistant`. Los derivados de Windows que leen directorios de manifiesto directamente también pueden usar `--native-host-dir` con una ruta absoluta de Windows.

Ambas opciones se pueden repetir. Las ubicaciones personalizadas persisten tras volver a ejecutar el instalador y se eliminan con `--uninstall`. La reinstalación conserva el token de emparejamiento y los IDs de extensión autorizados anteriormente. Si tu navegador asigna un ID de extensión distinto, añade `--extension-id ID_FROM_THE_POPUP`.

## Flatpak, Snap y navegadores sin mensajería nativa

El inicio automático necesita permiso para lanzar el asistente en el host. Los paquetes de navegador en sandbox pueden impedirlo incluso cuando hay un manifiesto. Buttercup no debilita el sandbox ni concede ejecución irrestricta en el host.

Usa un paquete nativo del navegador para el inicio automático, o ejecuta el backend en el host y empareja manualmente si el navegador permite redes de loopback y las API de extensión necesarias:

1. Copia el ID de la extensión desde **How to connect** en la ventana emergente.
2. Inicia el backend en un terminal del host:

   ```sh
   .venv/bin/python -m backend.app --extension-id YOUR_EXTENSION_ID --show-token
   ```

   En Windows, usa `.venv\Scripts\python.exe` en su lugar. Si ya hay un asistente en ejecución, detén esa instancia primero o selecciona otro puerto y directorio de estado con `--port` y `--state-dir`.
3. En **Local connection — advanced options**, introduce `http://127.0.0.1:8767` (o el puerto seleccionado) y el token de emparejamiento mostrado. Haz clic en **Check assistant**. Mantén el terminal abierto. Usa **Check connection** para las comprobaciones posteriores; **Start and connect** vuelve a invocar la mensajería nativa.

Copia el token de emparejamiento solo en el campo de contraseña de Buttercup; no lo incluyas en capturas de pantalla, informes de problemas ni URL. Esta ruta manual sigue aplicando el mismo enlace de loopback, la autenticación por token y la lista de orígenes de extensión permitidos. No puede restaurar API de extensión desactivadas por un navegador.

## Helium

Usa `dist/chromium` con Helium nativo en Linux. El [parche de compatibilidad de mensajería nativa de Helium](https://github.com/imputnet/helium/blob/main/patches/helium/core/scan-chrome-native-messaging-hosts.patch) busca el directorio de hosts del usuario de Chrome como alternativa. Buttercup registra esa ubicación de Chrome y el directorio propio de Helium, `$XDG_CONFIG_HOME/net.imput.helium/NativeMessagingHosts`, por lo que se espera que el asistente se inicie sin otro formato de registro. Esta es una compatibilidad verificada en el código fuente, no un resultado de ejecución real de Helium. Helium en Windows no se ha validado; la instalación del asistente en macOS sigue sin soporte. Los paquetes de terceros en sandbox aún pueden necesitar conexión manual.
