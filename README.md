# CRM Advocacia (projeto de demonstração)

CRM para escritório de advocacia: clientes, processos, prazos em dias úteis, tarefas e auditoria.

> **Aviso:** projeto de portfólio. Todos os dados são **fictícios** (nomes, e-mails, números de processo
> com ano 2099). Não representa nenhum escritório real e não deve receber dados reais.

**Status:** v0.3 (em construção) — base do sistema (monorepo, Docker Compose, schema, seed,
autenticação, perfis admin / advogado / assistente, auditoria) **clientes** (CRUD, busca, filtro e paginação no servidor) e **processos** com número no formato CNJ, validado pelo dígito verificador (módulo 97, Res. CNJ 65/2008).

## Stack

React 19 + Vite + Tailwind · Hono · Drizzle ORM · PostgreSQL 16 · Zod · Vitest · GitHub Actions.
Produção planejada: Cloudflare Workers + Neon.

## Como rodar (Windows/PowerShell ou qualquer shell)

```
npm install
copy .env.example .env
docker compose up -d db
npm run db:migrate -w @crm/api
npm run seed -w @crm/api
npm run dev
```

Abra http://localhost:5173. Contas de demonstração (senha `demo1234`): `admin@demo.crm`,
`advogado@demo.crm`, `assistente@demo.crm`.

## Testes

```
npm test                 # unitários (matriz de permissões, hash de senha)
npm run test:integration # API contra Postgres (usa um banco com "test" no nome)
```

Os testes de integração apagam dados: por segurança só rodam em banco cujo nome contém `test`.

## Decisões de segurança

- Senha: PBKDF2-SHA256 via Web Crypto, roda igual em Node e Workers ([ADR 0001](docs/adr/0001-hash-de-senha.md)).
- Sessão no banco; o cookie guarda um token e o banco só o hash dele (`HttpOnly`, `SameSite=Lax`, `Secure` em produção).
- Bloqueio de login: 5 falhas em 15 min por e-mail (429 + `Retry-After`); mensagem de erro genérica.
- CSRF: cabeçalho `X-Requested-With` obrigatório em requisições que alteram dados.
- Autorização num único ponto (`exigir(acao)`), com matriz `perfil × ação` testada.
- Auditoria gravada na mesma transação da alteração.

## Uso de IA

Desenvolvido com assistência de IA (Claude); as decisões, a revisão e os testes são do autor.
