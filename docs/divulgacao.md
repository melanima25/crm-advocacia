# Divulgação (rascunhos — troque o link da demo antes de publicar)

## Post do LinkedIn (v1.0)

Terminei meu CRM para escritório de advocacia — 7 semanas, do zero ao ar, de graça.

O que ele faz: clientes, processos com número CNJ validado (módulo 97), prazos em dias úteis com feriados
(vencem às 23:59 de Brasília), agenda, quadro de tarefas e painel com gráficos acessíveis. Três perfis
(admin, advogado, assistente) com permissões testadas e auditoria.

O que mais me ensinou:
• Testes e2e acharam um bug real que os testes unitários não pegavam (colisão de chave de cache).
• Rodar no plano gratuito do Cloudflare Workers tem 10 ms de CPU por requisição: tive que medir o hash de
senha e documentar a troca (ADR) em vez de fingir que não existia.
• A demo recria os dados fictícios todo dia às 05:00 por Cron Trigger, sem rota de reset exposta.

Stack: React, Hono, Drizzle, PostgreSQL (Neon), Cloudflare Workers, Playwright + axe, GitHub Actions.
Dados 100% fictícios.

Demo: https://crm-advocacia.SEU-SUBDOMINIO.workers.dev (advogado@demo.crm / demo1234)
Código: https://github.com/melanima25/crm-advocacia

Estou buscando minha primeira vaga remota como dev júnior — se fizer sentido, vamos conversar.

#desenvolvimento #typescript #react #cloudflare

## Card do portfólio (aplicar só com a demo no ar)

- **Título:** CRM Advocacia
- **Descrição:** CRM com prazos em dias úteis, número CNJ validado, tarefas, painel acessível e 3 perfis de acesso. Deploy gratuito (Cloudflare Workers + Neon), dados fictícios renovados diariamente.
- **Tags:** React · TypeScript · Hono · PostgreSQL · Cloudflare Workers · Playwright
- **Links:** Demo / GitHub / README com decisões (ADRs)
