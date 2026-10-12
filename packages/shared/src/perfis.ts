/**
 * Perfis e permissões. Funções puras, usadas pela API (para AUTORIZAR) e pela tela (para esconder
 * botões). Esconder botão não é segurança: a API sempre confere de novo (ver apps/api/src/auth).
 */
export const PERFIS = ['admin', 'advogado', 'assistente'] as const;
export type Perfil = (typeof PERFIS)[number];

export const ROTULO_PERFIL: Record<Perfil, string> = {
  admin: 'Sócio (admin)',
  advogado: 'Advogado',
  assistente: 'Assistente',
};

export const ACOES = [
  'cliente:ver',
  'cliente:criar',
  'cliente:editar',
  'cliente:excluir',
  'processo:ver',
  'processo:criar',
  'processo:editar',
  'processo:excluir',
  'prazo:ver',
  'prazo:criar',
  'prazo:editar',
  'prazo:cumprir',
  'tarefa:ver',
  'tarefa:criar',
  'tarefa:atribuir-outros',
  'dashboard:completo',
  'dashboard:basico',
  'usuario:gerenciar',
  'feriado:gerenciar',
  'auditoria:ver',
] as const;
export type Acao = (typeof ACOES)[number];

const TODOS: readonly Perfil[] = PERFIS;
const EQUIPE_JURIDICA: readonly Perfil[] = ['admin', 'advogado'];
const SO_ADMIN: readonly Perfil[] = ['admin'];

/** Matriz perfil × ação (docs: claude/escopo-crm-advocacia.md, seção 4). Cada "não" vira teste 403. */
export const PERMISSOES: Record<Acao, readonly Perfil[]> = {
  'cliente:ver': TODOS,
  'cliente:criar': TODOS,
  'cliente:editar': TODOS,
  'cliente:excluir': SO_ADMIN,
  'processo:ver': TODOS,
  'processo:criar': EQUIPE_JURIDICA,
  'processo:editar': EQUIPE_JURIDICA,
  'processo:excluir': SO_ADMIN,
  'prazo:ver': TODOS,
  'prazo:criar': TODOS, // assistente: só nos processos em que atua (regra de escopo na API de prazos)
  'prazo:editar': TODOS,
  'prazo:cumprir': EQUIPE_JURIDICA,
  'tarefa:ver': TODOS,
  'tarefa:criar': TODOS,
  'tarefa:atribuir-outros': EQUIPE_JURIDICA, // assistente cria tarefas só para si
  'dashboard:completo': EQUIPE_JURIDICA,
  'dashboard:basico': TODOS,
  'usuario:gerenciar': SO_ADMIN,
  'feriado:gerenciar': SO_ADMIN,
  'auditoria:ver': SO_ADMIN,
};

export function podeFazer(perfil: Perfil, acao: Acao): boolean {
  return PERMISSOES[acao].includes(perfil);
}

export function acoesDoPerfil(perfil: Perfil): Acao[] {
  return ACOES.filter((a) => podeFazer(perfil, a));
}
