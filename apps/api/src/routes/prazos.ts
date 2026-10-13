import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { and, asc, count, eq, gte, lt, lte, type SQL } from 'drizzle-orm';
import {
  CalcularBodySchema,
  CalcularResponseSchema,
  PrazoBodySchema,
  PrazoResponseSchema,
  PrazosQuerySchema,
  PrazosResponseSchema,
  StatusBodySchema,
  calcularVencimento,
  dateParaBrasilia,
  diffCampos,
  estaVencido,
  fimDoDiaBrasilia,
  localBrasiliaParaDate,
  type PrazoBody,
} from '@crm/shared';
import { registrarAuditoria } from '../auth/auditoria';
import { exigir, type AppEnv } from '../auth/middleware';
import { schema, type Db } from '../db/client';
import { codigoPg } from '../db/erros';

const p = schema.prazo;
const idDaRota = (v: string) => {
  const id = Number(v);
  return Number.isInteger(id) && id >= 1 && id <= 2_147_483_647 ? id : null;
};

type Feriados = { datas: Set<string>; anosCadastrados: Set<number> };

async function carregarFeriados(db: Db): Promise<Feriados> {
  const lista = await db.select({ data: schema.feriado.data }).from(schema.feriado);
  return {
    datas: new Set(lista.map((f) => f.data)),
    anosCadastrados: new Set(lista.map((f) => Number(f.data.slice(0, 4)))),
  };
}

/** Anos que a contagem atravessa e que NÃO têm nenhum feriado cadastrado (cálculo seria enganoso). */
function anosSemFeriados(f: Feriados, inicio: string, fim: string): number[] {
  const faltam: number[] = [];
  for (let a = Number(inicio.slice(0, 4)); a <= Number(fim.slice(0, 4)); a++)
    if (!f.anosCadastrados.has(a)) faltam.push(a);
  return faltam;
}

const textoAviso = (anos: number[]) =>
  `Não há feriados cadastrados para ${anos.join(', ')}: a contagem pode estar errada. Peça ao administrador para cadastrá-los.`;

type Resolvido = {
  venceEm: Date;
  intimacaoEm: string | null;
  diasUteis: number | null;
  semFeriados: number[];
};

/** Decide o vencimento: calculado pelo servidor (intimação + dias úteis) ou manual (data e hora). */
function resolverVencimento(body: PrazoBody, f: Feriados): Resolvido {
  if (body.intimacaoEm !== undefined && body.diasUteis !== undefined) {
    const r = calcularVencimento(body.intimacaoEm, body.diasUteis, f.datas);
    return {
      venceEm: fimDoDiaBrasilia(r.venceEm),
      intimacaoEm: body.intimacaoEm,
      diasUteis: body.diasUteis,
      semFeriados: anosSemFeriados(f, body.intimacaoEm, r.venceEm),
    };
  }
  return {
    venceEm: localBrasiliaParaDate(body.venceLocal!),
    intimacaoEm: null,
    diasUteis: null,
    semFeriados: [],
  };
}

export function prazosRoutes(db: Db, logado: MiddlewareHandler<AppEnv>, agora: () => Date) {
  const r = new Hono<AppEnv>();
  r.use('*', logado);

  const base = () =>
    db
      .select({
        id: p.id,
        processoId: p.processoId,
        processoNumero: schema.processo.numeroCnj,
        clienteNome: schema.cliente.nome,
        tipo: p.tipo,
        intimacaoEm: p.intimacaoEm,
        diasUteis: p.diasUteis,
        venceEm: p.venceEm,
        status: p.status,
        responsavelId: p.responsavelId,
        responsavelNome: schema.usuario.nome,
        observacao: p.observacao,
      })
      .from(p)
      .innerJoin(schema.processo, eq(schema.processo.id, p.processoId))
      .innerJoin(schema.cliente, eq(schema.cliente.id, schema.processo.clienteId))
      .innerJoin(schema.usuario, eq(schema.usuario.id, p.responsavelId));

  type Linha = Awaited<ReturnType<ReturnType<typeof base>['execute']>>[number];
  const paraApi = (l: Linha) => {
    const { data, hora } = dateParaBrasilia(l.venceEm);
    return {
      ...l,
      venceEm: l.venceEm.toISOString(),
      venceData: data,
      venceHora: hora,
      vencido: estaVencido(l.venceEm, agora(), l.status),
    };
  };

  /** Regra de escopo: assistente só mexe em prazos de processos em que atua (é o responsável). */
  async function assistenteFora(c: Context<AppEnv>, ...processoIds: number[]): Promise<boolean> {
    const eu = c.get('usuario');
    if (eu.perfil !== 'assistente') return false;
    for (const id of new Set(processoIds)) {
      const [proc] = await db
        .select({ responsavelId: schema.processo.responsavelId })
        .from(schema.processo)
        .where(eq(schema.processo.id, id));
      if (proc && proc.responsavelId !== eu.id) return true;
    }
    return false;
  }
  const MSG_ESCOPO = 'Assistente só altera prazos de processos em que atua (é o responsável)';

  const erroDeBanco = (c: Context<AppEnv>, e: unknown) => {
    if (codigoPg(e) === '23503')
      return c.json({ erro: 'Processo ou responsável inexistente' }, 400);
    throw e;
  };

  const camposAuditados = (x: {
    processoId: number;
    tipo: string;
    intimacaoEm: string | null;
    diasUteis: number | null;
    venceEm: Date;
    responsavelId: number;
    observacao: string | null;
    status: string;
  }) => ({
    processoId: x.processoId,
    tipo: x.tipo,
    intimacaoEm: x.intimacaoEm,
    diasUteis: x.diasUteis,
    venceEm: x.venceEm.toISOString(),
    responsavelId: x.responsavelId,
    observacao: x.observacao,
    status: x.status,
  });

  /** Prévia do cálculo: não grava nada. Mostra a contagem dia a dia e o que foi pulado. */
  r.post('/calcular', exigir('prazo:criar'), async (c) => {
    const corpo = CalcularBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success)
      return c.json({ erro: corpo.error.issues[0]?.message ?? 'Dados inválidos' }, 400);
    const f = await carregarFeriados(db);
    const res = calcularVencimento(corpo.data.intimacaoEm, corpo.data.diasUteis, f.datas);
    const faltam = anosSemFeriados(f, corpo.data.intimacaoEm, res.venceEm);
    return c.json(
      CalcularResponseSchema.parse({ ...res, aviso: faltam.length ? textoAviso(faltam) : null }),
    );
  });

  r.get('/', exigir('prazo:ver'), async (c) => {
    const q = PrazosQuerySchema.safeParse(c.req.query());
    if (!q.success) return c.json({ erro: 'Parâmetros inválidos' }, 400);
    const { status, tipo, responsavelId, processoId, de, ate, vencidos, pagina, porPagina } =
      q.data;
    const filtros: (SQL | undefined)[] = [
      status ? eq(p.status, status) : undefined,
      tipo ? eq(p.tipo, tipo) : undefined,
      responsavelId ? eq(p.responsavelId, responsavelId) : undefined,
      processoId ? eq(p.processoId, processoId) : undefined,
      de ? gte(p.venceEm, new Date(`${de}T00:00:00-03:00`)) : undefined,
      ate ? lte(p.venceEm, new Date(`${ate}T23:59:59.999-03:00`)) : undefined,
      vencidos ? and(eq(p.status, 'pendente'), lt(p.venceEm, agora())) : undefined,
    ];
    const onde = and(...filtros);
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(p).where(onde);
    const linhas = await base()
      .where(onde)
      .orderBy(asc(p.venceEm), asc(p.id))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina);
    return c.json(
      PrazosResponseSchema.parse({ pagina, porPagina, total, itens: linhas.map(paraApi) }),
    );
  });

  r.get('/:id', exigir('prazo:ver'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    if (!id) return c.json({ erro: 'Pedido inválido' }, 400);
    const [linha] = await base().where(eq(p.id, id));
    if (!linha) return c.json({ erro: 'Prazo não encontrado' }, 404);
    return c.json(PrazoResponseSchema.parse({ prazo: paraApi(linha) }));
  });

  r.post('/', exigir('prazo:criar'), async (c) => {
    const corpo = PrazoBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success)
      return c.json({ erro: corpo.error.issues[0]?.message ?? 'Dados inválidos' }, 400);
    if (await assistenteFora(c, corpo.data.processoId)) return c.json({ erro: MSG_ESCOPO }, 403);
    const venc = resolverVencimento(corpo.data, await carregarFeriados(db));
    if (venc.semFeriados.length) return c.json({ erro: textoAviso(venc.semFeriados) }, 422);
    const eu = c.get('usuario');
    try {
      const id = await db.transaction(async (tx) => {
        const [novo] = await tx
          .insert(p)
          .values({
            processoId: corpo.data.processoId,
            tipo: corpo.data.tipo,
            intimacaoEm: venc.intimacaoEm,
            diasUteis: venc.diasUteis,
            venceEm: venc.venceEm,
            responsavelId: corpo.data.responsavelId,
            observacao: corpo.data.observacao,
            criadoPor: eu.id,
          })
          .returning();
        if (!novo) throw new Error('Falha ao criar prazo');
        await registrarAuditoria(tx, {
          usuarioId: eu.id,
          entidade: 'prazo',
          entidadeId: novo.id,
          acao: 'criar',
          diff: diffCampos<Record<string, unknown>>({}, camposAuditados(novo)),
        });
        return novo.id;
      });
      const [linha] = await base().where(eq(p.id, id));
      return c.json(PrazoResponseSchema.parse({ prazo: paraApi(linha!) }), 201);
    } catch (e) {
      return erroDeBanco(c, e);
    }
  });

  /** Edita os dados do prazo (o STATUS muda só por PATCH /:id/status). Recalcula o vencimento. */
  r.put('/:id', exigir('prazo:editar'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    const corpo = PrazoBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!id) return c.json({ erro: 'Pedido inválido' }, 400);
    if (!corpo.success)
      return c.json({ erro: corpo.error.issues[0]?.message ?? 'Dados inválidos' }, 400);
    const [atual] = await db.select().from(p).where(eq(p.id, id));
    if (!atual) return c.json({ erro: 'Prazo não encontrado' }, 404);
    if (await assistenteFora(c, atual.processoId, corpo.data.processoId))
      return c.json({ erro: MSG_ESCOPO }, 403);
    const venc = resolverVencimento(corpo.data, await carregarFeriados(db));
    if (venc.semFeriados.length) return c.json({ erro: textoAviso(venc.semFeriados) }, 422);
    const eu = c.get('usuario');
    try {
      await db.transaction(async (tx) => {
        const [antes] = await tx.select().from(p).where(eq(p.id, id)).for('update');
        if (!antes) return;
        const depois = {
          ...antes,
          processoId: corpo.data.processoId,
          tipo: corpo.data.tipo,
          intimacaoEm: venc.intimacaoEm,
          diasUteis: venc.diasUteis,
          venceEm: venc.venceEm,
          responsavelId: corpo.data.responsavelId,
          observacao: corpo.data.observacao,
        };
        const diff = diffCampos(camposAuditados(antes), camposAuditados(depois));
        if (Object.keys(diff).length === 0) return;
        await tx
          .update(p)
          .set({
            processoId: depois.processoId,
            tipo: depois.tipo,
            intimacaoEm: depois.intimacaoEm,
            diasUteis: depois.diasUteis,
            venceEm: depois.venceEm,
            responsavelId: depois.responsavelId,
            observacao: depois.observacao,
            atualizadoEm: new Date(),
          })
          .where(eq(p.id, id));
        await registrarAuditoria(tx, {
          usuarioId: eu.id,
          entidade: 'prazo',
          entidadeId: id,
          acao: 'editar',
          diff,
        });
      });
    } catch (e) {
      return erroDeBanco(c, e);
    }
    const [linha] = await base().where(eq(p.id, id));
    if (!linha) return c.json({ erro: 'Prazo não encontrado' }, 404);
    return c.json(PrazoResponseSchema.parse({ prazo: paraApi(linha) }));
  });

  /** Marcar como cumprido/perdido (ou reabrir): só admin e advogado. */
  r.patch('/:id/status', exigir('prazo:cumprir'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    const corpo = StatusBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!id || !corpo.success) return c.json({ erro: 'Pedido inválido' }, 400);
    const eu = c.get('usuario');
    const achou = await db.transaction(async (tx) => {
      const [antes] = await tx.select().from(p).where(eq(p.id, id)).for('update');
      if (!antes) return false;
      if (antes.status === corpo.data.status) return true;
      await tx
        .update(p)
        .set({ status: corpo.data.status, atualizadoEm: new Date() })
        .where(eq(p.id, id));
      await registrarAuditoria(tx, {
        usuarioId: eu.id,
        entidade: 'prazo',
        entidadeId: id,
        acao: 'editar',
        diff: { status: { de: antes.status, para: corpo.data.status } },
      });
      return true;
    });
    if (!achou) return c.json({ erro: 'Prazo não encontrado' }, 404);
    const [linha] = await base().where(eq(p.id, id));
    return c.json(PrazoResponseSchema.parse({ prazo: paraApi(linha!) }));
  });

  return r;
}
