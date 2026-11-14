# 在 Firefox、Zen 和其他 Gecko 浏览器中设置 Buttercup

Buttercup Revival 是一款面向 **Chromium 和 Gecko** 的浏览器扩展。本指南介绍 Windows 和 Linux 上的 Gecko 构建，包括将 Zen Flatpak 连接到本地助手的两种方法。

你将安装两个部分：扩展在 YouTube 中添加 BC 按钮；助手在你的电脑上准备音频。安装未签名扩展和连接助手是两个独立的步骤。更改签名首选项不会解除 Flatpak 的原生消息传递限制。

## 选择你的方式

| 你的浏览器 | 安装扩展 | 连接助手 |
| --- | --- | --- |
| 原生 Zen | 下面的永久未签名安装，或临时安装 | 单击 **Start and connect** |
| 标准 Firefox 发行版 | 用于永久安装的 Mozilla 签名软件包，或临时安装 | 在原生安装中单击 **Start and connect** |
| Firefox ESR、Developer Edition、Nightly 或无品牌构建 | 受支持的构建可以未签名安装；请参阅签名表 | 在原生安装中单击 **Start and connect** |
| Zen Flatpak | 按 Zen 的方式安装 | 选择**方法 A：使用 Flatseal 自动连接**或**方法 B：手动连接** |
| 其他现代 Gecko 分支 | 检查签名表和浏览器要求 | 原生消息传递取决于浏览器/软件包；请参阅[兼容性详情](../firefox.md) |

Buttercup 面向 Gecko 140 或更高版本。仅有签名支持并不能证明每个分支/软件包都已用 Buttercup 测试过。原生 Firefox 和原生/Flatpak Zen 已完成运行时验证；LibreWolf 和 Waterfox 未单独进行运行时测试。

<a id="extract"></a>
## 1. 解压正确的软件包

1. 将完整的 Buttercup 项目 ZIP 解压到你打算长期保留的文件夹，例如文档。
2. 打开解压后的文件夹。它必须包含 `install.sh`、`scripts` 和 `dist`。第一个文件夹内可能还有另一个 `Buttercup-Revival` 文件夹：请打开包含这些文件的那个。
3. 检查 `dist/firefox/manifest.json` 和 `dist/firefox-unsigned.zip` 是否存在。旧的仅 Chromium 软件包不会包含它们。请下载 **v0.6.0 或更高版本**，或[从源代码构建](../../README.zh-CN.md#developers)。

**完整项目 ZIP** 包含助手和安装程序。较小的 **`dist/firefox-unsigned.zip`** 仅包含扩展。安装附加组件时请选择较小的 ZIP；不要选择完整项目 ZIP。

安装后请将解压后的项目文件夹保留在原位。移动它可能会破坏助手启动器。

## 2. 运行安装程序

**Windows：** 在该文件夹中双击 `Install Buttercup.cmd`。

**Linux：** 在该文件夹**内部**打开终端，然后运行：

```sh
sh install.sh
```

如果文件管理器有**在终端中打开**操作，请使用它。否则先用 `cd` 进入该文件夹。例如，如果你直接解压到下载文件夹：

```sh
cd "$HOME/Downloads/Buttercup-Revival"
```

该路径只是示例：请使用你的实际文件夹。包含空格或 `(1)` 的路径请保留引号。如果提示符以 `:~$` 结尾，通常你仍在主文件夹中，而不是项目文件夹。

安装程序会创建 `.venv` 并自动注册两个浏览器引擎。再次运行会复用环境并检查依赖更新。请等待它报告安装完成。

## 3. 安装扩展

### 在 Zen 中保留未签名扩展

当签名强制关闭时，Zen 可以在浏览器重启后保留已安装的未签名扩展：

1. 打开新标签页并输入 `about:config`。
2. 接受配置警告。
3. 搜索 `xpinstall.signatures.required`。
4. 将其值设为 **`false`**。
5. 打开 `about:addons`，或按 **Ctrl+Shift+A**。
6. 打开齿轮菜单并选择**从文件安装附加组件…**。
7. 从解压后的项目中选择 **`dist/firefox-unsigned.zip`** 并批准安装。
8. 从扩展菜单打开 Buttercup；如需方便访问，请固定其图标。

Buttercup 已包含持久安装所需的显式 Gecko 附加组件 ID。ZIP 和解压后的 Firefox 文件夹使用**相同的 ID**。将 ZIP 重命名为 `.xpi` 并不会为其签名。

此首选项会为该浏览器配置文件关闭签名强制，因此请只使用你信任的扩展。Zen 的[官方构建配置](https://github.com/zen-browser/desktop/blob/dev/configs/common/mozconfig)允许未签名附加组件，此方式已在 Zen 中测试。它与标准 Firefox 发行版不同。

<a id="other-browsers"></a>
### 还有哪些浏览器允许这样做？

| 浏览器/构建 | 该首选项能否允许永久未签名扩展？ | 证据 |
| --- | --- | --- |
| **Zen** | 可以：将 `xpinstall.signatures.required` 设为 `false` | 官方构建配置和 Zen 运行时测试 |
| **标准 Firefox 发行版** | **不能。** 更改首选项不会绕过发行版的签名要求 | Mozilla 文档 |
| **Firefox ESR** | 可以，根据 Mozilla 文档，在受支持的 ESR 构建中 | Mozilla 文档；此处未单独进行运行时测试 |
| **Firefox Developer Edition / Nightly** | 可以，用于测试 | Mozilla 文档；此处未单独进行运行时测试 |
| **无品牌 Firefox 构建** | 可以，在禁用签名强制的情况下构建时 | Mozilla 文档；此处未单独进行运行时测试 |
| **LibreWolf** | 其官方构建配置允许未签名附加组件；该首选项可以控制强制 | 已核实源代码；此处未单独进行运行时测试 |
| **现代 Waterfox** | 其官方桌面构建配置允许未签名附加组件；该首选项可以控制强制 | 已核实源代码；此处未单独进行运行时测试 |

请检查你实际的浏览器版本和软件包。分支名称或首选项的存在并不能证明某个二进制文件会遵循它。较旧的分支、第三方构建和发行版策略可能有所不同。此表涉及签名，不保证 Buttercup 兼容性或原生主机支持。

来源：[Mozilla：附加组件签名](https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox)、[Zen 构建配置](https://github.com/zen-browser/desktop/blob/dev/configs/common/mozconfig)、[LibreWolf 构建配置](https://librewolf.dev/librewolf/source/src/branch/main/assets/mozconfig.new)、[Waterfox 共享桌面构建配置](https://github.com/BrowserWorks/Waterfox/blob/current/waterfox/build/mozconfig.common)。检查于 2026-11-13。

### 临时安装（包括标准 Firefox）

如果你不想更改签名设置，或你的构建强制要求签名：

1. 打开 `about:debugging#/runtime/this-firefox`。
2. 单击**临时载入附加组件…**。
3. 选择 **`dist/firefox/manifest.json`**。

此安装在浏览器退出时会被移除。要在标准 Firefox 发行版中永久安装，请获取 Mozilla 签名的软件包。维护者可以使用 Mozilla 的[自行分发签名流程](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)，而无需公开列出该扩展。

<a id="connect"></a>
## 4. 连接助手

**原生浏览器安装：** 打开 Buttercup 并单击 **Start and connect**。徽标应变为 **Connected**。你不需要下面的任一 Flatpak 方法。

**Zen Flatpak：** 选择以下方法之一。两者使用相同的助手，并保留你的提供商设置。

<a id="flatseal"></a>
### 方法 A：使用 Flatseal 自动连接

如果你希望 **Start and connect** 启动助手（包括重启电脑后），请选择此方法。

#### A1. 准备一次启动器

如第 2 步所述，在**已安装的 Buttercup 项目文件夹中**打开终端。运行：

```sh
.venv/bin/python scripts/setup-assistant.py --flatpak-bridge app.zen_browser.zen
```

等待 **Flatpak launcher prepared**。该命令创建桥接，但不会更改 Flatpak 权限。再次运行会更新启动器。

#### A2. 添加两个 Flatseal 条目

打开 **Flatseal**，在应用程序列表中选择 **Zen**（`app.zen_browser.zen`），而不是“所有应用程序”。

| 找到此部分 | 添加此确切值 |
| --- | --- |
| **Session Bus → Talks** | `org.freedesktop.Flatpak` |
| **Persistent → Files** | `.mozilla` |

对于每个条目，使用该部分的 **+** 或添加条目按钮，输入值并确认。保留现有条目，例如 `.zen`。

**这些是文本条目，不是 Socket 部分中的 D-Bus 开关。** 你不需要启用整个会话总线、整个系统总线、所有用户文件或所有文件系统文件。第一个值区分大小写；第二个以点开头且不含斜杠。

会话总线权限允许 Zen 一般性地执行主机程序，而不仅是 Buttercup。如果你希望保持该权限关闭，请使用方法 B。已测试的方式使用 Zen 的默认文件系统权限；宽泛的自定义主目录覆盖可能会干扰持久化映射。请参阅 [Flatseal 的权限参考](https://github.com/tchx84/Flatseal/blob/master/DOCUMENTATION.md)。

#### A3. 重启并连接

1. 完全退出 Zen，包括其他窗口和后台实例。
2. 再次打开 Zen。
3. 打开 Buttercup 并单击 **Start and connect**。
4. 确认徽标显示 **Connected**。

此后，正常使用 **Start and connect**。重启电脑后，它可以再次启动助手；不需要连接文件或终端。

<a id="manual"></a>
### 方法 B：不增加 Flatpak 权限的手动连接

如果你希望保留 Zen 的默认沙盒权限，请选择此方法。你只需准备一次连接文件，然后在电脑重启后使用其辅助程序启动助手。

#### B1. 复制浏览器连接源

1. 在你要使用的浏览器配置文件中打开 Buttercup。
2. 展开 **Connect without native messaging**。
3. 单击 **Copy origin**。

使用该按钮的值。不要复制 How to connect 中的 **Extension ID**：连接源以 `moz-extension://` 开头，用于标识此浏览器配置文件。

#### B2. 创建私有连接文件

1. 在解压后的项目文件夹中，运行 **Set up Buttercup assistant.sh**。如果你的文件管理器以文本方式打开脚本，请在该文件夹中打开的终端里运行 `sh "Set up Buttercup assistant.sh"`。
2. 在设置窗口中找到 **Flatpak / Snap: connect manually**。
3. 将连接源粘贴到其字段中。
4. 单击 **Start assistant and save connection file**。
5. 将 JSON 文件保存到容易找到的位置，例如下载文件夹。

辅助程序会在后台启动助手。你不需要让终端保持打开。

#### B3. 导入并检查连接

1. 返回 Buttercup → **Connect without native messaging**。
2. 单击 **Open connection editor**。会打开一个标签页，以便弹出窗口关闭时文件选择器仍保持打开。
3. 选择你刚刚保存的 JSON 文件。
4. 单击 **Import connection**。
5. 检查是否显示 **Assistant connected** / **Connected**。
6. 之后删除该 JSON 文件：它包含你的私有本地助手令牌。

导入的连接会为该配置文件保留。更改提供商或字幕设置不会移除它。新的浏览器配置文件需要新文件。设置备份会有意排除本地连接。

#### B4. 重启电脑后

从同一项目文件夹运行 **Start Buttercup assistant.sh**。如有需要，在那里打开终端并运行：

```sh
sh "Start Buttercup assistant.sh"
```

然后在 Buttercup 中单击 **Check connection**。你不需要在每次重启后重新创建/导入 JSON 文件。使用此方法时，**Start and connect** 仍会尝试原生消息传递；请改用辅助程序和 **Check connection**。

## 5. 生成你的第一批字幕

1. 在 **Transcription** 中选择提供商并输入其 API 密钥。
2. 打开一个 YouTube 视频。
3. 单击播放器上的 **BC** 按钮，或 Buttercup 中的 **Generate captions**。
4. 等待完成消息。

**Generate** 在可用时复用缓存的转录。**Regenerate subtitles** 明确请求新的转录，可能产生提供商费用。在 **Start a new subtitle** 下，选择提供商原始分段或让 Buttercup 重新分组。布局更改可以使用现有缓存。

## 如果出现问题

| 你看到的情况 | 该怎么做 |
| --- | --- |
| `.venv/bin/python: No such file or directory` | 你在错误的文件夹中，或安装程序尚未完成。打开包含 `install.sh` 和 `scripts` 的文件夹，在那里打开终端，如果缺少 `.venv`，请运行 `sh install.sh`。不要从 `~` 运行相对命令。 |
| `unrecognized arguments: --flatpak-bridge` | 你正在运行旧软件包或另一份解压副本中的脚本。请使用更新后的双浏览器软件包及其项目文件夹。 |
| 未签名扩展被拒绝 | 选择 `dist/firefox-unsigned.zip`，而不是完整项目归档。检查浏览器/构建表和签名首选项。标准 Firefox 发行版需要签名软件包或临时加载。 |
| 重启浏览器后扩展消失 | 它是临时加载的。请使用该浏览器支持的永久安装，或签名软件包。 |
| 扩展已安装但助手无法连接 | 这与签名是不同的问题。原生用户应重新运行安装程序；Flatpak 用户应完成方法 A 或 B。 |
| 方法 A 仍无法连接 | 确认启动器命令成功、两个 Flatseal 条目已添加到 Zen 本身，并且 Zen 已完全重启。保持项目文件夹在原位。自定义文件系统覆盖可能需要改回手动方式。 |
| 方法 B 提示文件属于另一个配置文件 | 从当前配置文件复制连接源并生成新的连接文件。 |
| 方法 B 在重启电脑前可用 | 运行 `Start Buttercup assistant.sh`，然后单击 **Check connection**。通常不需要重新导入。 |

有关已测试版本、限制、手动 CLI 选项和安全设计，请参阅 [Gecko 技术和兼容性说明](../firefox.md)。
