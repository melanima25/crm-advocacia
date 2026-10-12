import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { AREAS, PERFIS, STATUS_PROCESSO, TIPOS_CLIENTE } from '@crm/shared';

export const perfilEnum = pgEnum('perfil', PERFIS);

export const tipoClienteEnum = pgEnum('tipo_cliente', TIPOS_CLIENTE);

export const usuario = pgTable('usuario', {
  id: serial('id').primaryKey(),
  nome: text('nome').notNull(),
  email: text('email').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  perfil: perfilEnum('perfil').notNull(),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

/** O id da sessão é o SHA-256 do token que vai no cookie: vazar o banco não vaza sessões válidas. */
export const sessao = pgTable(
  'sessao',
  {
    id: text('id').primaryKey(),
    usuarioId: integer('usuario_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'cascade' }),
    criadaEm: timestamp('criada_em', { withTimezone: true }).notNull().defaultNow(),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessao_usuario_idx').on(t.usuarioId)],
);

/** Em Workers não há memória entre requisições: o bloqueio por tentativas vive no banco. */
export const tentativaLogin = pgTable(
  'tentativa_login',
  {
    id: serial('id').primaryKey(),
    email: text('email').notNull(),
    sucesso: boolean('sucesso').notNull(),
    ocorridaEm: timestamp('ocorrida_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tentativa_email_idx').on(t.email, t.ocorridaEm)],
);

export const auditoria = pgTable(
  'auditoria',
  {
    id: serial('id').primaryKey(),
    usuarioId: integer('usuario_id').references(() => usuario.id, { onDelete: 'set null' }),
    entidade: text('entidade').notNull(),
    entidadeId: text('entidade_id'),
    acao: text('acao').notNull(),
    diff: jsonb('diff'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auditoria_criado_idx').on(t.criadoEm)],
);

export const cliente = pgTable(
  'cliente',
  {
    id: serial('id').primaryKey(),
    tipo: tipoClienteEnum('tipo').notNull(),
    nome: text('nome').notNull(),
    /** Referência FICTÍCIA (não é validada como CPF/CNPJ de propósito). */
    documento: text('documento'),
    email: text('email'),
    telefone: text('telefone'),
    criadoPor: integer('criado_por').references(() => usuario.id, { onDelete: 'set null' }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cliente_nome_idx').on(t.nome)],
);

export const areaEnum = pgEnum('area_processo', AREAS);
export const statusProcessoEnum = pgEnum('status_processo', STATUS_PROCESSO);

export const processo = pgTable(
  'processo',
  {
    id: serial('id').primaryKey(),
    numeroCnj: text('numero_cnj').notNull().unique(),
    /** RESTRICT: não dá para excluir um cliente que ainda tem processos. */
    clienteId: integer('cliente_id')
      .notNull()
      .references(() => cliente.id, { onDelete: 'restrict' }),
    area: areaEnum('area').notNull(),
    vara: text('vara').notNull(),
    status: statusProcessoEnum('status').notNull().default('em_andamento'),
    responsavelId: integer('responsavel_id')
      .notNull()
      .references(() => usuario.id, { onDelete: 'restrict' }),
    abertoEm: date('aberto_em', { mode: 'string' }).notNull(),
    criadoPor: integer('criado_por').references(() => usuario.id, { onDelete: 'set null' }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('processo_cliente_idx').on(t.clienteId),
    index('processo_responsavel_idx').on(t.responsavelId),
    index('processo_status_idx').on(t.status),
  ],
);
