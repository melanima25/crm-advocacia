import { fileURLToPath } from 'node:url';
import { gerarHash } from '../auth/senha';
import { parseEnv } from '../env';
import { createDb, schema, type Db } from './client';

/** Usuários 100% fictícios da demonstração (um por perfil). A senha é pública de propósito: é uma demo. */
export const SENHA_DEMO = 'demo1234';
export const USUARIOS_DEMO = [
  { nome: 'Ana Admin', email: 'admin@demo.crm', perfil: 'admin' },
  { nome: 'Bruno Advogado', email: 'advogado@demo.crm', perfil: 'advogado' },
  { nome: 'Carla Assistente', email: 'assistente@demo.crm', perfil: 'assistente' },
] as const;

export async function semear(db: Db, iteracoes?: number): Promise<void> {
  const senhaHash = await gerarHash(SENHA_DEMO, iteracoes);
  for (const u of USUARIOS_DEMO) {
    await db
      .insert(schema.usuario)
      .values({ ...u, senhaHash })
      .onConflictDoUpdate({
        target: schema.usuario.email,
        set: { nome: u.nome, perfil: u.perfil, senhaHash, ativo: true },
      });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = parseEnv();
  const { db, close } = createDb(env.DATABASE_URL);
  try {
    // Em Workers o PBKDF2 aceita até ~100k iterações (ver docs/adr/0001): use HASH_ITERACOES=100000 lá.
    await semear(db, process.env.HASH_ITERACOES ? Number(process.env.HASH_ITERACOES) : undefined);
    console.log(`Seed ok: ${USUARIOS_DEMO.length} usuários fictícios (senha ${SENHA_DEMO}).`);
  } finally {
    await close();
  }
}
