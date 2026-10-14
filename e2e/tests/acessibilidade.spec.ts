import { expect, test } from '@playwright/test';
import { aba, entrar, semViolacoesDeAcessibilidade, type Perfil } from './apoio';

const ABAS_COMUNS = ['Painel', 'Clientes', 'Processos', 'Prazos', 'Agenda', 'Tarefas'];
const ABAS_POR_PERFIL: Record<Perfil, string[]> = {
  admin: [...ABAS_COMUNS, 'Feriados', 'Minhas permissões', 'Auditoria'],
  advogado: [...ABAS_COMUNS, 'Minhas permissões'],
  assistente: [...ABAS_COMUNS, 'Minhas permissões'],
};

test('tela de login', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar' }).waitFor();
  await semViolacoesDeAcessibilidade(page, 'login');
});

for (const perfil of ['admin', 'advogado', 'assistente'] as const) {
  test(`axe: todas as telas de ${perfil}`, async ({ page }) => {
    await entrar(page, perfil);
    for (const nome of ABAS_POR_PERFIL[perfil]) {
      await aba(page, nome).click();
      await page.waitForLoadState('networkidle');
      await semViolacoesDeAcessibilidade(page, `${perfil} → ${nome}`);
    }
  });
}

test('axe: formulários abertos (cliente, processo, prazo, tarefa) e gráficos com a tabela aberta', async ({
  page,
}) => {
  await entrar(page, 'advogado');
  for (const [tela, botao] of [
    ['Clientes', 'Novo cliente'],
    ['Processos', 'Novo processo'],
    ['Prazos', 'Novo prazo'],
    ['Tarefas', 'Nova tarefa'],
  ] as const) {
    await aba(page, tela).click();
    await page.getByRole('button', { name: botao }).click();
    await page.waitForLoadState('networkidle');
    await semViolacoesDeAcessibilidade(page, `formulário: ${botao}`);
  }
  await aba(page, 'Painel').click();
  await page.waitForLoadState('networkidle');
  for (const resumo of await page.getByText('Ver dados do gráfico em tabela').all())
    await resumo.click();
  await semViolacoesDeAcessibilidade(page, 'painel com as tabelas dos gráficos abertas');
});

test('teclado: dá para focar uma barra do gráfico e ver o tooltip', async ({ page }) => {
  await entrar(page, 'advogado');
  await page.getByTestId('barra-em_andamento').focus();
  await page.getByRole('tooltip').waitFor();
});

test('o próprio detector funciona (controle negativo: acha imagem sem alt e contraste ruim)', async ({
  page,
}) => {
  await page.setContent(
    '<html lang="pt-BR"><body><main><img src="x.png"><p style="color:#777;background:#888">texto</p></main></body></html>',
  );
  await expect(semViolacoesDeAcessibilidade(page, 'controle')).rejects.toThrow(
    /image-alt|color-contrast/,
  );
});

test.describe('celular (375px)', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('todas as telas do advogado: sem rolagem horizontal e sem violações do axe', async ({
    page,
  }) => {
    await entrar(page, 'advogado');
    for (const nome of [...ABAS_POR_PERFIL.advogado]) {
      await aba(page, nome).click();
      await page.waitForLoadState('networkidle');
      const transborda = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(transborda, `rolagem horizontal em ${nome}`).toBe(false);
      await semViolacoesDeAcessibilidade(page, `celular → ${nome}`);
    }
  });
});
