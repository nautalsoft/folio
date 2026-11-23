import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const day = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() + offset * 86_400_000))
const today = () => day()

test('the demo library opens on the book of the day', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Bibliothèque de démonstration')).toBeVisible()
  await expect(page.getByRole('link', { name: /Ouvrir|Continuer/ }).first()).toBeVisible()
  await page.goto('/library')
  await expect(page.getByRole('tab', { name: 'Recueils' })).toBeVisible()
  expect(await page.locator('img[alt^="Couverture"]').count()).toBeGreaterThan(5)
})

test('reading turns pages, cites sources and remembers the place', async ({ page, isMobile }) => {
  // Each project reads its own book: the server and its reading state are shared between projects.
  await page.goto(`/read/${day(isMobile ? -2 : -1)}`)
  const footer = page.locator('footer')
  await page.locator('article[data-ready]').waitFor()
  await expect(footer).toContainText('Page 1 sur')
  const fits = await page.evaluate(() => document.querySelector('.reader-viewport')!.getBoundingClientRect().bottom <= innerHeight)
  expect(fits, 'the paged viewport stays within the screen, so long chapters flow onto more pages').toBe(true)
  if (isMobile) await page.getByRole('button', { name: 'Page suivante' }).click()
  else await page.keyboard.press('ArrowRight')
  await expect(footer).toContainText('Page 2 sur')
  await expect(page.locator('a.cite').first()).toHaveAttribute('href', /.+/)
  await page.waitForTimeout(1500)
  await page.reload()
  await page.locator('article[data-ready]').waitFor()
  await expect(footer).toContainText('Page 2 sur')
})

test('themes apply to the reader and stay distinct from dark mode', async ({ page }) => {
  await page.goto(`/read/${today()}`)
  await page.getByRole('button', { name: 'Thèmes et réglages' }).click()
  await page.getByRole('radio', { name: /Nuit/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-reader-theme', 'night')
  await page.getByRole('radio', { name: /Défilement/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-reader-mode', 'scroll')
  await page.getByRole('button', { name: 'Réinitialiser' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-reader-theme', 'original')
})

test('a browser agent can read and drive the reader settings', async ({ page }) => {
  await page.goto(`/read/${today()}`)
  await page.waitForFunction(() => 'folioAgent' in window)
  const labels = await page.evaluate(() => (window as unknown as { folioAgent: { snapshot: () => { label?: string, offPage?: boolean, component: string }[] } }).folioAgent.snapshot().filter(e => !e.offPage && e.component !== 'more').map(e => e.label))
  expect(labels.every(Boolean)).toBe(true)
  expect(labels).toContain('Table des matières')
  await page.evaluate(() => localStorage.setItem('folio-webmcp', 'marked'))
  await page.reload()
  await page.waitForFunction(() => 'folioAgent' in window)
  await page.getByRole('button', { name: 'Thèmes et réglages' }).click()
  const result = await page.evaluate(() => (window as unknown as { folioAgent: { act: (a: unknown) => Promise<{ ok: boolean, error?: { message: string } }> } }).folioAgent.act({ steps: [{ ref: 'Thème', action: 'setValue', args: ['Sépia'] }] }))
  expect(result.ok, result.error?.message).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-reader-theme', 'sepia')
})

test('releasing a claim can be undone', async ({ page, isMobile }) => {
  await page.goto('/work')
  await page.waitForFunction(() => 'folioAgent' in window)
  const card = page.locator('li', { hasText: isMobile ? 'Synonymes dans la recherche' : 'Valider le correctif tablette' })
  await card.getByRole('button', { name: 'Libérer la tâche' }).click()
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(card.getByRole('button', { name: 'Libérer la tâche' })).toBeVisible()
})

for (const path of ['/', '/library', '/needs', '/work', '/live', '/settings']) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}

test(`no serious accessibility violations in the reader`, async ({ page }) => {
  await page.goto(`/read/${today()}`)
  await page.waitForLoadState('networkidle')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
})
