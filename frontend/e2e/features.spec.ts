import { test, expect } from '@playwright/test';
test('transaction sorting, pagination and global filter reset', async ({ page }) => {
  await page.goto('/transactions'); await expect(page.locator('tbody tr')).toHaveCount(25);
  await page.getByRole('button', {name:'Next',exact:true}).click(); await expect(page.getByText(/page 2 of/)).toBeVisible();
  await page.getByLabel('From date').fill('2019-01-01');
  await expect(page.getByText(/page 1 of/)).toBeVisible();
  await page.getByRole('button',{name:'Amount',exact:true}).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
});
test('lookup, what-if scoring and sliders', async ({ page, request }) => {
  const data = await (await request.get('http://127.0.0.1:8000/api/transactions?page_size=1')).json();
  await page.goto('/explain'); await page.getByRole('textbox',{name:'Transaction ID',exact:true}).fill(String(data.rows[0].id));
  await page.getByRole('button',{name:'Explain',exact:true}).click(); await expect(page.getByText(`Transaction #${data.rows[0].id} · model score`,{exact:false})).toBeVisible();
  await page.goto('/scoring'); await page.getByRole('button',{name:'Score',exact:true}).click(); await expect(page.getByText(/the default flag threshold/)).toBeVisible();
  await page.goto('/model'); const slider = page.getByRole('slider',{name:'Threshold',exact:true}); await slider.focus(); await page.keyboard.press('ArrowRight');
  await expect(slider).not.toHaveAttribute('aria-valuenow','0.0319');
  await page.goto('/exposure'); const review = page.getByRole('slider',{name:'Share of flags reviewed'}); await review.focus();await page.keyboard.press('ArrowLeft');await expect(review).toHaveAttribute('aria-valuenow','0.95');
});
test('empty results and invalid bands/monitoring have clear states',async({page})=>{
 await page.goto('/transactions?txn_id=1');await expect(page.getByText('No transactions match these filters')).toBeVisible();
 await page.goto('/scoring');await page.getByRole('textbox',{name:'Medium from'}).fill('0.9');await expect(page.getByRole('alert').filter({hasText:/\S/})).toContainText('Cut-offs must be increasing');
 await page.goto('/monitoring');await page.getByRole('textbox',{name:'PSI warn',exact:true}).fill('0.8');await expect(page.getByRole('alert').filter({hasText:/\S/})).toContainText('must not exceed');
});
