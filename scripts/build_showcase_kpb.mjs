/** Render the KPB poster from the existing showcase assets; the classic edition stays intact. */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { access, readFile, writeFile } from 'node:fs/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'docs/assets/showcase');
const require = createRequire(resolve(root, 'frontend/package.json'));
const { chromium } = require('playwright');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--pdf')) throw Error('支持的选项：--pdf');
for (const file of ['overview-kpb.html', 'kpb-panels.svg', 'banks.png', 'mobile.png', 'feedback-paper.png', 'setup-card.png', 'continue.png']) {
  await access(resolve(output, file));
}
const panelArt = await readFile(resolve(output, 'kpb-panels.svg'), 'utf8');
const panels = Object.fromEntries(Array.from(panelArt.matchAll(/<path id="(\w+)" d="([^"]+)"/g), ([, id, path]) => {
  const values = path.match(/[\d.]+/g).map(Number);
  return [id, Array.from({ length: values.length / 2 }, (_, i) => [values[i * 2], values[i * 2 + 1]])];
}));

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(pathToFileURL(resolve(output, 'overview-kpb.html')).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, image => image.decode()));
  });
  const inspection = await page.evaluate(() => ({
    images: Array.from(document.images, img => ({ file: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 })),
    dimensions: { width: document.querySelector('.poster').offsetWidth, height: document.querySelector('.poster').offsetHeight },
    clippedText: Array.from(document.querySelectorAll('h1,h2,p,.chip,.sizes,.wordmark')).filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => ({ text: el.textContent, width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.clientHeight, scrollHeight: el.scrollHeight })),
  }));
  inspection.outsidePanels = await page.evaluate((panels) => {
    const selectors = {
      hero: '.brand,.hero-copy', note: '.note', banks: '.bank-title,.bank-shot',
      mobile: '.mobile-title,.mobile-screen,.mobile-aside', feedback: '.feedback-title,.feedback-shot',
      setup: '.setup-title,.setup-image,.setup-side', review: '.review',
    };
    const inside = (x, y, polygon) => {
      const sides = polygon.map(([ax, ay], i) => {
        const [bx, by] = polygon[(i + 1) % polygon.length];
        return (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      });
      return sides.every(side => side >= 0) || sides.every(side => side <= 0);
    };
    const failures = [];
    const check = (panel, rect, text) => {
      const points = [[rect.left, rect.top], [rect.right, rect.top], [rect.right, rect.bottom], [rect.left, rect.bottom]];
      if (points.some(([x, y]) => !inside(x, y, panels[panel]))) failures.push({ panel, content: text, rect: rect.toJSON() });
    };
    for (const [panel, selector] of Object.entries(selectors)) {
      for (const region of document.querySelectorAll(selector)) {
        const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) check(panel, rect, node.textContent.trim());
        }
        for (const img of region.matches('img') ? [region] : region.querySelectorAll('img')) check(panel, img.getBoundingClientRect(), img.getAttribute('src'));
      }
    }
    return failures;
  }, panels);
  await page.locator('.poster').screenshot({ path: resolve(output, 'praxis-overview-kpb.png'), animations: 'disabled' });
  if (errors.length || inspection.images.some(img => !img.loaded) || inspection.clippedText.length || inspection.outsidePanels.length) {
    throw Error(JSON.stringify({ errors, inspection }, null, 2));
  }
  if (args.includes('--pdf')) {
    await page.pdf({ path: resolve(output, 'praxis-overview-kpb.pdf'), printBackground: true, preferCSSPageSize: true });
  }
  inspection.previews = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const preview = await page.evaluate(() => ({
      viewport: window.innerWidth,
      width: document.querySelector('.poster').getBoundingClientRect().width,
      height: document.querySelector('.poster').getBoundingClientRect().height,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    if (preview.horizontalOverflow || Math.abs(preview.width - width) > 1 || Math.abs(preview.height - width / 1.5) > 1) throw Error(`预览缩放异常：${JSON.stringify(preview)}`);
    inspection.previews.push(preview);
  }
  await writeFile(resolve(output, 'kpb-render-report.json'), `${JSON.stringify({ ...inspection, errors, exportSize: { width: 3600, height: 2400 } }, null, 2)}\n`);
  console.log('KPB 海报已生成：docs/assets/showcase/praxis-overview-kpb.png (3600 × 2400)');
} finally {
  await browser.close();
}
