import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const PERFIS = ['admin', 'advogado', 'assistente'] as const;
export type Perfil = (typeof PERFIS)[number];

export async function entrar(page: Page, perfil: Perfil) {
  await page.goto('/');
  await page.getByLabel('E-mail').fill(`${perfil}@demo.crm`);
  await page.getByLabel('Senha').fill('demo1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible();
}

export const aba = (page: Page, nome: string) =>
  page.getByRole('navigation', { name: 'Seções' }).getByRole('button', { name: nome, exact: true });

/**
 * Número CNJ válido, calculado aqui de forma independente da implementação do app:
 * DV = 98 − ((NNNNNNN AAAA J TR OOOO 00) mod 97) (Res. CNJ 65/2008). Ano 2099 = número fictício.
 */
export function cnjFicticio(sequencial: number): string {
  const seq = String(sequencial).padStart(7, '0');
  const corpo = `${seq}2099826` + '0100';
  const dv = String(98 - Number(BigInt(`${corpo}00`) % 97n)).padStart(2, '0');
  return `${seq}-${dv}.2099.8.26.0100`;
}

/** Roda o axe (WCAG 2.0/2.1 A e AA). Qualquer violação reprova; a mensagem lista o que e onde. */
export async function semViolacoesDeAcessibilidade(page: Page, contexto: string) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const resumo = r.violations.map(
    (v) =>
      `[${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join('\n    ')}`,
  );
  expect(resumo, `Violações de acessibilidade em ${contexto}`).toEqual([]);
}
