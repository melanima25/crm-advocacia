# ADR 0002 — Deploy: Cloudflare Workers + Neon (plano gratuito)

**Status:** aceita (semana 13). **Data:** 13/10/2026.

## Contexto

A demo precisa ficar no ar de graça, com dados fictícios que se renovam sozinhos. A API (Hono) já usa só
APIs padrão (Web Crypto, `fetch`), então roda em Node (Docker/CI) e em Workers com o mesmo código.

## Decisão

- **Um único Worker** serve a API (`/api/*`) e o site (arquivos estáticos do Vite, com fallback de SPA).
  Mesma origem: sem CORS, o cookie de sessão funciona sem configuração extra. Só `/api/*` executa código
  (`run_worker_first`); o resto é servido como arquivo estático.
- **Banco:** PostgreSQL no Neon, acessado pelo **Hyperdrive** + `pg` (flag `nodejs_compat`). O mesmo driver
  e o mesmo schema do ambiente local. O Hyperdrive deve ser criado com `--caching-disabled`: o cache de
  consultas poderia devolver dados antigos (ex.: sessão recém-criada ou tarefa recém-movida).
- **Uma conexão por requisição** (`pg.Client`), encerrada com `ctx.waitUntil`. O pool fica com o Hyperdrive.
- **Reset diário por Cron Trigger** (`0 8 * * *` UTC = 05:00 em Brasília): em uma transação, apaga os dados
  de negócio, auditoria, sessões e tentativas de login e recria o seed. **Não há rota HTTP de reset**
  (o escopo previa uma protegida por segredo): sem rota, não há segredo para vazar nem endpoint para abusar.
  Usuários e hashes de senha não são tocados (não gasta CPU com PBKDF2 no cron).
- **Hash de senha no plano gratuito:** o Workers gratuito dá 10 ms de CPU por requisição e limita o PBKDF2 a
  100.000 iterações. Escolha: **10.000 iterações** em produção (`HASH_ITERACOES`, no `wrangler.jsonc` e no
  seed). O número de iterações vai dentro do hash guardado; o hash "de mentira" usado quando o e-mail não
  existe usa o mesmo valor, para o tempo de resposta não revelar quais e-mails existem.

## Consequências

- Segurança do hash menor em produção (10k contra 600k do padrão OWASP). Aceitável **somente** porque os
  dados e as senhas da demo são públicos e fictícios (`demo1234`). Em produto real: plano pago do Workers
  (limite de CPU maior) ou outro algoritmo/ambiente.
- Local (workerd, CPU do sandbox, indicativo): login ≈ 30 ms de relógio; no plano gratuito o que conta é CPU.
  Se aparecer erro 1102 / "exceeded CPU" no login, reduza `HASH_ITERACOES` (ex.: 5000) e **refaça o seed**
  com o mesmo valor (passo a passo em `docs/deploy.md`).
- Limites gratuitos (Workers 100 mil requisições/dia, Hyperdrive 100 mil consultas/dia, Neon com
  suspensão automática): um robô pode esgotar a cota do dia; a demo volta no dia seguinte. A primeira
  requisição após inatividade pode levar ~1 s extra (Neon acordando).
- Atualiza o ADR 0001: o plano de "100.000 em produção" foi substituído por 10.000 (CPU de 10 ms).
