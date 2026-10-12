import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import type { ClienteBody } from '@crm/shared';
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

export async function semearUsuarios(db: Db, iteracoes?: number): Promise<void> {
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

const PRIMEIROS = [
  'Ana',
  'Bruno',
  'Carla',
  'Daniel',
  'Elisa',
  'Fábio',
  'Gabriela',
  'Hugo',
  'Isabela',
  'João',
  'Karen',
  'Lucas',
  'Marina',
  'Nuno',
  'Olívia',
  'Paulo',
];
const SOBRENOMES = ['Exemplo', 'Fictício', 'de Teste', 'Demonstração', 'Modelo', 'Amostra'];
const EMPRESAS = [
  'Comércio',
  'Transportes',
  'Construtora',
  'Clínica',
  'Padaria',
  'Tecnologia',
  'Consultoria',
  'Indústria',
];

/** Clientes 100% fictícios, determinísticos (sem aleatoriedade): o reset diário gera sempre os mesmos. */
export function clientesDemo(): ClienteBody[] {
  const itens: ClienteBody[] = [];
  for (let i = 0; i < 16; i++) {
    const nome = `${PRIMEIROS[i]} ${SOBRENOMES[i % SOBRENOMES.length]}`;
    itens.push({
      tipo: 'PF',
      nome,
      documento: `EXEMPLO-PF-${String(i + 1).padStart(3, '0')}`,
      email: `cliente${i + 1}@exemplo.test`,
      telefone: `(00) 00000-${String(1000 + i)}`,
    });
  }
  for (let i = 0; i < 8; i++) {
    itens.push({
      tipo: 'PJ',
      nome: `${EMPRESAS[i]} ${SOBRENOMES[(i + 2) % SOBRENOMES.length]} Ltda`,
      documento: `EXEMPLO-PJ-${String(i + 1).padStart(3, '0')}`,
      email: `contato${i + 1}@empresa-exemplo.test`,
      telefone: `(00) 0000-${String(2000 + i)}`,
    });
  }
  return itens;
}

export async function semearClientes(db: Db): Promise<void> {
  const [admin] = await db
    .select()
    .from(schema.usuario)
    .where(eq(schema.usuario.email, USUARIOS_DEMO[0].email));
  await db.delete(schema.cliente);
  await db
    .insert(schema.cliente)
    .values(clientesDemo().map((c) => ({ ...c, criadoPor: admin?.id ?? null })));
}

export async function semear(db: Db, iteracoes?: number): Promise<void> {
  await semearUsuarios(db, iteracoes);
  await semearClientes(db);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = parseEnv();
  const { db, close } = createDb(env.DATABASE_URL);
  try {
    // Em Workers o PBKDF2 aceita até ~100k iterações (ver docs/adr/0001): use HASH_ITERACOES=100000 lá.
    await semear(db, process.env.HASH_ITERACOES ? Number(process.env.HASH_ITERACOES) : undefined);
    console.log(
      `Seed ok: ${USUARIOS_DEMO.length} usuários e ${clientesDemo().length} clientes fictícios (senha ${SENHA_DEMO}).`,
    );
  } finally {
    await close();
  }
}
