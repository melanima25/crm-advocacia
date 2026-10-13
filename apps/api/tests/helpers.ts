import { sql } from 'drizzle-orm';
import { createApp, type AppOptions } from '../src/app';
import { createDb, type Db } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { SENHA_DEMO, semearUsuarios } from '../src/db/seed';

export const ITERACOES_TESTE = 1000; // rápido; o valor real (600k) é medido à parte

export function urlDeTeste(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
  // Trava de segurança: os testes APAGAM dados; só rodam em banco cujo nome contém "test".
  const nome = url.split('?')[0]?.split('/').pop() ?? '';
  if (!nome.includes('test'))
    throw new Error(`Recusado: o banco de testes deve ter "test" no nome (atual: "${nome}")`);
  return url;
}

export async function prepararBanco() {
  const url = urlDeTeste();
  await runMigrations(url);
  const { db, close } = createDb(url);
  await limpar(db);
  await semearUsuarios(db, ITERACOES_TESTE);
  return { db, close };
}

export async function limpar(db: Db) {
  await db.execute(
    sql`truncate table auditoria, tarefa, prazo, feriado, processo, cliente, sessao, tentativa_login, usuario restart identity cascade`,
  );
}

export const csrf = { 'X-Requested-With': 'fetch', 'Content-Type': 'application/json' };

export function criarAppDeTeste(db: Db, options: AppOptions = {}) {
  return createApp(db, options);
}

export async function entrar(app: ReturnType<typeof createApp>, email: string, senha = SENHA_DEMO) {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: csrf,
    body: JSON.stringify({ email, senha }),
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
  return { res, cookie };
}
