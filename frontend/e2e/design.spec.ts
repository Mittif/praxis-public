import { test, expect, type Page } from '@playwright/test';

const options = [
  { id: 'A', text: '在每一轮练习中，保留独立的作答记录' },
  { id: 'B', text: '只记录本次结果，覆盖之前的历史' },
  { id: 'C', text: '通过重复练习，巩固不确定的内容' },
  { id: 'D', text: '跳过所有错题，不再回顾' },
];
const question = { id: 'visual-q1', bank: '高频错题-金融', multiple: true,
  stem: '关于练习记录与错题回顾，下列说法正确的有哪些？', options };
const nextQuestion = { ...question, id: 'visual-q2', multiple: false,
  stem: '保持自己的节奏，认真完成这一轮练习。接下来，你会选择哪一种方式？' };
const explanation = '每次作答都保留独立记录，错题通过连续练习逐步巩固。\n连续答对两次后，题目会移出待巩固列表，历史错误次数仍然保留。';
const correctResult = { correct: true, answer: ['A', 'C'], selected: ['A', 'C'], explanation, question };

async function fixture(page: Page, anonymous = false, shuffled = false) {
  const presented = shuffled ? { ...question, options: [options[2], options[0], options[1], options[3]].map((option, index) => ({ ...option, source_label: option.id, label: String.fromCharCode(65 + index) })) } : question;
  const state = { answered: false, index: 0, correct: true, selected: ['A', 'C'], anonymous };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const body = route.request().postDataJSON();
    const result = { ...correctResult, question: presented, correct: state.correct, selected: state.selected };
    const record = { id: 'demo', bank: '高频错题-金融', mode: 'special', subject: '金融',
      index: 1, total: 20, correct: 1, created: 1793380000 };
    let data: unknown = {};
    if (path === '/me') {
      if (state.anonymous) return route.fulfill({ status: 401, json: { detail: '请先登录' } });
      data = { id: 'visual-user', name: '小林', role: 'user' };
    } else if (path === '/banks') data = ['真题速攻-经济基础', '高频错题-经济基础', '真题速攻-金融', '高频错题-金融'].map((name, i) => ({ name, count: [797, 283, 287, 328][i], done: [125, 48, 72, 18][i] }));
    else if (path === '/history') data = [record, { ...record, id: 'finished', mode: 'mixed', bank: null, total: 30, index: 30, correct: 24, created: 1793290000 }];
    else if (path === '/stats') data = { 'visual-q1': { attempts: state.answered ? 4 : 3, errors: 2, streak: 1, pending: true } };
    else if (path === '/mistakes') data = [
      { question, attempts: 6, errors: 3, streak: 1, pending: true },
      { question: { ...question, id: 'other', bank: '高频错题-经济基础', stem: '在其他条件不变时，市场需求如何随价格变动？' }, attempts: 4, errors: 1, streak: 0, pending: true },
      { question: { ...question, id: 'mastered', stem: '已经巩固的题目，也会保留完整的练习记录。' }, attempts: 5, errors: 1, streak: 2, pending: false },
    ];
    else if (path.startsWith('/mistakes/') && path.endsWith('/review')) data = { ...result, correct: false, selected: ['B'] };
    else if (path === '/practice-sessions') data = { id: 'demo' };
    else if (path.endsWith('/answers')) {
      state.answered = true; state.selected = body.options;
      state.correct = state.index === 0 ? JSON.stringify([...body.options].sort()) === '["A","C"]' : body.options[0] === 'A';
      data = { ...result, correct: state.correct, selected: state.selected };
    } else if (path.endsWith('/next')) { state.index += 1; state.answered = false; }
    else if (path === '/practice-sessions/finished' || (path === '/practice-sessions/demo' && state.index >= 2)) data = {
      id: 'finished', index: 2, total: 2, mode: 'mixed', question: null, result: null, elapsed: 126,
      results: [correctResult, { ...correctResult, correct: false, selected: ['B'], question: nextQuestion }],
    };
    else if (path === '/practice-sessions/demo') data = {
      id: 'demo', index: state.index, total: 2, mode: 'mixed', question: state.index ? nextQuestion : presented,
      result: state.answered ? result : null, results: state.answered ? [result] : [], elapsed: 47,
    };
    await route.fulfill({ json: data });
  });
  return state;
}

async function settle(page: Page) {
  await expect(page.locator('article')).toHaveCSS('opacity', '1');
  await page.evaluate(() => document.fonts.ready);
  await page.locator('article').evaluate(async el => {
    await Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
  });
}

test('选项粒子有限播放，撕纸反馈可操作，刷新不重播奖励', async ({ page }) => {
  await fixture(page);
  await page.goto('/practice/demo');
  await page.locator('.option').nth(0).click();
  await expect(page.locator('.burst-selection')).toHaveCount(1);
  await expect(page.locator('.burst-selection')).toHaveCount(0);
  await page.locator('.option').nth(2).click();
  await page.getByRole('button', { name: '检查', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('回答正确');
  await expect(page.locator('.feedback-wrap .tear-edge')).toBeVisible();
  await expect(page.locator('.burst-correct')).toHaveCount(1);
  await expect(page.locator('.burst-correct')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.locator('.burst-correct')).toHaveCount(0);
  await page.getByRole('button', { name: '继续 →', exact: true }).click();
  await expect(page.locator('.question h2')).toContainText('保持自己的节奏');
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.locator('.option').first().click();
  await page.getByRole('button', { name: '检查', exact: true }).click();
  await page.getByRole('button', { name: '继续 →', exact: true }).click();
  await expect(page.getByRole('heading', { name: '这一轮，完成了！' })).toBeVisible();
  await expect(page.locator('.burst-complete')).toHaveCount(1);
  await expect(page.locator('.burst-complete')).toHaveCount(0);
});

test('减少动态效果时关闭粒子，错误反馈仍明确', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fixture(page);
  await page.goto('/practice/demo');
  await page.locator('.option').nth(1).click();
  await expect(page.locator('.pixel-burst')).toHaveCount(0);
  await page.getByRole('button', { name: '检查', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('正确答案：A、C');
  await expect(page.locator('.feedback-wrap')).toHaveClass(/is-incorrect/);
  await expect(page.locator('.pixel-burst')).toHaveCount(0);
});

test('设置弹窗支持键盘关闭与焦点回到入口', async ({ page }) => {
  await fixture(page);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /随机混合/ });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '关闭', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: '开始练习 →' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('页面视觉巡检：桌面、手机与窄屏没有横向溢出', async ({ page }) => {
  const state = await fixture(page);
  for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844], ['narrow', 320, 740]] as const) {
    await page.setViewportSize({ width, height });
    for (const [name, path] of [['home', '/'], ['mistakes', '/mistakes'], ['history', '/history'], ['account', '/account'], ['practice', '/practice/demo'], ['summary', '/practice/finished']]) {
      await page.goto(path);
      await expect(page.locator('h1, .question h2').first()).toBeVisible();
      if (name === 'home') await expect(page.locator('.bank').last()).toHaveCSS('opacity', '1');
      if (name === 'summary') await expect(page.locator('.burst-complete')).toHaveCount(0);
      await settle(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      if (label !== 'narrow') await page.screenshot({ path: `test-results/design/${name}-${label}.png`, fullPage: true, animations: 'disabled' });
      if (name === 'home' && label === 'desktop') {
        await page.locator('.bank-grid').screenshot({ path: 'test-results/design/bank-grid.png', animations: 'disabled' });
        await page.locator('.continue').screenshot({ path: 'test-results/design/continue-card.png', animations: 'disabled' });
      }
      if (name === 'home' && label !== 'narrow') {
        await page.getByRole('button', { name: /随机混合/ }).click();
        await expect(page.locator('.modal')).toHaveCSS('transform', 'none');
        expect(await page.locator('.overlay').evaluate(el => el.getBoundingClientRect().top)).toBe(0);
        await page.screenshot({ path: `test-results/design/setup-${label}.png`, fullPage: false, animations: 'disabled' });
        if (label === 'desktop') await page.locator('.modal').screenshot({ path: 'test-results/design/setup-card.png', animations: 'disabled' });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/practice/demo');
  await page.locator('.option').nth(0).click();
  await page.locator('.option').nth(2).click();
  await page.getByRole('button', { name: '检查', exact: true }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.locator('.burst-correct')).toHaveCount(0);
  await settle(page);
  await page.screenshot({ path: 'test-results/design/feedback-correct-desktop.png', fullPage: true, animations: 'disabled' });
  state.answered = false;
  await page.reload();
  await page.locator('.option').nth(1).click();
  await page.getByRole('button', { name: '检查', exact: true }).click();
  await expect(page.locator('.feedback-wrap')).toHaveClass(/is-incorrect/);
  await settle(page);
  await page.screenshot({ path: 'test-results/design/feedback-incorrect-desktop.png', fullPage: true, animations: 'disabled' });
  state.anonymous = true;
  for (const [label, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `test-results/design/auth-${label}.png`, fullPage: true, animations: 'disabled' });
  }
});


test('乱序后按本轮字母显示，提交仍使用固定ID，解析提供原题对照', async ({ page }) => {
  await fixture(page, false, true);
  await page.goto('/practice/demo');
  const first = page.locator('.option').nth(0), second = page.locator('.option').nth(1);
  await expect(first.locator('.choice')).toHaveText('A');
  await expect(first.locator('.option-text')).toContainText('通过重复练习');
  await first.click();
  await second.click();
  const sent = page.waitForRequest(request => request.url().endsWith('/answers'));
  await page.getByRole('button', { name: '检查', exact: true }).click();
  expect((await sent).postDataJSON().options.sort()).toEqual(['A', 'C']);
  await expect(page.getByRole('status')).toContainText('回答正确');
  await expect(page.locator('.feedback-answer')).toContainText('A、B');
  await page.locator('.feedback-sheet').evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  await page.locator('.feedback-wrap').screenshot({ path: 'test-results/design/feedback-paper.png', animations: 'disabled' });
  await page.locator('.source-reference summary').click();
  await expect(page.locator('.source-reference')).toContainText('原题 A → 当前 B');
  await expect(page.locator('.source-reference')).toContainText('原题 C → 当前 A');
  await expect(page.locator('.burst-correct')).toHaveCount(0);
  await settle(page);
  await page.screenshot({ path: 'test-results/design/shuffled-feedback.png', fullPage: true, animations: 'disabled' });
});
