/** Generate a product board from real UI screenshots, with no external image service. */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'frontend/package.json'));
const { chromium } = require('playwright');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--reuse-screenshots')) throw Error('支持的选项：--reuse-screenshots');
if (!args.includes('--reuse-screenshots')) {
  const result = spawnSync('npm', ['run', 'test:e2e', '--prefix', 'frontend', '--', '--grep', '页面视觉巡检|乱序后按本轮字母'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, BASE_URL: process.env.BASE_URL || 'http://localhost:8080' },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
const output = resolve(root, 'docs/assets/showcase');
await mkdir(output, { recursive: true });
const copies = {
  'home-desktop.png': 'home.png',
  'bank-grid.png': 'banks.png',
  'continue-card.png': 'continue.png',
  'shuffled-feedback.png': 'feedback.png',
  'feedback-paper.png': 'feedback-paper.png',
  'mistakes-desktop.png': 'mistakes.png',
  'summary-desktop.png': 'summary.png',
  'practice-mobile.png': 'mobile.png',
  'setup-card.png': 'setup-card.png',
};
for (const [from, to] of Object.entries(copies)) {
  await copyFile(resolve(root, 'frontend/test-results/design', from), resolve(output, to));
}
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(resolve(output, 'overview.html')).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, image => image.decode()));
  });
  await page.locator('.poster').screenshot({ path: resolve(output, 'praxis-overview.png'), animations: 'disabled' });
} finally { await browser.close(); }
console.log('Praxis 展示素材已生成：docs/assets/showcase/praxis-overview.png');
