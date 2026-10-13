import { fileURLToPath } from 'node:url';
import { eq, inArray } from 'drizzle-orm';
import type { ClienteBody } from '@crm/shared';
import {
  AREAS,
  calcularVencimento,
  feriadosNacionais,
  fimDoDiaBrasilia,
  gerarCnj,
  hojeEmBrasilia,
  localBrasiliaParaDate,
  proximoDiaUtil,
  somarDias,
  type ProcessoBody,
} from '@crm/shared';
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
  await db.delete(schema.tarefa);
  await db.delete(schema.prazo);
  await db.delete(schema.processo);
  await db.delete(schema.cliente);
  await db
    .insert(schema.cliente)
    .values(clientesDemo().map((c) => ({ ...c, criadoPor: admin?.id ?? null })));
}

const VARAS = [
  '1ª Vara Cível Fictícia',
  '2ª Vara do Trabalho Fictícia',
  'Vara de Família Fictícia',
  'Vara Criminal Fictícia',
  'Vara de Fazenda Fictícia',
  'Vara Empresarial Fictícia',
];
const STATUS_DEMO = [
  'em_andamento',
  'em_andamento',
  'em_andamento',
  'suspenso',
  'arquivado',
  'encerrado',
] as const;

/** Processos fictícios determinísticos. Todos os números CNJ usam o ano 2099 (nunca existem de verdade). */
export function processosDemo(clienteIds: number[], responsaveis: number[]): ProcessoBody[] {
  return Array.from({ length: 12 }, (_, i) => ({
    numeroCnj: gerarCnj({
      sequencial: String(i + 1).padStart(7, '0'),
      ano: '2099',
      justica: '8',
      tribunal: '26',
      origem: String(100 + (i % 3)).padStart(4, '0'),
    }),
    clienteId: clienteIds[(i * 2) % clienteIds.length]!,
    area: AREAS[i % AREAS.length]!,
    vara: VARAS[i % VARAS.length]!,
    status: STATUS_DEMO[i % STATUS_DEMO.length]!,
    responsavelId: responsaveis[i % responsaveis.length]!,
    abertoEm: `2099-${String((i % 12) + 1).padStart(2, '0')}-${String(5 + i).padStart(2, '0')}`,
  }));
}

export async function semearProcessos(db: Db): Promise<void> {
  await db.delete(schema.prazo);
  await db.delete(schema.processo);
  const clientes = await db
    .select({ id: schema.cliente.id })
    .from(schema.cliente)
    .orderBy(schema.cliente.id);
  const equipe = await db
    .select({ id: schema.usuario.id })
    .from(schema.usuario)
    .where(inArray(schema.usuario.perfil, ['admin', 'advogado']))
    .orderBy(schema.usuario.id);
  if (clientes.length === 0 || equipe.length === 0) return;
  const [assistente] = await db
    .select({ id: schema.usuario.id })
    .from(schema.usuario)
    .where(eq(schema.usuario.perfil, 'assistente'));
  const lista = processosDemo(
    clientes.map((c) => c.id),
    equipe.map((u) => u.id),
  ).map((p, i) => ({
    ...p,
    // 2 processos têm a assistente como responsável: ela só mexe em prazos de processos em que atua
    responsavelId: assistente && (i === 4 || i === 9) ? assistente.id : p.responsavelId,
    criadoPor: equipe[0]!.id,
  }));
  await db.insert(schema.processo).values(lista);
}

export async function semearFeriados(db: Db, agora: Date = new Date()): Promise<void> {
  const ano = Number(hojeEmBrasilia(agora).slice(0, 4));
  await db.delete(schema.feriado);
  const todos = [ano - 1, ano, ano + 1].flatMap((a) => feriadosNacionais(a));
  await db.insert(schema.feriado).values(todos);
}

type PrazoDemo = {
  proc: number;
  tipo: 'prazo' | 'audiencia' | 'reuniao';
  status?: 'pendente' | 'cumprido' | 'perdido';
  obs: string;
} & ({ intimacaoOffset: number; dias: number } | { diaOffset: number; hora: string });

/** Cenário fixo, relativo a "hoje": o reset diário sempre recria prazos vencidos, de hoje, da semana e futuros. */
const PRAZOS_DEMO: PrazoDemo[] = [
  { proc: 0, tipo: 'prazo', intimacaoOffset: -30, dias: 15, obs: 'Contestação (vencido)' },
  { proc: 1, tipo: 'prazo', intimacaoOffset: -25, dias: 10, obs: 'Réplica (vencido)' },
  {
    proc: 2,
    tipo: 'audiencia',
    diaOffset: 0,
    hora: '23:00',
    obs: 'Audiência de conciliação (hoje)',
  },
  { proc: 3, tipo: 'prazo', intimacaoOffset: -8, dias: 5, obs: 'Manifestação sobre documentos' },
  { proc: 4, tipo: 'prazo', intimacaoOffset: -3, dias: 8, obs: 'Recurso (poucos dias)' },
  { proc: 5, tipo: 'reuniao', diaOffset: 2, hora: '10:00', obs: 'Reunião com o cliente' },
  { proc: 6, tipo: 'prazo', intimacaoOffset: 0, dias: 15, obs: 'Apelação' },
  { proc: 7, tipo: 'audiencia', diaOffset: 5, hora: '14:30', obs: 'Audiência de instrução' },
  { proc: 8, tipo: 'prazo', intimacaoOffset: 1, dias: 30, obs: 'Cumprimento de sentença' },
  { proc: 9, tipo: 'reuniao', diaOffset: 12, hora: '09:00', obs: 'Alinhamento de estratégia' },
  { proc: 10, tipo: 'audiencia', diaOffset: 20, hora: '15:00', obs: 'Audiência de julgamento' },
  {
    proc: 11,
    tipo: 'prazo',
    intimacaoOffset: -20,
    dias: 10,
    status: 'cumprido',
    obs: 'Petição inicial (cumprido)',
  },
  {
    proc: 0,
    tipo: 'prazo',
    intimacaoOffset: -15,
    dias: 5,
    status: 'cumprido',
    obs: 'Embargos (cumprido)',
  },
  {
    proc: 1,
    tipo: 'prazo',
    intimacaoOffset: -40,
    dias: 5,
    status: 'perdido',
    obs: 'Prazo perdido (exemplo)',
  },
];

export async function semearPrazos(db: Db, agora: Date = new Date()): Promise<void> {
  await db.delete(schema.prazo);
  const procs = await db.select().from(schema.processo).orderBy(schema.processo.id);
  const feriados = new Set(
    (await db.select({ data: schema.feriado.data }).from(schema.feriado)).map((f) => f.data),
  );
  if (procs.length === 0) return;
  const hoje = hojeEmBrasilia(agora);
  const linhas = PRAZOS_DEMO.map((d) => {
    const proc = procs[d.proc % procs.length]!;
    let venceEm: Date;
    let intimacaoEm: string | null = null;
    let diasUteis: number | null = null;
    if ('dias' in d) {
      intimacaoEm = somarDias(hoje, d.intimacaoOffset);
      diasUteis = d.dias;
      venceEm = fimDoDiaBrasilia(calcularVencimento(intimacaoEm, d.dias, feriados).venceEm);
    } else {
      // compromissos marcados só em dia útil
      venceEm = localBrasiliaParaDate(
        `${proximoDiaUtil(somarDias(hoje, d.diaOffset), feriados)}T${d.hora}`,
      );
    }
    return {
      processoId: proc.id,
      tipo: d.tipo,
      intimacaoEm,
      diasUteis,
      venceEm,
      responsavelId: proc.responsavelId,
      status: d.status ?? ('pendente' as const),
      observacao: d.obs,
      criadoPor: proc.responsavelId,
    };
  });
  await db.insert(schema.prazo).values(linhas);
}

/** Tarefas de demonstração; datas relativas a "hoje" (negativo = atrasada). usuario: 0 admin, 1 advogado, 2 assistente. */
const TAREFAS_DEMO = [
  { t: 'Reunir documentos do cliente', u: 2, proc: 4, off: -2, st: 'a_fazer' },
  { t: 'Protocolar petição de juntada', u: 2, proc: 9, off: 1, st: 'fazendo' },
  { t: 'Organizar pasta digital do processo', u: 2, proc: 4, off: 5, st: 'a_fazer' },
  { t: 'Agendar reunião com o cliente', u: 2, proc: null, off: 2, st: 'feito' },
  { t: 'Revisar minuta de contestação', u: 1, proc: 0, off: 0, st: 'fazendo' },
  { t: 'Preparar audiência de instrução', u: 1, proc: 1, off: 3, st: 'a_fazer' },
  { t: 'Analisar recurso da parte contrária', u: 1, proc: 2, off: -1, st: 'a_fazer' },
  { t: 'Conferir cálculo de honorários', u: 1, proc: 3, off: 6, st: 'a_fazer' },
  { t: 'Enviar parecer ao cliente', u: 1, proc: 5, off: -4, st: 'feito' },
  { t: 'Atualizar tabela de feriados', u: 0, proc: null, off: 7, st: 'a_fazer' },
  { t: 'Revisar permissões da equipe', u: 0, proc: null, off: 10, st: 'fazendo' },
  { t: 'Conferir andamento dos processos parados', u: 0, proc: 6, off: 2, st: 'a_fazer' },
] as const;

export async function semearTarefas(db: Db, agora: Date = new Date()): Promise<void> {
  await db.delete(schema.tarefa);
  const procs = await db.select().from(schema.processo).orderBy(schema.processo.id);
  const users = await db.select().from(schema.usuario).orderBy(schema.usuario.id);
  const porEmail = USUARIOS_DEMO.map((d) => users.find((u) => u.email === d.email));
  if (procs.length === 0 || porEmail.some((u) => !u)) return;
  const hoje = hojeEmBrasilia(agora);
  await db.insert(schema.tarefa).values(
    TAREFAS_DEMO.map((d) => ({
      titulo: d.t,
      processoId: d.proc === null ? null : procs[d.proc % procs.length]!.id,
      responsavelId: porEmail[d.u]!.id,
      status: d.st,
      venceEm: somarDias(hoje, d.off),
      criadoPor: porEmail[d.u]!.id,
    })),
  );
}

export async function semear(db: Db, iteracoes?: number, agora: Date = new Date()): Promise<void> {
  await semearUsuarios(db, iteracoes);
  await semearClientes(db);
  await semearProcessos(db);
  await semearFeriados(db, agora);
  await semearPrazos(db, agora);
  await semearTarefas(db, agora);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = parseEnv();
  const { db, close } = createDb(env.DATABASE_URL);
  try {
    // Em Workers o PBKDF2 aceita até ~100k iterações (ver docs/adr/0001): use HASH_ITERACOES=100000 lá.
    await semear(db, process.env.HASH_ITERACOES ? Number(process.env.HASH_ITERACOES) : undefined);
    console.log(
      `Seed ok: ${USUARIOS_DEMO.length} usuários e ${clientesDemo().length} clientes e 12 processos, feriados, 14 prazos e 12 tarefas fictícios (senha ${SENHA_DEMO}).`,
    );
  } finally {
    await close();
  }
}
