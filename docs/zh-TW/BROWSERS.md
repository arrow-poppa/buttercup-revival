# Chromium 瀏覽器設定

對於 Firefox、Zen、LibreWolf 和其他 Gecko 瀏覽器，請使用 `dist/firefox` 和 [Gecko 設定指南](GECKO_SETUP.md)。本頁說明 Chromium。

Buttercup 以 Windows 和 Linux 上支援未封裝 Manifest V3 擴充功能、離屏文件與原生訊息傳遞的桌面 Chromium 瀏覽器（Chromium 120 或更新版本）為目標。分支可能會停用這些 API 或限制擴充功能；僅共用轉譯引擎並不能保證相容性。不支援行動瀏覽器和 macOS 安裝程式。

## 自動註冊

在 Windows 上執行 `Install Buttercup.cmd`，或在 Linux 上執行 `sh install.sh`，然後從瀏覽器的擴充功能頁面（`chrome://extensions` 或瀏覽器對應的頁面）載入 `dist/chromium`。在 Buttercup 中按一下 **啟動並連線**。

在 Linux 上，安裝程式會在 `$XDG_CONFIG_HOME`（預設：`~/.config`）下註冊下列設定目錄：

| 系列 | 目錄 |
| --- | --- |
| Chrome | `google-chrome`, `google-chrome-beta`, `google-chrome-unstable`, `google-chrome-for-testing` |
| Chromium | `chromium`, `chromium-browser`, `ungoogled-chromium` |
| Edge | `microsoft-edge`, `microsoft-edge-beta`, `microsoft-edge-dev` |
| Brave | `BraveSoftware/Brave-Browser`, `BraveSoftware/Brave-Browser-Beta`, `BraveSoftware/Brave-Browser-Nightly` |
| Brave Origin | `BraveSoftware/Brave-Origin`, `BraveSoftware/Brave-Origin-Beta`, `BraveSoftware/Brave-Origin-Nightly` |
| Vivaldi | `vivaldi`, `vivaldi-snapshot` |
| Opera | `opera`, `opera-beta`, `opera-developer` |
| Thorium | `thorium` |

Windows 註冊使用目前使用者的 Chrome、Chromium 和 Edge 登錄機碼。Brave、Vivaldi 和許多其他分支會重複使用 Chrome 的註冊。關於底層註冊慣例，請參閱 [Chrome 的原生訊息傳遞規格](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)和 [KeePassXC 的瀏覽器註冊實作](https://github.com/keepassxreboot/keepassxc/blob/develop/src/browser/NativeMessageInstaller.cpp)。

此清單描述安裝程式的涵蓋範圍，並不聲稱每個瀏覽器/通道都已進行端對端測試。不會變更系統層級檔案或瀏覽器設定。

## 其他分支和可攜式安裝

找到瀏覽器文件說明的原生訊息傳遞主機位置。在 Linux 上，使用絕對路徑新增其 **NativeMessagingHosts 目錄**：

```sh
.venv/bin/python scripts/setup-assistant.py \
  --native-host-dir "$HOME/.config/MyChromiumFork/NativeMessagingHosts"
```

在 Windows 上，如果瀏覽器使用個別的登錄機碼，請傳入**相對於 `HKEY_CURRENT_USER\Software`** 的瀏覽器特定路徑：

```powershell
.venv\Scripts\python.exe scripts/setup-assistant.py --browser-registry-key 'Vendor\Browser'
```

這會建立 `HKCU\Software\Vendor\Browser\NativeMessagingHosts\app.buttercup.assistant`。直接讀取資訊清單目錄的 Windows 分支也可以使用 `--native-host-dir` 並傳入絕對 Windows 路徑。

兩個旗標都可以重複使用。自訂位置在重新執行安裝程式後仍會保留，並會由 `--uninstall` 刪除。重新安裝會保留配對權杖和先前授權的擴充功能 ID。如果你的瀏覽器指派了不同的擴充功能 ID，請附加 `--extension-id ID_FROM_THE_POPUP`。

## Flatpak、Snap 和沒有原生訊息傳遞的瀏覽器

自動啟動需要權限來啟動主機端的助理。沙箱化的瀏覽器套件即使存在資訊清單，也可能阻止這一點。Buttercup 不會削弱沙箱，也不會授予不受限制的主機執行權限。

請使用原生瀏覽器套件實現自動啟動；或者，如果瀏覽器允許回送網路和所需的擴充功能 API，請在主機上執行後端並手動配對：

1. 從彈出式視窗的 **如何連線** 中複製擴充功能 ID。
2. 在主機上的終端機中啟動後端：

   ```sh
   .venv/bin/python -m backend.app --extension-id YOUR_EXTENSION_ID --show-token
   ```

   在 Windows 上，請改用 `.venv\Scripts\python.exe`。如果助理已在執行，請先停止該執行個體，或使用 `--port` 和 `--state-dir` 選擇其他連接埠和狀態目錄。
3. 在 **本機連線 — 高階選項** 中，輸入 `http://127.0.0.1:8767`（或所選連接埠）和顯示的配對權杖。按一下 **檢查助手**。保持終端機執行。後續檢查請使用 **檢查連線**；**啟動並連線** 會再次呼叫原生訊息傳遞。

請僅將配對權杖複製到 Buttercup 的密碼欄位中；不要將其包含在螢幕擷取畫面、問題報告或 URL 中。此手動方式仍會執行相同的回送繫結、權杖驗證和擴充功能來源允許清單。它無法復原瀏覽器已停用的擴充功能 API。

## Helium

在 Linux 上使用原生 Helium 搭配 `dist/chromium`。Helium 的[原生訊息傳遞相容修補程式](https://github.com/imputnet/helium/blob/main/patches/helium/core/scan-chrome-native-messaging-hosts.patch)會退回搜尋 Chrome 的每使用者主機目錄。Buttercup 會註冊該 Chrome 位置以及 Helium 自己的 `$XDG_CONFIG_HOME/net.imput.helium/NativeMessagingHosts` 目錄，因此預期助理無須其他註冊格式即可啟動。這是經原始碼核實的相容性，而非 Helium 的實際執行結果。Windows 上的 Helium 尚未驗證；macOS 上的助理安裝仍不受支援。第三方沙箱套件可能仍需要手動連線。
