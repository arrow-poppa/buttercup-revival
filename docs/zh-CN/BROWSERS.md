# Chromium 浏览器设置

对于 Firefox、Zen、LibreWolf 和其他 Gecko 浏览器，请使用 `dist/firefox` 和 [Gecko 设置指南](GECKO_SETUP.md)。本页介绍 Chromium。

Buttercup 面向 Windows 和 Linux 上支持未打包 Manifest V3 扩展、离屏文档和原生消息传递的桌面 Chromium 浏览器（Chromium 120 或更高版本）。分支可能会禁用这些 API 或限制扩展；仅共享渲染引擎并不能保证兼容性。不支持移动浏览器和 macOS 安装程序。

## 自动注册

在 Windows 上运行 `Install Buttercup.cmd`，或在 Linux 上运行 `sh install.sh`，然后从浏览器的扩展程序页面（`chrome://extensions` 或浏览器对应的页面）加载 `dist/chromium`。在 Buttercup 中单击 **启动并连接**。

在 Linux 上，安装程序会在 `$XDG_CONFIG_HOME`（默认：`~/.config`）下注册以下配置目录：

| 系列 | 目录 |
| --- | --- |
| Chrome | `google-chrome`, `google-chrome-beta`, `google-chrome-unstable`, `google-chrome-for-testing` |
| Chromium | `chromium`, `chromium-browser`, `ungoogled-chromium` |
| Edge | `microsoft-edge`, `microsoft-edge-beta`, `microsoft-edge-dev` |
| Brave | `BraveSoftware/Brave-Browser`, `BraveSoftware/Brave-Browser-Beta`, `BraveSoftware/Brave-Browser-Nightly` |
| Brave Origin | `BraveSoftware/Brave-Origin`, `BraveSoftware/Brave-Origin-Beta`, `BraveSoftware/Brave-Origin-Nightly` |
| Vivaldi | `vivaldi`, `vivaldi-snapshot` |
| Opera | `opera`, `opera-beta`, `opera-developer` |
| Thorium | `thorium` |

Windows 注册使用当前用户的 Chrome、Chromium 和 Edge 注册表项。Brave、Vivaldi 和许多其他分支复用 Chrome 的注册。有关底层注册约定，请参阅 [Chrome 的原生消息传递规范](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)和 [KeePassXC 的浏览器注册实现](https://github.com/keepassxreboot/keepassxc/blob/develop/src/browser/NativeMessageInstaller.cpp)。

此列表描述安装程序的覆盖范围，并不声称每个浏览器/通道都已进行端到端测试。不会更改系统级文件或浏览器设置。

## 其他分支和便携式安装

找到浏览器文档中说明的原生消息传递主机位置。在 Linux 上，使用绝对路径添加其 **NativeMessagingHosts 目录**：

```sh
.venv/bin/python scripts/setup-assistant.py \
  --native-host-dir "$HOME/.config/MyChromiumFork/NativeMessagingHosts"
```

在 Windows 上，如果浏览器使用单独的注册表项，请传入**相对于 `HKEY_CURRENT_USER\Software`** 的浏览器特定路径：

```powershell
.venv\Scripts\python.exe scripts/setup-assistant.py --browser-registry-key 'Vendor\Browser'
```

这会创建 `HKCU\Software\Vendor\Browser\NativeMessagingHosts\app.buttercup.assistant`。直接读取清单目录的 Windows 分支也可以使用 `--native-host-dir` 并传入绝对 Windows 路径。

两个标志都可以重复使用。自定义位置在重新运行安装程序后仍会保留，并会由 `--uninstall` 删除。重新安装会保留配对令牌和之前授权的扩展 ID。如果你的浏览器分配了不同的扩展 ID，请追加 `--extension-id ID_FROM_THE_POPUP`。

## Flatpak、Snap 和没有原生消息传递的浏览器

自动启动需要权限来启动主机端的助手。沙盒化的浏览器软件包即使存在清单，也可能阻止这一点。Buttercup 不会削弱沙盒，也不会授予不受限制的主机执行权限。

请使用原生浏览器软件包实现自动启动；或者，如果浏览器允许环回网络和所需的扩展 API，请在主机上运行后端并手动配对：

1. 从弹出窗口的 **如何连接** 中复制扩展 ID。
2. 在主机上的终端中启动后端：

   ```sh
   .venv/bin/python -m backend.app --extension-id YOUR_EXTENSION_ID --show-token
   ```

   在 Windows 上，请改用 `.venv\Scripts\python.exe`。如果助手已在运行，请先停止该实例，或使用 `--port` 和 `--state-dir` 选择其他端口和状态目录。
3. 在 **本地连接 — 高级选项** 中，输入 `http://127.0.0.1:8767`（或所选端口）和显示的配对令牌。单击 **检查助手**。保持终端运行。后续检查请使用 **检查连接**；**启动并连接** 会再次调用原生消息传递。

请仅将配对令牌复制到 Buttercup 的密码字段中；不要将其包含在截图、问题报告或 URL 中。此手动方式仍会执行相同的环回绑定、令牌身份验证和扩展来源允许列表。它无法恢复浏览器已禁用的扩展 API。

## Helium

在 Linux 上使用原生 Helium 配合 `dist/chromium`。Helium 的[原生消息传递兼容补丁](https://github.com/imputnet/helium/blob/main/patches/helium/core/scan-chrome-native-messaging-hosts.patch)会回退搜索 Chrome 的每用户主机目录。Buttercup 会注册该 Chrome 位置以及 Helium 自己的 `$XDG_CONFIG_HOME/net.imput.helium/NativeMessagingHosts` 目录，因此预计助手无需其他注册格式即可启动。这是经源代码核实的兼容性，而非 Helium 的实际运行结果。Windows 上的 Helium 尚未验证；macOS 上的助手安装仍不受支持。第三方沙盒软件包可能仍需要手动连接。
