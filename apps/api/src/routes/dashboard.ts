import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { and, count, eq, gte, lt, lte, ne, sql } from 'drizzle-orm';
import {
  AREAS,
  DashboardSchema,
  STATUS_PROCESSO,
  dateParaBrasilia,
  fimDoDiaBrasilia,
  hojeEmBrasilia,
  podeFazer,
  somarDias,
} from '@crm/shared';
import { exigir, type AppEnv } from '../auth/middleware';
import { schema, type Db } from '../db/client';

/**
 * Indicadores. O assistente (dashboard:basico) NÃO recebe a seção de processos: ela é omitida
 * já no servidor (null), não escondida na tela.
 */
export function dashboardRoutes(db: Db, logado: MiddlewareHandler<AppEnv>, agora: () => Date) {
  const r = new Hono<AppEnv>();
  r.use('*', logado);

  r.get('/', exigir('dashboard:basico'), async (c) => {
    const eu = c.get('usuario');
    const agoraD = agora();
    const hoje = hojeEmBrasilia(agoraD);
    const dias = Array.from({ length: 7 }, (_, i) => somarDias(hoje, i));
    const fimJanela = fimDoDiaBrasilia(dias[6]!);
    const pz = schema.prazo;
    const tf = schema.tarefa;

    // ---- prazos pendentes ----
    const [vencidos] = await db
      .select({ n: count() })
      .from(pz)
      .where(and(eq(pz.status, 'pendente'), lt(pz.venceEm, agoraD)));
    const pendentesJanela = await db
      .select({ venceEm: pz.venceEm })
      .from(pz)
      .where(and(eq(pz.status, 'pendente'), gte(pz.venceEm, agoraD), lte(pz.venceEm, fimJanela)));
    const porDia = dias.map((data) => ({ data, total: 0 }));
    for (const x of pendentesJanela) {
      const alvo = porDia.find((d) => d.data === dateParaBrasilia(x.venceEm).data);
      if (alvo) alvo.total++;
    }
    const venceHoje = porDia[0]!.total;

    // ---- tarefas abertas por pessoa ----
    const abertas = await db
      .select({
        usuarioId: schema.usuario.id,
        nome: schema.usuario.nome,
        status: tf.status,
        vencida: sql<boolean>`(${tf.venceEm} is not null and ${tf.venceEm} < ${hoje})`,
      })
      .from(tf)
      .innerJoin(schema.usuario, eq(schema.usuario.id, tf.responsavelId))
      .where(ne(tf.status, 'feito'));
    const pessoas = new Map<
      number,
      { usuarioId: number; nome: string; aFazer: number; fazendo: number; vencidas: number }
    >();
    for (const x of abertas) {
      const p = pessoas.get(x.usuarioId) ?? {
        usuarioId: x.usuarioId,
        nome: x.nome,
        aFazer: 0,
        fazendo: 0,
        vencidas: 0,
      };
      if (x.status === 'a_fazer') p.aFazer++;
      else p.fazendo++;
      if (x.vencida) p.vencidas++;
      pessoas.set(x.usuarioId, p);
    }
    const porPessoa = [...pessoas.values()].sort(
      (a, b) =>
        b.aFazer + b.fazendo - (a.aFazer + a.fazendo) || a.nome.localeCompare(b.nome, 'pt-BR'),
    );

    // ---- processos (só dashboard completo) ----
    let processos = null;
    if (podeFazer(eu.perfil, 'dashboard:completo')) {
      const pr = schema.processo;
      const st = await db.select({ k: pr.status, n: count() }).from(pr).groupBy(pr.status);
      const ar = await db.select({ k: pr.area, n: count() }).from(pr).groupBy(pr.area);
      // todas as categorias aparecem (inclusive com 0), na ordem do domínio
      const porStatus = STATUS_PROCESSO.map((status) => ({
        status,
        total: st.find((x) => x.k === status)?.n ?? 0,
      }));
      const porArea = AREAS.map((area) => ({
        area,
        total: ar.find((x) => x.k === area)?.n ?? 0,
      }));
      processos = { total: porStatus.reduce((s, x) => s + x.total, 0), porStatus, porArea };
    }

    return c.json(
      DashboardSchema.parse({
        hoje,
        prazos: {
          vencidos: vencidos?.n ?? 0,
          hoje: venceHoje,
          proximos7: porDia.reduce((s, d) => s + d.total, 0),
          porDia,
        },
        tarefas: {
          abertas: abertas.length,
          vencidas: abertas.filter((x) => x.vencida).length,
          porPessoa,
        },
        processos,
      }),
    );
  });

  return r;
}
