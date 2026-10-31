import { test, expect, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const sampleQuestions = Array.from({ length: 10 }, (_, index) => ({
  id: `simple-demo-${index}`, stem: `【自编演示】${index + 3} + 2 的计算结果是？`,
  bank: index < 6 ? '真题速攻-经济基础' : '真题速攻-金融', subject: index < 6 ? '基础' : '金融',
  series: '真题速攻', set: `set-${index}`, set_order: index, set_label: index < 6 ? `第 ${index + 1} 套` : ['单选（一）', '单选（二）', '多选', '案例'][index - 6],
  no: 1, module: index < 6 ? '经济学基础' : '货币与金融',
  type: index === 8 ? 'multi' : index === 9 ? 'case' : 'single', multiple: index === 8,
  options: ['A', 'B', 'C', 'D'].map((id, offset) => ({ id, text: String(index + 5 + offset) })),
  material: index === 9 ? '这是用于检查案例材料排版的自编演示。' : '', images: [],
}));

async function fixture(page: Page, options: { longContent?: boolean; reviewDelay?: number } = {}) {
  const questions = sampleQuestions.map(q => ({ ...q, stem: q.stem + (options.longContent ? '\n' + '自编长题干，用于检查手机翻题时是否保留阅读位置。'.repeat(40) : '') }));
  const state = { records: {} as Record<string, any>, stats: {} as Record<string, any>, stars: [] as string[], ids: [] as string[], anonymous: false };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const body = route.request().postDataJSON();
    let data: any = {};
    if (path === '/me') {
      if (state.anonymous) return route.fulfill({ status: 401, json: { detail: '请先登录' } });
      data = { id: 'simple-demo-user', name: '小林', role: 'user' };
    }
    else if (path === '/logout') state.anonymous = true;
    else if (path === '/simple/catalog') data = { questions, version: 'demo-version' };
    else if (path === '/simple/state') data = { ...state, resume: null };
    else if (path === '/simple/sessions') { state.ids = body.ids; data = { id: 'simple-demo-session', index: 0, total: body.ids.length }; }
    else if (path.endsWith('/answers')) {
      const id = state.ids[body.index], question = questions.find(q => q.id === id)!;
      const answer = question.multiple ? ['A', 'C'] : ['A'];
      const correct = [...body.options].sort().join('') === answer.join('');
      data = { question, answer, selected: body.options, correct, explanation: '自编演示解析：按题干条件计算，保留每次独立作答记录。' };
      state.records[id] = data;
      state.stats[id] = { attempts: 1, errors: correct ? 0 : 1, streak: correct ? 1 : 0, pending: !correct, last: 1793400000 };
    } else if (path.startsWith('/bookmarks/')) {
      const id = path.split('/').pop()!;
      state.stars = body.starred ? [...state.stars, id] : state.stars.filter(qid => qid !== id);
      data = { starred: body.starred };
    } else if (path.endsWith('/review')) {
      if (options.reviewDelay) await new Promise(resolve => setTimeout(resolve, options.reviewDelay));
      const id = path.split('/').at(-2), question = questions.find(q => q.id === id)!;
      data = { question, answer: question.multiple ? ['A', 'C'] : ['A'], explanation: '这是自编演示解析，不计入作答统计。' };
    }
    await route.fulfill({ json: data });
  });
  return state;
}

test('极简版保留四种模式、筛选、题号、夜间与移动端排版', async ({ page }) => {
  await fixture(page);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
    await page.goto('/simple/');
    await expect(page.locator('#qcard .stem')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(4);
    await expect(page.locator('#subjectChips button')).toHaveCount(3);
    await expect(page.locator('#filterPanel')).toHaveJSProperty('open', false);
    await expect(page.locator('#subjectChips')).toBeHidden();
    await page.locator('#filterPanel summary').click();
    await expect(page.locator('#subjectChips')).toBeVisible();
    await page.locator('#filterPanel summary').press('Enter');
    await expect(page.locator('#subjectChips')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    if (width !== 320) await page.screenshot({ path: `test-results/simple/quiz-${width}.png`, fullPage: true });
    await page.locator('#gridBtn').click();
    await expect(page.locator('.qgrid button')).toHaveCount(10);
    await page.getByRole('button', { name: '跳到第 3 题', exact: true }).click();
    await expect(page.locator('#progText')).toContainText('第 3 / 10 题');
    await page.locator('#themeBtn').click();
    await expect(page.locator('body')).toHaveClass('dark');
    if (width === 390) await page.screenshot({ path: 'test-results/simple/night-mobile.png', fullPage: true });
    await page.locator('#themeBtn').click();
    await page.getByRole('tab', { name: '统计', exact: true }).click();
    await expect(page.locator('#statCards .stat')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  }
});

test('极简版单选即判分、多选提交、键盘、收藏和答案遮盖', async ({ page }) => {
  const data = await fixture(page);
  await page.goto('/simple/');
  await expect(page.locator('#qcard .stem')).toBeVisible();
  await page.keyboard.press('b');
  await expect(page.locator('#qcard .result')).toContainText('回答错误');
  expect(Object.values(data.stats)[0].errors).toBe(1);
  await page.keyboard.press('s');
  await expect(page.locator('#qcard .starbtn')).toContainText('已收藏');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#progText')).toContainText('第 2 / 10 题');
  await page.getByRole('tab', { name: '背题', exact: true }).click();
  await expect(page.locator('#revCard .result')).toBeVisible();
  await page.locator('#maskBtn').click();
  await expect(page.locator('#revCard .result')).toHaveCount(0);
  await expect(page.locator('#revCard .opt.right')).toHaveCount(0);
  await page.locator('#unmaskBtn').click();
  await expect(page.locator('#revCard .result')).toBeVisible();
  expect(Object.keys(data.stats)).toHaveLength(1);
  await page.getByRole('tab', { name: '刷题', exact: true }).click();
  await page.locator('#filterPanel summary').click();
  await page.locator('#subjectChips [data-subject="金融"]').click();
  await expect(page.locator('#filterSummary')).toContainText('中级金融');
  await expect(page.locator('#filterPanel')).toHaveJSProperty('open', true);
  await page.locator('#moduleSel').selectOption('货币与金融');
  await page.locator('#gridBtn').click();
  await page.getByRole('button', { name: '跳到第 3 题', exact: true }).click();
  await page.locator('#qcard [data-option="A"]').click();
  await expect(page.locator('#qcard .result')).toHaveCount(0);
  await page.locator('#qcard [data-option="C"]').click();
  await page.locator('#submitBtn').click();
  await expect(page.locator('#qcard .result')).toContainText('回答正确');
  await page.locator('#logoutBtn').click();
  await expect(page.locator('#authForm')).toBeVisible();
  await expect(page.locator('#qcard')).toBeEmpty();
  await expect(page.locator('#revCard')).toBeEmpty();
});

test('手机刷题和背题翻页保留阅读位置，加载解析时不缩短卡片', async ({ page }) => {
  await fixture(page, { longContent: true, reviewDelay: 500 });
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto('/simple/');
  await expect(page.locator('#qcard .stem')).toBeVisible();
  await page.locator('#nextBtn').scrollIntoViewIfNeeded();
  const quizY = await page.evaluate(() => scrollY);
  expect(quizY).toBeGreaterThan(200);
  await page.locator('#nextBtn').click();
  await expect(page.locator('#progText')).toContainText('第 2 / 10 题');
  expect(Math.abs(await page.evaluate(() => scrollY) - quizY)).toBeLessThanOrEqual(2);
  await page.locator('#prevBtn').click();
  expect(Math.abs(await page.evaluate(() => scrollY) - quizY)).toBeLessThanOrEqual(2);
  await page.keyboard.press('ArrowRight');
  expect(Math.abs(await page.evaluate(() => scrollY) - quizY)).toBeLessThanOrEqual(2);

  await page.getByRole('tab', { name: '背题', exact: true }).click();
  await expect(page.locator('#revCard .result')).toBeVisible();
  await page.locator('#rnextBtn').scrollIntoViewIfNeeded();
  const reviewY = await page.evaluate(() => scrollY);
  expect(reviewY).toBeGreaterThan(200);
  await page.locator('#rnextBtn').click();
  await expect(page.locator('#revCard')).toHaveAttribute('aria-busy', 'true');
  expect(Math.abs(await page.evaluate(() => scrollY) - reviewY)).toBeLessThanOrEqual(2);
  await expect(page.locator('#revCard .result')).toBeVisible();
  expect(Math.abs(await page.evaluate(() => scrollY) - reviewY)).toBeLessThanOrEqual(2);
  await page.locator('#rprevBtn').click();
  await expect(page.locator('#revCard .result')).toBeVisible();
  expect(Math.abs(await page.evaluate(() => scrollY) - reviewY)).toBeLessThanOrEqual(2);
});

test('刷题临时看答案不切换模式、不计入作答，多选勾选保留', async ({ page }) => {
  const data = await fixture(page);
  await page.goto('/simple/');
  await expect(page.locator('#revealBtn')).toBeVisible();
  await page.locator('#revealBtn').press('Enter');
  await expect(page.locator('#peekContent')).toContainText('本题答案：A');
  await expect(page.getByRole('tab', { name: '刷题', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#reviewWrap')).toBeHidden();
  await expect(page.locator('#progText')).toContainText('第 1 / 10 题');
  await expect(page.locator('#qcard .opt.right')).toHaveCount(0);
  expect(data.records).toEqual({}); expect(data.stats).toEqual({}); expect(data.ids).toEqual([]);
  await page.locator('#revealBtn').click();
  await expect(page.locator('#answerPreview')).toHaveAttribute('aria-hidden', 'true');
  await page.locator('#nextBtn').click(); await page.locator('#prevBtn').click();
  await expect(page.locator('#revealBtn')).toHaveAttribute('aria-expanded', 'false');

  await page.locator('#filterPanel summary').click();
  await page.locator('#subjectChips [data-subject="金融"]').click();
  await page.locator('#gridBtn').click();
  await page.getByRole('button', { name: '跳到第 3 题', exact: true }).click();
  await page.locator('#qcard [data-option="A"]').click();
  await page.locator('#revealBtn').click();
  await expect(page.locator('#peekContent')).toContainText('本题答案：A C');
  await expect(page.locator('#qcard [data-option="A"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#qcard [data-option="C"]').click();
  await expect(page.locator('#revealBtn')).toHaveAttribute('aria-expanded', 'true');
  expect(data.records).toEqual({}); expect(data.ids).toEqual([]);
  await page.locator('#submitBtn').click();
  await expect(page.locator('#qcard .result')).toContainText('回答正确');
  expect(Object.keys(data.records)).toHaveLength(1);
  await expect(page.locator('#answerPreview')).toHaveAttribute('aria-hidden', 'true');
});

test('慢返回的临时答案不跨题弹出，减少动态效果时交互仍可用', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fixture(page, { reviewDelay: 400 });
  await page.goto('/simple/');
  const response = page.waitForResponse(reply => reply.url().endsWith('/simple/questions/simple-demo-0/review'));
  await page.locator('#revealBtn').click();
  await expect(page.locator('#answerPreview')).toHaveAttribute('aria-busy', 'true');
  await page.locator('#nextBtn').click(); await page.locator('#prevBtn').click();
  await response;
  await expect(page.locator('#answerPreview')).toHaveAttribute('aria-hidden', 'true');
  await page.locator('#filterPanel summary').click();
  await expect(page.locator('#filterPanel')).toHaveJSProperty('open', true);
  await page.locator('#filterPanel summary').press('Enter');
  await expect(page.locator('#filterPanel')).toHaveJSProperty('open', false);
  expect(await page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  const pending = page.waitForResponse(reply => reply.url().endsWith('/simple/questions/simple-demo-0/review'));
  await page.locator('#revealBtn').click();
  await expect(page.locator('#answerPreview')).toHaveAttribute('aria-busy', 'true');
  await page.locator('#logoutBtn').click();
  await pending;
  await expect(page.locator('#authForm')).toBeVisible();
  await expect(page.locator('#qcard')).toBeEmpty();
});

test('真实主站与极简版共享登录、收藏、作答与两次巩固', async ({ page, context }) => {
  const name = '极简兼容' + Date.now();
  const register = await page.request.post('/api/v1/auth/register', { data: { name, password: randomBytes(24).toString('base64url') } });
  expect(register.ok()).toBeTruthy();
  const catalog = await (await page.request.get('/api/v1/simple/catalog')).json();
  const q = catalog.questions.find((item: any) => !item.multiple && item.series === '真题速攻');
  const correct = (await (await page.request.get(`/api/v1/simple/questions/${q.id}/review`)).json()).answer;
  const wrong = q.options.find((option: any) => !correct.includes(option.id)).id;
  const first = await (await page.request.post('/api/v1/simple/sessions', { data: { ids: [q.id], version: catalog.version } })).json();
  await page.goto('/simple/?session=' + first.id);
  await expect(page.locator('#progText')).toContainText('第 1 / 1 题');
  await page.locator(`#qcard [data-option="${wrong}"]`).click();
  await expect(page.locator('#qcard .result')).toContainText('回答错误');
  await page.locator('#qcard .starbtn').click();
  await expect(page.locator('#qcard .starbtn')).toContainText('已收藏');
  expect((await (await page.request.get('/api/v1/stats')).json())[q.id].pending).toBeTruthy();
  const primary = await context.newPage();
  for (let round = 0; round < 2; round++) {
    const next = await (await page.request.post('/api/v1/simple/sessions', { data: { ids: [q.id], version: catalog.version, retry: true } })).json();
    await primary.goto('/practice/' + next.id);
    await expect(primary.locator('.question h2')).toContainText(q.stem);
    if (round === 0) {
      await expect(primary.getByRole('button', { name: '★ 已收藏', exact: true })).toBeVisible();
      await primary.getByRole('button', { name: '★ 已收藏', exact: true }).click();
      await expect(primary.getByRole('button', { name: '☆ 收藏', exact: true })).toBeVisible();
    }
    const session = await (await page.request.get('/api/v1/practice-sessions/' + next.id)).json();
    const index = session.question.options.findIndex((option: any) => option.id === correct[0]);
    await primary.locator('.option').nth(index).click();
    await primary.getByRole('button', { name: '检查', exact: true }).click();
    await expect(primary.locator('.feedback-wrap')).toHaveClass(/is-correct/);
    const records = await (await page.request.get('/api/v1/simple/state')).json();
    expect(records.stats[q.id].pending).toBe(round === 0);
  }
  await page.reload();
  await expect(page.locator('#qcard .starbtn')).toContainText('☆ 收藏');
  await page.getByRole('tab', { name: '错题本', exact: true }).click();
  await expect(page.locator('#wrongList')).toContainText('当前没有待巩固错题');
  const stats = (await (await page.request.get('/api/v1/stats')).json())[q.id];
  expect(stats.attempts).toBe(3); expect(stats.errors).toBe(1);
  await primary.close();
});
