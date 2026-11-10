# Backend local

Consulte o [README principal](../README.md) para instalação em Windows/Linux e conexão com a extensão.

Executar da raiz, com Python 3.11+ e dependências instaladas:

```sh
python -m backend.app --extension-id ID_DE_32_LETRAS --show-token
```

O módulo CLI fixa o bind em `127.0.0.1`. Não é necessário executar `uvicorn` manualmente nem configurar acesso público. Um token pode ser fornecido por `BUTTERCUP_TOKEN`; caso contrário é gerado e armazenado no estado privado. Não coloque tokens em URLs.

Todas as rotas, incluindo `/health`, exigem `Authorization: Bearer TOKEN`. Origens enviadas precisam estar explicitamente autorizadas. Requisições sem Origin (por exemplo clientes CLI locais) ainda exigem token e Host loopback. O CORS não aceita curingas. O backend nunca recebe chaves do provedor de transcrição.

| Método | Rota | Comportamento |
|---|---|---|
| GET | `/health` | Versões e disponibilidade das dependências |
| POST | `/cookies/import` | JSON `{content,persist:false}`; substitui cookies após validar |
| GET | `/cookies/status` | Status sem os valores dos cookies |
| PATCH | `/cookies` | JSON `{enabled:true}` |
| DELETE | `/cookies` | Cancela extrações autenticadas e remove cookies |
| POST | `/jobs/extract` | JSON `{video,chunk_seconds:120,max_upload_bytes:24000000,audio_track:"default"}`; `audio_track` também aceita `"original"` |
| GET | `/jobs/{id}` | Progresso, erros fixos/sanitizados e metadados dos chunks |
| GET | `/jobs/{id}/chunks/{index}` | MP3 local autenticado |
| POST | `/jobs/{id}/cancel` | Cancela e remove trabalho e arquivos |
| DELETE | `/jobs/{id}` | Remove trabalho e arquivos |

Os subprocessos usam listas de argumentos sem shell. Windows usa Job Objects para encerrar processos descendentes e ACLs para proteger o estado; Unix usa grupos de processo e modos POSIX. Arquivos e limites usam `pathlib`, sem caminhos ou ferramentas exclusivas de Unix no fluxo comum.

`/health` informa `audio_track_selection: ["default", "original"]`. Em modo original, yt-dlp seleciona o melhor formato somente de áudio identificado como original (`language_preference=10`); pytubefix filtra os streams com metadados explícitos de faixa original. Ausência dessa identificação gera erro e não permite substituir por dublagem ou por uma faixa sem identificação. O job confirma `audio_track` e o backend verifica a confirmação do extrator antes da conversão.

Use `python -m backend.app --help` para porta, estado, limites, runtime JavaScript e caminhos dos executáveis FFmpeg/FFprobe.

`POST /jobs/extract` também aceita `audio_mode: "whole"` (padrão `"chunks"`). O modo inteiro produz um único MP3 com offset zero e toda a duração; se o tamanho estimado ultrapassar a margem do limite escolhido, falha antes da conversão/upload. O tamanho final também é conferido. Não há corte/split silencioso no modo inteiro. `/health` anuncia `audio_modes` e o job devolve `audio_mode` para confirmação da extensão. O backend só prepara áudio; o limite de pedidos simultâneos ao provedor é aplicado pela extensão, que mantém as chaves da API fora do backend.
