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

**This is an unsigned development build.** Temporary add-ons are unloaded when the browser exits. Normal permanent installation in release Firefox/Zen needs Mozilla signing (listed or self-distributed XPI). No signing, store submission or release publication is performed by this change. Do not disable browser security settings to install it. See Mozilla's [extension distribution guide](https://extensionworkshop.com/documentation/publish/distribute-sideloading/).

The manifest declares transmission of authentication information, website content and browsing activity: selected provider credentials, requested video/audio/subtitles, and explicitly imported YouTube cookies go only to their configured destinations. This is not telemetry. The minimum desktop version is 140 to support the declaration; the Android metadata minimum only satisfies manifest compatibility checks and does **not** add mobile/Android assistant support.

## Browser families and native messaging

| Browser/package | Registration and validation |
| --- | --- |
| Native Firefox / ESR | Mozilla locations; Linux Firefox 159.0 tested with the real Python native host |
| Native Zen | Shares Mozilla locations; portable Linux Zen 1.24.2b tested with the real Python native host |
| LibreWolf | Mozilla Windows registry; separate LibreWolf Linux locations registered; no live LibreWolf runtime test |
| Other modern Gecko forks (including Waterfox) | Same build when required WebExtension APIs are available; custom registration supported; not individually runtime-verified |
| Flatpak / Snap | Native-process sandbox/portal support varies; not validated. Copying a host manifest alone cannot grant permission to execute the assistant |
| Android, macOS installers, old non-WebExtension forks | Unsupported by the existing assistant installation flow |

The installer writes separate manifests because Chromium uses `allowed_origins`, while Firefox uses `allowed_extensions`. Linux defaults include `~/.mozilla/native-messaging-hosts`, `~/.librewolf/native-messaging-hosts`, and the `mozilla/native-messaging-hosts` and `librewolf/native-messaging-hosts` directories under `$XDG_CONFIG_HOME` (default `~/.config`). Windows uses `HKCU\Software\Mozilla\NativeMessagingHosts`, alongside the unchanged Chromium registrations. Zen's [native-host lookup discussion](https://github.com/zen-browser/desktop/issues/10622) and [LibreWolf's native messaging notes](https://librewolf.net/docs/faq/#how-do-i-get-native-messaging-to-work) explain why browser profile-folder names are not sufficient to determine these paths.

For forks or portable packages with a different **verified** location:

```sh
.venv/bin/python scripts/setup-assistant.py --gecko-host-dir /absolute/path/to/native-messaging-hosts
```

On Windows, use `.venv\Scripts\python.exe` and, when needed, `--gecko-registry-key "Vendor\Browser"`. These Gecko-specific options are repeatable, remembered across reinstalls, and removed by uninstall. Keep them separate from Chromium's `--native-host-dir` / `--browser-registry-key`: using the same host manifest location for both formats is rejected.

### Manual connection when native startup is unavailable

If a sandboxed browser permits loopback HTTP but cannot launch native programs, the existing manual backend can explicitly authorize its profile origin. In `about:debugging`, inspect Buttercup and evaluate `browser.runtime.getURL('').slice(0, -1)` in the extension console. This yields `moz-extension://<UUID>`; it is **not** the logical add-on ID displayed in the popup.

```sh
.venv/bin/python -m backend.app --firefox-origin moz-extension://YOUR-PROFILE-UUID --show-token
```

Copy the resulting local token into Buttercup's advanced connection fields. Keep it private. Repeat `--firefox-origin` or `--extension-id` for additional explicitly authorized profiles. Profile recreation can change the UUID and require pairing again. This fallback does not bypass the browser's sandbox or networking restrictions.

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
- **109 JavaScript tests and 76 Python tests passed.** They include build invariants, credential isolation, exact-origin CORS/authentication, atomic native pairing and separate Chromium/Gecko installer lifecycles. Windows registry installation is tested with a fake registry; no live Windows Gecko test has been performed.
- Mozilla `web-ext` 10.8.0 reported **0 errors and 1 warning** for the generated manifest/package. The shared localization code's existing assignment of bundled translations to `innerHTML` produces a warning; no remote HTML is introduced by the Gecko target.
- Audio extraction, YouTube responses, transcription providers and asbplayer traffic in browser tests are fixtures. Real external extraction, paid model calls, Windows Gecko, LibreWolf/Waterfox runtimes, Flatpak/Snap and store signing are not claimed as verified.

Reproduce the native Linux runtime checks after installing the project's development dependencies and building:

```sh
npm run test:gecko-browser
BUTTERCUP_GECKO_BROWSER=/path/to/zen npm run test:gecko-browser
```

The harness launches a disposable profile, registers a uniquely named temporary native host, uses synthetic keys and a separate assistant state directory, then removes them. It does not edit the installed Buttercup registration or normal browser profile. `BUTTERCUP_GECKO_HOST_DIR` adds a native host directory for a fork. `BUTTERCUP_GECKO_DELAY_MS` can shorten development runs; the default 65 seconds is used to test persistence beyond an event-page idle timeout. Runtime automation requires a browser version with the WebDriver BiDi extension commands; this testing requirement is separate from the extension's minimum version.

The first unsigned test build used an older ID. Export settings from that build before loading the UUID build: browsers treat a changed add-on ID as a separate extension. The installer accepts the legacy ID for migration and automatically registers both current browser identities. Appearance supports Auto (system), Light and Dark; it is saved and included in settings backups.
