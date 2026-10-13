import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { PERFIS, PERMISSOES, gerarCnj, type Acao, type Perfil, type Prazo } from '@crm/shared';
import { schema, type Db } from '../src/db/client';
import { semearClientes, semearUsuarios } from '../src/db/seed';
import { ITERACOES_TESTE, criarAppDeTeste, csrf, entrar, limpar, prepararBanco } from './helpers';

let db: Db;
let close: () => Promise<void>;
// segunda-feira 12/10/2026, 12:00 em Brasília
let agora = new Date('2026-10-12T15:00:00Z');
const app = () => criarAppDeTeste(db, { agora: () => agora, sessaoDias: 90 });
const cookies = {} as Record<Perfil, string>;
let procAdvogado = 0; // responsável: advogado
let procAssistente = 0; // responsável: assistente
let idAdvogado = 0;
let idAssistente = 0;

beforeAll(async () => {
  ({ db, close } = await prepararBanco());
});
afterAll(async () => close());
beforeEach(async () => {
  agora = new Date('2026-10-12T15:00:00Z');
  await limpar(db);
  await semearUsuarios(db, ITERACOES_TESTE);
  await semearClientes(db);
  for (const p of PERFIS) cookies[p] = (await entrar(app(), `${p}@demo.crm`)).cookie;
  const us = await db.select().from(schema.usuario);
  idAdvogado = us.find((u) => u.perfil === 'advogado')!.id;
  idAssistente = us.find((u) => u.perfil === 'assistente')!.id;
  const clienteId = (await db.select().from(schema.cliente).orderBy(schema.cliente.id))[0]!.id;
  const mk = async (n: number, responsavelId: number) =>
    (
      await db
        .insert(schema.processo)
        .values({
          numeroCnj: gerarCnj({
            sequencial: String(n).padStart(7, '0'),
            ano: '2099',
            justica: '8',
            tribunal: '26',
            origem: '0100',
          }),
          clienteId,
          area: 'civel',
          vara: 'Vara Teste',
          responsavelId,
          abertoEm: '2099-01-01',
        })
        .returning()
    )[0]!.id;
  procAdvogado = await mk(1, idAdvogado);
  procAssistente = await mk(2, idAssistente);
  // feriados: 12/10/2026 (segunda) e 2027 inteiro de teste
  await db.insert(schema.feriado).values([
    { data: '2026-10-12', nome: 'Nossa Senhora Aparecida' },
    { data: '2026-11-02', nome: 'Finados' },
    { data: '2026-11-15', nome: 'Proclamação da República' },
    { data: '2026-12-25', nome: 'Natal' },
    { data: '2027-01-01', nome: 'Confraternização Universal' },
  ]);
});

const chamar = (perfil: Perfil, metodo: string, caminho: string, corpo?: unknown) =>
  app().request(caminho, {
    method: metodo,
    headers: { ...csrf, cookie: cookies[perfil] },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });

const calculado = (extra: object = {}) => ({
  processoId: procAdvogado,
  tipo: 'prazo',
  intimacaoEm: '2026-10-09', // sexta
  diasUteis: 5,
  responsavelId: idAdvogado,
  observacao: 'Contestação',
  ...extra,
});
const criar = async (perfil: Perfil = 'advogado', corpo: object = calculado()) => {
  const res = await chamar(perfil, 'POST', '/api/prazos', corpo);
  const json = (await res.json()) as { prazo?: Prazo; erro?: string };
  return { res, prazo: json.prazo as Prazo, erro: json.erro };
};
const auditoriaDe = async () =>
  (await db.select().from(schema.auditoria).orderBy(schema.auditoria.id)).filter(
    (a) => a.entidade === 'prazo',
  );

describe('POST /api/prazos/calcular', () => {
  it('conta em dias úteis pulando fim de semana e feriado, e explica o que pulou', async () => {
    const res = await chamar('assistente', 'POST', '/api/prazos/calcular', {
      intimacaoEm: '2026-10-09',
      diasUteis: 5,
    });
    expect(res.status).toBe(200);
    const r = (await res.json()) as {
      venceEm: string;
      pulados: { data: string; motivo: string }[];
      aviso: string | null;
    };
    // sex 09 (intimação) → sáb, dom, seg 12 feriado pulados; 13,14,15,16 = 4 dias; 19 = 5º
    expect(r.venceEm).toBe('2026-10-19');
    expect(r.pulados.map((p) => `${p.data}:${p.motivo}`)).toEqual([
      '2026-10-10:sabado',
      '2026-10-11:domingo',
      '2026-10-12:feriado',
      '2026-10-17:sabado',
      '2026-10-18:domingo',
    ]);
    expect(r.aviso).toBeNull();
  });

  it('cadastrar um feriado muda o resultado (a regra usa a tabela)', async () => {
    await chamar('admin', 'POST', '/api/feriados', {
      data: '2026-10-14',
      nome: 'Feriado de teste',
    });
    const r = (await (
      await chamar('admin', 'POST', '/api/prazos/calcular', {
        intimacaoEm: '2026-10-09',
        diasUteis: 5,
      })
    ).json()) as { venceEm: string };
    expect(r.venceEm).toBe('2026-10-20');
  });

  it('avisa quando o ano da contagem não tem feriados cadastrados', async () => {
    const r = (await (
      await chamar('admin', 'POST', '/api/prazos/calcular', {
        intimacaoEm: '2030-03-04',
        diasUteis: 3,
      })
    ).json()) as { aviso: string | null };
    expect(r.aviso).toContain('2030');
  });

  it('entradas inválidas → 400', async () => {
    for (const corpo of [
      { intimacaoEm: '2026-02-30', diasUteis: 3 },
      { intimacaoEm: '2026-10-09', diasUteis: 0 },
      { intimacaoEm: '2026-10-09', diasUteis: 999 },
      {},
    ])
      expect((await chamar('admin', 'POST', '/api/prazos/calcular', corpo)).status).toBe(400);
  });

  it('não grava nada', async () => {
    await chamar('admin', 'POST', '/api/prazos/calcular', {
      intimacaoEm: '2026-10-09',
      diasUteis: 5,
    });
    expect(await db.select().from(schema.prazo)).toHaveLength(0);
    expect(await auditoriaDe()).toHaveLength(0);
  });
});

describe('criar prazo', () => {
  it('prazo calculado: vence às 23:59 de Brasília no dia útil certo', async () => {
    const { res, prazo } = await criar();
    expect(res.status).toBe(201);
    expect(prazo).toMatchObject({
      venceData: '2026-10-19',
      venceHora: '23:59',
      status: 'pendente',
      vencido: false,
      intimacaoEm: '2026-10-09',
      diasUteis: 5,
      processoNumero: expect.any(String),
    });
    expect(prazo.venceEm).toBe('2026-10-20T02:59:59.000Z');
  });

  it('audiência/reunião: data e hora manuais em Brasília', async () => {
    const { res, prazo } = await criar('advogado', {
      processoId: procAdvogado,
      tipo: 'audiencia',
      venceLocal: '2026-10-20T14:30',
      responsavelId: idAdvogado,
    });
    expect(res.status).toBe(201);
    expect(prazo).toMatchObject({
      venceData: '2026-10-20',
      venceHora: '14:30',
      intimacaoEm: null,
      diasUteis: null,
    });
    expect(prazo.venceEm).toBe('2026-10-20T17:30:00.000Z');
  });

  it('o cliente NÃO consegue impor o vencimento de um prazo calculado', async () => {
    const { res, prazo } = await criar('advogado', {
      ...calculado(),
      venceEm: '2030-01-01T00:00:00Z',
    });
    expect(res.status).toBe(201);
    expect(prazo.venceData).toBe('2026-10-19');
    const { res: r2 } = await criar('advogado', { ...calculado(), venceLocal: '2030-01-01T10:00' });
    expect(r2.status).toBe(400);
  });

  it.each([
    ['sem data nenhuma', { intimacaoEm: undefined, diasUteis: undefined }],
    ['contagem em audiência', { tipo: 'audiencia' }],
    ['processo inexistente', { processoId: 999999 }],
    ['responsável inexistente', { responsavelId: 999999 }],
  ])('recusa %s', async (_n, parte) => {
    const { res } = await criar('advogado', { ...calculado(), ...parte });
    expect(res.status).toBe(400);
    expect(await db.select().from(schema.prazo)).toHaveLength(0);
  });

  it('422 se o ano do cálculo não tem feriados cadastrados (não grava prazo possivelmente errado)', async () => {
    const { res, erro } = await criar('advogado', calculado({ intimacaoEm: '2030-03-04' }));
    expect(res.status).toBe(422);
    expect(erro).toContain('2030');
    expect(await db.select().from(schema.prazo)).toHaveLength(0);
  });

  it('o banco recusa contagem incompleta (CHECK), mesmo fora da API', async () => {
    await expect(
      db.execute(
        sql`insert into prazo (processo_id, tipo, intimacao_em, vence_em, responsavel_id) values (${procAdvogado}, 'prazo', '2026-10-09', now(), ${idAdvogado})`,
      ),
    ).rejects.toThrow();
  });
});

describe('vencido, filtros e agenda', () => {
  it('"vencido" depende do relógio e só vale para pendentes', async () => {
    const { prazo } = await criar(); // vence 19/10 23:59
    const ver = async () =>
      ((await (await chamar('admin', 'GET', `/api/prazos/${prazo.id}`)).json()) as { prazo: Prazo })
        .prazo;
    expect((await ver()).vencido).toBe(false);
    agora = new Date('2026-10-19T20:00:00Z'); // 17h de 19/10: ainda no dia
    expect((await ver()).vencido).toBe(false);
    agora = new Date('2026-10-20T03:00:00Z'); // 00h de 20/10 em Brasília
    expect((await ver()).vencido).toBe(true);
    await chamar('advogado', 'PATCH', `/api/prazos/${prazo.id}/status`, { status: 'cumprido' });
    expect((await ver()).vencido).toBe(false);
  });

  it('filtra por vencidos, status, intervalo de datas (Brasília) e responsável', async () => {
    await criar(
      'advogado',
      calculado({ intimacaoEm: '2026-09-01', diasUteis: 3, observacao: 'antigo' }),
    ); // vencido
    await criar('advogado', calculado()); // 19/10
    await criar('advogado', {
      processoId: procAdvogado,
      tipo: 'reuniao',
      venceLocal: '2026-10-14T09:00',
      responsavelId: idAdvogado,
    });
    await criar('admin', {
      processoId: procAdvogado,
      tipo: 'reuniao',
      venceLocal: '2026-10-15T09:00',
      responsavelId: idAssistente,
    });
    const lista = async (qs: string) =>
      (await (await chamar('assistente', 'GET', `/api/prazos${qs}`)).json()) as {
        total: number;
        itens: Prazo[];
      };
    expect((await lista('?vencidos=true')).total).toBe(1);
    expect((await lista('?de=2026-10-12&ate=2026-10-16')).total).toBe(2);
    expect((await lista('?de=2026-10-19&ate=2026-10-19')).total).toBe(1); // 23:59 de Brasília ainda é dia 19
    expect((await lista(`?responsavelId=${idAssistente}`)).total).toBe(1);
    expect((await lista('?status=pendente&tipo=reuniao')).total).toBe(2);
    const ordem = (await lista('')).itens.map((p) => p.venceEm);
    expect(ordem).toEqual([...ordem].sort());
  });

  it('parâmetros inválidos → 400', async () => {
    for (const qs of ['?de=2026-13-01', '?vencidos=false', '?porPagina=500', '?status=x'])
      expect((await chamar('admin', 'GET', `/api/prazos${qs}`)).status).toBe(400);
  });
});

describe('editar e status', () => {
  it('editar recalcula o vencimento e audita só o que mudou', async () => {
    const { prazo } = await criar();
    const res = await chamar(
      'advogado',
      'PUT',
      `/api/prazos/${prazo.id}`,
      calculado({ diasUteis: 6 }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { prazo: Prazo }).prazo.venceData).toBe('2026-10-20');
    const a = await auditoriaDe();
    expect(a.map((x) => x.acao)).toEqual(['criar', 'editar']);
    expect(Object.keys(a[1]!.diff as object).sort()).toEqual(['diasUteis', 'venceEm']);
  });

  it('PUT sem mudança não audita; PUT não altera o status', async () => {
    const { prazo } = await criar();
    await chamar('advogado', 'PATCH', `/api/prazos/${prazo.id}/status`, { status: 'cumprido' });
    const antes = (await auditoriaDe()).length;
    const res = await chamar('advogado', 'PUT', `/api/prazos/${prazo.id}`, {
      ...calculado(),
      status: 'pendente', // campo ignorado: status só muda por PATCH /:id/status
    });
    expect(res.status).toBe(200);
    const lido = (
      (await (await chamar('admin', 'GET', `/api/prazos/${prazo.id}`)).json()) as { prazo: Prazo }
    ).prazo;
    expect(lido.status).toBe('cumprido');
    expect((await auditoriaDe()).length).toBe(antes);
  });

  it('PATCH status audita (de → para) e repetir o mesmo status não audita', async () => {
    const { prazo } = await criar();
    await chamar('advogado', 'PATCH', `/api/prazos/${prazo.id}/status`, { status: 'cumprido' });
    await chamar('advogado', 'PATCH', `/api/prazos/${prazo.id}/status`, { status: 'cumprido' });
    const a = await auditoriaDe();
    expect(a.map((x) => x.acao)).toEqual(['criar', 'editar']);
    expect(a[1]?.diff).toEqual({ status: { de: 'pendente', para: 'cumprido' } });
  });

  it('ids e status inválidos / inexistentes', async () => {
    expect(
      (await chamar('admin', 'PATCH', '/api/prazos/abc/status', { status: 'cumprido' })).status,
    ).toBe(400);
    expect((await chamar('admin', 'PATCH', '/api/prazos/1/status', { status: 'xx' })).status).toBe(
      400,
    );
    expect(
      (await chamar('admin', 'PATCH', '/api/prazos/9999/status', { status: 'cumprido' })).status,
    ).toBe(404);
    expect((await chamar('admin', 'PUT', '/api/prazos/9999', calculado())).status).toBe(404);
    expect((await chamar('admin', 'GET', '/api/prazos/9999')).status).toBe(404);
  });
});

describe('permissões (matriz × rotas)', () => {
  const rotas: { acao: Acao; chamada: (id: number) => [string, string, unknown?] }[] = [
    { acao: 'prazo:ver', chamada: () => ['GET', '/api/prazos'] },
    { acao: 'prazo:ver', chamada: () => ['GET', '/api/feriados'] },
    {
      acao: 'prazo:criar',
      chamada: () => ['POST', '/api/prazos/calcular', { intimacaoEm: '2026-10-09', diasUteis: 5 }],
    },
    {
      acao: 'prazo:cumprir',
      chamada: (id) => ['PATCH', `/api/prazos/${id}/status`, { status: 'cumprido' }],
    },
    {
      acao: 'feriado:gerenciar',
      chamada: () => ['POST', '/api/feriados', { data: '2026-12-24', nome: 'Véspera de Natal' }],
    },
    { acao: 'feriado:gerenciar', chamada: () => ['DELETE', '/api/feriados/2026-11-02'] },
  ];
  for (const perfil of PERFIS) {
    for (const r of rotas) {
      const permitido = PERMISSOES[r.acao].includes(perfil);
      it(`${perfil} ${permitido ? 'PODE' : 'NÃO pode'} ${r.chamada(1)[0]} ${r.chamada(1)[1].replace(/\/\d+\//, '/:id/')}`, async () => {
        const { prazo } = await criar('admin');
        const [metodo, caminho, corpo] = r.chamada(prazo.id);
        const res = await chamar(perfil, metodo, caminho, corpo);
        if (permitido) expect(res.status).toBeLessThan(300);
        else expect(res.status).toBe(403);
      });
    }
  }

  it('assistente recebe 403 ao marcar prazo como cumprido e o status não muda', async () => {
    const { prazo } = await criar('admin');
    expect(
      (
        await chamar('assistente', 'PATCH', `/api/prazos/${prazo.id}/status`, {
          status: 'cumprido',
        })
      ).status,
    ).toBe(403);
    expect(
      (await db.select().from(schema.prazo).where(eq(schema.prazo.id, prazo.id)))[0]?.status,
    ).toBe('pendente');
  });
});

describe('escopo do assistente (só processos em que atua)', () => {
  it('cria e edita prazo no processo em que é responsável', async () => {
    const { res, prazo } = await criar(
      'assistente',
      calculado({ processoId: procAssistente, responsavelId: idAssistente }),
    );
    expect(res.status).toBe(201);
    expect(
      (
        await chamar(
          'assistente',
          'PUT',
          `/api/prazos/${prazo.id}`,
          calculado({ processoId: procAssistente, responsavelId: idAssistente, diasUteis: 7 }),
        )
      ).status,
    ).toBe(200);
  });
  it('403 ao criar prazo em processo de outro responsável; nada é gravado', async () => {
    const { res } = await criar('assistente', calculado({ processoId: procAdvogado }));
    expect(res.status).toBe(403);
    expect(await db.select().from(schema.prazo)).toHaveLength(0);
  });
  it('403 ao editar prazo de outro processo ou ao mover o prazo para outro processo', async () => {
    const { prazo: doAdvogado } = await criar('advogado');
    expect(
      (
        await chamar(
          'assistente',
          'PUT',
          `/api/prazos/${doAdvogado.id}`,
          calculado({ diasUteis: 9 }),
        )
      ).status,
    ).toBe(403);
    const { prazo: doAssistente } = await criar(
      'admin',
      calculado({ processoId: procAssistente, responsavelId: idAssistente }),
    );
    expect(
      (
        await chamar(
          'assistente',
          'PUT',
          `/api/prazos/${doAssistente.id}`,
          calculado({ processoId: procAdvogado }),
        )
      ).status,
    ).toBe(403);
  });
  it('advogado e admin não têm essa restrição', async () => {
    expect((await criar('advogado', calculado({ processoId: procAssistente }))).res.status).toBe(
      201,
    );
    expect((await criar('admin', calculado({ processoId: procAssistente }))).res.status).toBe(201);
  });
});

describe('integridade', () => {
  it('processo com prazos não pode ser excluído (409)', async () => {
    await criar('admin');
    expect((await chamar('admin', 'DELETE', `/api/processos/${procAdvogado}`)).status).toBe(409);
    expect((await chamar('admin', 'GET', `/api/processos/${procAdvogado}`)).status).toBe(200);
  });
});

describe('feriados', () => {
  it('admin cadastra e remove; duplicado → 409; inválido → 400; inexistente → 404', async () => {
    expect(
      (
        await chamar('admin', 'POST', '/api/feriados', {
          data: '2026-12-24',
          nome: 'Véspera de Natal',
        })
      ).status,
    ).toBe(201);
    expect(
      (await chamar('admin', 'POST', '/api/feriados', { data: '2026-12-24', nome: 'Outra vez' }))
        .status,
    ).toBe(409);
    expect(
      (await chamar('admin', 'POST', '/api/feriados', { data: '2026-02-30', nome: 'Impossível' }))
        .status,
    ).toBe(400);
    expect((await chamar('admin', 'DELETE', '/api/feriados/2026-12-24')).status).toBe(200);
    expect((await chamar('admin', 'DELETE', '/api/feriados/2026-12-24')).status).toBe(404);
    expect((await chamar('admin', 'DELETE', '/api/feriados/lixo')).status).toBe(400);
  });
  it('lista em ordem de data e audita criar/excluir', async () => {
    await chamar('admin', 'POST', '/api/feriados', {
      data: '2026-06-04',
      nome: 'Corpus Christi (ponto facultativo)',
    });
    await chamar('admin', 'DELETE', '/api/feriados/2026-06-04');
    const lista = (
      (await (await chamar('assistente', 'GET', '/api/feriados')).json()) as {
        feriados: { data: string }[];
      }
    ).feriados.map((f) => f.data);
    expect(lista).toEqual([...lista].sort());
    const a = (await db.select().from(schema.auditoria).orderBy(schema.auditoria.id)).filter(
      (x) => x.entidade === 'feriado',
    );
    expect(a.map((x) => x.acao)).toEqual(['criar', 'excluir']);
    expect(a[0]?.entidadeId).toBe('2026-06-04');
  });
});
