import { expect, test } from '@playwright/test';
import { aba, entrar } from './apoio';

const HEADERS = { 'X-Requested-With': 'fetch' };

test.describe('o que cada perfil enxerga', () => {
  test('admin tem Feriados e Auditoria', async ({ page }) => {
    await entrar(page, 'admin');
    await expect(aba(page, 'Feriados')).toBeVisible();
    await expect(aba(page, 'Auditoria')).toBeVisible();
  });

  for (const perfil of ['advogado', 'assistente'] as const) {
    test(`${perfil} não tem Feriados nem Auditoria`, async ({ page }) => {
      await entrar(page, perfil);
      await expect(aba(page, 'Clientes')).toBeVisible();
      await expect(aba(page, 'Feriados')).toHaveCount(0);
      await expect(aba(page, 'Auditoria')).toHaveCount(0);
    });
  }
});

test('assistente: sem botão de excluir na tela E a API recusa (403)', async ({ page }) => {
  await entrar(page, 'assistente');
  await aba(page, 'Clientes').click();
  await expect(page.getByRole('row').nth(1)).toBeVisible(); // lista carregada
  await expect(page.getByRole('button', { name: /^Excluir/ })).toHaveCount(0);

  // mesmo sabendo o endereço, a API não deixa (a sessão do assistente vai junto nas requisições da página)
  const lista = await page.request.get('/api/clientes?porPagina=1');
  const id = (await lista.json()).itens[0].id as number;
  const del = await page.request.delete(`/api/clientes/${id}`, { headers: HEADERS });
  expect(del.status()).toBe(403);
  const processos = await page.request.get('/api/processos?porPagina=1');
  const pid = (await processos.json()).itens[0].id as number;
  expect((await page.request.delete(`/api/processos/${pid}`, { headers: HEADERS })).status()).toBe(
    403,
  );
  expect((await page.request.get('/api/auditoria')).status()).toBe(403);
});

test('assistente vê o painel básico (sem gráficos de processos)', async ({ page }) => {
  await entrar(page, 'assistente');
  await expect(page.getByRole('heading', { name: 'Tarefas abertas por pessoa' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Processos por status' })).toHaveCount(0);
  const r = await page.request.get('/api/dashboard');
  expect((await r.json()).processos).toBeNull();
});

test('advogado vê o painel completo', async ({ page }) => {
  await entrar(page, 'advogado');
  await expect(page.getByRole('heading', { name: 'Processos por status' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Processos por área' })).toBeVisible();
});

test('sem login a API responde 401 e a tela mostra o formulário de entrada', async ({
  page,
  request,
}) => {
  expect((await request.get('http://127.0.0.1:3100/api/clientes')).status()).toBe(401);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});

test('senha errada mostra erro sem entrar', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('E-mail').fill('advogado@demo.crm');
  await page.getByLabel('Senha').fill('senha-errada');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Painel' })).toHaveCount(0);
});

test('sair encerra a sessão', async ({ page }) => {
  await entrar(page, 'advogado');
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
});
