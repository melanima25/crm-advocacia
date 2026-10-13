import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Dashboard as Dados } from '@crm/shared';
import { Painel } from '../Dashboard';
import { GraficoBarras } from './GraficoBarras';
import { GraficoColunas } from './GraficoColunas';
import { GraficoEmpilhadas } from './GraficoEmpilhadas';

const barras = [
  { chave: 'a', rotulo: 'Em andamento', valor: 6 },
  { chave: 'b', rotulo: 'Arquivado', valor: 0 },
];

describe('GraficoBarras', () => {
  it('uma série só: sem legenda; cada barra é focável e tem rótulo falado', () => {
    const html = renderToStaticMarkup(
      <GraficoBarras titulo="Status" descricao="x" unidade="processos" itens={barras} />,
    );
    expect(html).not.toContain('aria-label="Legenda"');
    expect(html.match(/tabindex="0"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Em andamento: 6 processos"');
  });
  it('valor zero não desenha barra, mas aparece no gráfico e na tabela equivalente', () => {
    const html = renderToStaticMarkup(
      <GraficoBarras titulo="Status" descricao="x" unidade="processos" itens={barras} />,
    );
    expect(html.match(/<path /g)).toHaveLength(1);
    expect(html).toContain('<details');
    expect(html).toContain('<th scope="row" class="py-1 pr-4 font-normal">Arquivado</th>');
  });
  it('a cor da barra é a da série; o texto nunca usa a cor da série', () => {
    const html = renderToStaticMarkup(
      <GraficoBarras titulo="Status" descricao="x" unidade="processos" itens={barras} />,
    );
    expect(html).toContain('fill="var(--color-viz-1)"');
    expect(html).not.toMatch(/<text[^>]*fill="var\(--color-viz/);
  });
});

describe('GraficoColunas', () => {
  const itens = ['seg', 'ter', 'qua'].map((r, i) => ({
    chave: String(i),
    rotulo: r,
    detalhe: `1${i}/10`,
    valor: i === 1 ? 0 : 2,
  }));
  it('colunas finas (≤24px) só onde há valor; tabela traz todos os dias', () => {
    const html = renderToStaticMarkup(
      <GraficoColunas titulo="7 dias" descricao="x" unidade="prazos" itens={itens} />,
    );
    expect(html.match(/<path /g)).toHaveLength(2);
    expect(html.match(/<tr /g)).toHaveLength(4); // cabeçalho + 3 dias
    expect(html).toContain('ter 11/10');
  });
});

describe('GraficoEmpilhadas', () => {
  const itens = [
    { chave: '1', rotulo: 'Bruno', a: 3, b: 1 },
    { chave: '2', rotulo: 'Carla', a: 0, b: 2 },
  ];
  it('duas séries: legenda sempre presente com os dois nomes', () => {
    const html = renderToStaticMarkup(
      <GraficoEmpilhadas
        titulo="Tarefas"
        descricao="x"
        nomeA="A fazer"
        nomeB="Fazendo"
        itens={itens}
      />,
    );
    expect(html).toContain('aria-label="Legenda"');
    expect(html).toContain('A fazer');
    expect(html).toContain('Fazendo');
  });
  it('usa as duas cores validadas e a tabela traz o total', () => {
    const html = renderToStaticMarkup(
      <GraficoEmpilhadas
        titulo="Tarefas"
        descricao="x"
        nomeA="A fazer"
        nomeB="Fazendo"
        itens={itens}
      />,
    );
    expect(html).toContain('var(--color-viz-1)');
    expect(html).toContain('var(--color-viz-2)');
    expect(html).toContain('<td class="py-1 pl-2 text-right tabular-nums">4</td>');
  });
});

describe('Painel', () => {
  const base: Dados = {
    hoje: '2026-10-12',
    prazos: {
      vencidos: 2,
      hoje: 1,
      proximos7: 1,
      porDia: Array.from({ length: 7 }, (_, i) => ({
        data: `2026-10-${12 + i}`,
        total: i === 0 ? 1 : 0,
      })),
    },
    tarefas: {
      abertas: 3,
      vencidas: 1,
      porPessoa: [{ usuarioId: 1, nome: 'Bruno', aFazer: 2, fazendo: 1, vencidas: 1 }],
    },
    processos: null,
  };
  it('painel básico (processos nulos): sem gráficos de processos e com o aviso', () => {
    const html = renderToStaticMarkup(<Painel d={base} />);
    expect(html).not.toContain('Processos por status');
    expect(html).not.toContain('Processos por área');
    expect(html).toContain('painel básico');
    expect(html).toContain('Tarefas abertas por pessoa');
  });
  it('painel completo mostra os quatro gráficos e alerta com ícone + texto', () => {
    const completo: Dados = {
      ...base,
      processos: {
        total: 2,
        porStatus: [
          { status: 'em_andamento', total: 2 },
          { status: 'suspenso', total: 0 },
          { status: 'arquivado', total: 0 },
          { status: 'encerrado', total: 0 },
        ],
        porArea: [
          { area: 'civel', total: 2 },
          { area: 'familia', total: 0 },
          { area: 'trabalhista', total: 0 },
          { area: 'criminal', total: 0 },
          { area: 'tributario', total: 0 },
          { area: 'empresarial', total: 0 },
        ],
      },
    };
    const html = renderToStaticMarkup(<Painel d={completo} />);
    expect(html).toContain('Processos por status');
    expect(html).toContain('Processos por área');
    expect(html).toContain('Prazos pendentes nos próximos 7 dias');
    expect(html).toContain('⚠');
    expect(html).toContain('Prazos vencidos');
  });
});
