# Firefox and Gecko browsers

Buttercup builds two extensions from the same codebase:

| Build | Runtime | Directory |
| --- | --- | --- |
| Chromium 120+ | Manifest V3 service worker + offscreen document | `dist/chromium` |
| Firefox/Gecko 140+ | Manifest V2 persistent background page + private processing frame | `dist/firefox` |

Run `npm run build` to generate both directories and `dist/firefox-unsigned.zip`, an extension-only archive with the manifest at its root for Mozilla submission. The ZIP is unsigned. Chromium retains its manifest, public key, extension ID, permissions and offscreen behavior. The Python assistant, transcription pipeline, providers, subtitles, cache, popup, settings format and integrations are shared. `npm run package` includes both builds in the local ZIP; it packages **committed HEAD**, not uncommitted edits. Building or packaging does not publish a release.

## No processing tab

Firefox processing runs in an invisible extension background page. It creates a private iframe for the existing audio runner on demand. Neither is a browser tab. Closing the popup or switching tabs does not stop transcription. Closing the video tab cancels its job, as on Chromium; closing the browser or disabling/reloading the extension ends its JavaScript tasks.

Firefox's MV3 event pages are nonpersistent and do not provide Chromium's offscreen API. A visible processing tab would impose a new user workflow. MV2's supported persistent background page is a smaller compatibility adjustment and preserves long-running requests without timer/port tricks or duplicating processing in Python. The tradeoff is that this small background document stays in memory while the extension is enabled; the processing frame is created only when needed.

Mozilla [continues to support MV2 alongside MV3](https://blog.mozilla.org/en/firefox/firefox-manifest-v3-adblockers/). Its [background manifest documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) describes the persistent-page lifetime. A future change in that browser policy would require revisiting this target. The existing settings-import flow still opens an editor tab, identically to Chromium; that tab is unrelated to transcription.

## Installation

1. Run the normal installer (`sh install.sh` on Linux or `Install Buttercup.cmd` on Windows). It registers both browser families with the same assistant. Existing users must rerun it to add Gecko registration.
2. Build with `npm run build` if working from source.
3. In Firefox or Zen, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`.
4. Open Buttercup and click **Start and connect**. Import an existing Buttercup settings backup if desired; provider keys/settings are separate for each browser profile. The local pairing is intentionally excluded from backups.

**This is an unsigned development build.** Temporary add-ons are unloaded when the browser exits. Standard release Firefox needs Mozilla signing for permanent installation. Zen can permit permanent unsigned installation when `xpinstall.signatures.required` is `false`: open `about:addons`, choose the gear menu → Install Add-on From File, and select `dist/firefox-unsigned.zip`. The stable ID is already included. This disables signature enforcement for that Zen profile; install extensions you trust. No signing, store submission or release publication is performed by this change. See Mozilla's [extension distribution guide](https://extensionworkshop.com/documentation/publish/distribute-sideloading/).

The manifest declares transmission of authentication information, website content and browsing activity: selected provider credentials, requested video/audio/subtitles, and explicitly imported YouTube cookies go only to their configured destinations. This is not telemetry. The minimum desktop version is 140 to support the declaration; the Android metadata minimum only satisfies manifest compatibility checks and does **not** add mobile/Android assistant support.

## Browser families and native messaging

| Browser/package | Registration and validation |
| --- | --- |
| Native Firefox / ESR | Mozilla locations; Linux Firefox 159.0 tested with the real Python native host |
| Native Zen | Shares Mozilla locations; portable Linux Zen 1.24.2b tested with the real Python native host |
| LibreWolf | Mozilla Windows registry; separate LibreWolf Linux locations registered; no live LibreWolf runtime test |
| Other modern Gecko forks (including Waterfox) | Same build when required WebExtension APIs are available; custom registration supported; not individually runtime-verified |
| Flatpak / Snap | Manual connection supported without native messaging; Linux Flatpak Zen 1.24b tested. Snap remains unverified |
| Android, macOS installers, old non-WebExtension forks | Unsupported by the existing assistant installation flow |

The installer writes separate manifests because Chromium uses `allowed_origins`, while Firefox uses `allowed_extensions`. Linux defaults include `~/.mozilla/native-messaging-hosts`, `~/.librewolf/native-messaging-hosts`, and the `mozilla/native-messaging-hosts` and `librewolf/native-messaging-hosts` directories under `$XDG_CONFIG_HOME` (default `~/.config`). Windows uses `HKCU\Software\Mozilla\NativeMessagingHosts`, alongside the unchanged Chromium registrations. Zen's [native-host lookup discussion](https://github.com/zen-browser/desktop/issues/10622) and [LibreWolf's native messaging notes](https://librewolf.net/docs/faq/#how-do-i-get-native-messaging-to-work) explain why browser profile-folder names are not sufficient to determine these paths.

For forks or portable packages with a different **verified** location:

```sh
.venv/bin/python scripts/setup-assistant.py --gecko-host-dir /absolute/path/to/native-messaging-hosts
```

On Windows, use `.venv\Scripts\python.exe` and, when needed, `--gecko-registry-key "Vendor\Browser"`. These Gecko-specific options are repeatable, remembered across reinstalls, and removed by uninstall. Keep them separate from Chromium's `--native-host-dir` / `--browser-registry-key`: using the same host manifest location for both formats is rejected.

### Optional automatic connection with Flatseal (Zen Flatpak)

Run the normal installer, then `.venv/bin/python scripts/setup-assistant.py --flatpak-bridge app.zen_browser.zen` from the project folder. This creates an app-specific native host launcher without changing Flatpak permissions. In **Flatseal → Zen**, add **Session Bus → Talks → `org.freedesktop.Flatpak`** and **Persistent → Files → `.mozilla`**. Restart Zen completely, then use **Start and connect** as with a native browser.

The launcher calls `flatpak-spawn --host --watch-bus` to the existing host assistant. `.mozilla` persistence exposes the app's own Gecko host manifest; the installer also registers its XDG Mozilla location. No home-wide or entire-bus access is required. The command permission applies to the browser generally, so this path is explicitly opt-in. It is tested with Zen's default filesystem permissions; custom home/filesystem overrides can interfere with persistence mapping. The manual path below requires neither setting.

Uninstall removes Buttercup's app-specific launcher/manifests. Remove the two entries in Flatseal yourself if you no longer need them, preserving any settings required by other extensions. Tests used runtime flags rather than permanent overrides, so the installed Zen application's permissions were left unchanged. Reproduce with `BUTTERCUP_TEST_FLATPAK=app.zen_browser.zen BUTTERCUP_TEST_FLATPAK_BRIDGE=1 BUTTERCUP_GECKO_DELAY_MS=1000 npm run test:gecko-browser`.

### Manual connection for Flatpak / Snap

Native browsers keep using **Start and connect**. Sandboxed browsers can pair explicitly without a native-messaging portal or extra Flatpak permissions:

1. In Buttercup, expand **Connect without native messaging** and click **Copy origin**. This is the exact profile URL, not the logical extension ID.
2. From the installed project folder, run **Set up Buttercup assistant.sh**. In its Flatpak / Snap section, paste the origin and click **Start assistant and save connection file**.
3. Back in Buttercup, click **Open connection editor**. Select the private JSON file and click **Import connection**. The editor uses a tab so closing the popup/file picker cannot interrupt import.
4. Delete the connection file after import: it contains the local assistant token. Existing provider keys and settings are preserved.

The helper authorizes only the pasted origin and starts the existing Python assistant. No wildcard CORS, new HTTP pairing endpoint, browser sandbox overrides or additional service is introduced. Connection files are rejected in a different browser profile and are excluded from settings backups. The browser's normal file-selection portal grants access to the selected file.

After restarting the computer, run **Start Buttercup assistant.sh** and click **Check connection** in the extension. The helper starts the assistant detached; it does not keep a terminal open. The connection survives ordinary browser restarts. A new browser profile requires a new connection file.

CLI equivalents (no secrets are printed):

```sh
.venv/bin/python scripts/setup-assistant.py --manual-origin moz-extension://YOUR-PROFILE-UUID --connection-file /private/path/Buttercup-connection.private.json
.venv/bin/python scripts/setup-assistant.py --start-service
```

Flatpak Zen 1.24b was tested in a disposable profile against a host assistant with separate state. The test uses a temporary filesystem grant only for its generated profile/extension fixtures; no overrides are added to the installed application or normal profile. Zen's BiDi automation cannot choose a file in privileged extension pages, so the test feeds the helper-generated file through the browser's `File` API and exercises the actual import handler. Interactive file-picker/portal selection and the Tk save dialog were not automated. Run this test with `BUTTERCUP_TEST_FLATPAK=app.zen_browser.zen BUTTERCUP_GECKO_DELAY_MS=1000 npm run test:gecko-browser`.

## Compatibility and security details

- The stable Gecko ID is defined once in `gecko/manifest.json`: `{806fcedc-6fce-4d5e-818d-6eb7d943c562}`. It is separate from Chromium's key-derived ID and from Firefox's per-profile URL UUID.
- Firefox's callback-style `chrome` namespace is replaced with its promise-based `browser` namespace only in generated Gecko contexts, before shared scripts load.
- Firefox lacks `storage.local.setAccessLevel`. Its settings and drafts therefore use extension-origin IndexedDB. Content scripts see only a random revision notification in browser storage and request redacted public settings through the worker. Chromium retains its existing restricted browser storage.
- Firefox supplies the native host manifest path and logical add-on ID as process arguments. The bridge authenticates that ID before accepting the requesting profile's strictly validated UUID origin. It atomically records the binding in private assistant state.
- The backend checks that exact binding for both CORS and request authorization, and still requires its bearer token and literal loopback host. No wildcard `moz-extension://` access is granted. Pairing another profile does not restart a running assistant or interrupt other browser jobs. Removing assistant state removes the bindings; a new setup creates a fresh token.

See Mozilla's [native messaging protocol](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) and [manifest locations](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests).

## Validation

Validation on Linux, 2026-11-13:

- Actual Firefox **159.0** and Zen **1.24.2b**: shared settings UI, real Python native startup/pairing, exact-origin/token denial, content-script settings isolation, a **65-second** simulated provider request with the popup closed, no processing tab, YouTube fixture subtitle delivery, cache reuse without another request, SRT download, asbplayer fixture delivery, legacy settings schema/pairing preservation, and cancellation. Final short runs also verified content-script IndexedDB isolation, rejection of injected public-storage settings, and settings persistence across a real extension reload.
- Chromium: existing full MV3 smoke, settings import, five-language UI, assistant popup, DeepInfra and Groq browser suites passed after the shared compatibility changes.
- **110 JavaScript tests and 77 Python tests passed.** They include build invariants, credential isolation, exact-origin CORS/authentication, atomic native pairing and separate Chromium/Gecko installer lifecycles. Windows registry installation is tested with a fake registry; no live Windows Gecko test has been performed.
- Mozilla `web-ext` 10.8.0 reported **0 errors and 1 warning** for the generated manifest/package. The shared localization code's existing assignment of bundled translations to `innerHTML` produces a warning; no remote HTML is introduced by the Gecko target.
- Audio extraction, YouTube responses, transcription providers and asbplayer traffic in browser tests are fixtures. Real external extraction, paid model calls, Windows Gecko, LibreWolf/Waterfox runtimes, Snap and store signing are not claimed as verified.

Reproduce the native Linux runtime checks after installing the project's development dependencies and building:

```sh
npm run test:gecko-browser
BUTTERCUP_GECKO_BROWSER=/path/to/zen npm run test:gecko-browser
```

The harness launches a disposable profile, registers a uniquely named temporary native host, uses synthetic keys and a separate assistant state directory, then removes them. It does not edit the installed Buttercup registration or normal browser profile. `BUTTERCUP_GECKO_HOST_DIR` adds a native host directory for a fork. `BUTTERCUP_GECKO_DELAY_MS` can shorten development runs; the default 65 seconds is used to test persistence beyond an event-page idle timeout. Runtime automation requires a browser version with the WebDriver BiDi extension commands; this testing requirement is separate from the extension's minimum version.

The first unsigned test build used an older ID. Export settings from that build before loading the UUID build: browsers treat a changed add-on ID as a separate extension. The installer accepts the legacy ID for migration and automatically registers both current browser identities. Appearance supports Auto (system), Light and Dark; it is saved and included in settings backups.

Subtitle fallback and regeneration update: 116 JavaScript tests pass, including cached DeepInfra segment-only formatting without network requests, estimated internal timing notices, Japanese/Chinese cue caps, and explicit cache bypass with retention of the prior result on provider failure. The DeepInfra and Groq browser suites exercise the Regenerate button using simulated services.

Original segmentation: “Keep provider segments (original timing)” preserves cached provider segment boundaries (including overlaps) and bypasses the cue word cap. Line wrapping remains independent; 0 preserves the returned text layout. Both layouts are available without a provider request.

Keyboard commands: Generate uses Alt+Shift+G and Regenerate uses Alt+Shift+U by default. Remap or disable them using the popup's Configure shortcuts button. Assignments are managed by the browser rather than exported with Buttercup settings. Commands share the same configuration checks, cache behavior and one-job-per-tab guard as the popup/player actions. Physical remapped Firefox key events and Chromium defaults were tested in isolated X11 windows.

Shortcut/bridge validation update: 118 JavaScript tests and 84 Python tests passed. Actual Chromium default-key events, Firefox custom-key events, and Flatpak Zen 1.24b native pairing through the optional host bridge were tested in disposable profiles. Helium Linux native-host registration is source/path-verified; no live Helium runtime test is claimed.
