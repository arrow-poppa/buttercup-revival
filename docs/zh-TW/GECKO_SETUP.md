# 在 Firefox、Zen 和其他 Gecko 瀏覽器中設定 Buttercup

Buttercup Revival 是一款適用於 **Chromium 和 Gecko** 的瀏覽器擴充功能。本指南說明 Windows 和 Linux 上的 Gecko 建置，包括將 Zen Flatpak 連線到本機助理的兩種方法。

你將安裝兩個部分：擴充功能在 YouTube 中加入 BC 按鈕；助理在你的電腦上準備音訊。安裝未簽署擴充功能和連線助理是兩個獨立的步驟。變更簽章偏好設定不會解除 Flatpak 的原生訊息傳遞限制。

## 選擇你的方式

| 你的瀏覽器 | 安裝擴充功能 | 連線助理 |
| --- | --- | --- |
| 原生 Zen | 下方的永久未簽署安裝，或臨時安裝 | 按一下 **Start and connect** |
| 標準 Firefox 發行版 | 用於永久安裝的 Mozilla 簽署套件，或臨時安裝 | 在原生安裝中按一下 **Start and connect** |
| Firefox ESR、Developer Edition、Nightly 或無品牌建置 | 受支援的建置可以未簽署安裝；請參閱簽章表 | 在原生安裝中按一下 **Start and connect** |
| Zen Flatpak | 依 Zen 的方式安裝 | 選擇**方法 A：使用 Flatseal 自動連線**或**方法 B：手動連線** |
| 其他現代 Gecko 分支 | 檢查簽章表和瀏覽器需求 | 原生訊息傳遞取決於瀏覽器/套件；請參閱[相容性詳情](../firefox.md) |

Buttercup 以 Gecko 140 或更新版本為目標。僅有簽章支援並不能證明每個分支/套件都已用 Buttercup 測試過。原生 Firefox 和原生/Flatpak Zen 已完成實際執行驗證；LibreWolf 和 Waterfox 未個別進行實際執行測試。

<a id="extract"></a>
## 1. 解壓縮正確的套件

1. 將完整的 Buttercup 專案 ZIP 解壓縮到你打算長期保留的資料夾，例如文件。
2. 開啟解壓縮後的資料夾。它必須包含 `install.sh`、`scripts` 和 `dist`。第一個資料夾內可能還有另一個 `Buttercup-Revival` 資料夾：請開啟包含這些檔案的那個。
3. 檢查 `dist/firefox/manifest.json` 和 `dist/firefox-unsigned.zip` 是否存在。舊的僅 Chromium 套件不會包含它們。請下載 **v0.6.0 或更新版本**，或[從原始碼建置](../../README.zh-TW.md#developers)。

**完整專案 ZIP** 包含助理和安裝程式。較小的 **`dist/firefox-unsigned.zip`** 僅包含擴充功能。安裝附加元件時請選擇較小的 ZIP；不要選擇完整專案 ZIP。

安裝後請將解壓縮後的專案資料夾保留在原位。移動它可能會破壞助理啟動器。

## 2. 執行安裝程式

**Windows：** 在該資料夾中按兩下 `Install Buttercup.cmd`。

**Linux：** 在該資料夾**內部**開啟終端機，然後執行：

```sh
sh install.sh
```

如果檔案管理員有**在終端機中開啟**動作，請使用它。否則先用 `cd` 進入該資料夾。例如，如果你直接解壓縮到下載資料夾：

```sh
cd "$HOME/Downloads/Buttercup-Revival"
```

該路徑只是範例：請使用你的實際資料夾。包含空格或 `(1)` 的路徑請保留引號。如果提示字元以 `:~$` 結尾，通常你仍在家目錄中，而不是專案資料夾。

安裝程式會建立 `.venv` 並自動註冊兩個瀏覽器引擎。再次執行會重複使用環境並檢查相依性更新。請等待它回報安裝完成。

## 3. 安裝擴充功能

### 在 Zen 中保留未簽署擴充功能

當簽章強制關閉時，Zen 可以在瀏覽器重新啟動後保留已安裝的未簽署擴充功能：

1. 開啟新分頁並輸入 `about:config`。
2. 接受設定警告。
3. 搜尋 `xpinstall.signatures.required`。
4. 將其值設為 **`false`**。
5. 開啟 `about:addons`，或按 **Ctrl+Shift+A**。
6. 開啟齒輪選單並選擇**從檔案安裝附加元件…**。
7. 從解壓縮後的專案中選擇 **`dist/firefox-unsigned.zip`** 並核准安裝。
8. 從擴充功能選單開啟 Buttercup；如需方便存取，請釘選其圖示。

Buttercup 已包含永久安裝所需的明確 Gecko 附加元件 ID。ZIP 和解壓縮後的 Firefox 資料夾使用**相同的 ID**。將 ZIP 重新命名為 `.xpi` 並不會為其簽署。

此偏好設定會為該瀏覽器設定檔關閉簽章強制，因此請只使用你信任的擴充功能。Zen 的[官方建置設定](https://github.com/zen-browser/desktop/blob/dev/configs/common/mozconfig)允許未簽署附加元件，此方式已在 Zen 中測試。它與標準 Firefox 發行版不同。

<a id="other-browsers"></a>
### 還有哪些瀏覽器允許這樣做？

| 瀏覽器/建置 | 此偏好設定能否允許永久未簽署擴充功能？ | 證據 |
| --- | --- | --- |
| **Zen** | 可以：將 `xpinstall.signatures.required` 設為 `false` | 官方建置設定和 Zen 實際執行測試 |
| **標準 Firefox 發行版** | **不能。** 變更偏好設定不會繞過發行版的簽章要求 | Mozilla 文件 |
| **Firefox ESR** | 可以，根據 Mozilla 文件，在受支援的 ESR 建置中 | Mozilla 文件；此處未個別進行實際執行測試 |
| **Firefox Developer Edition / Nightly** | 可以，用於測試 | Mozilla 文件；此處未個別進行實際執行測試 |
| **無品牌 Firefox 建置** | 可以，在停用簽章強制的情況下建置時 | Mozilla 文件；此處未個別進行實際執行測試 |
| **LibreWolf** | 其官方建置設定允許未簽署附加元件；此偏好設定可以控制強制 | 已核實原始碼；此處未個別進行實際執行測試 |
| **現代 Waterfox** | 其官方桌面建置設定允許未簽署附加元件；此偏好設定可以控制強制 | 已核實原始碼；此處未個別進行實際執行測試 |

請檢查你實際的瀏覽器版本和套件。分支名稱或偏好設定的存在並不能證明某個二進位檔會遵循它。較舊的分支、第三方建置和發行版原則可能有所不同。此表涉及簽章，不保證 Buttercup 相容性或原生主機支援。

來源：[Mozilla：附加元件簽章](https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox)、[Zen 建置設定](https://github.com/zen-browser/desktop/blob/dev/configs/common/mozconfig)、[LibreWolf 建置設定](https://librewolf.dev/librewolf/source/src/branch/main/assets/mozconfig.new)、[Waterfox 共用桌面建置設定](https://github.com/BrowserWorks/Waterfox/blob/current/waterfox/build/mozconfig.common)。檢查於 2026-11-13。

### 臨時安裝（包括標準 Firefox）

如果你不想變更簽章設定，或你的建置強制要求簽章：

1. 開啟 `about:debugging#/runtime/this-firefox`。
2. 按一下**臨時載入附加元件…**。
3. 選擇 **`dist/firefox/manifest.json`**。

此安裝會在瀏覽器結束時移除。若要在標準 Firefox 發行版中永久安裝，請取得 Mozilla 簽署的套件。維護者可以使用 Mozilla 的[自行散佈簽章流程](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)，而無須公開列出該擴充功能。

<a id="connect"></a>
## 4. 連線助理

**原生瀏覽器安裝：** 開啟 Buttercup 並按一下 **Start and connect**。徽章應變成 **Connected**。你不需要下列任一 Flatpak 方法。

**Zen Flatpak：** 選擇下列方法之一。兩者使用相同的助理，並保留你的供應商設定。

<a id="flatseal"></a>
### 方法 A：使用 Flatseal 自動連線

如果你希望 **Start and connect** 啟動助理（包括重新啟動電腦後），請選擇此方法。

#### A1. 準備一次啟動器

如步驟 2 所述，在**已安裝的 Buttercup 專案資料夾中**開啟終端機。執行：

```sh
.venv/bin/python scripts/setup-assistant.py --flatpak-bridge app.zen_browser.zen
```

等待 **Flatpak launcher prepared**。此命令會建立橋接，但不會變更 Flatpak 權限。再次執行會更新啟動器。

#### A2. 新增兩個 Flatseal 項目

開啟 **Flatseal**，在應用程式清單中選擇 **Zen**（`app.zen_browser.zen`），而不是「所有應用程式」。

| 找到此區段 | 新增此確切值 |
| --- | --- |
| **Session Bus → Talks** | `org.freedesktop.Flatpak` |
| **Persistent → Files** | `.mozilla` |

對於每個項目，使用該區段的 **+** 或新增項目按鈕，輸入值並確認。保留現有項目，例如 `.zen`。

**這些是文字項目，不是 Socket 區段中的 D-Bus 開關。** 你不需要啟用整個工作階段匯流排、整個系統匯流排、所有使用者檔案或所有檔案系統檔案。第一個值區分大小寫；第二個以點開頭且不含斜線。

工作階段匯流排權限允許 Zen 一般性地執行主機程式，而不僅是 Buttercup。如果你希望保持該權限關閉，請使用方法 B。已測試的方式使用 Zen 的預設檔案系統權限；廣泛的自訂家目錄覆寫可能會干擾持續性對應。請參閱 [Flatseal 的權限參考](https://github.com/tchx84/Flatseal/blob/master/DOCUMENTATION.md)。

#### A3. 重新啟動並連線

1. 完全結束 Zen，包括其他視窗和背景執行個體。
2. 再次開啟 Zen。
3. 開啟 Buttercup 並按一下 **Start and connect**。
4. 確認徽章顯示 **Connected**。

此後，正常使用 **Start and connect**。重新啟動電腦後，它可以再次啟動助理；不需要連線檔案或終端機。

<a id="manual"></a>
### 方法 B：不增加 Flatpak 權限的手動連線

如果你希望保留 Zen 的預設沙箱權限，請選擇此方法。你只需準備一次連線檔案，然後在電腦重新啟動後使用其輔助程式啟動助理。

#### B1. 複製瀏覽器連線來源

1. 在你要使用的瀏覽器設定檔中開啟 Buttercup。
2. 展開 **Connect without native messaging**。
3. 按一下 **Copy origin**。

使用該按鈕的值。不要複製 How to connect 中的 **Extension ID**：連線來源以 `moz-extension://` 開頭，用於識別此瀏覽器設定檔。

#### B2. 建立私人連線檔案

1. 在解壓縮後的專案資料夾中，執行 **Set up Buttercup assistant.sh**。如果你的檔案管理員以文字方式開啟指令碼，請在該資料夾中開啟的終端機裡執行 `sh "Set up Buttercup assistant.sh"`。
2. 在設定視窗中找到 **Flatpak / Snap: connect manually**。
3. 將連線來源貼到其欄位中。
4. 按一下 **Start assistant and save connection file**。
5. 將 JSON 檔案儲存到容易找到的位置，例如下載資料夾。

輔助程式會在背景啟動助理。你不需要讓終端機保持開啟。

#### B3. 匯入並檢查連線

1. 返回 Buttercup → **Connect without native messaging**。
2. 按一下 **Open connection editor**。會開啟一個分頁，以便彈出式視窗關閉時檔案選擇器仍保持開啟。
3. 選擇你剛剛儲存的 JSON 檔案。
4. 按一下 **Import connection**。
5. 檢查是否顯示 **Assistant connected** / **Connected**。
6. 之後刪除該 JSON 檔案：它包含你的私人本機助理權杖。

匯入的連線會為該設定檔保留。變更供應商或字幕設定不會移除它。新的瀏覽器設定檔需要新檔案。設定備份會刻意排除本機連線。

#### B4. 重新啟動電腦後

從同一專案資料夾執行 **Start Buttercup assistant.sh**。如有需要，在那裡開啟終端機並執行：

```sh
sh "Start Buttercup assistant.sh"
```

然後在 Buttercup 中按一下 **Check connection**。你不需要在每次重新啟動後重新建立/匯入 JSON 檔案。使用此方法時，**Start and connect** 仍會嘗試原生訊息傳遞；請改用輔助程式和 **Check connection**。

## 5. 產生你的第一批字幕

1. 在 **Transcription** 中選擇供應商並輸入其 API 金鑰。
2. 開啟一個 YouTube 影片。
3. 按一下播放器上的 **BC** 按鈕，或 Buttercup 中的 **Generate captions**。
4. 等待完成訊息。

**Generate** 在可用時重複使用快取的轉錄。**Regenerate subtitles** 明確要求新的轉錄，可能產生供應商費用。在 **Start a new subtitle** 下，選擇供應商原始分段或讓 Buttercup 重新分組。版面變更可以使用現有快取。

## 如果發生問題

| 你看到的情況 | 該怎麼做 |
| --- | --- |
| `.venv/bin/python: No such file or directory` | 你在錯誤的資料夾中，或安裝程式尚未完成。開啟包含 `install.sh` 和 `scripts` 的資料夾，在那裡開啟終端機，如果缺少 `.venv`，請執行 `sh install.sh`。不要從 `~` 執行相對命令。 |
| `unrecognized arguments: --flatpak-bridge` | 你正在執行舊套件或另一份解壓縮副本中的指令碼。請使用更新後的雙瀏覽器套件及其專案資料夾。 |
| 未簽署擴充功能被拒絕 | 選擇 `dist/firefox-unsigned.zip`，而不是完整專案封存檔。檢查瀏覽器/建置表和簽章偏好設定。標準 Firefox 發行版需要簽署套件或臨時載入。 |
| 重新啟動瀏覽器後擴充功能消失 | 它是臨時載入的。請使用該瀏覽器支援的永久安裝，或簽署套件。 |
| 擴充功能已安裝但助理無法連線 | 這與簽章是不同的問題。原生使用者應重新執行安裝程式；Flatpak 使用者應完成方法 A 或 B。 |
| 方法 A 仍無法連線 | 確認啟動器命令成功、兩個 Flatseal 項目已新增到 Zen 本身，且 Zen 已完全重新啟動。保持專案資料夾在原位。自訂檔案系統覆寫可能需要改回手動方式。 |
| 方法 B 提示檔案屬於另一個設定檔 | 從目前設定檔複製連線來源並產生新的連線檔案。 |
| 方法 B 在重新啟動電腦前可用 | 執行 `Start Buttercup assistant.sh`，然後按一下 **Check connection**。通常不需要重新匯入。 |

關於已測試版本、限制、手動 CLI 選項和安全設計，請參閱 [Gecko 技術與相容性說明](../firefox.md)。
