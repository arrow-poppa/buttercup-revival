# Cache comunitário opcional — Workers + D1

Implementação preparada, não publicada. O cache local continua funcionando sem este serviço.

`GET /subtitles/{sha256}` retorna a versão aprovada mais recente. `PUT /subtitles/{sha256}` recebe apenas metadados e timestamps/texto normalizados e retorna `202` com `moderation: pending`. O serviço rejeita propriedades superiores inesperadas, limita o corpo a 2 MB, valida timestamps, aplica limites Cloudflare e usa consultas SQL parametrizadas. Versões de conteúdo diferentes são preservadas; conteúdo idêntico é deduplicado pelo digest.

Novos envios ficam pendentes para impedir que um cliente arbitrário substitua uma legenda aprovada. O operador revisa o conteúdo e marca a versão como aprovada via administração do D1 (`UPDATE subtitles SET approved = 1 WHERE id = ...`). Não há endpoint público de moderação nem segredos administrativos na extensão. Limites por IP são uma proteção inicial, aproximada e por região Cloudflare; um serviço público de grande escala precisa controles adicionais e política de moderação.

Para um operador autorizado, depois de instalar/configurar Wrangler:

1. Copiar `wrangler.toml.example` para `wrangler.toml` e substituir IDs e origens explícitas.
2. Criar o banco D1, atualizar `database_id` e aplicar `schema.sql`.
3. Validar localmente o Worker com as duas bindings de rate limit e a binding D1.
4. Publicar somente quando houver autorização do dono da conta.
5. Informar a URL HTTPS no popup e ativar consulta. O compartilhamento exige a caixa separada de consentimento.

Nenhum cookie, áudio, API key, token de pareamento, prompt ou endpoint privado é incluído no payload da extensão. A chave é um hash da configuração não secreta do resultado. Legendas são conteúdo do vídeo; consentir em compartilhar inclui publicar esse texto e metadados de vídeo/modelo.

Referências: [Workers Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) e [D1](https://developers.cloudflare.com/d1/).
