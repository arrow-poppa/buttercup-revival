# Chromium browser setup

Buttercup targets desktop Chromium browsers on Windows and Linux that support unpacked Manifest V3 extensions, offscreen documents, and native messaging (Chromium 120 or newer). A fork can disable these APIs or restrict extensions; a shared rendering engine alone does not guarantee compatibility. Mobile browsers and macOS installers are not supported.

## Automatic registration

Run `Install Buttercup.cmd` on Windows or `sh install.sh` on Linux, then load `dist/extension` from your browser's extensions page (`chrome://extensions`, or its browser-specific equivalent). Click **Start and connect** in Buttercup.

On Linux the installer registers these configuration directories below `$XDG_CONFIG_HOME` (default: `~/.config`):

| Family | Directories |
| --- | --- |
| Chrome | `google-chrome`, `google-chrome-beta`, `google-chrome-unstable`, `google-chrome-for-testing` |
| Chromium | `chromium`, `chromium-browser`, `ungoogled-chromium` |
| Edge | `microsoft-edge`, `microsoft-edge-beta`, `microsoft-edge-dev` |
| Brave | `BraveSoftware/Brave-Browser`, `BraveSoftware/Brave-Browser-Beta`, `BraveSoftware/Brave-Browser-Nightly` |
| Brave Origin | `BraveSoftware/Brave-Origin`, `BraveSoftware/Brave-Origin-Beta`, `BraveSoftware/Brave-Origin-Nightly` |
| Vivaldi | `vivaldi`, `vivaldi-snapshot` |
| Opera | `opera`, `opera-beta`, `opera-developer` |
| Thorium | `thorium` |

Windows registration uses the per-user Chrome, Chromium and Edge registry keys. Brave, Vivaldi and many other forks reuse Chrome's registration. See [Chrome's native messaging specification](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) and [KeePassXC's browser registration implementation](https://github.com/keepassxreboot/keepassxc/blob/develop/src/browser/NativeMessageInstaller.cpp) for the underlying registration conventions.

This list describes installer coverage, not a claim that every browser/channel has been tested end to end. No system-wide files or browser settings are changed.

## Other forks and portable installations

Find the native messaging host location documented by your browser. On Linux, add its **NativeMessagingHosts directory**, using an absolute path:

```sh
.venv/bin/python scripts/setup-assistant.py \
  --native-host-dir "$HOME/.config/MyChromiumFork/NativeMessagingHosts"
```

On Windows, if a browser uses a separate registry key, pass the browser-specific path **relative to `HKEY_CURRENT_USER\Software`**:

```powershell
.venv\Scripts\python.exe scripts/setup-assistant.py --browser-registry-key 'Vendor\Browser'
```

This creates `HKCU\Software\Vendor\Browser\NativeMessagingHosts\app.buttercup.assistant`. Windows forks that read manifest directories directly can also use `--native-host-dir` with an absolute Windows path.

Both flags are repeatable. Custom locations persist across installer reruns and are removed by `--uninstall`. Reinstallation preserves the pairing token and previously authorized extension IDs. If your browser assigns a different extension ID, append `--extension-id ID_FROM_THE_POPUP`.

## Flatpak, Snap and browsers without native messaging

Automatic startup needs permission to launch the host-side assistant. Sandboxed browser packages may prevent this even when a manifest is present. Buttercup does not weaken the sandbox or grant unrestricted host execution.

Use a native browser package for automatic startup, or run the backend on the host and pair manually if the browser allows loopback networking and the required extension APIs:

1. Copy the extension ID from **How to connect** in the popup.
2. Start the backend in a terminal on the host:

   ```sh
   .venv/bin/python -m backend.app --extension-id YOUR_EXTENSION_ID --show-token
   ```

   On Windows, use `.venv\Scripts\python.exe` instead. If an assistant is already running, stop that instance first or select a different port and state directory with `--port` and `--state-dir`.
3. In **Local connection — advanced options**, enter `http://127.0.0.1:8767` (or the selected port) and the displayed pairing token. Click **Check assistant**. Keep the terminal running. Use **Check connection** for subsequent checks; **Start and connect** invokes native messaging again.

Copy the pairing token only into Buttercup's password field; do not include it in screenshots, issue reports or URLs. This manual path still enforces the same loopback binding, token authentication and extension-origin allowlist. It cannot restore extension APIs disabled by a browser.
