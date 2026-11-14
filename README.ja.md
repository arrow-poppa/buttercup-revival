# 🌼 Buttercup Revival

[English](README.md) · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md) · 日本語 · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

> この翻訳ガイドは README の要約です。技術的な詳細は[英語の完全版](README.md)を参照してください。

**Chromium・Gecko ブラウザー向けのオンデマンド YouTube 字幕生成。**

Buttercup Revival は、視聴中の動画の音声を選択した音声認識モデルで文字起こしします。字幕は動画上に表示するほか、[asbplayer](https://github.com/asbplayer/asbplayer) への送信や `.srt`・`.vtt` ファイルへの保存ができます。音声はローカルで準備され、選択した文字起こしプロバイダーに送信されます。

[最新版をダウンロード](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip) · [Firefox / Zen ガイド（英語）](docs/GECKO_SETUP.md) · [英語の README](README.md)

## 主な機能

- 字幕がない動画や自動字幕の品質が低い動画に字幕を生成します。DeepInfra、Groq、OpenRouter、OpenAI 互換 API を利用できます。
- 発話に合わせて字幕を区切り、長さや改行を調整できます。
- キャッシュを使えば、プロバイダーに再送信せずに字幕のレイアウト変更や再出力ができます。**再生成**は新しい文字起こしを要求します。
- ローカルアシスタントが `yt-dlp` と FFmpeg で音声を準備します。音声と必要な API キーは、選択したプロバイダーに送信されます。
- インターフェースは英語、ブラジルポルトガル語、スペイン語、日本語、簡体字中国語、繁体字中国語に対応しています。

## 必要なもの

Windows 10/11 または Linux、デスクトップ版 Chromium 120 以降または Gecko 140 以降、音声認識プロバイダーの API キー、約 1 GB の空き容量が必要です。Python、Node.js、FFmpeg は必要に応じてインストーラーが導入します。[Chromium の互換性](docs/BROWSERS.md)と [Gecko ガイド](docs/GECKO_SETUP.md)も参照してください。

## インストール

1. [完全版 ZIP](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip) をダウンロードして展開し、ドキュメントなど継続して使える場所に保存します。フォルダーを移動・削除すると動作しなくなることがあります。
2. **Windows:** `Install Buttercup.cmd` をダブルクリックします。警告が出たら **詳細情報 → 実行** を選び、Node.js のインストール確認には必要に応じて許可します。
3. **Linux:** 展開したフォルダーで端末を開き、次を実行します。

   ```sh
   sh install.sh
   ```

   インストーラーは `apt`、`dnf`、`pacman`、`zypper` のいずれかを使い、足りないパッケージのインストール時にパスワードを求めます。
4. **Chromium、Chrome、Edge、Brave など:** `chrome://extensions` を開き、デベロッパーモードを有効にして、展開済み拡張機能の読み込みから `dist/chromium` を選びます。Buttercup をツールバーに固定してください。
5. **Firefox、Zen などの Gecko ブラウザー:** [Gecko インストールガイド](docs/GECKO_SETUP.md)に従ってください。パッケージには `dist/firefox` と `dist/firefox-unsigned.zip` が含まれます。Zen は `about:config` の `xpinstall.signatures.required` を `false` にすると未署名の拡張機能を保持できます。通常版 Firefox Release は署名が必要です。ガイドには各エディションと Flatpak の接続方法を説明しています。Linux の Helium は Chromium 版を使用し、ホストの登録に対応していますが、実機検証はまだ行っていません。
6. [Groq](https://console.groq.com/keys)、[DeepInfra](https://deepinfra.com/dash/api_keys)、[OpenRouter](https://openrouter.ai/keys) などでキーを作成します。Buttercup を開いて **Start and connect** を押し、**Transcription** でプロバイダーを選んでキーを貼り付けます。

通常のブラウザーはネイティブメッセージングでアシスタントに接続します。Snap や Flatpak はこれを制限する場合があります。Zen Flatpak では [Flatseal を使った自動接続](docs/GECKO_SETUP.md#method-a-automatic-connection-with-flatseal)または[手動接続](docs/GECKO_SETUP.md#method-b-manual-connection-without-extra-flatpak-permissions)を選べます。ガイドは英語です。

## 字幕を生成する

YouTube 動画を開き、プレーヤーのピンク色の **BC** ボタンを押します。進行状況が表示され、完了すると字幕が現れます。もう一度押すと表示・非表示を切り替えられます。初回の所要時間はプロバイダーによって異なり、次回はキャッシュを利用できます。パソコン再起動後は Buttercup を開き、**Start and connect** を押してください。

人手による既存字幕を置き換えるには **Prefer human captions** をオフにします。吹き替え動画では **Audio track for transcription** で **Original audio** を選びます。

## asbplayer と連携する

asbplayer の WebSocket サーバーは Buttercup とは別のプログラムです。[Go](https://go.dev/dl/) と [Git](https://git-scm.com/downloads) をインストールし、端末で次を実行します。

```sh
git clone https://github.com/asbplayer/asbplayer.git
cd asbplayer/scripts/web-socket-server
go run .
```

端末は開いたままにします。asbplayer の **Misc → WebSocket client** を有効にし、Buttercup の **Integrations → asbplayer** で接続確認と自動送信を有効にします。asbplayer の字幕だけを表示したい場合は、Buttercup の動画上の字幕表示をオフにします。詳細は [asbplayer のガイド](https://docs.asbplayer.dev/docs/guides/web-socket-server)を参照してください。

## ファイルと設定

**Download SRT** または **Download VTT** で現在の字幕を保存できます。自動保存を有効にすると生成後に SRT が保存されます。保存先は既存のフォルダーを指定するか、空欄でダウンロードフォルダーを使用します。同名ファイルは上書きされます。

上部のメニューで言語を選択できます。**Auto** はブラウザーの言語に従います。**Transcription** ではプロバイダー、キー、モデルを選びます。モデルが単語単位のタイムスタンプに対応していれば、短い字幕の生成に役立ちます。**Subtitle layout** では区切り方、文字数・単語数の上限、改行を調整できます。セグメント単位のタイムスタンプしかない場合、内部の境界時刻は推定されることがあります。**Keep provider segments (original timing)** はプロバイダーの区切りを保持し、単語数上限を適用しません。改行を `0` にすると返されたレイアウトを保持します。日本語・中国語では文字を数え、ラテン文字の単語や書記素を保護します。

**Audio upload (advanced)** では分割送信または全音声送信を選べます。既定値は 16 kHz・モノラル・64 kbps の MP3 で、16 kHz・モノラル・16 ビットの FLAC も選べます。FLAC は通常ファイルが大きくなり、精度向上は保証されません。対応はプロバイダーとモデルによって異なります。形式はプロバイダー・モデルなどの設定ごとに保存され、バックアップにも含まれます。FLAC にはアシスタントの更新と再起動が必要です。両形式は字幕キャッシュを共有します。選択した形式で新しく送信するには **Regenerate subtitles** を選んでください。プロバイダー料金が発生する場合があります。サンプルテストは選択したファイルを変換せずに送信します。

分割送信では 1.5 秒の重なりを設け、設定したサイズ上限（既定 24 MB）を守ります。年齢制限などの動画では **YouTube Authentication / Cookies** から `cookies.txt` をインポートできます。YouTube と Google の Cookie のみ受け付け、ローカルに保存されます。

既定のショートカットは生成が **Alt+Shift+G**、再生成が **Alt+Shift+U** です。**Keyboard shortcuts → Configure shortcuts** で変更できます。ショートカットはブラウザーが設定バックアップとは別に保存し、一部の組み合わせは予約されている場合があります。

## 更新とインポート

[最新 ZIP](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip) を同じフォルダーに上書き展開し、インストーラーを再実行します。Chromium では `chrome://extensions` で拡張機能を再読み込みします。Gecko では削除せず、[ガイド](docs/GECKO_SETUP.md)に従い新しい ZIP を既存の拡張機能に上書きインストールします。ID は固定ですが、自動更新の仕組みはありません。更新前に設定をエクスポートしておくと安心です。

設定、Cookie、接続情報のインポートと音声サンプルテストは、閉じないタブで行います。そのタブでファイルを選択し、対応するボタンを押してください。ファイルを選択しただけでは送信されません。Cookie の永続保存は任意で、既定ではオフです。

## トラブルシューティング

- **アシスタントが未接続:** 正しいフォルダーからインストーラーを実行し、**Start and connect** を押します。Zen Flatpak ではガイドのいずれかの接続方法を完了してください。手動接続の場合は `Start Buttercup assistant.sh` を実行して **Check connection** を押します。
- **BC ボタンがない:** YouTube を再読み込みし、Buttercup が有効か確認します。
- **キーのエラー:** 選択したプロバイダーのキーを入力します。YouTube の認証エラーや 403 の場合は、新しい Cookie のインポートを試してください。
- **字幕が長すぎる:** Buttercup の分割モードで上限を下げます。プロバイダーの元のセグメントには上限が適用されません。
- **ファイルが大きすぎる:** 分割送信を選びます。asbplayer の接続に失敗する場合は WebSocket サーバーとクライアントを確認します。
- 解決しない場合は、エラーと再現手順を添えて [issue を作成](https://github.com/arrow-poppa/buttercup-revival/issues)してください。

## プライバシー・開発・クレジット

音声はローカルで変換され、選択したプロバイダーに送信されます。API キーは拡張機能のプライベートストレージに保存され、アシスタントはトークンで認証されたローカル接続を受け付けます。コミュニティキャッシュは任意で、既定ではオフです。**設定バックアップには API キーが含まれるため、パスワードと同様に保護してください。**

アンインストールするには、Windows で `Uninstall Buttercup.cmd`、Linux で `.venv/bin/python scripts/setup-assistant.py --uninstall` を実行し、ブラウザーから拡張機能を削除してフォルダーを削除します。共有依存関係は残ります。

構成、ビルド・テストコマンド、アーキテクチャーについては[英語の README](README.md#-for-developers) を参照してください。インストーラーは実行のたびに `yt-dlp` と `pytubefix` を互換性のある最新安定版へ更新しようとします。

### ビルドとテスト

開発には Python 3.11 以降、Node.js 22 以降、FFmpeg が必要です。プロジェクトのルートで以下を実行します。両ブラウザーはコードを共有し、Gecko は非表示のバックグラウンドページを使用します。アシスタントは両方の固定 ID を登録し、ネイティブメッセージングを使用します。失敗した有料リクエストは自動で再試行・転送されません。

```sh
python -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
npm ci
npm run build
npm run package
npm test
.venv/bin/python -m pytest tests/backend -q
```

Buttercup Revival は [iGerman00 の Buttercup](https://github.com/iGerman00/buttercup-chrome) を現代化したフォークで、[yt-dlp](https://github.com/yt-dlp/yt-dlp)、[pytubefix](https://github.com/JuanBindez/pytubefix)、[FFmpeg](https://ffmpeg.org/)、[FastAPI](https://fastapi.tiangolo.com/) を使用しています。元のプロジェクトにはライセンスの宣言がなく、このフォークも追加していません。[UPSTREAM](docs/UPSTREAM.md) を参照してください。
