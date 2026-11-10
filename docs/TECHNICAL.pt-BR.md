# <img src="icons/icon48.png" height="28" alt=""> Buttercup Revival

Modernização do [Buttercup de iGerman00](https://github.com/iGerman00/buttercup-chrome), a partir do commit `38c8278`, com histórico Git e identidade visual preservados. Extração local com **yt-dlp → pytubefix**, processamento com **FFmpeg** e transcrição com **OpenRouter, DeepInfra, Groq ou API personalizada**. Sem Cobalt, YouTube.js ou inferência local de IA.

**Plataformas de destino: Windows e Linux.** Python 3.11+, Node.js 22+ e Chrome/Chromium 120+. macOS usa a mesma instalação Unix, mas ainda não foi validado. Veja o [registro de validação](docs/VALIDATION.md) para distinguir testes reais de simulações e pendências.

## Usar no dia a dia

Na **0.3.0**, **Transcription → Envio do áudio** permite escolher **Áudio inteiro** (um pedido) ou **Em partes**, com **1–3 pedidos simultâneos**. O padrão continua sendo partes, uma de cada vez; altere para áudio inteiro ou dois pedidos para experimentar menor latência. O ganho depende da fila/velocidade do provedor e da conexão; não houve benchmark pago. Áudio inteiro deve caber no tamanho configurado e respeitar os limites do modelo/rota. Se não couber, o backend para antes do upload. Não há troca automática de estratégia após uma chamada paga falhar. O provedor ainda pode dividir o áudio internamente. Cache existente continua sendo reutilizado, sem nova cobrança só por mudar a estratégia.

O backend anuncia `audio_modes: ["chunks", "whole"]` e confirma o modo no job. Um assistente antigo é bloqueado antes de enviar áudio em modo inteiro: reinicie o assistente após atualizar o código. Nesta instalação Windows, ele foi reiniciado e verificado. Durante paralelismo, resultados são combinados na ordem original; uma falha/cancelamento interrompe a fila e aborta pedidos em andamento, mas a API ainda pode cobrar trabalho já recebido.

O botão **BC** do player agora apenas oculta/exibe a legenda, preservando a faixa nativa em modo `hidden` ao ocultar. Ele mantém cues/tempos disponíveis para integrações e não recarrega a fonte de legendas do YouTube. Legendas já enviadas como arquivo ao asbplayer continuam sob controle do asbplayer. Desligar toda a extensão ou navegar para outro vídeo continua encerrando a sessão do Buttercup.

Na versão **0.2.7**, o cartão **Assistente local** mostra a conexão no início do popup. Clique em **Iniciar e conectar**: o serviço abre em segundo plano e o pareamento é automático. Quando aparecer **Conectado**, escolha o provedor e gere as legendas. Não é preciso deixar terminal aberto nem copiar token. Depois de reiniciar o computador, clique no mesmo botão novamente.

A configuração inicial é feita uma vez por extensão/navegador, após instalar as dependências e carregar `dist/extension`:

1. Na pasta do projeto, abra **Configurar assistente Buttercup.cmd** no Windows. No Linux, execute **Configurar assistente Buttercup.sh** (o assistente gráfico precisa de Tk; Debian/Ubuntu: pacote `python3-tk`).
2. Confirme o ID mostrado em **Como conectar**, no popup, e conclua. Neste computador Windows, o assistente já foi registrado para a extensão instalada.
3. Volte à extensão e clique em **Iniciar e conectar**. Use **Verificar conexão** para conferir o estado.

O registro é apenas para o usuário atual, sem administrador. O host de comunicação aceita exclusivamente o comando de iniciar o serviço e os IDs autorizados; as chaves de API continuam na extensão. A configuração oferece registro para Edge, Chrome e Chromium no Windows e Linux. Não há inicialização automática com o sistema. Endereço/token manuais permanecem em **Conexão local — opções avançadas**.

Se a extensão estava aberta durante uma atualização, recarregue-a em `edge://extensions` ou `chrome://extensions` uma vez. O botão **Recarregar extensão** também aparece quando o popup identifica uma versão anterior em execução.

## Instalação no Windows

Instale Python 3.11+ e Node.js 22+ e coloque FFmpeg **e FFprobe** no PATH. Uma opção para FFmpeg é `winget install "FFmpeg (Essentials Build)"`. Feche e reabra o terminal depois da instalação.

No PowerShell, dentro do repositório:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm.cmd ci
npm.cmd run build
ffmpeg -version
ffprobe -version
node --version
```

`npm.cmd` evita o bloqueio de `npm.ps1` pela política de execução do PowerShell. Não é necessário ativar o ambiente virtual.

Os inicializadores **Iniciar Buttercup.cmd** e **Parar Buttercup.cmd** continuam disponíveis como alternativa. Iniciar liga o serviço em segundo plano e mostra uma confirmação, sem abrir outro perfil de navegador. As configurações e o token ficam no diretório privado `%LOCALAPPDATA%\ButtercupRevival`; as chaves dos provedores são informadas diretamente na extensão. A instalação não ativa inicialização automática com o Windows.

## Instalação no Linux

Em Debian/Ubuntu, instale `python3`, `python3-venv`, `ffmpeg` e um Node.js 22+ compatível com sua distribuição. O pacote `nodejs` de distribuições antigas pode ter versão insuficiente. FFmpeg normalmente já inclui FFprobe.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
npm ci
npm run build
ffmpeg -version
ffprobe -version
node --version
```

O yt-dlp precisa dos scripts EJS e de um runtime JavaScript. A dependência `yt-dlp[default]` instala a versão correspondente de `yt-dlp-ejs`; o backend habilita explicitamente Node.js. Alternativamente, instale Deno 2.3+ e use `--js-runtime deno`. Não é necessário Docker. Consulte a [documentação oficial de EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS).

## Conexão manual (alternativa avançada)

1. Abra `chrome://extensions`, habilite o modo de desenvolvedor e escolha **Carregar sem compactação**.
2. Selecione **`dist/extension`**. O diretório raiz também é carregável, mas o build contém apenas os arquivos necessários da extensão.
3. Copie o ID da extensão. Ele também aparece no popup, em **Como conectar**.
4. Inicie o backend usando esse ID, sem os sinais `< >` dos exemplos abaixo.

Windows, comando direto que funciona mesmo com scripts PowerShell desabilitados:

```powershell
.\.venv\Scripts\python.exe -m backend.app --extension-id <ID_DA_EXTENSAO> --show-token
```

Se a política local permitir executar scripts, também existe:

```powershell
.\scripts\start-backend.ps1 -ExtensionId <ID_DA_EXTENSAO> -ShowToken
```

Linux:

```sh
sh scripts/start-backend.sh ID_DA_EXTENSAO --show-token
```

O servidor atende somente em **`127.0.0.1:8767`**, exige token em todas as rotas e aceita apenas as origens de extensão configuradas. `--port` altera a porta; é necessário ajustar o popup também. Para mais de um navegador, repita `--extension-id`.

O token é gerado automaticamente no diretório privado de estado e pode ser exibido explicitamente com `--show-token`. Copie-o para **Conexão local — opções avançadas → Pairing token**, salve e clique em **Verificar assistente**. Os detalhes técnicos mostram versões dos extratores, disponibilidade de FFmpeg/FFprobe, EJS e runtime. O botão de conexão automática dispensa esse procedimento quando o assistente está registrado.

Diretórios padrão:

- Windows: `%LOCALAPPDATA%\ButtercupRevival` (ACL do usuário atual e SYSTEM).
- Linux: `$XDG_STATE_HOME/buttercup-revival` ou `~/.local/state/buttercup-revival` (diretório `0700`, arquivos privados `0600`).

Use `--state-dir` para mudar o diretório. Não aponte dois servidores para o mesmo estado. Encerre com Ctrl+C.

## Gerar e usar legendas

Na versão **0.2.6**, a caixa **Provedor de transcrição**, no início do formulário, seleciona **OpenRouter**, **DeepInfra**, **Groq** ou **Custom API**. Somente os campos do provedor escolhido ficam visíveis. Uma regra CSS explícita para `[hidden]` evita que estilos de labels e checkboxes mostrem novamente campos ocultos.

1. Em **Transcription**, selecione OpenRouter, informe a chave e um modelo de transcrição, por exemplo `openai/whisper-large-v3`. **Fetch available models** consulta o catálogo de transcrição. O identificador também pode ser digitado livremente.
2. Deixe `verbose_json` e os timestamps por palavra habilitados, ou use segmentos quando o modelo só retornar essa granularidade. O teste com uma pequena amostra de fala verifica o endpoint e os timestamps; ele envia a amostra ao provedor e pode gerar cobrança.
3. Defina o idioma falado ou deixe em branco para detecção automática. Ajuste palavras por bloco, palavras por linha, prompt, limite de upload, duração de chunks e timeout conforme o provedor.
4. Abra ou recarregue um vídeo no YouTube após instalar a extensão. Clique no botão **BC** no player ou em **Generate captions** no popup. Ao clicar no CC original, Buttercup assume o processamento quando sabe que não há legendas humanas prioritárias.
5. Acompanhe extração, conversão, transcrição e processamento no popup ou na mensagem de progresso do player. **Cancel** interrompe o trabalho e remove o áudio temporário.
6. As legendas são uma faixa de texto do próprio elemento de vídeo, sincronizada pelo navegador. O BC alterna sua visibilidade. Legendas humanas têm prioridade por padrão; desmarque **Prefer human captions** somente se desejar substituí-las.
7. Use **Download SRT**, **Download VTT** ou **Send to asbplayer**. O seletor de faixas permite exportar/enviar variantes que já estejam no cache. O cache é consultado antes de acessar o backend ou pagar por nova transcrição.

O processamento continua ao fechar o popup. A navegação para outro vídeo ou o fechamento da aba cancela o trabalho anterior. Alterar apenas a formatação não muda a chave do cache.

Em **General → Audio track for transcription**, escolha **Original audio (avoid dubbing)** para transcrever a faixa identificada como original pelo YouTube. Essa opção permite vídeos com múltiplas faixas, fica salva ao fechar o popup e mantém o modo Chat Completions e o provedor fixado. Se o extrator não conseguir identificar a faixa original, a operação falha antes de enviar áudio ao provedor; nenhuma dublagem é escolhida como substituta. A seleção controla o áudio baixado para transcrição; escolha a mesma faixa no player do YouTube para ouvir o áudio correspondente. O cache separa áudio padrão e original. Após atualizar o código, reinicie o backend e recarregue a extensão.

As configurações são salvas automaticamente a cada alteração, sem precisar clicar em **Save settings** antes de fechar o popup. Campos ainda incompletos (modelo vazio, número apagado ou JSON em edição) ficam preservados como rascunho; só uma configuração válida passa a ser usada nas transcrições. O aviso junto ao formulário mostra se a configuração foi aplicada ou se falta corrigir um campo. Modelos e slugs de provedor podem ser digitados livremente; as listas são apenas sugestões.

O modo **Chat Completions** e o provedor fixado ficam gravados no momento da edição, mesmo se o popup fechar antes de receber uma confirmação. Cada alteração grava somente os campos editados; salvar um formulário antigo não substitui uma escolha mais recente de modo ou provedor. As preferências de OpenRouter e Custom são preservadas separadamente e sobrevivem ao reinício completo do navegador. O aviso sobre a combinação de modelo e rota é apenas informativo e não muda a seleção.

Uma configuração antiga inválida pode ser aberta e corrigida no formulário, preservando chave e token. Falhas ao carregar o formulário liberam os controles e mostram uma mensagem; se o processo em segundo plano não responder, o popup recupera os valores locais e orienta recarregar a extensão para usar as ações.

Na versão 0.2.1, o popup usa o comando de salvamento compatível com os workers anteriores. Se um worker antigo descartar modo, provedor ou faixa de áudio, a geração fica bloqueada e aparece **Recarregar extensão**. Esse botão conclui a atualização mantendo as configurações. Requisições de transcrição não são repetidas automaticamente.

A versão **0.2.2** confirma que o processo de áudio está pronto antes de enviar uma ação e reconecta o código do player quando perde o receptor. Abas com os controles antigos (anteriores a 0.2.2) são recarregadas uma vez ao solicitar geração, removendo timers e cliques órfãos; as versões atuais reconectam sem atualizar a página. A entrega de legendas confirma o recebimento e pode ser repetida sem chamar o provedor novamente. Controles, faixas e cues não são duplicados. Após atualizar o build, recarregue a extensão uma vez em `edge://extensions` ou `chrome://extensions`.

**Max audio chunk (MB)** limita cada bloco enviado, não o vídeo completo ou os créditos da conta. O teto da extensão é 100 MB (padrão 24 MB); Groq e OpenRouter recusam arquivos enviados acima de 25 MB em Audio Transcriptions; não representa um limite universal de Chat Completions. A duração configurada dos blocos também determina quando dividir o áudio.

### API personalizada e tradução

**Fixar o provedor no OpenRouter:** em **Transcription → OpenRouter API**, selecione **Chat Completions (audio + provider pinning)** e informe o slug em **Fixar provedor / Pin provider**. As chamadas usam `/api/v1/chat/completions`, áudio em Base64 e `provider.only: [slug]` com `allow_fallbacks: false`. Se esse provedor não estiver disponível para o modelo, a chamada falha; a extensão não troca de provedor nem de endpoint. Deixe o campo em branco para roteamento automático.

Marque **Never fall back to another provider (strict)** para exigir uma seleção explícita e bloquear rotas sem suporte. Essa opção requer um modelo de chat com entrada de áudio, compatível com o provedor escolhido. O sufixo `model:provider` é um atalho interpretado pelo Buttercup: a requisição contém o modelo base e `provider: {only: ["deepinfra"], allow_fallbacks: false}` quando o provedor escolhido é DeepInfra. Provedores conflitantes entre os dois campos são recusados. A escolha fica salva e o popup mostra o destino efetivo.

**Whisper não é um modelo de chat.** `openai/whisper-large-v3-turbo`, com ou sem sufixo `:deepinfra`, não funciona em Chat Completions no OpenRouter. Na versão **0.2.4**, essa combinação é recusada localmente antes da extração/envio. O botão **Use Audio Transcriptions — automatic provider routing** corrige a rota, remove a exigência de pinning e usa `verbose_json`, somente após o clique explícito do usuário. Não inicia transcrição nem altera a chave. A alternativa direta para usar Whisper somente no DeepInfra é a API desse provedor com sua própria chave; uma chave OpenRouter não serve como chave DeepInfra.

O modo estrito recusa **Audio Transcriptions** do OpenRouter, inclusive quando essa base é usada em Custom: essa rota não aplica allowlists de provedores. O bloqueio ocorre antes da extração/envio, inclusive pelo botão do player quando existe um rascunho estrito inválido. A extensão não muda sua rota automaticamente. Chat Completions precisa ser compatível com o modelo/provedor escolhido; caso contrário, a chamada falha, sem trocar o provedor/modelo. Para transcrição Whisper com provedor único quando o chat não for compatível, use uma API direta desse provedor. Resultados do cache anteriores ao modo estrito ficam separados das novas entradas estritas.

As requisições ao host `openrouter.ai` identificam o aplicativo como **Buttercup** usando `X-OpenRouter-Title` e `HTTP-Referer: http://localhost:8767` (identificador da aplicação local, não um callback). Isso também se aplica ao OpenRouter configurado em Custom. A atribuição segue a [documentação do OpenRouter](https://openrouter.ai/docs/app-attribution).

Esse modo requer um **modelo de chat com entrada de áudio**; o botão **Fetch audio-input chat models** filtra o catálogo por essa capacidade. Os modelos de transcrição Whisper não são presumidos compatíveis com chat. O modelo deve retornar JSON com segmentos contendo `start`, `end` (segundos relativos ao chunk) e `text`, ou palavras com seus timestamps. A aplicação valida os tempos fornecidos, aplica os offsets e não cria tempos a partir de uma resposta apenas textual. A precisão dos timestamps de um modelo de chat depende dele e precisa ser validada com uma amostra de fala. O teste de compatibilidade rejeita respostas sem tempos utilizáveis e respostas truncadas.

Para `openai/whisper-large-v3-turbo` no OpenRouter, o caminho documentado para obter timestamps é **Audio Transcriptions** com **verbose_json**. O popup mostra essa orientação quando um modelo Whisper está selecionado em Chat Completions. Nessa rota de transcrição do OpenRouter, o roteamento de provedor é automático; a opção de fixar no chat continua disponível para modelos compatíveis com a rota e com tempos utilizáveis na resposta.

Se a API retornar palavras com tempos inválidos (por exemplo, `start` igual a `end`), a extensão usa os segmentos válidos da mesma resposta e mostra um aviso, sem descartar palavras isoladas do texto nem fazer outra chamada paga. Também pode usar palavras válidas quando os segmentos opcionais forem inválidos. Sem uma alternativa válida, o erro informa a lista e a entrada que falharam; tempos ausentes, negativos, invertidos ou abaixo da resolução de um milissegundo não são inventados ou estendidos. Em Audio Transcriptions com `verbose_json`, a requisição pede segmentos, além de palavras quando essa opção estiver ativa.

Na **0.2.8**, esse fallback também funciona quando apenas algumas partes do vídeo têm palavras válidas: os trechos restantes usam seus segmentos, sem desaparecer da legenda final. Os trechos com palavras continuam permitindo reagrupamento local. Resultados antigos em cache recuperam segmentos sem palavras correspondentes quando essas informações foram preservadas; isso não faz outra chamada ao provedor.

O limite de tamanho **não corta o vídeo em 25 MB e descarta o restante**. A extração percorre o áudio completo, dividindo pela duração configurada (padrão 120 s), com sobreposição de 1,5 s. A 64 kbps, cada parte de 120 s ocupa aproximadamente 0,96 MB; aumentar o limite de tamanho não altera esse corte por duração. Os 25 MB são uma restrição documentada do multipart OpenRouter/Groq, mas não uma regra universal de toda rota ou provedor. O aplicativo mantém um teto conservador nessa versão. Alterar a duração dos blocos afeta novas transcrições; resultados existentes continuam sendo lidos do cache.

`Subtitles ready` com o aviso de palavras inválidas indica que as legendas estão prontas usando os tempos de segmentos, com menor granularidade. Um aviso adicional de envio automático ao asbplayer é separado da transcrição; as legendas continuam disponíveis no Buttercup. O envio aceita sucesso HTTP sem corpo, enquanto a consulta de mídia exige JSON válido.

O modo **Audio Transcriptions** continua usando multipart em `/audio/transcriptions`, com roteamento automático. Sua limitação de pinning não se aplica à rota de Chat Completions. O cache distingue os dois modos e cada provedor fixado; resultados antigos do modo automático não satisfazem uma nova configuração fixada.

Referências: [áudio via Chat Completions](https://openrouter.ai/docs/guides/overview/multimodal/audio), [fixação de provedores](https://openrouter.ai/docs/guides/routing/provider-selection#allowing-only-specific-providers) e [roteamento da rota de transcrição](https://openrouter.ai/blog/tutorials/transcription-on-openrouter/#how-does-provider-routing-work-for-transcription).

Selecione **Custom API**, informe a base (por exemplo `https://seu-provedor.example/v1`), modelo e chave opcional. Em **Custom API endpoint**, escolha multipart em `/audio/transcriptions` ou áudio Base64/JSON em `/chat/completions`. O modo de chat exige um modelo com entrada de áudio e timestamps utilizáveis. Headers adicionais são restritos a nomes `X-`; cookies, Host e Authorization não podem ser sobrescritos. Chrome pede acesso ao host selecionado ao salvar explicitamente ou usar uma ação que precisa dele; o salvamento automático não abre pedidos de permissão.

No Custom, **Fixar provedor / Pin provider** também é opcional e aceita um slug digitado ou uma sugestão. Em branco, nenhum parâmetro de roteamento é adicionado. Preenchido, envia `provider.only: [slug]` e `allow_fallbacks: false`, como objeto JSON em Chat Completions ou no campo multipart `provider` em Audio Transcriptions. Essa opção depende do suporte da API selecionada a esses campos; APIs que os ignoram não garantem fixação. No próprio OpenRouter, use Chat Completions para fixar o provedor, inclusive quando configurar a base manualmente em Custom. O cache diferencia também a rota e o provedor do Custom.

Compatibilidade com chat não implica compatibilidade com áudio. Não são inventados timestamps para respostas contendo apenas texto: a extensão apresenta uma mensagem de incompatibilidade. A opção de tradução para inglês exige uma API personalizada com suporte explícito a `/audio/translations`; OpenRouter não é presumido compatível com esse endpoint.

### DeepInfra e Groq diretos

**DeepInfra:** selecione DeepInfra e informe **DeepInfra API key**. O modelo padrão é `openai/whisper-large-v3-turbo`. Também há sugestões para Whisper large-v3, `Qwen/Qwen3-ASR-1.7B`, `Qwen/Qwen3-ASR-0.6B` e Voxtral Mini/Small. **Fetch DeepInfra speech models** consulta todos os modelos ASR ativos do catálogo, incluindo NVIDIA, em vez de restringir a lista a Whisper. É possível digitar um ID. A integração usa `POST https://api.deepinfra.com/v1/inference/{modelo}` com multipart `audio`, `task=transcribe`, `chunk_level=word|segment` e `initial_prompt` quando configurado, conforme o schema nativo publicado dessas famílias. O idioma é opcional. Os tempos retornados passam pela mesma validação e formatação local. [Whisper](https://deepinfra.com/openai/whisper-large-v3-turbo/api), [Qwen ASR](https://deepinfra.com/Qwen/Qwen3-ASR-1.7B/api), [Voxtral](https://deepinfra.com/mistralai/Voxtral-Mini-3B-2507/api).

**Groq:** selecione Groq e informe **Groq API key**. Use `whisper-large-v3-turbo` ou `whisper-large-v3`, sem o prefixo `openai/`. O botão de modelos consulta o catálogo do Groq e filtra modelos Whisper ativos. A integração usa `POST https://api.groq.com/openai/v1/audio/transcriptions` com multipart `file`, `model`, `response_format=verbose_json`, timestamps de segmentos e, quando solicitados, de palavras. Prompt e idioma são opcionais. [Documentação oficial](https://console.groq.com/docs/speech-to-text).

O catálogo Groq também reconhece futuros modelos que o serviço marque explicitamente como ASR ou compatíveis com `/audio/transcriptions`; modelos de chat/TTS não entram por simplesmente terem áudio. No OpenRouter, **Fetch available models** em Audio Transcriptions consulta `/models?output_modalities=transcription`, sem limitar famílias. Listar um modelo não garante legendas sincronizadas: modelos que só devolvem texto, diarização sem texto ou que rejeitam `verbose_json`/timestamps não podem gerar cues sem uma etapa de alinhamento. Use o teste com uma amostra para confirmar a saída; não há geração artificial de tempos nem troca automática de modelo.

Groq e DeepInfra possuem chaves e modelos próprios, preservados ao alternar a seleção e reiniciar o navegador. Os presets diretos não usam chaves/créditos do OpenRouter, não enviam headers de APIs personalizadas e não tentam outro provedor/modelo após uma falha. O backend local continua recebendo apenas seu token de pareamento, nunca as chaves dos provedores. O cache distingue os serviços e permite reformatar uma transcrição existente sem nova chamada, inclusive sem uma chave configurada. Os presets diretos atualmente oferecem transcrição; tradução continua disponível apenas no Custom com suporte explícito.

### YouTube Authentication / Cookies

No popup, escolha explicitamente um `cookies.txt` Mozilla/Netscape contendo cookies de YouTube/Google e clique em **Import cookies**. Há status, data de importação, substituição, ativação/desativação e remoção. Arquivos com cookies de outros sites são rejeitados: exporte apenas os domínios necessários.

O padrão é manter os cookies na memória do backend, com uma cópia temporária protegida durante a extração. **Authorize persistence between backend sessions** permite armazená-los entre sessões. **Remove cookies** cancela trabalhos autenticados e remove o arquivo persistente e as cópias temporárias. Não há coleta automática do navegador. Os cookies nunca vão ao provedor de transcrição nem ao cache.

O yt-dlp usa seu `cookiefile` oficial. O pytubefix instalado não oferece entrada Netscape documentada; por isso o fallback é usado somente sem cookies. Erros de autenticação, restrição regional, indisponibilidade e HTTP 429 não são escondidos por fallback. Cookies expirados ou recusados aparecem no status; ter cookies não garante acesso a qualquer vídeo.

### Cache local e comunitário

O cache local usa IndexedDB, organizado por vídeo, idioma de origem/destino, faixa de áudio padrão ou original, tipo, provedor, endpoint, modelo, granularidade e prompt. Armazena timestamps, texto, data, revisão e versão. Não armazena áudio, cookies ou chaves. **Clear local cache** remove as legendas persistentes.

O [serviço comunitário opcional](cache-service/README.md) está preparado para Cloudflare Workers + D1, com validação, limites de tamanho, deduplicação, versões e moderação. Consulta e compartilhamento são desligados por padrão e independem do cache local. A publicação requer consentimento explícito. Nenhum serviço foi implantado automaticamente.

### asbplayer

Inicie o [servidor oficial do asbplayer](https://docs.asbplayer.dev/docs/reference/external-api/), geralmente em `http://127.0.0.1:8766`. Configure essa base em **Integrations**, verifique os meios conectados e, quando suportado pelo servidor, informe `mediaId` para direcionar o destino. O envio usa `POST /asbplayer/load-subtitles` com `{files:[{name,base64}]}` e SRT em UTF-8. Envio manual e automático funcionam tanto com resultados novos quanto com o cache. O suporte a direcionamento deve ser confirmado na versão instalada do asbplayer.

### Idiomas da interface

O popup e os avisos no player estão disponíveis em inglês, português (Brasil), espanhol, japonês e chinês simplificado. No seletor do topo do popup escolha um idioma ou deixe em **Auto** para seguir o idioma do navegador.

As traduções ficam em `locales/<idioma>.js`, no formato `"texto original": "tradução"`; o texto original é exatamente o que está escrito no código ou no `popup.html`, e `{0}`, `{1}` marcam as partes variáveis. Um texto sem tradução aparece como foi escrito. Para adicionar um idioma, crie o arquivo, registre-o em `api/i18n.js` (`LANGUAGES` e `resolveLanguage`), em `validateSettings` e na lista do popup.

## Limites e segurança

- `--max-duration 14400`, `--max-storage-mb 1024` e `--concurrency 2` configuram os limites padrão. Áudio longo é convertido em MP3 mono 16 kHz/64 kbps e dividido com sobreposição de 1,5 segundo. Os offsets são aplicados na extensão e cada sobreposição pertence a um único chunk.
- Trabalhos finalizados ficam disponíveis até serem consumidos e excluídos pela extensão; há limpeza por TTL como proteção para clientes interrompidos. Sobras de uma sessão encerrada abruptamente são apagadas na próxima inicialização.
- Credenciais ficam em `chrome.storage.local`, com acesso restrito aos contextos confiáveis. Não são sincronizadas para a conta Chrome, expostas ao YouTube ou aceitas pelo backend de extração. O documento offscreen lê as credenciais apenas para enviar a transcrição ao provedor.
- A integração não substitui `fetch`, XHR, Trusted Types ou respostas globais do YouTube. A comunicação com o contexto da página lê metadados mínimos e alterna apenas o módulo de legendas do player.
- As permissões são: `storage` para configurações/cache; `scripting` para metadados e módulo de legendas; `offscreen` para processar blobs durante requisições longas; `activeTab` para identificar a aba aberta; `downloads` para SRT/VTT. Hosts fixos: YouTube, OpenRouter e loopback; outros hosts HTTPS são opcionais e solicitados ao salvar sua configuração.
- Não há telemetria. Arquivos de cookies, tokens locais e ambientes virtuais estão no `.gitignore`.

## Estrutura

```text
manifest.json, buttercup.js, content.js, popup.html   Extensão derivada do original
api/                                                Configuração, backend e provedores
background/                                         Service worker e processamento offscreen
subtitles/, cache/, integrations/                    Formatos, IndexedDB e asbplayer
assets/, icons/                                     Popup e recursos visuais
backend/app/                                        FastAPI, cookies, processos, áudio e jobs
backend/app/extractors/                              yt-dlp, pytubefix e gerenciador
cache-service/                                      Worker/D1 opcional
scripts/                                            Build e inicialização Windows/Unix
tests/                                              Testes Python e JavaScript
docs/                                               Origem, validação e histórico de alterações
dist/extension/                                     Build local gerado (não versionado)
```

## Testes e atualizações

Windows:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest tests/backend -q
npm.cmd test
npm.cmd run build
```

Linux:

```sh
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python -m pytest tests/backend -q
npm test
npm run build
```

O teste de conversão real exige FFmpeg/FFprobe no PATH; na ausência, é reportado como ignorado. A matriz `.github/workflows/test.yml` prepara as dependências no Windows e Linux, em Python 3.11 e 3.13. A existência dessa matriz não significa que o workflow já foi executado.

Teste de navegador, usando Chromium instalado pelo Playwright:

```sh
npx playwright install chromium
npm run test:browser
```

No PowerShell use `npx.cmd` e `npm.cmd`. `BUTTERCUP_BROWSER` pode apontar para um executável Chromium/Edge já instalado. O teste usa um perfil descartável e serviços simulados; não comprova a integração real com YouTube/OpenRouter/asbplayer.

`npm run test:youtube` é uma verificação opcional da página real do YouTube: confere metadados, botão BC e uma faixa de teste explicitamente sintética. Não chama o provedor de transcrição.

Teste real opcional de extração (faz requisições ao YouTube, sem cookies):

```sh
python scripts/live-extraction.py --video jNQXAC9IVRw
```

Use o Python do ambiente virtual no seu sistema. O relatório é salvo em `test-results/live-extraction.json`. Para atualizar os extratores: `python -m pip install -U "yt-dlp[default]" pytubefix`. Em caso de `MemoryError` durante a pré-compilação do instalador, repita com `--no-compile`.

## Limitações atuais e créditos

Vídeos ao vivo são recusados. Vídeos com múltiplas faixas exigem a opção **Original audio**, com identificação explícita da faixa pelo extrator. Mudanças na interface do YouTube podem exigir ajustes no seletor de controles ou no método de metadados. A renderização preserva uma faixa nativa no vídeo; estilos do menu de legendas do YouTube não controlam essa faixa.

A interface se concentra nas páginas `/watch`. O backend valida também URLs curtas/Shorts, mas a interface específica de Shorts não foi validada.

Consulte [VALIDATION.md](docs/VALIDATION.md) para as validações externas ainda pendentes. O fluxo pago real, autenticação real por cookies e servidor real do asbplayer precisam ser testados com os serviços do usuário antes de considerar todos os critérios do projeto concluídos.

Autor original: **iGerman00 / German**. Créditos históricos a DualSubs/Virgil Clyne, Groq, Cobalt e Cloudflare estão preservados no [README original](docs/README.upstream.md); Groq e Cobalt foram removidos das dependências desta versão. A árvore original não contém arquivo `LICENSE`; nenhuma licença foi inventada ou atribuída ao código original. Veja [UPSTREAM.md](docs/UPSTREAM.md).

Nenhum repositório, release, fork remoto ou serviço foi publicado.
