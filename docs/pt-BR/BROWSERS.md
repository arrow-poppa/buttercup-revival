# Configuração em navegadores Chromium

Para Firefox, Zen, LibreWolf e outros navegadores Gecko, use `dist/firefox` e o [guia de configuração Gecko](GECKO_SETUP.md). Esta página trata do Chromium.

O Buttercup é destinado a navegadores Chromium de desktop no Windows e Linux que suportem extensões Manifest V3 descompactadas, documentos offscreen e mensagens nativas (Chromium 120 ou superior). Um fork pode desativar essas APIs ou restringir extensões; compartilhar o mesmo motor de renderização não garante compatibilidade. Navegadores móveis e instaladores para macOS não são suportados.

## Registro automático

Execute `Install Buttercup.cmd` no Windows ou `sh install.sh` no Linux e carregue `dist/chromium` na página de extensões do navegador (`chrome://extensions` ou o endereço equivalente). Clique em **Iniciar e conectar** no Buttercup.

No Linux, o instalador registra os seguintes diretórios de configuração abaixo de `$XDG_CONFIG_HOME` (padrão: `~/.config`):

| Família | Diretórios |
| --- | --- |
| Chrome | `google-chrome`, `google-chrome-beta`, `google-chrome-unstable`, `google-chrome-for-testing` |
| Chromium | `chromium`, `chromium-browser`, `ungoogled-chromium` |
| Edge | `microsoft-edge`, `microsoft-edge-beta`, `microsoft-edge-dev` |
| Brave | `BraveSoftware/Brave-Browser`, `BraveSoftware/Brave-Browser-Beta`, `BraveSoftware/Brave-Browser-Nightly` |
| Brave Origin | `BraveSoftware/Brave-Origin`, `BraveSoftware/Brave-Origin-Beta`, `BraveSoftware/Brave-Origin-Nightly` |
| Vivaldi | `vivaldi`, `vivaldi-snapshot` |
| Opera | `opera`, `opera-beta`, `opera-developer` |
| Thorium | `thorium` |

No Windows, o registro usa as chaves do Chrome, Chromium e Edge do usuário atual. Brave, Vivaldi e vários outros forks reutilizam o registro do Chrome. Veja a [especificação de mensagens nativas do Chrome](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) e a [implementação de registro de navegadores do KeePassXC](https://github.com/keepassxreboot/keepassxc/blob/develop/src/browser/NativeMessageInstaller.cpp) para as convenções utilizadas.

Essa lista descreve o que o instalador registra, não afirma que todos os navegadores e canais foram testados de ponta a ponta. Nenhum arquivo do sistema ou configuração de navegador é alterado para todos os usuários.

## Outros forks e instalações portáteis

Encontre o local do assistente de mensagens nativas documentado pelo seu navegador. No Linux, adicione o **diretório NativeMessagingHosts** usando um caminho absoluto:

```sh
.venv/bin/python scripts/setup-assistant.py \
  --native-host-dir "$HOME/.config/MyChromiumFork/NativeMessagingHosts"
```

No Windows, se o navegador usar uma chave de registro própria, informe o caminho específico **relativo a `HKEY_CURRENT_USER\Software`**:

```powershell
.venv\Scripts\python.exe scripts/setup-assistant.py --browser-registry-key 'Vendor\Browser'
```

Isso cria `HKCU\Software\Vendor\Browser\NativeMessagingHosts\app.buttercup.assistant`. Forks do Windows que leem diretórios de manifesto diretamente também podem usar `--native-host-dir` com um caminho absoluto do Windows.

Ambas as opções podem ser repetidas. Os locais personalizados permanecem após executar novamente o instalador e são removidos por `--uninstall`. A reinstalação preserva o token de pareamento e os IDs de extensão autorizados anteriormente. Se o navegador atribuir outro ID, acrescente `--extension-id ID_FROM_THE_POPUP`.

## Flatpak, Snap e navegadores sem mensagens nativas

A inicialização automática precisa de permissão para iniciar o assistente no sistema hospedeiro. Pacotes de navegador isolados podem impedir isso mesmo quando há um manifesto. O Buttercup não enfraquece a sandbox nem concede execução irrestrita no sistema hospedeiro.

Use um pacote nativo do navegador para a inicialização automática ou execute o backend no sistema hospedeiro e faça o pareamento manualmente, caso o navegador permita conexão de rede local e as APIs necessárias:

1. Copie o ID da extensão em **Como conectar** no popup.
2. Inicie o backend em um terminal no sistema hospedeiro:

   ```sh
   .venv/bin/python -m backend.app --extension-id YOUR_EXTENSION_ID --show-token
   ```

   No Windows, use `.venv\Scripts\python.exe`. Se já houver um assistente em execução, interrompa essa instância ou selecione outra porta e diretório de estado com `--port` e `--state-dir`.
3. Em **Conexão local — opções avançadas**, insira `http://127.0.0.1:8767` (ou a porta selecionada) e o token de pareamento exibido. Clique em **Verificar assistente**. Mantenha o terminal aberto. Use **Verificar conexão** nas verificações seguintes; **Iniciar e conectar** invoca mensagens nativas novamente.

Copie o token de pareamento apenas no campo de senha do Buttercup; não o inclua em capturas de tela, relatórios de problemas ou URLs. Esse método manual mantém a mesma restrição de conexão local, autenticação por token e lista de origens de extensão permitidas. Ele não restaura APIs de extensão desativadas pelo navegador.

## Helium

Use `dist/chromium` com o Helium nativo no Linux. O [patch de compatibilidade de mensagens nativas do Helium](https://github.com/imputnet/helium/blob/main/patches/helium/core/scan-chrome-native-messaging-hosts.patch) procura o diretório de hosts do Chrome do usuário como alternativa. O Buttercup registra esse local do Chrome e o diretório próprio do Helium, `$XDG_CONFIG_HOME/net.imput.helium/NativeMessagingHosts`; portanto, espera-se que o assistente inicie sem outro formato de registro. A compatibilidade foi verificada no código-fonte, não em uma execução real do Helium. O Helium no Windows não foi validado; a instalação do assistente no macOS continua sem suporte. Pacotes de terceiros isolados ainda podem precisar de conexão manual.
