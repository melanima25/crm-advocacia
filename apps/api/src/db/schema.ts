import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { PERFIS } from '@crm/shared';

export const perfilEnum = pgEnum('perfil', PERFIS);

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
