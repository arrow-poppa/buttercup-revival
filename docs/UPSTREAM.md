# Origem e análise do fork

- Repositório de origem: https://github.com/iGerman00/buttercup-chrome
- Base local: `38c8278` — `feat: add newline splitting, adjust defaults`.
- O repositório já estava clonado com histórico completo e remoto `origin`; não foi inicializado outro Git nem reescrito o histórico. Nenhum fork remoto/publicação foi feito.
- Não há `LICENSE` na árvore da base, nem entrada desse arquivo no histórico consultado. Preservamos esse estado e os créditos; não declaramos uma licença que o autor não forneceu.

| Código original estudado | Reutilização / modernização |
|---|---|
| `buttercup.js` | Mantida a ideia do controle BC e de legendas sincronizadas. Removidos bloqueio global de fetch, substituição global de XHR, descarte de initplayback e políticas permissivas de Trusted Types. A renderização usa TextTrack/VTTCue no elemento de vídeo. |
| `content.js` | Mantida a integração com a página e navegação SPA. Removida a ponte de CustomEvents que expunha API keys ao YouTube. O contexto isolado recebe apenas configurações públicas e legendas. |
| `manifest.json` | Mantido Manifest V3, ícones e popup. Adicionados service worker/offscreen e permissões por host configurado. Eliminados scripts web-accessible e hosts dos serviços antigos. |
| `popup.html`, `assets/js/buttons.js` | Preservadas preferências, agrupamento por palavras, idiomas e identidade Buttercup. Organização expandida para backend, cookies, cache e integrações. Retirado Tailwind executado em runtime, inadequado à CSP da extensão. |
| `api/cobalt.js` | Substituído pelo backend FastAPI, yt-dlp, pytubefix e FFmpeg; arquivo removido. |
| `api/groq.js` | Extraídas as ideias de agrupamento por palavras e conversão de timestamps. Provedor específico removido; formatos separados de transporte HTTP. |
| `api/config.js` | Configuração validada e local; credenciais restritas a contextos confiáveis, sem storage sync. |
| `api/transcription.js` | Pipeline preservado conceitualmente: áudio → transcrição → formatos. Agora consulta IndexedDB antes da extração, processa chunks, cancela e limpa jobs. |

Recursos visuais originais e `.github/FUNDING.yml` foram preservados. O README anterior está em `docs/README.upstream.md`. Arquivos CSS/JS históricos não utilizados permanecem na árvore e são excluídos do build. As remoções dos interceptadores e da ponte de chaves são necessárias à segurança do Manifest V3, não uma tentativa de alterar a finalidade da extensão.
