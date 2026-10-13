import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import {
  OpcoesResponseSchema,
  ProcessoBodySchema,
  ProcessoResponseSchema,
  ProcessosQuerySchema,
  ProcessosResponseSchema,
  diffCampos,
} from '@crm/shared';
import { registrarAuditoria } from '../auth/auditoria';
import { exigir, type AppEnv } from '../auth/middleware';
import { schema, type Db } from '../db/client';
import { codigoPg } from '../db/erros';

const p = schema.processo;

const selecao = {
  id: p.id,
  numeroCnj: p.numeroCnj,
  clienteId: p.clienteId,
  clienteNome: schema.cliente.nome,
  area: p.area,
  vara: p.vara,
  status: p.status,
  responsavelId: p.responsavelId,
  responsavelNome: schema.usuario.nome,
  abertoEm: p.abertoEm,
  criadoEm: p.criadoEm,
  atualizadoEm: p.atualizadoEm,
};

const paraApi = (l: { criadoEm: Date; atualizadoEm: Date; [k: string]: unknown }) => ({
  ...l,
  criadoEm: l.criadoEm.toISOString(),
  atualizadoEm: l.atualizadoEm.toISOString(),
});

const camposAuditados = (x: {
  numeroCnj: string;
  clienteId: number;
  area: string;
  vara: string;
  status: string;
  responsavelId: number;
  abertoEm: string;
}) => ({
  numeroCnj: x.numeroCnj,
  clienteId: x.clienteId,
  area: x.area,
  vara: x.vara,
  status: x.status,
  responsavelId: x.responsavelId,
  abertoEm: x.abertoEm,
});

const literal = (t: string) => t.replace(/[\\%_]/g, (m) => `\\${m}`);
const idDaRota = (v: string) => {
  const id = Number(v);
  return Number.isInteger(id) && id >= 1 && id <= 2_147_483_647 ? id : null;
};

/** Traduz violações de banco em respostas claras (409 duplicado / 400 referência inexistente). */
function erroDeBanco(c: Context, e: unknown) {
  const codigo = codigoPg(e);
  if (codigo === '23505') return c.json({ erro: 'Já existe um processo com este número CNJ' }, 409);
  if (codigo === '23503') return c.json({ erro: 'Cliente ou responsável inexistente' }, 400);
  throw e;
}

export function processosRoutes(db: Db, logado: MiddlewareHandler<AppEnv>) {
  const r = new Hono<AppEnv>();
  r.use('*', logado);

  const base = () =>
    db
      .select(selecao)
      .from(p)
      .innerJoin(schema.cliente, eq(schema.cliente.id, p.clienteId))
      .innerJoin(schema.usuario, eq(schema.usuario.id, p.responsavelId));

  /** Usuários ativos que podem ser escolhidos como responsável (qualquer perfil logado com processo:ver). */
  r.get('/opcoes', exigir('processo:ver'), async (c) => {
    const lista = await db
      .select({ id: schema.usuario.id, nome: schema.usuario.nome })
      .from(schema.usuario)
      .where(eq(schema.usuario.ativo, true))
      .orderBy(schema.usuario.nome);
    return c.json(OpcoesResponseSchema.parse({ responsaveis: lista }));
  });

  r.get('/', exigir('processo:ver'), async (c) => {
    const q = ProcessosQuerySchema.safeParse(c.req.query());
    if (!q.success) return c.json({ erro: 'Parâmetros inválidos' }, 400);
    const { q: busca, status, area, clienteId, responsavelId, pagina, porPagina } = q.data;
    const filtros: (SQL | undefined)[] = [
      status ? eq(p.status, status) : undefined,
      area ? eq(p.area, area) : undefined,
      clienteId ? eq(p.clienteId, clienteId) : undefined,
      responsavelId ? eq(p.responsavelId, responsavelId) : undefined,
    ];
    if (busca) {
      const padrao = `%${literal(busca)}%`;
      filtros.push(
        or(ilike(p.numeroCnj, padrao), ilike(schema.cliente.nome, padrao), ilike(p.vara, padrao)),
      );
    }
    const onde = and(...filtros);
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(p)
      .innerJoin(schema.cliente, eq(schema.cliente.id, p.clienteId))
      .where(onde);
    const linhas = await base()
      .where(onde)
      .orderBy(desc(p.abertoEm), desc(p.id))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina);
    return c.json(
      ProcessosResponseSchema.parse({ pagina, porPagina, total, itens: linhas.map(paraApi) }),
    );
  });

  r.get('/:id', exigir('processo:ver'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    if (!id) return c.json({ erro: 'Pedido inválido' }, 400);
    const [linha] = await base().where(eq(p.id, id));
    if (!linha) return c.json({ erro: 'Processo não encontrado' }, 404);
    return c.json(ProcessoResponseSchema.parse({ processo: paraApi(linha) }));
  });

  r.post('/', exigir('processo:criar'), async (c) => {
    const corpo = ProcessoBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success)
      return c.json({ erro: corpo.error.issues[0]?.message ?? 'Dados inválidos' }, 400);
    const eu = c.get('usuario');
    try {
      const id = await db.transaction(async (tx) => {
        const [novo] = await tx
          .insert(p)
          .values({ ...corpo.data, criadoPor: eu.id })
          .returning();
        if (!novo) throw new Error('Falha ao criar processo');
        await registrarAuditoria(tx, {
          usuarioId: eu.id,
          entidade: 'processo',
          entidadeId: novo.id,
          acao: 'criar',
          diff: diffCampos<Record<string, unknown>>({}, camposAuditados(novo)),
        });
        return novo.id;
      });
      const [linha] = await base().where(eq(p.id, id));
      return c.json(ProcessoResponseSchema.parse({ processo: paraApi(linha!) }), 201);
    } catch (e) {
      return erroDeBanco(c, e);
    }
  });

  r.put('/:id', exigir('processo:editar'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    const corpo = ProcessoBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!id) return c.json({ erro: 'Pedido inválido' }, 400);
    if (!corpo.success)
      return c.json({ erro: corpo.error.issues[0]?.message ?? 'Dados inválidos' }, 400);
    const eu = c.get('usuario');
    try {
      const achou = await db.transaction(async (tx) => {
        const [antes] = await tx.select().from(p).where(eq(p.id, id)).for('update');
        if (!antes) return false;
        const diff = diffCampos(camposAuditados(antes), camposAuditados({ ...corpo.data }));
        if (Object.keys(diff).length === 0) return true;
        await tx
          .update(p)
          .set({ ...corpo.data, atualizadoEm: new Date() })
          .where(eq(p.id, id));
        await registrarAuditoria(tx, {
          usuarioId: eu.id,
          entidade: 'processo',
          entidadeId: id,
          acao: 'editar',
          diff,
        });
        return true;
      });
      if (!achou) return c.json({ erro: 'Processo não encontrado' }, 404);
      const [linha] = await base().where(eq(p.id, id));
      return c.json(ProcessoResponseSchema.parse({ processo: paraApi(linha!) }));
    } catch (e) {
      return erroDeBanco(c, e);
    }
  });

  r.delete('/:id', exigir('processo:excluir'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    if (!id) return c.json({ erro: 'Pedido inválido' }, 400);
    const eu = c.get('usuario');
    let ok: boolean;
    try {
      ok = await db.transaction(async (tx) => {
        const [removido] = await tx.delete(p).where(eq(p.id, id)).returning();
        if (!removido) return false;
        await registrarAuditoria(tx, {
          usuarioId: eu.id,
          entidade: 'processo',
          entidadeId: id,
          acao: 'excluir',
          diff: { removido: camposAuditados(removido) },
        });
        return true;
      });
    } catch (e) {
      // FK RESTRICT: o processo ainda tem prazos
      if (codigoPg(e) === '23503')
        return c.json({ erro: 'Não é possível excluir: o processo possui prazos' }, 409);
      throw e;
    }
    if (!ok) return c.json({ erro: 'Processo não encontrado' }, 404);
    return c.json({ ok: true });
  });

  return r;
}
