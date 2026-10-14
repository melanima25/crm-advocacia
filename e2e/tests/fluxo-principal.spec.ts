import { expect, test } from '@playwright/test';
import { aba, cnjFicticio, entrar } from './apoio';

test.setTimeout(90_000);

test('advogado: cliente → processo → prazo com vencimento calculado → tarefa aparece no painel', async ({
  page,
}) => {
  const nomeCliente = `Cliente E2E ${Date.now()}`;
  const cnj = cnjFicticio(Math.floor(Date.now() / 1000) % 10_000_000);
  await entrar(page, 'advogado');

  // 1) cliente
  await aba(page, 'Clientes').click();
  await page.getByRole('button', { name: 'Novo cliente' }).click();
  await page.getByLabel('Nome').fill(nomeCliente);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(nomeCliente)).toBeVisible();

  // 2) processo do cliente, com número CNJ válido
  await aba(page, 'Processos').click();
  await page.getByRole('button', { name: 'Novo processo' }).click();
  await page.getByLabel('Número CNJ').fill(cnj);
  await page.getByLabel('Cliente').selectOption({ label: nomeCliente });
  await page.getByLabel('Responsável').selectOption({ label: 'Bruno Advogado' });
  await page.getByLabel('Vara').fill('1ª Vara Cível (e2e)');
  await page.getByLabel('Data de abertura').fill('2099-01-10');
  await page.getByRole('button', { name: 'Salvar' }).click();
  // a lista é paginada (10 por página): procura pelo número para achar o processo novo
  await page
    .getByRole('searchbox')
    .or(page.getByPlaceholder(/Número, cliente ou vara/))
    .fill(cnj);
  await expect(page.getByRole('row').filter({ hasText: cnj })).toBeVisible();

  // (Vale enquanto o seed cobrir 2027: ele cadastra os feriados de ano−1 a ano+1, ou seja, até 2028.)
  // 3) prazo: intimação segunda 22/03/2027 + 5 dias úteis. Dias não contados: sex 26/03 (Sexta-feira
  //    Santa, feriado), sáb 27 e dom 28 → vence terça 30/03/2027.
  await aba(page, 'Prazos').click();
  await page.getByRole('button', { name: 'Novo prazo' }).click();
  await page.getByLabel('Processo').selectOption({ label: `${cnj} — ${nomeCliente}` });
  await page.getByLabel('Responsável').selectOption({ label: 'Bruno Advogado' });
  await page.getByLabel('Data da intimação').fill('2027-03-22');
  await page.getByLabel('Dias úteis', { exact: true }).fill('5');
  const previa = page.locator('[aria-live="polite"]').filter({ hasText: 'Vence em' });
  await expect(previa).toContainText('30/03/2027');
  await expect(previa).toContainText('26/03/2027 (feriado)');
  await page.getByRole('button', { name: 'Salvar' }).click();
  // vence em 2027, então fica na última página da lista (ordenada por vencimento)
  await page.getByRole('button', { name: 'Próxima' }).click();
  await expect(page.getByRole('row').filter({ hasText: cnj })).toContainText('30/03/2027');

  // 4) tarefa: o indicador "Tarefas abertas" do painel sobe em 1
  await aba(page, 'Painel').click();
  const abertas = page.getByTestId('indicador-tarefas-abertas').getByTestId('valor');
  await expect(abertas).toHaveText(/\d+/);
  const antes = Number((await abertas.innerText()).replace(/\D/g, ''));
  await aba(page, 'Tarefas').click();
  await page.getByRole('button', { name: 'Nova tarefa' }).click();
  await page.getByLabel('Título').fill('Conferir andamento (e2e)');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Conferir andamento (e2e)')).toBeVisible();
  await aba(page, 'Painel').click();
  await expect(abertas).toHaveText(String(antes + 1));
});
