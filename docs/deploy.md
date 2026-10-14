# Deploy (Cloudflare Workers + Neon) — passo a passo

Tudo no **PowerShell**, dentro de `C:\dev\crm-advocacia`. Custo: R$ 0 (planos gratuitos).
Decisões e riscos: [ADR 0002](adr/0002-deploy-cloudflare-neon.md).

## 1. Banco no Neon

1. Crie conta em https://neon.com (pode entrar com o GitHub) e um projeto novo (região mais próxima; nome `crm-advocacia`).
2. Em **Connect**, DESMARQUE "Connection pooling" (queremos a conexão **direta**; o pool fica por conta do Hyperdrive).
3. Copie a connection string (`postgresql://usuario:senha@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`). Trate como senha: não cole em arquivo versionado nem em chat.

## 2. Criar as tabelas e os dados fictícios no Neon (a partir do seu PC)

```powershell
$env:DATABASE_URL = "COLE-A-STRING-DO-NEON"
$env:HASH_ITERACOES = "10000"
npm run db:migrate -w @crm/api
npm run seed -w @crm/api
```

Saída esperada: `Migrations aplicadas.` e `Seed ok: 3 usuários ...`. Depois feche a janela ou rode
`Remove-Item Env:DATABASE_URL` para não deixar a string na sessão.

## 3. Cloudflare

1. Crie conta em https://dash.cloudflare.com (gratuita).
2. `npx wrangler login` (abre o navegador; clique em Allow).
3. Crie o Hyperdrive apontando para o Neon, **sem cache**:

```powershell
npx wrangler hyperdrive create crm-neon --connection-string="COLE-A-STRING-DO-NEON" --caching-disabled
```

4. A saída mostra um `id`. Cole-o em `wrangler.jsonc`, no lugar de `COLE-AQUI-O-ID-DO-HYPERDRIVE`
   (o id não é segredo; a senha fica guardada na Cloudflare).

## 4. Publicar

```powershell
npm ci
npm run cf:deploy
```

No final aparece a URL `https://crm-advocacia.SEU-SUBDOMINIO.workers.dev`. Abra e entre com
`advogado@demo.crm` / `demo1234` (também `admin@demo.crm` e `assistente@demo.crm`).

## 5. Verificações

- Entre com os 3 perfis; o painel carrega; crie e mova uma tarefa.
- **CPU do login:** em um terminal, `npm run cf:tail`; faça login no site. Se aparecer erro 1102,
  "Exceeded CPU" ou status 500 no `/api/auth/login`, vá para "Calibragem" abaixo.
- **Cron:** painel Cloudflare → Workers & Pages → `crm-advocacia` → Settings → Trigger Events (Cron `0 8 * * *`).
  Para testar na hora, use "Test"/"Trigger" no painel e veja em **Logs** a mensagem "Reset diário da demonstração concluído."
  (Crie uma tarefa antes e confirme que ela some após o reset.)

## 6. Calibragem do hash (só se o login estourar CPU)

Reduza as iterações **nos dois lugares** e refaça o seed (o valor tem que ser igual):

1. `wrangler.jsonc` → `"HASH_ITERACOES": "5000"`.
2. PowerShell: `$env:DATABASE_URL = "..."; $env:HASH_ITERACOES = "5000"; npm run seed -w @crm/api`
3. `npm run cf:deploy`.

Se nem 3000 resolver, o plano pago do Workers (US$ 5/mês) tem limite de CPU maior; a demo é fictícia, então reduzir é aceitável.

## 7. Desfazer / rollback

- Painel Cloudflare → `crm-advocacia` → Deployments → escolha a versão anterior → Rollback.
- Apagar tudo: `npx wrangler delete` e apagar o projeto no Neon.

## 8. Checagem de segredos no histórico do Git (antes de tornar público / v1.0)

```powershell
git log --all -p | Select-String -Pattern "postgres(ql)?://[^ ]*:[^ ]*@" | Select-String -NotMatch "crm:crm@|localhost|db:5432"
```

Sem saída = nenhuma string de conexão real no histórico. Rode também uma varredura com
`docker run --rm -v ${PWD}:/repo zricethezav/gitleaks:latest detect --source /repo` (ou o GitHub → Settings → Code security → Secret scanning).
Se vazar algo: troque a senha no Neon (Reset password) e recrie o Hyperdrive.
