/**
 * Entrada da API no Cloudflare Workers (produção da demonstração).
 *
 *  - fetch: só chega aqui o que começa com /api/ (o resto é servido como arquivo estático pelo
 *    próprio Workers, com a página inicial como alternativa: ver wrangler.jsonc).
 *  - scheduled: Cron Trigger diário que recria os dados fictícios (reset da demo).
 *
 * Banco: Postgres no Neon, acessado pelo Hyperdrive (pool de conexões na rede da Cloudflare).
 * Uma conexão (`pg.Client`) por requisição; o Hyperdrive reaproveita as conexões reais.
 */
import pg from 'pg';
import { createApp } from './app';
import { createDbPorClient } from './db/client';
import { resetarDemo } from './db/reset';

// Tipos mínimos do runtime (evita puxar @cloudflare/workers-types, que conflita com os tipos do Node).
type Fetcher = { fetch(req: Request): Promise<Response> };
type Contexto = { waitUntil(p: Promise<unknown>): void };
type Env = {
  HYPERDRIVE: { connectionString: string };
  ASSETS: Fetcher;
  /** Iterações do PBKDF2 (hash falso). Em Workers: no máximo 100000. Ver docs/adr/0002. */
  HASH_ITERACOES?: string;
  SESSAO_DIAS?: string;
};

async function comBanco<T>(
  env: Env,
  ctx: Contexto,
  usar: (db: ReturnType<typeof createDbPorClient>) => Promise<T>,
) {
  const client = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
  await client.connect();
  try {
    return await usar(createDbPorClient(client));
  } finally {
    ctx.waitUntil(client.end());
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: Contexto): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    return comBanco(env, ctx, (db) =>
      Promise.resolve(
        createApp(db, {
          cookieSeguro: true, // o Workers só responde em HTTPS
          sessaoDias: Number(env.SESSAO_DIAS ?? 1),
          iteracoesHashFalso: env.HASH_ITERACOES ? Number(env.HASH_ITERACOES) : undefined,
        }).fetch(req),
      ),
    );
  },

  async scheduled(_controller: { scheduledTime: number; cron: string }, env: Env, ctx: Contexto) {
    await comBanco(env, ctx, (db) => resetarDemo(db));
    console.log('Reset diário da demonstração concluído.');
  },
};
