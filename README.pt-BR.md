# 🌼 Buttercup Revival

[English](README.md) · Português (Brasil) · [Español](README.es.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

> Este guia traduzido resume o README; detalhes técnicos adicionais estão disponíveis na [versão completa em inglês](README.md).

**Transcrição de vídeos do YouTube sob demanda para navegadores Chromium e Gecko.**

O Buttercup Revival transcreve o áudio do vídeo que você está assistindo usando o modelo de sua escolha. Exiba legendas no player, envie-as ao [asbplayer](https://github.com/asbplayer/asbplayer) ou salve arquivos `.srt` e `.vtt`. O áudio é preparado no seu computador e enviado ao provedor de transcrição selecionado.

[Baixar a versão mais recente](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip) · [Guia para Firefox e Zen (inglês)](docs/GECKO_SETUP.md) · [Código-fonte e documentação em inglês](README.md)

## O que o Buttercup faz

- Cria legendas para vídeos sem legendas ou com legendas automáticas ruins, usando DeepInfra, Groq, OpenRouter ou uma API compatível com OpenAI.
- Ajusta a divisão das legendas ao conteúdo falado e permite configurar seu tamanho e as quebras de linha.
- Reutiliza transcrições em cache para alterar o formato ou exportar novamente sem outra chamada à API. **Regenerar** solicita uma nova transcrição.
- Prepara o áudio localmente com `yt-dlp` e FFmpeg. O assistente local se comunica com a extensão; o áudio e a chave de API necessária são enviados ao provedor escolhido.
- Oferece seis idiomas para a interface: inglês, português brasileiro, espanhol, japonês, chinês simplificado e chinês tradicional.

## Requisitos

Windows 10/11 ou Linux; navegador de desktop Chromium 120+ ou Gecko 140+; uma chave de API de um provedor de transcrição; e cerca de 1 GB de espaço livre. Os instaladores instalam Python, Node.js e FFmpeg quando necessário. Consulte a [compatibilidade Chromium](docs/BROWSERS.md) e o [guia Gecko](docs/GECKO_SETUP.md) para detalhes.

## Instalação

1. [Baixe o pacote completo](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip), extraia-o e guarde a pasta em um local permanente, como Documentos. Mover ou apagar a pasta pode interromper o funcionamento.
2. **Windows:** clique duas vezes em `Install Buttercup.cmd`. Se o Windows bloquear o script, escolha **Mais informações → Executar assim mesmo**. Autorize a instalação do Node.js se solicitado.
3. **Linux:** abra um terminal na pasta extraída e execute:

   ```sh
   sh install.sh
   ```

   O instalador usa `apt`, `dnf`, `pacman` ou `zypper` e solicita a senha para instalar dependências ausentes.
4. **Chromium, Chrome, Edge, Brave e outros derivados:** abra `chrome://extensions`, ative o modo de desenvolvedor, clique em **Carregar sem compactação** e escolha `dist/chromium`. Fixe o Buttercup na barra do navegador.
5. **Firefox, Zen e outros navegadores Gecko:** siga o [guia de instalação Gecko](docs/GECKO_SETUP.md). O pacote inclui `dist/firefox` e `dist/firefox-unsigned.zip`. O Zen pode manter a extensão não assinada quando `xpinstall.signatures.required` está em `false` em `about:config`; o Firefox Release padrão exige assinatura. O guia explica as diferentes edições e métodos Flatpak. No Linux, o Helium usa a versão Chromium; os caminhos do assistente estão registrados, mas o navegador ainda não foi testado em execução.
6. Crie uma chave em [Groq](https://console.groq.com/keys), [DeepInfra](https://deepinfra.com/dash/api_keys), [OpenRouter](https://openrouter.ai/keys) ou outro provedor compatível. Abra o Buttercup, clique em **Start and connect** e, em **Transcription**, escolha o provedor e cole a chave.

Navegadores nativos usam mensagens nativas para conectar o assistente. Snap e Flatpak podem bloqueá-las. No Zen Flatpak, escolha a [conexão automática com Flatseal](docs/GECKO_SETUP.md#method-a-automatic-connection-with-flatseal) ou a [conexão manual](docs/GECKO_SETUP.md#method-b-manual-connection-without-extra-flatpak-permissions). O guia está em inglês.

## Primeiras legendas

Abra um vídeo no YouTube e clique no botão rosa **BC** no player. O aviso mostra o progresso e as legendas aparecem no vídeo; clique novamente para ocultá-las ou mostrá-las. O tempo inicial depende do provedor. Vídeos já transcritos podem usar o cache. Após reiniciar o computador, abra o Buttercup e clique em **Start and connect**.

Se o vídeo tiver legendas humanas e você quiser substituí-las, desative **Prefer human captions**. Para vídeos dublados, selecione **Original audio** em **Audio track for transcription**.

## Usar com asbplayer

O servidor WebSocket do asbplayer é separado do Buttercup e precisa ser iniciado uma vez por sessão. Instale [Go](https://go.dev/dl/) e [Git](https://git-scm.com/downloads) e execute:

```sh
git clone https://github.com/asbplayer/asbplayer.git
cd asbplayer/scripts/web-socket-server
go run .
```

Deixe o terminal aberto. No asbplayer, ative **Misc → WebSocket client**. No Buttercup, abra **Integrations → asbplayer**, verifique a conexão e ative o envio automático. Para mostrar apenas as legendas do asbplayer, desative a exibição das legendas Buttercup no vídeo. Mais detalhes no [guia do asbplayer](https://docs.asbplayer.dev/docs/guides/web-socket-server).

## Arquivos e configurações

Use **Download SRT** ou **Download VTT** para salvar as legendas atuais; a opção de salvamento automático grava um SRT após a geração. Escolha uma pasta existente ou deixe em branco para usar Downloads. Arquivos com o mesmo nome são substituídos.

O menu superior altera o idioma; **Auto** segue o navegador. Em **Transcription**, escolha provedor, chave e modelo. Solicitar timestamps por palavra ajuda a criar legendas curtas, quando o modelo os oferece. Em **Subtitle layout**, ajuste segmentação, limite de palavras e quebras de linha. Quando há apenas timestamps de segmentos, limites internos podem ser estimados. **Keep provider segments (original timing)** mantém os segmentos originais e ignora o limite de palavras; defina a quebra de linha como `0` para manter o layout recebido. Para japonês e chinês, a divisão considera caracteres e preserva palavras latinas e grafemas.

Em **Audio upload (advanced)**, escolha envio em partes ou áudio completo. O padrão é MP3 mono, 16 kHz e 64 kbps; FLAC mono, 16 kHz e 16 bits também está disponível. FLAC costuma gerar arquivos maiores e não garante maior precisão; a compatibilidade depende do provedor e modelo. A escolha é salva por configuração de provedor/modelo e incluída no backup. Atualize e reinicie o assistente para usar FLAC. Ambos os formatos compartilham o cache: use **Regenerate subtitles** para enviar áudio novo no formato escolhido, sujeito a cobranças. O teste de amostra envia o arquivo selecionado sem convertê-lo.

O envio em partes usa sobreposição de 1,5 segundo e respeita o limite de tamanho configurado, cujo padrão é 24 MB. Para vídeos restritos, importe um `cookies.txt` em **YouTube Authentication / Cookies**; apenas cookies do YouTube e Google são aceitos e permanecem no computador.

Os atalhos padrão são **Alt+Shift+G** para gerar e **Alt+Shift+U** para regenerar. Personalize-os em **Keyboard shortcuts → Configure shortcuts**; o navegador os armazena separadamente do backup. Algumas combinações podem ser reservadas pelo navegador.

## Atualização e importação

Baixe o [ZIP mais recente](https://github.com/arrow-poppa/buttercup-revival/releases/latest/download/Buttercup-Revival.zip), extraia-o sobre a mesma pasta e execute o instalador novamente. No Chromium, recarregue a extensão em `chrome://extensions`. No Gecko, instale o novo ZIP sobre a extensão existente conforme o [guia](docs/GECKO_SETUP.md), sem removê-la primeiro. Os IDs são estáveis, mas não há canal de atualização automática. Exporte suas configurações antes de atualizar para ter um backup.

A importação de configurações, cookies e conexão, assim como o teste de áudio, abre uma página persistente. Selecione o arquivo nessa página e clique no botão correspondente; selecionar um arquivo não o envia automaticamente. A persistência de cookies é opcional e fica desativada por padrão.

## Solução de problemas

- **Assistente desconectado:** execute o instalador na pasta correta e use **Start and connect**. Para Zen Flatpak, conclua um dos métodos do guia; na conexão manual, execute `Start Buttercup assistant.sh` e clique em **Check connection**.
- **Botão BC ausente:** recarregue o YouTube e verifique se o Buttercup está ativado.
- **Erro de chave:** cole a chave do provedor selecionado. Para erro de autenticação ou 403 no YouTube, tente importar cookies atualizados.
- **Legendas muito longas:** use um modo de segmentação do Buttercup e reduza o limite de palavras; os segmentos originais do provedor ignoram esse limite.
- **Arquivo grande demais:** selecione envio em partes. Para problemas no asbplayer, inicie seu servidor WebSocket e ative o cliente.
- Se ainda precisar de ajuda, [abra uma issue](https://github.com/arrow-poppa/buttercup-revival/issues) com a mensagem e os passos para reproduzir.

## Privacidade, desenvolvimento e créditos

O áudio é convertido localmente e enviado ao provedor escolhido. As chaves ficam no armazenamento privado da extensão; o assistente aceita conexões locais autorizadas por um token. O cache comunitário é opcional e desativado por padrão. **O backup de configurações contém suas chaves de API: proteja-o como uma senha.**

Para desinstalar, execute `Uninstall Buttercup.cmd` no Windows ou `.venv/bin/python scripts/setup-assistant.py --uninstall` no Linux, remova a extensão no navegador e apague a pasta. Dependências compartilhadas permanecem instaladas.

Consulte o [README em inglês](README.md#-for-developers) para estrutura, comandos de build/teste e arquitetura. Cada execução do instalador tenta atualizar `yt-dlp` e `pytubefix` para versões estáveis compatíveis.

### Compilar e testar

Para desenvolvimento, instale Python 3.11+, Node.js 22+ e FFmpeg. Execute os comandos abaixo na raiz do projeto. O build compartilha o código entre os dois navegadores; a versão Gecko usa uma página de processamento em segundo plano. O assistente registra os dois IDs estáveis e usa mensagens nativas. Solicitações pagas que falham não são repetidas nem redirecionadas automaticamente.

```sh
python -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-dev.txt
npm ci
npm run build
npm run package
npm test
.venv/bin/python -m pytest tests/backend -q
```

O Buttercup Revival é uma versão modernizada de [Buttercup, de iGerman00](https://github.com/iGerman00/buttercup-chrome), e usa [yt-dlp](https://github.com/yt-dlp/yt-dlp), [pytubefix](https://github.com/JuanBindez/pytubefix), [FFmpeg](https://ffmpeg.org/) e [FastAPI](https://fastapi.tiangolo.com/). O projeto original não declara licença e este fork não adiciona uma; veja [UPSTREAM](docs/UPSTREAM.md).
