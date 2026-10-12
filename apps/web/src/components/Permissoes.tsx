import { ACOES, ROTULO_PERFIL, type Acao, type Perfil } from '@crm/shared';

export function Permissoes({
  perfil,
  total,
  permitidas,
}: {
  perfil: Perfil;
  total: number;
  permitidas: readonly Acao[];
}) {
  const set = new Set(permitidas);
  return (
    <section aria-labelledby="titulo-perm">
      <h2 id="titulo-perm" className="text-lg font-medium">
        Permissões do perfil {ROTULO_PERFIL[perfil]}
      </h2>
      <p className="mb-3 text-sm text-suave">
        {permitidas.length} de {total} ações liberadas. O servidor valida cada ação; esta tela só
        mostra o resultado.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {ACOES.map((a) => (
          <li
            key={a}
            className="flex items-center justify-between rounded border border-borda bg-surface px-3 py-2 text-sm"
          >
            <code>{a}</code>
            <span className={set.has(a) ? 'text-ouro' : 'text-suave'}>
              {set.has(a) ? '✓ permitido' : '— negado'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
