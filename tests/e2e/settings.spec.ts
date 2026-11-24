import { expect, test } from '@playwright/test'

for (const locale of ['fr', 'en'] as const) {
  test(`Settings reports a writer failure and recovers on the next run (${locale})`, async ({ page, context, baseURL }, testInfo) => {
    const error = 'Model unavailable for this synthetic test'
    let writerError: string | undefined = error
    await page.route('**/api/digest', route => route.fulfill({
      json: { book: { slug: '2026-11-23', writerError }, sources: [] },
    }))
    await context.addCookies([{ name: 'folio_locale', value: locale, url: baseURL! }])
    await page.goto('/settings')
    const run = page.getByRole('button', { name: locale === 'fr' ? 'Collecter et publier maintenant' : 'Collect and publish now' })
    await run.click()
    const warning = page.locator('[data-slot="toast"][data-type="warning"]')
    await expect(warning).toContainText(error)
    await expect(warning).toContainText(locale === 'fr' ? 'texte compilé' : 'compiled text')
    await expect(run).toBeEnabled()
    await expect(page.locator('[data-slot="toast"][data-type="success"]')).toHaveCount(0)
    await testInfo.attach('writer-warning', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
    await page.waitForFunction(() => 'folioAgent' in window)
    const entries = await page.evaluate(() => (window as unknown as { folioAgent: { snapshot: () => { label?: string, component: string }[] } }).folioAgent.snapshot())
    expect(entries.some(entry => entry.label === (locale === 'fr' ? 'Collecter et publier maintenant' : 'Collect and publish now'))).toBe(true)
    writerError = undefined
    await run.click()
    await expect(page.locator('[data-slot="toast"][data-type="success"]')).toContainText(locale === 'fr' ? 'Livre du jour mis à jour' : 'Today’s book updated')
  })
}
