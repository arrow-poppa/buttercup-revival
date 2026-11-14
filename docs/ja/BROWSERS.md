# Chromium ブラウザのセットアップ

Firefox、Zen、LibreWolf、その他の Gecko ブラウザでは、`dist/firefox` と [Gecko セットアップガイド](GECKO_SETUP.md)を使用してください。このページは Chromium を扱います。

Buttercup は、展開済み Manifest V3 拡張機能、オフスクリーンドキュメント、ネイティブメッセージングをサポートする Windows および Linux のデスクトップ Chromium ブラウザ (Chromium 120 以降) を対象としています。フォークによってはこれらの API を無効化したり、拡張機能を制限したりする場合があります。同じレンダリングエンジンを共有しているだけでは互換性は保証されません。モバイルブラウザと macOS インストーラーはサポートされていません。

## 自動登録

Windows では `Install Buttercup.cmd`、Linux では `sh install.sh` を実行し、ブラウザーの拡張機能ページ (`chrome://extensions` またはブラウザー固有の同等ページ) から `dist/chromium` を読み込みます。Buttercup で **Start and connect** をクリックします。

Linux では、インストーラーが `$XDG_CONFIG_HOME` (既定: `~/.config`) の下にある次の設定ディレクトリを登録します:

| ファミリー | ディレクトリ |
| --- | --- |
| Chrome | `google-chrome`, `google-chrome-beta`, `google-chrome-unstable`, `google-chrome-for-testing` |
| Chromium | `chromium`, `chromium-browser`, `ungoogled-chromium` |
| Edge | `microsoft-edge`, `microsoft-edge-beta`, `microsoft-edge-dev` |
| Brave | `BraveSoftware/Brave-Browser`, `BraveSoftware/Brave-Browser-Beta`, `BraveSoftware/Brave-Browser-Nightly` |
| Brave Origin | `BraveSoftware/Brave-Origin`, `BraveSoftware/Brave-Origin-Beta`, `BraveSoftware/Brave-Origin-Nightly` |
| Vivaldi | `vivaldi`, `vivaldi-snapshot` |
| Opera | `opera`, `opera-beta`, `opera-developer` |
| Thorium | `thorium` |

Windows の登録では、現在のユーザーの Chrome、Chromium、Edge のレジストリキーを使用します。Brave、Vivaldi、その他の多くのフォークは Chrome の登録を再利用します。基盤となる登録の慣例については、[Chrome のネイティブメッセージング仕様](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)と [KeePassXC のブラウザー登録実装](https://github.com/keepassxreboot/keepassxc/blob/develop/src/browser/NativeMessageInstaller.cpp)を参照してください。

この一覧はインストーラーの対応範囲を説明するものであり、すべてのブラウザー/チャネルがエンドツーエンドでテスト済みであることを主張するものではありません。システム全体のファイルやブラウザー設定は変更されません。

## その他のフォークとポータブルインストール

ブラウザーが文書化しているネイティブメッセージングホストの場所を確認してください。Linux では、絶対パスを使用して **NativeMessagingHosts ディレクトリ**を追加します:

```sh
.venv/bin/python scripts/setup-assistant.py \
  --native-host-dir "$HOME/.config/MyChromiumFork/NativeMessagingHosts"
```

Windows では、ブラウザーが別のレジストリキーを使用する場合、**`HKEY_CURRENT_USER\Software` からの相対パス**でブラウザー固有のパスを渡します:

```powershell
.venv\Scripts\python.exe scripts/setup-assistant.py --browser-registry-key 'Vendor\Browser'
```

これにより `HKCU\Software\Vendor\Browser\NativeMessagingHosts\app.buttercup.assistant` が作成されます。マニフェストディレクトリを直接読み取る Windows のフォークでは、絶対 Windows パスを指定して `--native-host-dir` を使用することもできます。

どちらのフラグも繰り返し指定できます。カスタムの場所はインストーラーの再実行後も保持され、`--uninstall` で削除されます。再インストールでは、ペアリングトークンと以前に承認された拡張機能 ID が保持されます。ブラウザーが別の拡張機能 ID を割り当てる場合は、`--extension-id ID_FROM_THE_POPUP` を追加してください。

## Flatpak、Snap、ネイティブメッセージングのないブラウザー

自動起動には、ホスト側のアシスタントを起動する権限が必要です。サンドボックス化されたブラウザーパッケージでは、マニフェストがあってもこれが妨げられる場合があります。Buttercup はサンドボックスを弱めたり、ホストでの無制限の実行を許可したりしません。

自動起動にはネイティブのブラウザーパッケージを使用するか、ブラウザーがループバックネットワークと必要な拡張機能 API を許可する場合は、ホストでバックエンドを実行して手動でペアリングします:

1. ポップアップの **How to connect** から拡張機能 ID をコピーします。
2. ホストのターミナルでバックエンドを起動します:

   ```sh
   .venv/bin/python -m backend.app --extension-id YOUR_EXTENSION_ID --show-token
   ```

   Windows では代わりに `.venv\Scripts\python.exe` を使用します。アシスタントがすでに実行中の場合は、そのインスタンスを停止するか、`--port` と `--state-dir` で別のポートと状態ディレクトリを選択してください。
3. **Local connection — advanced options** で `http://127.0.0.1:8767` (または選択したポート) と表示されたペアリングトークンを入力します。**Check assistant** をクリックします。ターミナルは開いたままにしてください。以降の確認には **Check connection** を使用します。**Start and connect** は再びネイティブメッセージングを呼び出します。

ペアリングトークンは Buttercup のパスワードフィールドにのみコピーしてください。スクリーンショット、イシューレポート、URL に含めないでください。この手動の方法でも、同じループバックバインド、トークン認証、拡張機能オリジンの許可リストが適用されます。ブラウザーによって無効化された拡張機能 API を復元することはできません。

## Helium

Linux のネイティブ Helium で `dist/chromium` を使用します。Helium の[ネイティブメッセージング互換パッチ](https://github.com/imputnet/helium/blob/main/patches/helium/core/scan-chrome-native-messaging-hosts.patch)は、フォールバックとして Chrome のユーザーごとのホストディレクトリを検索します。Buttercup はその Chrome の場所と Helium 独自の `$XDG_CONFIG_HOME/net.imput.helium/NativeMessagingHosts` ディレクトリを登録するため、別の登録形式なしでアシスタントが起動することが期待されます。これはソースで確認された互換性であり、Helium の実際の実行結果ではありません。Windows の Helium は検証されていません。macOS でのアシスタントインストールは引き続きサポートされていません。サードパーティのサンドボックスパッケージでは、手動接続が必要な場合があります。
