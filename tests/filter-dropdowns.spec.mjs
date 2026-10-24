import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Keep catalogue responses deterministic and independent of external services.
  await page.route('https://api.finna.fi/**', (route) => route.fulfill({
    json: { status: 'OK', resultCount: 0, records: [] },
  }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Show filters', exact: true }).click()
})

for (const title of ['Language', 'Genre', 'Library']) {
  test(`${title} label taps select, deselect and reset options`, async ({ page }) => {
    const dropdown = page.locator('.mobile-filter-dropdown').filter({ has: page.locator(`summary[aria-label^="${title}: "]`) })
    await dropdown.locator('summary').tap()
    const labels = dropdown.locator('.filter-option')
    const first = labels.nth(1)
    const second = labels.nth(2)
    const firstLabel = await first.locator('span').innerText()
    await first.locator('span').tap()
    await expect(first.locator('input')).toBeChecked()
    await expect(dropdown).toHaveAttribute('open', '')
    await expect(dropdown.locator('summary')).toHaveAttribute('aria-label', `${title}: ${firstLabel}`)
    await second.locator('span').tap()
    await expect(first.locator('input')).toBeChecked()
    await expect(second.locator('input')).toBeChecked()
    await first.locator('span').tap()
    await expect(first.locator('input')).not.toBeChecked()
    await expect(second.locator('input')).toBeChecked()
    await labels.first().locator('span').tap()
    await expect(labels.first().locator('input')).toBeChecked()
    await expect(second.locator('input')).not.toBeChecked()
    await expect(dropdown.locator('summary')).toHaveAttribute('aria-label', `${title}: All`)
  })
}

test('dropdown dismisses on outside pointer, outside focus and Escape', async ({ page }) => {
  const dropdown = page.locator('.mobile-filter-dropdown').first()
  const summary = dropdown.locator('summary')
  await summary.click()
  await dropdown.getByRole('checkbox').nth(1).focus()
  await expect(dropdown).toHaveAttribute('open', '')
  await page.getByRole('button', { name: 'Show books', exact: true }).focus()
  await expect(dropdown).not.toHaveAttribute('open')
  await summary.click()
  await page.getByRole('heading', { name: 'Metso', exact: true }).click()
  await expect(dropdown).not.toHaveAttribute('open')
  await summary.click()
  await dropdown.getByRole('checkbox').nth(1).focus()
  await page.keyboard.press('Escape')
  await expect(dropdown).not.toHaveAttribute('open')
  await expect(summary).toBeFocused()
})
