# Configure o Buttercup no Firefox, Zen e outros navegadores Gecko

O Buttercup Revival é uma extensão para **Chromium e Gecko**. Este guia explica como instalar a versão Gecko no Windows e Linux, incluindo duas formas de conectar o Zen Flatpak ao assistente local.

Você instalará duas partes: a extensão adiciona o botão BC ao YouTube; o assistente prepara o áudio no computador. Instalar uma extensão não assinada e conectar o assistente são etapas diferentes. Alterar a preferência de assinatura não elimina as restrições de mensagens nativas do Flatpak.

## Escolha sua opção

| Seu navegador | Instalar a extensão | Conectar o assistente |
| --- | --- | --- |
| Zen nativo | Instalação permanente não assinada, explicada abaixo, ou instalação temporária | Clique em **Start and connect** |
| Firefox Release padrão | Pacote assinado pela Mozilla para instalação permanente, ou instalação temporária | Clique em **Start and connect** em uma instalação nativa |
| Firefox ESR, Developer Edition, Nightly ou uma versão sem marca | A instalação não assinada é possível em versões compatíveis; consulte a tabela de assinaturas | Clique em **Start and connect** em uma instalação nativa |
| Zen Flatpak | Instale como no Zen | Escolha **Método A: automático com Flatseal** ou **Método B: conexão manual** |
| Outros navegadores Gecko modernos | Consulte a tabela de assinaturas e os requisitos do navegador | O suporte a mensagens nativas depende do navegador e do pacote; veja os [detalhes de compatibilidade](../firefox.md) |

O Buttercup é destinado ao Gecko 140 ou superior. O suporte a assinaturas, por si só, não significa que todas as versões tenham sido testadas com o Buttercup. Firefox nativo e Zen nativo/Flatpak foram testados em execução; LibreWolf e Waterfox não foram testados individualmente em execução.

<a id="extract"></a>
## 1. Extraia o pacote correto

1. Extraia o ZIP completo do projeto Buttercup para uma pasta que você pretende manter, como Documentos.
2. Abra a pasta extraída. Ela deve conter `install.sh`, `scripts` e `dist`. Pode haver outra pasta `Buttercup-Revival` dentro da primeira: abra a que contém esses arquivos.
3. Verifique se `dist/firefox/manifest.json` e `dist/firefox-unsigned.zip` existem. Um pacote antigo apenas para Chromium não os contém. Baixe a **v0.6.0 ou posterior** ou [compile a partir do código-fonte](../../README.md#-for-developers).

O **ZIP completo do projeto** contém o assistente e os instaladores. O **`dist/firefox-unsigned.zip`**, menor, contém somente a extensão. Selecione o ZIP menor ao instalar a extensão; não selecione o ZIP completo do projeto.

Mantenha a pasta extraída no mesmo lugar após a instalação. Movê-la pode impedir que o assistente seja iniciado.

## 2. Execute o instalador

**Windows:** clique duas vezes em `Install Buttercup.cmd` nessa pasta.

**Linux:** abra um terminal **dentro dessa pasta** e execute:

```sh
sh install.sh
```

Se disponível, use a opção **Abrir no terminal** do gerenciador de arquivos. Caso contrário, use `cd` para entrar primeiro na pasta. Por exemplo, se você extraiu diretamente em Downloads:

```sh
cd "$HOME/Downloads/Buttercup-Revival"
```

Esse caminho é apenas um exemplo: use a pasta em que você realmente extraiu o projeto. Mantenha as aspas em caminhos com espaços ou `(1)`. Se o terminal terminar em `:~$`, geralmente você ainda está na pasta pessoal, não na pasta do projeto.

O instalador cria `.venv` e registra automaticamente os dois motores de navegador. Ao executá-lo novamente, ele reutiliza o ambiente e procura atualizações de dependências. Aguarde até que informe a conclusão da instalação.

## 3. Instale a extensão

### Manter uma extensão não assinada instalada no Zen

O Zen pode manter uma extensão não assinada após reiniciar o navegador quando a exigência de assinatura está desativada:

1. Abra uma nova aba e digite `about:config`.
2. Aceite o aviso de configuração.
3. Procure `xpinstall.signatures.required`.
4. Altere o valor para **`false`**.
5. Abra `about:addons` ou pressione **Ctrl+Shift+A**.
6. Abra o menu de engrenagem e escolha **Instalar extensão de um arquivo…**.
7. Selecione **`dist/firefox-unsigned.zip`** na pasta extraída e confirme a instalação.
8. Abra o Buttercup pelo menu de extensões; se quiser, fixe o ícone para acessá-lo facilmente.

O Buttercup já inclui o ID explícito de extensão Gecko necessário para a instalação permanente. O ZIP e a pasta Firefox descompactada usam o **mesmo ID**. Renomear um ZIP para `.xpi` não o assina.

Essa preferência desativa a exigência de assinatura para o perfil do navegador; portanto, use extensões em que você confia. A [configuração oficial de compilação do Zen](https://github.com/zen-browser/desktop/blob/dev/configs/common/mozconfig) permite extensões não assinadas, e esse procedimento foi testado no Zen. O comportamento é diferente no Firefox Release padrão.

### Quais outros navegadores permitem isso?

| Navegador/versão | A preferência pode permitir extensões não assinadas permanentes? | Evidência |
| --- | --- | --- |
| **Zen** | Sim: defina `xpinstall.signatures.required` como `false` | Configuração oficial e teste em execução no Zen |
| **Firefox Release padrão** | **Não.** Alterar a preferência não dispensa a assinatura exigida pela versão Release | Documentação da Mozilla |
| **Firefox ESR** | Sim, segundo a Mozilla, em versões ESR compatíveis | Documentação da Mozilla; não testado independentemente em execução aqui |
| **Firefox Developer Edition / Nightly** | Sim, para testes | Documentação da Mozilla; não testado independentemente em execução aqui |
| **Versões Firefox sem marca** | Sim, quando compiladas com a exigência de assinatura desativada | Documentação da Mozilla; não testado independentemente em execução aqui |
| **LibreWolf** | A configuração oficial permite extensões não assinadas; a preferência pode controlar a exigência | Verificado no código-fonte, sem teste individual em execução aqui |
| **Waterfox moderno** | A configuração oficial para desktop permite extensões não assinadas; a preferência pode controlar a exigência | Verificado no código-fonte, sem teste individual em execução aqui |

Verifique a edição e o pacote do seu navegador. O nome de um fork ou a existência da preferência não provam que um executável a respeite. Forks antigos, compilações de terceiros e políticas de distribuição podem diferir. A tabela trata de assinaturas, não garante compatibilidade com o Buttercup ou suporte ao assistente nativo.

Fontes: [Mozilla: assinatura de extensões](https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox), [configuração do Zen](https://github.com/zen-browser/desktop/blob/dev/configs/common/mozconfig), [configuração do LibreWolf](https://librewolf.dev/librewolf/source/src/branch/main/assets/mozconfig.new), [configuração compartilhada do Waterfox para desktop](https://github.com/BrowserWorks/Waterfox/blob/current/waterfox/build/mozconfig.common). Verificadas em 13/11/2026.

### Instalação temporária, inclusive no Firefox padrão

Se você não quiser alterar as configurações de assinatura ou se sua versão exigir assinatura:

1. Abra `about:debugging#/runtime/this-firefox`.
2. Clique em **Carregar extensão temporária…**.
3. Selecione **`dist/firefox/manifest.json`**.

Essa instalação é removida quando o navegador é fechado. Para instalação permanente no Firefox Release padrão, obtenha um pacote assinado pela Mozilla. Mantenedores podem usar o [processo de assinatura para distribuição própria](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) da Mozilla sem listar a extensão publicamente.

<a id="connect"></a>
## 4. Conecte o assistente

**Instalação nativa do navegador:** abra o Buttercup e clique em **Start and connect**. O indicador deve mudar para **Connected**. Você não precisa dos métodos Flatpak abaixo.

**Zen Flatpak:** escolha um dos métodos a seguir. Ambos usam o mesmo assistente e preservam suas configurações de provedor.

<a id="flatseal"></a>
### Método A: conexão automática com Flatseal

Escolha este método se quiser que **Start and connect** inicie o assistente, inclusive depois de reiniciar o computador.

#### A1. Prepare o inicializador uma vez

Abra um terminal **na pasta do projeto Buttercup instalado**, como na etapa 2. Execute:

```sh
.venv/bin/python scripts/setup-assistant.py --flatpak-bridge app.zen_browser.zen
```

Aguarde **Flatpak launcher prepared**. O comando cria a ponte, mas não altera as permissões do Flatpak. Executá-lo novamente atualiza o inicializador.

#### A2. Adicione as duas entradas no Flatseal

Abra o **Flatseal** e selecione **Zen** (`app.zen_browser.zen`) na lista de aplicativos, não Todos os aplicativos.

| Encontre esta seção | Adicione exatamente este valor |
| --- | --- |
| **Session Bus → Talks** (Barramento de sessão → Fala) | `org.freedesktop.Flatpak` |
| **Persistent → Files** (Persistente → Arquivos) | `.mozilla` |

Para cada entrada, use o botão **+** ou de adicionar da seção, digite o valor e confirme. Mantenha as entradas existentes, como `.zen`.

**Essas são entradas de texto, não as opções de D-Bus da seção Socket.** Não é necessário ativar o barramento de sessão inteiro, o barramento de sistema inteiro, todos os arquivos do usuário ou todo o sistema de arquivos. O primeiro valor diferencia maiúsculas e minúsculas; o segundo começa com ponto e não contém barra.

A permissão do barramento de sessão permite que o Zen execute programas no sistema hospedeiro em geral, não apenas o Buttercup. Use o Método B se preferir manter essa permissão desativada. O procedimento testado usa as permissões de arquivos padrão do Zen; permissões personalizadas amplas para a pasta pessoal podem interferir no mapeamento de persistência. Consulte a [referência de permissões do Flatseal](https://github.com/tchx84/Flatseal/blob/master/DOCUMENTATION.md).

#### A3. Reinicie e conecte

1. Feche completamente o Zen, inclusive outras janelas e instâncias em segundo plano.
2. Abra o Zen novamente.
3. Abra o Buttercup e clique em **Start and connect**.
4. Confirme que o indicador mostra **Connected**.

A partir de agora, use **Start and connect** normalmente. Após reiniciar o computador, ele pode iniciar o assistente novamente; não é necessário arquivo de conexão nem terminal.

<a id="manual"></a>
### Método B: conexão manual sem permissões Flatpak adicionais

Escolha este método se quiser manter as permissões padrão da sandbox do Zen. Você prepara um arquivo de conexão uma vez e inicia o assistente com seu atalho após reiniciar o computador.

#### B1. Copie a origem de conexão do navegador

1. Abra o Buttercup no perfil do navegador que deseja usar.
2. Expanda **Connect without native messaging**.
3. Clique em **Copy origin**.

Use o valor desse botão. Não copie o **Extension ID** exibido em How to connect: a origem de conexão começa com `moz-extension://` e identifica esse perfil do navegador.

#### B2. Crie o arquivo privado de conexão

1. Na pasta extraída do projeto, execute **Set up Buttercup assistant.sh**. Se o gerenciador de arquivos abrir o script como texto, execute `sh "Set up Buttercup assistant.sh"` em um terminal aberto nessa pasta.
2. Na janela de configuração, encontre **Flatpak / Snap: connect manually**.
3. Cole a origem no campo.
4. Clique em **Start assistant and save connection file**.
5. Salve o arquivo JSON em um local fácil de encontrar, como Downloads.

O programa inicia o assistente em segundo plano. Não é necessário deixar o terminal aberto.

#### B3. Importe e verifique a conexão

1. Volte ao Buttercup → **Connect without native messaging**.
2. Clique em **Open connection editor**. Uma aba é aberta para que o seletor de arquivos permaneça disponível quando o popup fechar.
3. Escolha o arquivo JSON que você acabou de salvar.
4. Clique em **Import connection**.
5. Verifique se aparece **Assistant connected** / **Connected**.
6. Exclua o arquivo JSON depois: ele contém seu token privado do assistente local.

A conexão importada permanece salva nesse perfil. Alterar as configurações de provedor ou legenda não a remove. Um novo perfil do navegador precisa de um novo arquivo. Os backups de configurações excluem intencionalmente a conexão local.

#### B4. Após reiniciar o computador

Execute **Start Buttercup assistant.sh** na mesma pasta do projeto. Se necessário, abra um terminal nela e execute:

```sh
sh "Start Buttercup assistant.sh"
```

Em seguida, clique em **Check connection** no Buttercup. Normalmente não é preciso criar e importar o JSON novamente a cada reinicialização. Com esse método, **Start and connect** ainda tenta usar mensagens nativas; use o inicializador e **Check connection**.

## 5. Gere suas primeiras legendas

1. Escolha um provedor em **Transcription** e insira sua chave de API.
2. Abra um vídeo no YouTube.
3. Clique no botão **BC** no player ou em **Generate captions** no Buttercup.
4. Aguarde a mensagem de conclusão.

**Generate** reutiliza uma transcrição em cache quando disponível. **Regenerate subtitles** solicita explicitamente uma nova transcrição e pode gerar cobranças do provedor. Em **Start a new subtitle**, escolha os segmentos originais do provedor ou permita que o Buttercup os reagrupe. Alterações de layout podem usar o cache existente.

## Se algo der errado

| O que aparece | O que fazer |
| --- | --- |
| `.venv/bin/python: No such file or directory` | Você está na pasta errada ou o instalador não terminou. Abra a pasta que contém `install.sh` e `scripts`, abra um terminal nela e execute `sh install.sh` se `.venv` não existir. Não execute o comando relativo a partir de `~`. |
| `unrecognized arguments: --flatpak-bridge` | Você está executando um pacote antigo ou um script de outra cópia extraída. Use o pacote atualizado para os dois navegadores e a pasta dele. |
| A extensão não assinada é rejeitada | Selecione `dist/firefox-unsigned.zip`, não o arquivo completo do projeto. Verifique a tabela de navegadores e a preferência de assinatura. O Firefox Release padrão exige um pacote assinado ou carregamento temporário. |
| A extensão desaparece após reiniciar o navegador | Ela foi carregada temporariamente. Use uma instalação permanente compatível com seu navegador ou um pacote assinado. |
| A extensão está instalada, mas o assistente não conecta | Esse problema é diferente da assinatura. Usuários de navegadores nativos devem executar o instalador novamente; usuários Flatpak devem concluir o Método A ou B. |
| O Método A ainda não conecta | Confirme que o comando do inicializador funcionou, que as duas entradas foram adicionadas ao próprio Zen no Flatseal e que o Zen foi reiniciado completamente. Mantenha a pasta do projeto no lugar. Permissões personalizadas de arquivos podem exigir o uso da conexão manual. |
| O Método B diz que o arquivo pertence a outro perfil | Copie a origem do perfil atual e gere um novo arquivo de conexão. |
| O Método B funcionava antes de reiniciar o computador | Execute `Start Buttercup assistant.sh` e clique em **Check connection**. Normalmente não é necessário importar novamente. |

Para versões testadas, limitações, opções manuais de linha de comando e detalhes de segurança, consulte as [notas técnicas e de compatibilidade Gecko](../firefox.md).
