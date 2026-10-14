import { useQuery } from '@tanstack/react-query';
import {
  DashboardSchema,
  ROTULO_AREA,
  ROTULO_STATUS_PROCESSO,
  type Dashboard as Dados,
} from '@crm/shared';
import { chamar } from '../api';
import { nomeDia } from '../datas';
import { GraficoBarras } from './graficos/GraficoBarras';
import { GraficoColunas } from './graficos/GraficoColunas';
import { GraficoEmpilhadas } from './graficos/GraficoEmpilhadas';

/** Número de destaque: valor grande + texto. Alerta usa ícone e texto (nunca só cor). */
function Indicador({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div
      className="rounded-lg border border-borda bg-surface p-4"
      data-testid={`indicador-${rotulo
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\s+/g, '-')}`}
    >
      <p className="text-sm text-suave">{rotulo}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums" data-testid="valor">
        {alerta && valor > 0 && (
          <span aria-hidden="true" className="mr-1 text-2xl">
            ⚠
          </span>
        )}
        {valor}
      </p>
    </div>
  );
}

export function Dashboard() {
  const q = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => chamar('/api/dashboard', DashboardSchema),
  });
  if (q.isPending) return <p className="text-suave">Carregando…</p>;
  if (q.error)
    return (
      <p role="alert" className="text-red-300">
        {q.error.message}
      </p>
    );
  return <Painel d={q.data} />;
}

export function Painel({ d }: { d: Dados }) {
  return (
    <section aria-labelledby="titulo-dashboard">
      <h2 id="titulo-dashboard" className="mb-3 text-lg font-medium">
        Painel
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador rotulo="Prazos vencidos" valor={d.prazos.vencidos} alerta />
        <Indicador rotulo="Prazos que vencem hoje" valor={d.prazos.hoje} />
        <Indicador rotulo="Tarefas abertas" valor={d.tarefas.abertas} />
        <Indicador rotulo="Tarefas atrasadas" valor={d.tarefas.vencidas} alerta />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {d.processos && (
          <>
            <GraficoBarras
              titulo="Processos por status"
              descricao={`${d.processos.total} processos no total`}
              unidade="processos"
              itens={d.processos.porStatus.map((s) => ({
                chave: s.status,
                rotulo: ROTULO_STATUS_PROCESSO[s.status],
                valor: s.total,
              }))}
            />
            <GraficoBarras
              titulo="Processos por área"
              descricao="Da maior para a menor área de atuação"
              unidade="processos"
              itens={[...d.processos.porArea]
                .sort(
                  (a, b) =>
                    b.total - a.total ||
                    ROTULO_AREA[a.area].localeCompare(ROTULO_AREA[b.area], 'pt-BR'),
                )
                .map((a) => ({ chave: a.area, rotulo: ROTULO_AREA[a.area], valor: a.total }))}
            />
          </>
        )}
        <div className="lg:col-span-2">
          <GraficoColunas
            titulo="Prazos pendentes nos próximos 7 dias"
            descricao="De hoje até daqui a 6 dias; compromissos pendentes por dia de vencimento"
            unidade="prazos"
            itens={d.prazos.porDia.map((x, i) => ({
              chave: x.data,
              rotulo: i === 0 ? 'hoje' : nomeDia(x.data).slice(0, 3).toLowerCase(),
              detalhe: x.data.slice(8) + '/' + x.data.slice(5, 7),
              valor: x.total,
            }))}
          />
        </div>
        <div className="lg:col-span-2">
          <GraficoEmpilhadas
            titulo="Tarefas abertas por pessoa"
            descricao="Tarefas que ainda não foram concluídas"
            nomeA="A fazer"
            nomeB="Fazendo"
            itens={d.tarefas.porPessoa.map((p) => ({
              chave: String(p.usuarioId),
              rotulo: p.nome,
              a: p.aFazer,
              b: p.fazendo,
              extra:
                p.vencidas > 0 ? `⚠ ${p.vencidas} atrasada${p.vencidas > 1 ? 's' : ''}` : undefined,
            }))}
          />
        </div>
      </div>
      {!d.processos && (
        <p className="mt-4 text-sm text-suave">
          Seu perfil vê o painel básico (prazos e tarefas). Os indicadores de processos são
          exclusivos da equipe jurídica.
        </p>
      )}
    </section>
  );
}
