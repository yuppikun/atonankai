#!/usr/bin/env node
/* 結果画面まで実際に操作して進み、時計・砂時計部分をスクリーンショットする */
'use strict';
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:8791/index.html';
const OUTDIR = process.argv[3] || '/tmp/shots';

const cases = [
  { label: 'young', y: 2005, m: 6, d: 15, sex: 'male' },
  { label: 'middle', y: 1985, m: 3, d: 10, sex: 'female' },
  { label: 'old', y: 1955, m: 11, d: 20, sex: 'na' }
];

const fs = require('fs');
fs.mkdirSync(OUTDIR, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  for (const width of [390, 800]) {
    for (const c of cases) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(BASE, { waitUntil: 'load' });

      await page.click('[data-go="basic"]');
      await page.waitForSelector('#screen-basic:not([hidden])');
      await page.selectOption('#birthY', String(c.y));
      await page.selectOption('#birthM', String(c.m));
      await page.selectOption('#birthD', String(c.d));
      await page.click(`[data-sex="${c.sex}"]`);
      await page.click('#toPick');
      await page.click('#pickAll');
      await page.click('#toResult');
      await page.waitForSelector('#screen-result:not([hidden])');
      await page.waitForTimeout(500); // sand-fall アニメーション待ち

      const clockText = await page.textContent('#clockText');
      const clockAmpm = await page.textContent('#clockAmpm');
      const note = await page.textContent('.hero__hourglass-note');
      console.log(`[${width}px] ${c.label}: 時刻=${clockText} ${clockAmpm} / ${note}`);

      const hero = page.locator('#hero');
      await hero.screenshot({ path: `${OUTDIR}/${c.label}_${width}.png` });

      await page.close();
    }
  }
  await browser.close();
})();
