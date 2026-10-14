#!/bin/sh
# Sobe a API: aplica as migrações, semeia os dados fictícios SÓ se o banco estiver vazio e inicia.
set -e
cd /app
npm run db:migrate -w @crm/api
npm run seed -w @crm/api -- --se-vazio
exec node apps/api/dist/index.js
