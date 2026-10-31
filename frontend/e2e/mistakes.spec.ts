import { test, expect, type Page } from '@playwright/test';
import { makeMistakes } from '../tests/mistake-fixture.mjs';

async function fixture(page: Page) {
  const state = makeMistakes();
  const requests: string[] = [];
  await page.route('**/api/v1/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.replace('/api/v1', '');
    requests.push(endpoint);
    let data: unknown;
    if (endpoint === '/me') data = { id: state.user_id, name: '自编演示用户', role: 'user' };
    else if (endpoint === '/mistakes') data = state.questions.map(question => ({ question, ...state.stats[question.id] }));
    else if (endpoint.startsWith('/mistakes/') && endpoint.endsWith('/review')) data = state.records[decodeURIComponent(endpoint.split('/')[2])];
    else if (endpoint === '/simple/catalog') data = { version: 'demo', questions: state.questions };
    else if (endpoint === '/simple/state') data = state;
    else throw Error('Unexpected fixture API: ' + endpoint);
    await route.fulfill({ json: data });
  });
  return { state, requests };
}

for (const [width, size] of [[1440, 12], [390, 5]]) {
  test(`主站错题分页与解析映射 ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width, height: 844 });
    const { requests } = await fixture(page); await page.goto('/mistakes');
    await expect(page.locator('.mistake-row')).toHaveCount(size);
    expect(requests.some(url => url.endsWith('/review'))).toBe(false);
    const top = page.getByRole('navigation', { name: '错题本上方分页' });
    await expect(top.getByRole('button', { name: '上一页' })).toBeDisabled();
    await page.locator('.mistake-row > summary').first().click();
    await expect(page.locator('.review-body .tag').first()).toContainText('正确答案：C');
    await expect(page.locator('.review-body').first()).toContainText('选项C正确，A选项错误。公式C=2。');
    await expect(page.locator('.review-options .is-answer').first()).toContainText('自编内容 A');
    await page.locator('.source-reference > summary').first().click();
    await expect(page.locator('.source-reference').first()).toContainText('选项A正确，B选项错误。公式C=2。');
    await top.getByRole('button', { name: '下一页' }).click();
    await expect(page.locator('.review-number').first()).toHaveText(String(size + 1).padStart(2, '0'));
    await top.getByRole('combobox').selectOption(String(Math.ceil(27 / size) - 1));
    await expect(page.locator('.mistake-row')).toHaveCount(27 % size || size);
    await expect(top.getByRole('button', { name: '下一页' })).toBeDisabled();
    await page.locator('.filter-select select').selectOption('金融');
    await expect(page.locator('.review-number').first()).toHaveText('01');
    await expect(page.locator('.mistake-row')).toHaveCount(Math.min(13, size));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });

  test(`极简版分页、跨站映射与旧内容回看 ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width, height: 844 });
    await fixture(page); await page.goto('/simple/'); await page.locator('[data-mode="wrong"]').click();
    await expect(page.locator('#wrongList .qitem')).toHaveCount(size);
    await expect(page.locator('#wrongList .ansline').first()).toContainText('正确答案：A');
    await expect(page.locator('#wrongList .rev-analysis').first()).toContainText('选项A正确，B选项错误。公式C=2。');
    const top = page.getByRole('navigation', { name: '错题本上方分页' });
    await top.getByRole('button', { name: '下一页' }).click();
    await expect(page.locator('#wrongList .qitem').first()).toContainText(`第 ${size + 1} 题`);
    await top.getByRole('combobox').selectOption(String((Math.ceil(27 / size) - 1) * size));
    await expect(page.locator('#wrongList .qitem')).toHaveCount(27 % size || size);
    await expect(top.getByRole('button', { name: '下一页' })).toBeDisabled();
    const last = page.locator('#wrongList .qitem').last();
    await expect(last).toContainText('自编题目 27');
    await expect(last).not.toContainText('修订后的内容');
    await expect(last.locator('.ansline')).toContainText('正确答案：C');
    await expect(last.locator('.rev-analysis')).toContainText('选项C正确，A选项错误。公式C=2。');
    await page.locator('#wrongClearBtn').click(); await expect(page.locator('#wrongList .qitem')).toHaveCount(0);
    await expect(top).toHaveCount(0);
    await page.locator('#wrongClearBtn').click(); await expect(page.locator('#wrongList .qitem').first()).toContainText('第 1 题');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  });
}

test('调整宽度后当前条目仍在分页范围中', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 1440, height: 900 });
  await fixture(page); await page.goto('/mistakes');
  const top = page.getByRole('navigation', { name: '错题本上方分页' });
  await top.getByRole('button', { name: '下一页' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.mistake-row')).toHaveCount(5);
  await expect(top).toContainText('11–15 / 27');
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.mistake-row')).toHaveCount(12);
  await expect(top).toContainText('13–24 / 27');
});
