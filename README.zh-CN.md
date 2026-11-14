# 🌼 Buttercup Revival

[English](README.md) · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md) · [日本語](README.ja.md) · 简体中文 · [繁體中文](README.zh-TW.md)

> 本翻译指南概述了 README；更多技术细节请参阅[英文完整版](README.md)。

**面向 Chromium 和 Gecko 浏览器的按需 YouTube 字幕转录工具。**

Buttercup Revival 使用你选择的语音识别模型转录正在观看的视频。你可以在播放器上显示字幕、发送到 [asbplayer](https://github.com/asbplayer/asbplayer)，或保存为 `.srt`、`.vtt` 文件。音频在本机处理，然后发送给你选择的转录服务商。

[下载最新版本](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip) · [Firefox / Zen 指南（英语）](docs/GECKO_SETUP.md) · [英文 README](README.md)

## 功能

- 为没有字幕或自动字幕质量较差的视频生成字幕，支持 DeepInfra、Groq、OpenRouter 和 OpenAI 兼容 API。
- 根据语音内容划分字幕，并可调整字幕长度和换行。
- 利用缓存的转录结果调整排版或重新导出，无需再次请求服务商。**重新生成**会请求新的转录。
- 本地助手使用 `yt-dlp` 和 FFmpeg 准备音频；音频和所需 API 密钥只发送给你选择的服务商。
- 界面支持英语、巴西葡萄牙语、西班牙语、日语、简体中文和繁体中文。

## 系统要求

Windows 10/11 或 Linux；Chromium 120+ 或 Gecko 140+ 桌面浏览器；语音服务商的 API 密钥；约 1 GB 可用空间。安装程序会在需要时安装 Python、Node.js 和 FFmpeg。详情请参阅 [Chromium 兼容性](docs/BROWSERS.md)和 [Gecko 指南](docs/GECKO_SETUP.md)。

## 安装

1. [下载完整 ZIP 包](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip)，解压并将文件夹保存在文档等固定位置。移动或删除文件夹可能导致扩展无法运行。
2. **Windows：**双击 `Install Buttercup.cmd`。如果 Windows 阻止脚本，请选择**更多信息 → 仍要运行**；如提示安装 Node.js，请允许。
3. **Linux：**在解压后的文件夹中打开终端并运行：

   ```sh
   sh install.sh
   ```

   安装程序使用 `apt`、`dnf`、`pacman` 或 `zypper`，并在安装缺失的软件包时请求密码。
4. **Chromium、Chrome、Edge、Brave 等衍生浏览器：**打开 `chrome://extensions`，启用开发者模式，点击**加载已解压的扩展程序**，选择 `dist/chromium`，然后将 Buttercup 固定到工具栏。
5. **Firefox、Zen 和其他 Gecko 浏览器：**按照 [Gecko 安装指南](docs/GECKO_SETUP.md)操作。完整包包含 `dist/firefox` 和 `dist/firefox-unsigned.zip`。Zen 在 `about:config` 中将 `xpinstall.signatures.required` 设为 `false` 后可以保留未签名扩展；标准 Firefox Release 仍要求签名。指南说明了不同版本及 Flatpak 连接方式。Linux 上的 Helium 使用 Chromium 版本，安装程序会注册助手路径，但尚未完成 Helium 运行时测试。
6. 在 [Groq](https://console.groq.com/keys)、[DeepInfra](https://deepinfra.com/dash/api_keys)、[OpenRouter](https://openrouter.ai/keys) 或其他兼容服务商处创建密钥。打开 Buttercup，点击 **Start and connect**，然后在 **Transcription** 中选择服务商并粘贴密钥。

原生安装的浏览器通过原生消息机制连接助手；Snap 和 Flatpak 可能阻止该机制。Zen Flatpak 用户可选择 [Flatseal 自动连接](docs/GECKO_SETUP.md#method-a-automatic-connection-with-flatseal)或[手动连接](docs/GECKO_SETUP.md#method-b-manual-connection-without-extra-flatpak-permissions)。指南为英语。

## 生成第一份字幕

打开 YouTube 视频，点击播放器上的粉色 **BC** 按钮。提示会显示处理进度，完成后字幕出现在视频上；再次点击可隐藏或显示。首次耗时取决于服务商，以后可使用缓存。重启电脑后，请打开 Buttercup 并点击 **Start and connect**。

如需替换人工字幕，请关闭 **Prefer human captions**。对于配音视频，在 **Audio track for transcription** 中选择 **Original audio**。

## 与 asbplayer 配合使用

asbplayer 的 WebSocket 服务器独立于 Buttercup。安装 [Go](https://go.dev/dl/) 和 [Git](https://git-scm.com/downloads)，然后运行：

```sh
git clone https://github.com/asbplayer/asbplayer.git
cd asbplayer/scripts/web-socket-server
go run .
```

使用期间保持终端打开。在 asbplayer 中启用 **Misc → WebSocket client**；在 Buttercup 的 **Integrations → asbplayer** 中检查连接并启用自动发送。如只想显示 asbplayer 的字幕，可关闭 Buttercup 的视频内字幕。详情请参阅 [asbplayer 指南](https://docs.asbplayer.dev/docs/guides/web-socket-server)。

## 文件与设置

使用 **Download SRT** 或 **Download VTT** 保存当前字幕；启用自动保存后，生成字幕时会保存 SRT。请选择已有文件夹，或留空使用下载文件夹。同名文件会被替换。

顶部菜单可切换语言；**Auto** 跟随浏览器语言。在 **Transcription** 中选择服务商、密钥和模型。如果模型支持，单词时间戳有助于生成较短的字幕。在 **Subtitle layout** 中调整分段方式、字数或词数上限及换行。只有片段时间戳时，片段内部的边界时间可能经过估算。**Keep provider segments (original timing)** 保留服务商返回的片段边界并忽略词数上限；将换行设为 `0` 可保留返回的排版。日语和中文按字符计数，同时保留拉丁单词和完整字素。

在 **Audio upload (advanced)** 中选择分段发送或完整音频。默认格式为 16 kHz、单声道、64 kbps MP3，也可选择 16 kHz、单声道、16 位 FLAC。FLAC 通常更大，不保证提高准确率；支持情况取决于服务商和模型。格式按服务商、模型等配置分别保存，并包含在设置备份中。使用 FLAC 需要更新并重启助手。两种格式共享字幕缓存；要按所选格式重新发送音频，请选择 **Regenerate subtitles**，服务商可能收费。短样本测试会原样上传所选文件，不进行转换。

分段发送使用 1.5 秒重叠，并遵守配置的大小上限，默认 24 MB。受限视频可在 **YouTube Authentication / Cookies** 中导入 `cookies.txt`；只接受 YouTube 和 Google 的 Cookie，且保存在本机。

默认快捷键为 **Alt+Shift+G** 生成字幕、**Alt+Shift+U** 重新生成。可在 **Keyboard shortcuts → Configure shortcuts** 中更改。浏览器单独保存快捷键，不包含在设置备份中；部分组合可能被浏览器占用。

## 更新与导入

下载[最新 ZIP](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip)，解压覆盖原文件夹并重新运行安装程序。Chromium 用户在 `chrome://extensions` 中重新加载扩展；Gecko 用户按照[指南](docs/GECKO_SETUP.md)将新 ZIP 安装到现有扩展上，无需先卸载。扩展 ID 固定，但没有自动更新渠道。更新前可导出设置作为备份。

导入设置、Cookie、连接文件以及测试音频时，会打开一个持久页面。在该页面选择文件后再点击相应按钮；仅选择文件不会自动发送。Cookie 持久保存为可选功能，默认关闭。

## 故障排除

- **助手未连接：**在正确的文件夹中运行安装程序并点击 **Start and connect**。Zen Flatpak 用户需完成指南中的一种连接方式；手动连接时运行 `Start Buttercup assistant.sh` 并点击 **Check connection**。
- **没有 BC 按钮：**刷新 YouTube 页面并确认已启用 Buttercup。
- **密钥错误：**粘贴所选服务商的密钥。遇到 YouTube 身份验证错误或 403 时，可尝试导入新的 Cookie。
- **字幕过长：**使用 Buttercup 分段模式并降低词数上限；服务商原始片段模式不受该限制。
- **文件过大：**选择分段发送。asbplayer 连接失败时，检查 WebSocket 服务器和客户端是否运行。
- 仍需帮助时，请附上错误信息和复现步骤[提交 issue](https://github.com/arrow-poppa/buttercup-revival/issues)。

## 隐私、开发与致谢

音频在本机转换后发送给所选服务商。API 密钥保存在扩展的私有存储中；助手只接受经令牌授权的本地连接。社区缓存可选，默认关闭。**设置备份包含 API 密钥，请像保护密码一样保护备份文件。**

卸载时，在 Windows 上运行 `Uninstall Buttercup.cmd`，或在 Linux 上运行 `.venv/bin/python scripts/setup-assistant.py --uninstall`，然后从浏览器删除扩展并删除文件夹。共享依赖仍会保留。

项目结构、构建与测试命令以及架构请参阅[英文 README](README.md#-for-developers)。每次运行安装程序时，都会尝试将 `yt-dlp` 和 `pytubefix` 更新到兼容的最新稳定版本。

### 构建与测试

开发需要 Python 3.11+、Node.js 22+ 和 FFmpeg。在项目根目录执行以下命令。两个浏览器版本共享代码；Gecko 使用隐藏的后台页面。助手注册两个固定 ID 并使用原生消息机制。失败的付费请求不会自动重试或转发。

```sh
python -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
npm ci
npm run build
npm run package
npm test
.venv/bin/python -m pytest tests/backend -q
```

Buttercup Revival 是 [iGerman00 的 Buttercup](https://github.com/iGerman00/buttercup-chrome) 的现代化分支，使用了 [yt-dlp](https://github.com/yt-dlp/yt-dlp)、[pytubefix](https://github.com/JuanBindez/pytubefix)、[FFmpeg](https://ffmpeg.org/) 和 [FastAPI](https://fastapi.tiangolo.com/)。原项目未声明许可证，本分支也未添加许可证；参阅 [UPSTREAM](docs/UPSTREAM.md)。
