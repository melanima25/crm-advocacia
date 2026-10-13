import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { and, asc, count, eq, lt, ne, sql, type SQL } from 'drizzle-orm';
import {
  StatusTarefaBodySchema,
  TarefaBodySchema,
  TarefaResponseSchema,
  TarefasQuerySchema,
  TarefasResponseSchema,
  diffCampos,
  hojeEmBrasilia,
  podeFazer,
  tarefaVencida,
} from '@crm/shared';
import { registrarAuditoria } from '../auth/auditoria';
import { exigir, type AppEnv } from '../auth/middleware';
import { schema, type Db } from '../db/client';
import { codigoPg } from '../db/erros';

const t = schema.tarefa;
const idDaRota = (v: string) => {
  const id = Number(v);
  return Number.isInteger(id) && id >= 1 && id <= 2_147_483_647 ? id : null;
};

const MSG_ATRIBUIR = 'Assistente só cria e atribui tarefas para si mesmo';
const MSG_ALHEIA = 'Assistente só altera as próprias tarefas';

export function tarefasRoutes(db: Db, logado: MiddlewareHandler<AppEnv>, agora: () => Date) {
  const r = new Hono<AppEnv>();
  r.use('*', logado);

  const base = () =>
    db
      .select({
        id: t.id,
        titulo: t.titulo,
        descricao: t.descricao,
        processoId: t.processoId,
        processoNumero: schema.processo.numeroCnj,
        responsavelId: t.responsavelId,
        responsavelNome: schema.usuario.nome,
        status: t.status,
        venceEm: t.venceEm,
      })
      .from(t)
      .leftJoin(schema.processo, eq(schema.processo.id, t.processoId))
      .innerJoin(schema.usuario, eq(schema.usuario.id, t.responsavelId));

  type Linha = Awaited<ReturnType<ReturnType<typeof base>['execute']>>[number];
  const paraApi = (l: Linha) => ({
    ...l,
    vencida: tarefaVencida(l.venceEm, hojeEmBrasilia(agora()), l.status),
  });

  const auditados = (x: {
    titulo: string;
    descricao: string | null;
    processoId: number | null;
    responsavelId: number;
    venceEm: string | null;
    status: string;
  }) => ({
    titulo: x.titulo,
    descricao: x.descricao,
    processoId: x.processoId,
    responsavelId: x.responsavelId,
    venceEm: x.venceEm,
    status: x.status,
  });

  /** Assistente: só mexe em tarefa própria. Admin e advogado: em qualquer uma. */
  const ehEquipe = (c: Context<AppEnv>) =>
    podeFazer(c.get('usuario').perfil, 'tarefa:atribuir-outros');

  const erroDeBanco = (c: Context<AppEnv>, e: unknown) => {
    if (codigoPg(e) === '23503')
      return c.json({ erro: 'Processo ou responsável inexistente' }, 400);
    throw e;
  };

  async function responsavelAtivo(id: number): Promise<boolean> {
    const [u] = await db
      .select({ ativo: schema.usuario.ativo })
      .from(schema.usuario)
      .where(eq(schema.usuario.id, id));
    return !!u?.ativo;
  }

  r.get('/', exigir('tarefa:ver'), async (c) => {
    const q = TarefasQuerySchema.safeParse(c.req.query());
    if (!q.success) return c.json({ erro: 'Parâmetros inválidos' }, 400);
    const { status, responsavelId, processoId, vencidas, pagina, porPagina } = q.data;
    const hoje = hojeEmBrasilia(agora());
    const filtros: (SQL | undefined)[] = [
      status ? eq(t.status, status) : undefined,
      responsavelId ? eq(t.responsavelId, responsavelId) : undefined,
      processoId ? eq(t.processoId, processoId) : undefined,
      vencidas ? and(ne(t.status, 'feito'), lt(t.venceEm, hoje)) : undefined,
    ];
    const onde = and(...filtros);
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(t).where(onde);
    // sem data vai para o fim; depois pela data, depois pelo id (ordem estável)
    const linhas = await base()
      .where(onde)
      .orderBy(sql`${t.venceEm} asc nulls last`, asc(t.id))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina);
    return c.json(
      TarefasResponseSchema.parse({ pagina, porPagina, total, itens: linhas.map(paraApi) }),
    );
  });

  r.get('/:id', exigir('tarefa:ver'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    if (!id) return c.json({ erro: 'Pedido inválido' }, 400);
    const [linha] = await base().where(eq(t.id, id));
    if (!linha) return c.json({ erro: 'Tarefa não encontrada' }, 404);
    return c.json(TarefaResponseSchema.parse({ tarefa: paraApi(linha) }));
  });

  r.post('/', exigir('tarefa:criar'), async (c) => {
    const corpo = TarefaBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success)
      return c.json({ erro: corpo.error.issues[0]?.message ?? 'Dados inválidos' }, 400);
    const eu = c.get('usuario');
    const responsavelId = corpo.data.responsavelId ?? eu.id;
    if (responsavelId !== eu.id && !ehEquipe(c)) return c.json({ erro: MSG_ATRIBUIR }, 403);
    if (!(await responsavelAtivo(responsavelId)))
      return c.json({ erro: 'Responsável inexistente ou inativo' }, 400);
    try {
      const id = await db.transaction(async (tx) => {
        const [nova] = await tx
          .insert(t)
          .values({
            titulo: corpo.data.titulo,
            descricao: corpo.data.descricao,
            processoId: corpo.data.processoId,
            responsavelId,
            venceEm: corpo.data.venceEm,
            criadoPor: eu.id,
          })
          .returning();
        if (!nova) throw new Error('Falha ao criar tarefa');
        await registrarAuditoria(tx, {
          usuarioId: eu.id,
          entidade: 'tarefa',
          entidadeId: nova.id,
          acao: 'criar',
          diff: diffCampos<Record<string, unknown>>({}, auditados(nova)),
        });
        return nova.id;
      });
      const [linha] = await base().where(eq(t.id, id));
      return c.json(TarefaResponseSchema.parse({ tarefa: paraApi(linha!) }), 201);
    } catch (e) {
      return erroDeBanco(c, e);
    }
  });

  /** Edita título, descrição, processo, responsável e data. O STATUS muda por PATCH /:id/status. */
  r.put('/:id', exigir('tarefa:criar'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    const corpo = TarefaBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!id) return c.json({ erro: 'Pedido inválido' }, 400);
    if (!corpo.success)
      return c.json({ erro: corpo.error.issues[0]?.message ?? 'Dados inválidos' }, 400);
    const eu = c.get('usuario');
    const [atual] = await db.select().from(t).where(eq(t.id, id));
    if (!atual) return c.json({ erro: 'Tarefa não encontrada' }, 404);
    if (!ehEquipe(c)) {
      if (atual.responsavelId !== eu.id) return c.json({ erro: MSG_ALHEIA }, 403);
      if ((corpo.data.responsavelId ?? eu.id) !== eu.id) return c.json({ erro: MSG_ATRIBUIR }, 403);
    }
    // mantém o responsável atual quando o corpo não informa (editar não "puxa" a tarefa para você)
    const responsavelId = corpo.data.responsavelId ?? atual.responsavelId;
    if (responsavelId !== atual.responsavelId && !(await responsavelAtivo(responsavelId)))
      return c.json({ erro: 'Responsável inexistente ou inativo' }, 400);
    try {
      await db.transaction(async (tx) => {
        const [antes] = await tx.select().from(t).where(eq(t.id, id)).for('update');
        if (!antes) return;
        const depois = {
          ...antes,
          titulo: corpo.data.titulo,
          descricao: corpo.data.descricao,
          processoId: corpo.data.processoId,
          responsavelId,
          venceEm: corpo.data.venceEm,
        };
        const diff = diffCampos(auditados(antes), auditados(depois));
        if (Object.keys(diff).length === 0) return;
        await tx
          .update(t)
          .set({
            titulo: depois.titulo,
            descricao: depois.descricao,
            processoId: depois.processoId,
            responsavelId: depois.responsavelId,
            venceEm: depois.venceEm,
            atualizadoEm: new Date(),
          })
          .where(eq(t.id, id));
        await registrarAuditoria(tx, {
          usuarioId: eu.id,
          entidade: 'tarefa',
          entidadeId: id,
          acao: 'editar',
          diff,
        });
      });
    } catch (e) {
      return erroDeBanco(c, e);
    }
    const [linha] = await base().where(eq(t.id, id));
    return c.json(TarefaResponseSchema.parse({ tarefa: paraApi(linha!) }));
  });

  r.patch('/:id/status', exigir('tarefa:criar'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    const corpo = StatusTarefaBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!id || !corpo.success) return c.json({ erro: 'Pedido inválido' }, 400);
    const eu = c.get('usuario');
    const resultado = await db.transaction(async (tx) => {
      const [antes] = await tx.select().from(t).where(eq(t.id, id)).for('update');
      if (!antes) return 'inexistente' as const;
      if (!ehEquipe(c) && antes.responsavelId !== eu.id) return 'alheia' as const;
      if (antes.status === corpo.data.status) return 'ok' as const;
      await tx
        .update(t)
        .set({ status: corpo.data.status, atualizadoEm: new Date() })
        .where(eq(t.id, id));
      await registrarAuditoria(tx, {
        usuarioId: eu.id,
        entidade: 'tarefa',
        entidadeId: id,
        acao: 'editar',
        diff: { status: { de: antes.status, para: corpo.data.status } },
      });
      return 'ok' as const;
    });
    if (resultado === 'inexistente') return c.json({ erro: 'Tarefa não encontrada' }, 404);
    if (resultado === 'alheia') return c.json({ erro: MSG_ALHEIA }, 403);
    const [linha] = await base().where(eq(t.id, id));
    return c.json(TarefaResponseSchema.parse({ tarefa: paraApi(linha!) }));
  });

  return r;
}
