import { z } from 'zod';
import { PERFIS } from './perfis';

export const PerfilSchema = z.enum(PERFIS);

export const LoginBodySchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(200),
  senha: z.string().min(1, 'Informe a senha').max(200),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const UsuarioPublicoSchema = z.object({
  id: z.number().int().positive(),
  nome: z.string(),
  email: z.string(),
  perfil: PerfilSchema,
  ativo: z.boolean(),
});
export type UsuarioPublico = z.infer<typeof UsuarioPublicoSchema>;

export const MeResponseSchema = z.object({ usuario: UsuarioPublicoSchema });
export const UsuariosResponseSchema = z.object({ usuarios: z.array(UsuarioPublicoSchema) });

export const AtivoBodySchema = z.object({ ativo: z.boolean() });

export const AuditoriaQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
  entidade: z.string().min(1).max(40).optional(),
});

export const AuditoriaItemSchema = z.object({
  id: z.number().int(),
  usuarioId: z.number().int().nullable(),
  usuarioNome: z.string().nullable(),
  entidade: z.string(),
  entidadeId: z.string().nullable(),
  acao: z.string(),
  diff: z.unknown(),
  criadoEm: z.string(),
});
export const AuditoriaResponseSchema = z.object({
  pagina: z.number().int(),
  porPagina: z.number().int(),
  total: z.number().int(),
  itens: z.array(AuditoriaItemSchema),
});
export type AuditoriaResponse = z.infer<typeof AuditoriaResponseSchema>;

export const ErroSchema = z.object({ erro: z.string() });
