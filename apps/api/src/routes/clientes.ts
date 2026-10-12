import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import {
  ClienteBodySchema,
  ClienteResponseSchema,
  ClientesQuerySchema,
  ClientesResponseSchema,
  diffCampos,
} from '@crm/shared';
import { registrarAuditoria } from '../auth/auditoria';
import { exigir, type AppEnv } from '../auth/middleware';
import { schema, type Db } from '../db/client';

type Linha = typeof schema.cliente.$inferSelect;

const paraApi = (c: Linha) => ({
  id: c.id,
  tipo: c.tipo,
  nome: c.nome,
  documento: c.documento,
  email: c.email,
  telefone: c.telefone,
  criadoEm: c.criadoEm.toISOString(),
  atualizadoEm: c.atualizadoEm.toISOString(),
});

/** Campos que entram no diff de auditoria. */
const camposAuditados = (c: Pick<Linha, 'tipo' | 'nome' | 'documento' | 'email' | 'telefone'>) => ({
  tipo: c.tipo,
  nome: c.nome,
  documento: c.documento,
  email: c.email,
  telefone: c.telefone,
});

/** Escapa % _ \ para a busca tratar o texto digitado literalmente. */
const literal = (t: string) => t.replace(/[\\%_]/g, (m) => `\\${m}`);

function idDaRota(valor: string): number | null {
  const id = Number(valor);
  return Number.isInteger(id) && id >= 1 && id <= 2_147_483_647 ? id : null;
}

export function clientesRoutes(db: Db, logado: MiddlewareHandler<AppEnv>) {
  const r = new Hono<AppEnv>();
  r.use('*', logado);

  r.get('/', exigir('cliente:ver'), async (c) => {
    const q = ClientesQuerySchema.safeParse(c.req.query());
    if (!q.success) return c.json({ erro: 'Parâmetros inválidos' }, 400);
    const { q: busca, tipo, pagina, porPagina } = q.data;
    const filtros: (SQL | undefined)[] = [tipo ? eq(schema.cliente.tipo, tipo) : undefined];
    if (busca) {
      const padrao = `%${literal(busca)}%`;
      filtros.push(
        or(
          ilike(schema.cliente.nome, padrao),
          ilike(schema.cliente.email, padrao),
          ilike(schema.cliente.documento, padrao),
        ),
      );
    }
    const onde = and(...filtros);
    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(schema.cliente)
      .where(onde);
    const linhas = await db
      .select()
      .from(schema.cliente)
      .where(onde)
      .orderBy(schema.cliente.nome, desc(schema.cliente.id))
      .limit(porPagina)
      .offset((pagina - 1) * porPagina);
    return c.json(
      ClientesResponseSchema.parse({ pagina, porPagina, total, itens: linhas.map(paraApi) }),
    );
  });

  r.get('/:id', exigir('cliente:ver'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    if (!id) return c.json({ erro: 'Pedido inválido' }, 400);
    const [linha] = await db.select().from(schema.cliente).where(eq(schema.cliente.id, id));
    if (!linha) return c.json({ erro: 'Cliente não encontrado' }, 404);
    return c.json(ClienteResponseSchema.parse({ cliente: paraApi(linha) }));
  });

  r.post('/', exigir('cliente:criar'), async (c) => {
    const corpo = ClienteBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!corpo.success)
      return c.json({ erro: corpo.error.issues[0]?.message ?? 'Dados inválidos' }, 400);
    const eu = c.get('usuario');
    const criado = await db.transaction(async (tx) => {
      const [novo] = await tx
        .insert(schema.cliente)
        .values({ ...corpo.data, criadoPor: eu.id })
        .returning();
      if (!novo) throw new Error('Falha ao criar cliente');
      await registrarAuditoria(tx, {
        usuarioId: eu.id,
        entidade: 'cliente',
        entidadeId: novo.id,
        acao: 'criar',
        diff: diffCampos<Record<string, unknown>>({}, camposAuditados(novo)),
      });
      return novo;
    });
    return c.json(ClienteResponseSchema.parse({ cliente: paraApi(criado) }), 201);
  });

  r.put('/:id', exigir('cliente:editar'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    const corpo = ClienteBodySchema.safeParse(await c.req.json().catch(() => null));
    if (!id) return c.json({ erro: 'Pedido inválido' }, 400);
    if (!corpo.success)
      return c.json({ erro: corpo.error.issues[0]?.message ?? 'Dados inválidos' }, 400);
    const eu = c.get('usuario');
    const atualizado = await db.transaction(async (tx) => {
      const [antes] = await tx
        .select()
        .from(schema.cliente)
        .where(eq(schema.cliente.id, id))
        .for('update');
      if (!antes) return null;
      const diff = diffCampos(camposAuditados(antes), corpo.data);
      if (Object.keys(diff).length === 0) return antes; // nada mudou: não grava nem audita
      const [novo] = await tx
        .update(schema.cliente)
        .set({ ...corpo.data, atualizadoEm: new Date() })
        .where(eq(schema.cliente.id, id))
        .returning();
      await registrarAuditoria(tx, {
        usuarioId: eu.id,
        entidade: 'cliente',
        entidadeId: id,
        acao: 'editar',
        diff,
      });
      return novo ?? antes;
    });
    if (!atualizado) return c.json({ erro: 'Cliente não encontrado' }, 404);
    return c.json(ClienteResponseSchema.parse({ cliente: paraApi(atualizado) }));
  });

  r.delete('/:id', exigir('cliente:excluir'), async (c) => {
    const id = idDaRota(c.req.param('id'));
    if (!id) return c.json({ erro: 'Pedido inválido' }, 400);
    const eu = c.get('usuario');
    const ok = await db.transaction(async (tx) => {
      const [removido] = await tx
        .delete(schema.cliente)
        .where(eq(schema.cliente.id, id))
        .returning();
      if (!removido) return false;
      await registrarAuditoria(tx, {
        usuarioId: eu.id,
        entidade: 'cliente',
        entidadeId: id,
        acao: 'excluir',
        diff: { removido: camposAuditados(removido) },
      });
      return true;
    });
    if (!ok) return c.json({ erro: 'Cliente não encontrado' }, 404);
    return c.json({ ok: true });
  });

  return r;
}
