# 🌼 Buttercup Revival

[English](README.md) · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · 繁體中文

> 本翻譯指南概述了 README；更多技術細節請參閱[英文完整版](README.md)。

**面向 Chromium 和 Gecko 瀏覽器的按需 YouTube 字幕轉錄工具。**

Buttercup Revival 使用你選擇的語音識別模型轉錄正在觀看的影片。你可以在播放器上顯示字幕、傳送到 [asbplayer](https://github.com/asbplayer/asbplayer)，或儲存為 `.srt`、`.vtt` 檔案。音訊在本機處理，然後傳送給你選擇的轉錄服務商。

[下載最新版本](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip) · [Firefox / Zen 指南（英語）](docs/GECKO_SETUP.md) · [英文 README](README.md)

## 功能

- 為沒有字幕或自動字幕質量較差的影片生成字幕，支援 DeepInfra、Groq、OpenRouter 和 OpenAI 相容 API。
- 根據語音內容劃分字幕，並可調整字幕長度和換行。
- 利用快取的轉錄結果調整排版或重新匯出，無需再次請求服務商。**重新生成**會請求新的轉錄。
- 本地助手使用 `yt-dlp` 和 FFmpeg 準備音訊；音訊和所需 API 金鑰只傳送給你選擇的服務商。
- 介面支援英語、巴西葡萄牙語、西班牙語、日語、簡體中文和繁體中文。

## 系統要求

Windows 10/11 或 Linux；Chromium 120+ 或 Gecko 140+ 桌面瀏覽器；語音服務商的 API 金鑰；約 1 GB 可用空間。安裝程式會在需要時安裝 Python、Node.js 和 FFmpeg。詳情請參閱 [Chromium 相容性](docs/BROWSERS.md)和 [Gecko 指南](docs/GECKO_SETUP.md)。

## 安裝

1. [下載完整 ZIP 包](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip)，解壓並將資料夾儲存在文件等固定位置。移動或刪除資料夾可能導致擴充套件無法執行。
2. **Windows：**雙擊 `Install Buttercup.cmd`。如果 Windows 阻止指令碼，請選擇**更多資訊 → 仍要執行**；如提示安裝 Node.js，請允許。
3. **Linux：**在解壓後的資料夾中開啟終端並執行：

   ```sh
   sh install.sh
   ```

   安裝程式使用 `apt`、`dnf`、`pacman` 或 `zypper`，並在安裝缺失的軟體包時請求密碼。
4. **Chromium、Chrome、Edge、Brave 等衍生瀏覽器：**開啟 `chrome://extensions`，啟用開發者模式，點選**載入已解壓的擴充套件程式**，選擇 `dist/chromium`，然後將 Buttercup 固定到工具欄。
5. **Firefox、Zen 和其他 Gecko 瀏覽器：**按照 [Gecko 安裝指南](docs/GECKO_SETUP.md)操作。完整包包含 `dist/firefox` 和 `dist/firefox-unsigned.zip`。Zen 在 `about:config` 中將 `xpinstall.signatures.required` 設為 `false` 後可以保留未簽名擴充套件；標準 Firefox Release 仍要求籤名。指南說明了不同版本及 Flatpak 連線方式。Linux 上的 Helium 使用 Chromium 版本，安裝程式會註冊助手路徑，但尚未完成 Helium 執行時測試。
6. 在 [Groq](https://console.groq.com/keys)、[DeepInfra](https://deepinfra.com/dash/api_keys)、[OpenRouter](https://openrouter.ai/keys) 或其他相容服務商處建立金鑰。開啟 Buttercup，點選 **Start and connect**，然後在 **Transcription** 中選擇服務商並貼上金鑰。

原生安裝的瀏覽器透過原生訊息機制連線助手；Snap 和 Flatpak 可能阻止該機制。Zen Flatpak 使用者可選擇 [Flatseal 自動連線](docs/GECKO_SETUP.md#method-a-automatic-connection-with-flatseal)或[手動連線](docs/GECKO_SETUP.md#method-b-manual-connection-without-extra-flatpak-permissions)。指南為英語。

## 生成第一份字幕

開啟 YouTube 影片，點選播放器上的粉色 **BC** 按鈕。提示會顯示處理進度，完成後字幕出現在影片上；再次點選可隱藏或顯示。首次耗時取決於服務商，以後可使用快取。重啟電腦後，請開啟 Buttercup 並點選 **Start and connect**。

如需替換人工字幕，請關閉 **Prefer human captions**。對於配音影片，在 **Audio track for transcription** 中選擇 **Original audio**。

## 與 asbplayer 配合使用

asbplayer 的 WebSocket 伺服器獨立於 Buttercup。安裝 [Go](https://go.dev/dl/) 和 [Git](https://git-scm.com/downloads)，然後執行：

```sh
git clone https://github.com/asbplayer/asbplayer.git
cd asbplayer/scripts/web-socket-server
go run .
```

使用期間保持終端開啟。在 asbplayer 中啟用 **Misc → WebSocket client**；在 Buttercup 的 **Integrations → asbplayer** 中檢查連線並啟用自動傳送。如只想顯示 asbplayer 的字幕，可關閉 Buttercup 的影片內字幕。詳情請參閱 [asbplayer 指南](https://docs.asbplayer.dev/docs/guides/web-socket-server)。

## 檔案與設定

使用 **Download SRT** 或 **Download VTT** 儲存當前字幕；啟用自動儲存後，生成字幕時會儲存 SRT。請選擇已有資料夾，或留空使用下載資料夾。同名檔案會被替換。

頂部選單可切換語言；**Auto** 跟隨瀏覽器語言。在 **Transcription** 中選擇服務商、金鑰和模型。如果模型支援，單詞時間戳有助於生成較短的字幕。在 **Subtitle layout** 中調整分段方式、字數或詞數上限及換行。只有片段時間戳時，片段內部的邊界時間可能經過估算。**Keep provider segments (original timing)** 保留服務商返回的片段邊界並忽略詞數上限；將換行設為 `0` 可保留返回的排版。日語和中文按字元計數，同時保留拉丁單詞和完整字素。

在 **Audio upload (advanced)** 中選擇分段傳送或完整音訊。預設格式為 16 kHz、單聲道、64 kbps MP3，也可選擇 16 kHz、單聲道、16 位 FLAC。FLAC 通常更大，不保證提高準確率；支援情況取決於服務商和模型。格式按服務商、模型等配置分別儲存，幷包含在設定備份中。使用 FLAC 需要更新並重啟助手。兩種格式共享字幕快取；要按所選格式重新傳送音訊，請選擇 **Regenerate subtitles**，服務商可能收費。短樣本測試會原樣上傳所選檔案，不進行轉換。

分段傳送使用 1.5 秒重疊，並遵守配置的大小上限，預設 24 MB。受限影片可在 **YouTube Authentication / Cookies** 中匯入 `cookies.txt`；只接受 YouTube 和 Google 的 Cookie，且儲存在本機。

預設快捷鍵為 **Alt+Shift+G** 生成字幕、**Alt+Shift+U** 重新生成。可在 **Keyboard shortcuts → Configure shortcuts** 中更改。瀏覽器單獨儲存快捷鍵，不包含在設定備份中；部分組合可能被瀏覽器佔用。

## 更新與匯入

下載[最新 ZIP](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip)，解壓覆蓋原資料夾並重新執行安裝程式。Chromium 使用者在 `chrome://extensions` 中重新載入擴充套件；Gecko 使用者按照[指南](docs/GECKO_SETUP.md)將新 ZIP 安裝到現有擴充套件上，無需先解除安裝。擴充套件 ID 固定，但沒有自動更新渠道。更新前可匯出設定作為備份。

匯入設定、Cookie、連線檔案以及測試音訊時，會開啟一個持久頁面。在該頁面選擇檔案後再點選相應按鈕；僅選擇檔案不會自動傳送。Cookie 持久儲存為可選功能，預設關閉。

## 故障排除

- **助手未連線：**在正確的資料夾中執行安裝程式並點選 **Start and connect**。Zen Flatpak 使用者需完成指南中的一種連線方式；手動連線時執行 `Start Buttercup assistant.sh` 並點選 **Check connection**。
- **沒有 BC 按鈕：**重新整理 YouTube 頁面並確認已啟用 Buttercup。
- **金鑰錯誤：**貼上所選服務商的金鑰。遇到 YouTube 身份驗證錯誤或 403 時，可嘗試匯入新的 Cookie。
- **字幕過長：**使用 Buttercup 分段模式並降低詞數上限；服務商原始片段模式不受該限制。
- **檔案過大：**選擇分段傳送。asbplayer 連線失敗時，檢查 WebSocket 伺服器和客戶端是否執行。
- 仍需幫助時，請附上錯誤資訊和復現步驟[提交 issue](https://github.com/arrow-poppa/buttercup-revival/issues)。

## 隱私、開發與致謝

音訊在本機轉換後傳送給所選服務商。API 金鑰儲存在擴充套件的私有儲存中；助手只接受經令牌授權的本地連線。社群快取可選，預設關閉。**設定備份包含 API 金鑰，請像保護密碼一樣保護備份檔案。**

解除安裝時，在 Windows 上執行 `Uninstall Buttercup.cmd`，或在 Linux 上執行 `.venv/bin/python scripts/setup-assistant.py --uninstall`，然後從瀏覽器刪除擴充套件並刪除資料夾。共享依賴仍會保留。

專案結構、構建與測試命令以及架構請參閱[英文 README](README.md#-for-developers)。每次執行安裝程式時，都會嘗試將 `yt-dlp` 和 `pytubefix` 更新到相容的最新穩定版本。

### 建置與測試

開發需要 Python 3.11+、Node.js 22+ 和 FFmpeg。在專案根目錄執行以下命令。兩個瀏覽器版本共用程式碼；Gecko 使用隱藏的背景頁面。助手註冊兩個固定 ID 並使用原生訊息機制。失敗的付費請求不會自動重試或轉送。

```sh
python -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
npm ci
npm run build
npm run package
npm test
.venv/bin/python -m pytest tests/backend -q
```

Buttercup Revival 是 [iGerman00 的 Buttercup](https://github.com/iGerman00/buttercup-chrome) 的現代化分支，使用了 [yt-dlp](https://github.com/yt-dlp/yt-dlp)、[pytubefix](https://github.com/JuanBindez/pytubefix)、[FFmpeg](https://ffmpeg.org/) 和 [FastAPI](https://fastapi.tiangolo.com/)。原專案未宣告許可證，本分支也未新增許可證；參閱 [UPSTREAM](docs/UPSTREAM.md)。
