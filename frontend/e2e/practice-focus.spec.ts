import { test, expect, type Page } from '@playwright/test';

async function fixture(page: Page, config: { long?: boolean; fail?: boolean } = {}) {
  const rows = [true, false].map((multiple, index) => ({
    id: 'focus-demo-' + index, bank: '真题速攻-经济基础', multiple,
    stem: '【自编演示】请选择符合题意的选项。' + (config.long ? '演示长题干应可自然滚动阅读。'.repeat(60) : ''),
    options: ['A', 'B', 'C', 'D', ...(config.long ? ['E'] : [])].map(id => ({ id, label: id,
      text: '自编选项 ' + id + (config.long ? '选项完整文字不应被截断。'.repeat(12) : '') })),
    material: config.long ? '自编案例材料，展开题目后可回看。' : undefined,
    images: config.long ? ['data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="220"><rect width="600" height="220" fill="#c2f4d4"/></svg>')] : [],
  }));
  const records: Record<number, any> = {};
  const state = { index: 0, requests: 0, fail: !!config.fail };
  await page.route('**/api/v1/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const body = route.request().postDataJSON(); let data: any = {};
    if (endpoint === '/me') data = { id: 'focus-user', name: '演示用户', role: 'user' };
    else if (endpoint === '/stats') data = {};
    else if (endpoint === '/practice-sessions/focus') data = { id: 'focus', index: state.index, total: 2,
      elapsed: 50, mode: 'mixed', question: rows[state.index] || null, result: records[state.index] || null, results: Object.values(records) };
    else if (endpoint.endsWith('/answers')) {
      state.requests++;
      if (state.fail) { state.fail = false; return route.fulfill({ status: 503, json: { detail: '自编提交失败，请重试' } }); }
      const answer = state.index ? ['A'] : ['A', 'C'];
      data = records[body.index] ||= { question: rows[state.index], selected: body.options, answer,
        correct: [...body.options].sort().join('') === answer.join(''),
        explanation: '自编解析：每次练习保留独立记录。\n' + (config.long ? '解析应完整展示，字号不随篇幅变化。'.repeat(180) : '读完这一点，再继续下一题。') };
    } else if (endpoint.endsWith('/next')) { if (state.index === body.index) state.index++; data = { ok: true }; }
    await route.fulfill({ json: data });
  });
  return state;
}

for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 568]]) {
  test(`固定操作区与两阶段布局 ${width}×${height}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width, height });
    await fixture(page); await page.goto('/practice/focus');
    const check = page.getByRole('button', { name: '检查', exact: true });
    await expect(check).toBeDisabled();
    expect(await page.locator('.practice-actions-fixed').evaluate(el => el.parentElement === document.body)).toBeTruthy();
    const before = (await check.boundingBox())!;
    await page.locator('.option').nth(0).click(); await page.locator('.option').nth(2).click(); await check.click();
    const next = page.getByRole('button', { name: '继续 →', exact: true }); await expect(next).toBeEnabled();
    await expect(page.locator('.practice-focus')).toHaveAttribute('data-stage', 'feedback');
    const after = (await next.boundingBox())!;
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(before[key] - after[key])).toBeLessThanOrEqual(1);
    await expect(page.locator('.question-detail-shell')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByRole('button', { name: '收起完整题目', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '展开完整题目', exact: true })).toHaveCount(0);
    await expect(page.locator('.answer-recap')).toHaveCount(0);
    const left = (await page.locator('.question-panel').boundingBox())!, right = (await page.locator('.feedback-reading').boundingBox())!;
    if (width >= 1024) expect(right.x).toBeGreaterThanOrEqual(left.x + left.width + 26);
    else expect(right.y).toBeGreaterThanOrEqual(left.y + left.height);
    await page.getByRole('button', { name: '收起完整题目' }).click();
    await expect(page.locator('.question-detail-shell')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.review-option-list .option')).toHaveCount(2);
    await expect(page.locator('.review-option-list .choice')).toHaveText(['A', 'C']);
    await expect(page.locator('.review-option-list .correct')).toHaveCount(2);
    await expect(page.locator('.review-option-list .incorrect')).toHaveCount(0);
    const one = (await page.locator('.review-option-list .option').nth(0).boundingBox())!, two = (await page.locator('.review-option-list .option').nth(1).boundingBox())!;
    if (width <= 760) { expect(Math.abs(one.y - two.y)).toBeLessThanOrEqual(1); expect(two.x).toBeGreaterThan(one.x); }
    else { expect(two.y).toBeGreaterThan(one.y); expect(Math.abs(one.x - two.x)).toBeLessThanOrEqual(1); }
    await page.getByRole('button', { name: '展开完整题目' }).click();
    await expect(page.locator('.question-detail-shell')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('.option')).toHaveCount(4);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    expect(Math.abs((await next.boundingBox())!.y - before.y)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await next.click(); await expect(page.locator('.practice-focus')).toHaveAttribute('data-stage', 'answering');
    await expect(page.locator('.option[aria-pressed="true"]')).toHaveCount(0); await expect(check).toBeDisabled();
  });
}

test('长题、长解析和材料完整可达，字号稳定，反馈标题定位可见', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, { long: true }); await page.goto('/practice/focus');
  await expect(page.locator('.question h2')).toHaveCSS('font-size', '18px');
  await expect(page.locator('.option').first()).toHaveCSS('font-size', '16px');
  await page.locator('.option').nth(0).click(); await page.locator('.option').nth(2).click();
  await page.getByRole('button', { name: '检查', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续 →', exact: true })).toBeEnabled();
  expect(await page.locator('.feedback-reading').evaluate(el => el === document.activeElement)).toBeTruthy();
  const title = (await page.locator('.feedback-title').boundingBox())!, rail = (await page.locator('.practice-actions-fixed').boundingBox())!;
  expect(title.y).toBeGreaterThanOrEqual(0); expect(title.y + title.height).toBeLessThan(rail.y);
  await expect(page.locator('.explanation > p')).toHaveCSS('font-size', '15px');
  expect((await page.locator('.explanation > p').textContent())!.length).toBeGreaterThan(2000);
  await expect(page.getByRole('button', { name: '收起完整题目' })).toBeVisible();
  await expect(page.locator('.material-image')).toBeVisible();
  await expect(page.locator('.question h2')).toHaveCSS('font-size', '14px');
  await expect(page.locator('.option')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('收起后的多选回看保留错选、漏选和已答对选项，展开及刷新不改变答案', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page); await page.goto('/practice/focus');
  await page.locator('.option').nth(0).click(); await page.locator('.option').nth(1).click();
  await page.getByRole('button', { name: '检查', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续 →', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '收起完整题目' }).click();
  await expect(page.locator('.review-option-list .choice')).toHaveText(['A', 'B', 'C']);
  await expect(page.locator('.review-option-list .selected.correct .choice')).toHaveText('A');
  await expect(page.locator('.review-option-list .incorrect .choice')).toHaveText('B');
  await expect(page.locator('.review-option-list .correct:not(.selected) .choice')).toHaveText('C');
  await expect(page.locator('.review-option-list .option:enabled')).toHaveCount(0);
  await expect(page.locator('.review-option-list')).not.toHaveAttribute('inert', '');
  await page.getByRole('button', { name: '展开完整题目' }).click();
  await expect(page.locator('.review-option-list .option')).toHaveCount(4);
  await page.reload();
  await expect(page.getByRole('button', { name: '收起完整题目' })).toBeVisible();
  await expect(page.locator('.answer-recap')).toHaveCount(0);
  expect(state.requests).toBe(1);
});

test('提交失败保留勾选，连点不跳过反馈，刷新恢复不重播', async ({ page }) => {
  const state = await fixture(page, { fail: true }); await page.goto('/practice/focus');
  await page.locator('.option').nth(0).click(); await page.locator('.option').nth(2).click();
  const check = page.getByRole('button', { name: '检查', exact: true }); await check.click();
  await expect(page.getByRole('alert')).toContainText('自编提交失败');
  await expect(page.locator('.option[aria-pressed="true"]')).toHaveCount(2);
  await check.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  const next = page.getByRole('button', { name: '继续 →', exact: true });
  await expect(next).toBeDisabled(); await expect(next).toBeEnabled(); expect(state.requests).toBe(2);
  await page.reload(); await expect(next).toBeEnabled();
  await expect(page.locator('.burst-correct')).toHaveCount(0);
  await expect(page.locator('.practice-focus')).toHaveAttribute('data-transitioning', 'false');
});
