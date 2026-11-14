# Set up Buttercup in Firefox, Zen, and other Gecko browsers

Buttercup Revival is a browser extension for **Chromium and Gecko**. This guide covers the Gecko build on Windows and Linux, including two ways to connect Zen Flatpak to the local assistant.

You will install two parts: the extension adds the BC button to YouTube; the assistant prepares audio on your computer. Installing an unsigned extension and connecting the assistant are separate steps. Changing a signature preference does not remove Flatpak's native-messaging restrictions.

## Choose your route

| Your browser | Install the extension | Connect the assistant |
| --- | --- | --- |
| Native Zen | Permanent unsigned installation below, or temporary installation | Click **Start and connect** |
| Standard Firefox release | Mozilla-signed package for permanent installation, or temporary installation | Click **Start and connect** in a native installation |
| Firefox ESR, Developer Edition, Nightly, or an unbranded build | Unsigned installation is possible in supported builds; see the signing table | Click **Start and connect** in a native installation |
| Zen Flatpak | Install as for Zen | Choose **Method A: automatic with Flatseal** or **Method B: manual connection** |
| Other modern Gecko forks | Check the signing table and browser requirements | Native messaging depends on the browser/package; see [compatibility details](firefox.md) |

Buttercup targets Gecko 140 or newer. Signing support alone does not establish that every fork/package has been tested with Buttercup. Native Firefox and native/Flatpak Zen have runtime validation; LibreWolf and Waterfox have not been individually runtime-tested.

## 1. Extract the right package

1. Extract the complete Buttercup project ZIP to a folder you intend to keep, such as Documents.
2. Open the extracted folder. It must contain `install.sh`, `scripts`, and `dist`. There may be another `Buttercup-Revival` folder inside the first one: open the one containing those files.
3. Check that `dist/firefox/manifest.json` and `dist/firefox-unsigned.zip` exist. An older Chromium-only package will not contain them. Download **v0.6.0 or later**, or [build from source](../README.md#-for-developers).

The **full project ZIP** contains the assistant and installers. The smaller **`dist/firefox-unsigned.zip`** contains only the extension. Select the smaller ZIP when installing the add-on; do not select the full project ZIP.

Keep the extracted project folder in place after installation. Moving it can break the assistant launcher.

## 2. Run the installer

**Windows:** double-click `Install Buttercup.cmd` in that folder.

**Linux:** open a terminal **inside that folder**, then run:

```sh
sh install.sh
```

Use your file manager's **Open in Terminal** action if available. Otherwise use `cd` to enter the folder first. For example, if you extracted directly into Downloads:

```sh
cd "$HOME/Downloads/Buttercup-Revival"
```

That path is only an example: use your actual folder. Keep quotes around paths containing spaces or `(1)`. If the prompt ends in `:~$`, you are usually still in your home folder, not the project.

The installer creates `.venv` and registers both browser engines automatically. Rerunning it reuses the environment and checks for updated dependencies. Wait until it reports that installation has finished.

## 3. Install the extension

### Keep an unsigned extension installed in Zen

Zen can keep an unsigned extension installed across browser restarts when signature enforcement is disabled:

1. Open a new tab and enter `about:config`.
2. Accept the configuration warning.
3. Search for `xpinstall.signatures.required`.
4. Set its value to **`false`**.
5. Open `about:addons`, or press **Ctrl+Shift+A**.
6. Open the gear menu and choose **Install Add-on From File…**.
7. Select **`dist/firefox-unsigned.zip`** from the extracted project and approve installation.
8. Open Buttercup from the extensions menu; pin its icon if you want easy access.

Buttercup already includes the explicit Gecko add-on ID needed for persistent installation. The ZIP and unpacked Firefox folder use the **same ID**. Renaming a ZIP to `.xpi` does not sign it.

This preference disables signature enforcement for the browser profile, so use extensions you trust. Zen's [official build configuration](https://github.com/zen-browser/desktop/blob/dev/configs/common/mozconfig) permits unsigned add-ons, and this path has been tested with Zen. It is different from standard Firefox release builds.

### Which other browsers allow this?

| Browser/build | Can the preference allow permanent unsigned extensions? | Evidence |
| --- | --- | --- |
| **Zen** | Yes: set `xpinstall.signatures.required` to `false` | Official build configuration and Zen runtime testing |
| **Standard Firefox release** | **No.** Changing the preference does not bypass the release build's signature requirement | Mozilla documentation |
| **Firefox ESR** | Yes, according to Mozilla, in supported ESR builds | Mozilla documentation; not independently runtime-tested here |
| **Firefox Developer Edition / Nightly** | Yes, for testing | Mozilla documentation; not independently runtime-tested here |
| **Unbranded Firefox builds** | Yes, when built with signature enforcement disabled | Mozilla documentation; not independently runtime-tested here |
| **LibreWolf** | Its official build configuration allows unsigned add-ons; the preference can control enforcement | Source-verified, not independently runtime-tested here |
| **Modern Waterfox** | Its official desktop build configuration allows unsigned add-ons; the preference can control enforcement | Source-verified, not independently runtime-tested here |

Check your actual browser edition and package. A fork name or the existence of the preference alone is not proof that a binary honors it. Older forks, third-party builds, and distribution policies can differ. This table concerns signing, not guaranteed Buttercup compatibility or native-host support.

Sources: [Mozilla: add-on signing](https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox), [Zen build configuration](https://github.com/zen-browser/desktop/blob/dev/configs/common/mozconfig), [LibreWolf build configuration](https://librewolf.dev/librewolf/source/src/branch/main/assets/mozconfig.new), [Waterfox shared desktop build configuration](https://github.com/BrowserWorks/Waterfox/blob/current/waterfox/build/mozconfig.common). Checked on 2026-11-13.

### Temporary installation, including standard Firefox

If you do not want to change signing settings, or your build enforces signatures:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select **`dist/firefox/manifest.json`**.

This installation is removed when the browser exits. For permanent installation in standard release Firefox, obtain a Mozilla-signed package. Maintainers can use Mozilla's [self-distribution signing process](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) without listing the extension publicly.

## 4. Connect the assistant

**Native browser installation:** open Buttercup and click **Start and connect**. The badge should become **Connected**. You do not need either Flatpak method below.

**Zen Flatpak:** choose one of the following methods. Both use the same assistant and preserve your provider settings.

### Method A: automatic connection with Flatseal

Choose this if you want **Start and connect** to launch the assistant, including after restarting your computer.

#### A1. Prepare the launcher once

Open a terminal **in the installed Buttercup project folder**, as in step 2. Run:

```sh
.venv/bin/python scripts/setup-assistant.py --flatpak-bridge app.zen_browser.zen
```

Wait for **Flatpak launcher prepared**. The command creates the bridge but does not change Flatpak permissions. Running it again updates the launcher.

#### A2. Add the two Flatseal entries

Open **Flatseal** and select **Zen** (`app.zen_browser.zen`) in the application list, not All Applications.

| Find this section | Add this exact value |
| --- | --- |
| **Session Bus → Talks** | `org.freedesktop.Flatpak` |
| **Persistent → Files** | `.mozilla` |

For each entry, use the section's **+** or add-entry button, enter the value, and confirm it. Keep existing entries such as `.zen`.

**These are text entries, not the D-Bus switches in the Socket section.** You do not need to enable the entire session bus, entire system bus, All user files, or All filesystem files. The first value is case-sensitive; the second starts with a dot and has no slash.

The Session Bus permission lets Zen execute host programs generally, not only Buttercup. Use Method B if you prefer to leave that permission disabled. The tested route uses Zen's default filesystem permissions; broad custom home-directory overrides can interfere with persistence mapping. See [Flatseal's own permission reference](https://github.com/tchx84/Flatseal/blob/master/DOCUMENTATION.md).

#### A3. Restart and connect

1. Fully quit Zen, including its other windows/background instance.
2. Open Zen again.
3. Open Buttercup and click **Start and connect**.
4. Confirm that the badge says **Connected**.

From now on, use **Start and connect** normally. After restarting the computer, it can launch the assistant again; no connection file or terminal is needed.

### Method B: manual connection without extra Flatpak permissions

Choose this if you want to keep Zen's default sandbox permissions. You prepare a connection file once and start the assistant with its helper after computer restarts.

#### B1. Copy the browser connection origin

1. Open Buttercup in the browser profile you want to use.
2. Expand **Connect without native messaging**.
3. Click **Copy origin**.

Use that button's value. Do not copy **Extension ID** from How to connect: the connection origin begins with `moz-extension://` and identifies this browser profile.

#### B2. Create the private connection file

1. In the extracted project folder, run **Set up Buttercup assistant.sh**. If your file manager opens the script as text, run `sh "Set up Buttercup assistant.sh"` in a terminal opened in that folder.
2. Find **Flatpak / Snap: connect manually** in the setup window.
3. Paste the origin into its field.
4. Click **Start assistant and save connection file**.
5. Save the JSON file somewhere easy to find, such as Downloads.

The helper starts the assistant in the background. You do not have to leave the terminal open.

#### B3. Import and check the connection

1. Return to Buttercup → **Connect without native messaging**.
2. Click **Open connection editor**. A tab opens so the file picker can stay open when the popup closes.
3. Choose the JSON file you just saved.
4. Click **Import connection**.
5. Check for **Assistant connected** / **Connected**.
6. Delete the JSON file afterward: it contains your private local assistant token.

The imported connection stays saved for that profile. Changing provider or subtitle settings does not remove it. A new browser profile needs a new file. Settings backups intentionally exclude the local connection.

#### B4. After restarting the computer

Run **Start Buttercup assistant.sh** from the same project folder. If needed, open a terminal there and run:

```sh
sh "Start Buttercup assistant.sh"
```

Then click **Check connection** in Buttercup. You do not have to create/import the JSON file again after every restart. With this method, **Start and connect** still attempts native messaging; use the helper and **Check connection** instead.

## 5. Generate your first subtitles

1. Choose a provider in **Transcription** and enter its API key.
2. Open a YouTube video.
3. Click the **BC** button on the player, or **Generate captions** in Buttercup.
4. Wait for the completion message.

**Generate** reuses a cached transcript when available. **Regenerate subtitles** explicitly requests a fresh transcription and may incur provider charges. Under **Start a new subtitle**, choose original provider segments or let Buttercup regroup them. Layout changes can use the existing cache.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| `.venv/bin/python: No such file or directory` | You are in the wrong folder, or the installer has not finished. Open the folder containing `install.sh` and `scripts`, open a terminal there, and run `sh install.sh` if `.venv` is missing. Do not run the relative command from `~`. |
| `unrecognized arguments: --flatpak-bridge` | You are running an older package or a script from another extracted copy. Use the updated dual-browser package and its project folder. |
| The unsigned extension is rejected | Select `dist/firefox-unsigned.zip`, not the full project archive. Check the browser/build table and the signing preference. Standard release Firefox needs a signed package or temporary loading. |
| The extension disappears after restarting the browser | It was loaded temporarily. Use a permanent installation supported by that browser, or a signed package. |
| The extension is installed but the assistant cannot connect | This is a different issue from signing. Native users should rerun the installer; Flatpak users should finish Method A or B. |
| Method A still cannot connect | Confirm the launcher command succeeded, both Flatseal entries were added to Zen itself, and Zen was fully restarted. Keep the project folder in place. Custom filesystem overrides may require reverting to the manual route. |
| Method B says the file belongs to another profile | Copy the origin from the current profile and generate a new connection file. |
| Method B worked before a computer restart | Run `Start Buttercup assistant.sh`, then **Check connection**. No re-import is normally needed. |

For tested versions, limitations, manual CLI options, and the security design, see [Gecko technical and compatibility notes](firefox.md).
