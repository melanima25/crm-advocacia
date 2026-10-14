# API (Hono + Node 22). Contexto de build: a raiz do repositório.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# Instala dependências primeiro (camada em cache enquanto os package.json não mudam).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# NODE_ENV=production não pode valer aqui: o build precisa das devDependencies (tsup, tsx).
RUN NODE_ENV=development npm ci

COPY . .
RUN npm run build -w @crm/api

COPY docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["api-entrypoint.sh"]
