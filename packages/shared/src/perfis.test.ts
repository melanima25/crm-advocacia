import { describe, expect, it } from 'vitest';
import { ACOES, PERFIS, acoesDoPerfil, podeFazer, type Acao, type Perfil } from './perfis';

/** Tabela escrita À MÃO a partir do escopo (seção 4): se alguém mexer na matriz, este teste acusa. */
const ESPERADO: Record<Acao, Perfil[]> = {
  'cliente:ver': ['admin', 'advogado', 'assistente'],
  'cliente:criar': ['admin', 'advogado', 'assistente'],
  'cliente:editar': ['admin', 'advogado', 'assistente'],
  'cliente:excluir': ['admin'],
  'processo:ver': ['admin', 'advogado', 'assistente'],
  'processo:criar': ['admin', 'advogado'],
  'processo:editar': ['admin', 'advogado'],
  'processo:excluir': ['admin'],
  'prazo:ver': ['admin', 'advogado', 'assistente'],
  'prazo:criar': ['admin', 'advogado', 'assistente'],
  'prazo:editar': ['admin', 'advogado', 'assistente'],
  'prazo:cumprir': ['admin', 'advogado'],
  'tarefa:ver': ['admin', 'advogado', 'assistente'],
  'tarefa:criar': ['admin', 'advogado', 'assistente'],
  'tarefa:atribuir-outros': ['admin', 'advogado'],
  'dashboard:completo': ['admin', 'advogado'],
  'dashboard:basico': ['admin', 'advogado', 'assistente'],
  'usuario:gerenciar': ['admin'],
  'feriado:gerenciar': ['admin'],
  'auditoria:ver': ['admin'],
};

describe('matriz de permissões', () => {
  it('cobre todas as ações', () => {
    expect(Object.keys(ESPERADO).sort()).toEqual([...ACOES].sort());
  });

  for (const acao of ACOES) {
    for (const perfil of PERFIS) {
      const permitido = ESPERADO[acao].includes(perfil);
      it(`${perfil} ${permitido ? 'PODE' : 'NÃO pode'} ${acao}`, () => {
        expect(podeFazer(perfil, acao)).toBe(permitido);
      });
    }
  }

  it('admin pode tudo; assistente nunca exclui nem vê auditoria', () => {
    expect(acoesDoPerfil('admin')).toHaveLength(ACOES.length);
    const assistente = acoesDoPerfil('assistente');
    expect(assistente.some((a) => a.endsWith(':excluir'))).toBe(false);
    expect(assistente).not.toContain('auditoria:ver');
  });
});
