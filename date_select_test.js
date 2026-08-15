#!/usr/bin/env node
/* =====================================================================
   date_select_test.js
   ---------------------------------------------------------------------
   STEP0（最優先バグ）: 生年月日プルダウンが実際に選択・機能するかを
   jsdom で検証する。test.js と同じ手法（ローカルスクリプトのみを
   実ブラウザ同様の順序でevalする）を用いる。

   実行: node date_select_test.js
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname;
const rp = (...p) => path.join(ROOT, ...p);
const read = f => fs.readFileSync(rp(f), 'utf8');

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ok - ' + name);
  } catch (e) {
    fail++;
    failures.push({ name, error: e });
    console.log('  NG - ' + name);
    console.log('       ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join('\n       ') : e));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function loadPage(file) {
  const html = read(file);
  const dom = new JSDOM(html, {
    url: 'https://atonankai.pages.dev/' + file,
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { window } = dom;

  window.matchMedia = window.matchMedia || function () {
    return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
  };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.scrollTo = function () {};
  window.HTMLCanvasElement.prototype.getContext = window.HTMLCanvasElement.prototype.getContext || function () { return null; };

  const scripts = Array.from(window.document.querySelectorAll('script[src]'));
  const combined = scripts
    .map(s => s.getAttribute('src'))
    .filter(src => !/^https?:/.test(src))
    .map(src => fs.readFileSync(rp(src.replace(/\?.*$/, '')), 'utf8'))
    .join('\n;\n');
  window.eval(combined);
  return dom;
}

function fireChange(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

console.log('== date_select_test.js — 生年月日プルダウンの検証 ==');

const dom = loadPage('index.html');
const window = dom.window;
const document = window.document;
const $ = s => document.querySelector(s);

/* STEP1画面を表示させる（cover の「数えはじめる」相当の遷移） */
$('[data-go="basic"]').click();

const birthY = $('#birthY');
const birthM = $('#birthM');
const birthD = $('#birthD');

/* 1. 年・月・日それぞれの <select> 要素が存在する */
test('年 <select id="birthY"> が存在する', () => {
  assert(birthY, '#birthY が見つからない');
});
test('月 <select id="birthM"> が存在する', () => {
  assert(birthM, '#birthM が見つからない');
});
test('日 <select id="birthD"> が存在する', () => {
  assert(birthD, '#birthD が見つからない');
});

/* 2. 年の <option> が実際に90個以上入っている（プレースホルダ除く、現在年から100年分・降順） */
test('年の <option> が90個以上入っている（プレースホルダ除く）', () => {
  const opts = Array.from(birthY.options).filter(o => o.value !== '');
  assert(opts.length >= 90, `年の選択肢が ${opts.length} 個しかない`);
  const values = opts.map(o => Number(o.value));
  const sorted = [...values].sort((a, b) => b - a);
  assert(JSON.stringify(values) === JSON.stringify(sorted), '年の選択肢が降順になっていない');
});

/* 3. 月の <option> が12個入っている */
test('月の <option> が12個入っている（プレースホルダ除く）', () => {
  const opts = Array.from(birthM.options).filter(o => o.value !== '');
  assert(opts.length === 12, `月の選択肢が ${opts.length} 個しかない`);
});

/* 4. 日の <option> が1つ以上入っている（月に応じて28〜31個） */
test('日の <option> が1つ以上入っている', () => {
  const opts = Array.from(birthD.options).filter(o => o.value !== '');
  assert(opts.length >= 1, '日の選択肢が0個');
  assert(opts.length >= 28 && opts.length <= 31, `日の選択肢が ${opts.length} 個（28〜31の範囲外）`);
});

/* 5. 年=1990, 月=5, 日=20 を選択し change を発火させたとき、年齢表示が空でなくなる */
test('年1990・月5・日20を選択すると年齢表示（#ageHint）が更新される', () => {
  birthY.value = '1990'; fireChange(birthY);
  birthM.value = '5'; fireChange(birthM);
  birthD.value = '20'; fireChange(birthD);
  assert(birthY.value === '1990', '年の選択値が反映されない');
  assert(birthM.value === '5', '月の選択値が反映されない');
  assert(birthD.value === '20', '日の選択値が反映されない');
  const hint = $('#ageHint').textContent;
  assert(hint && hint.trim() !== '', '#ageHint が空のまま（年齢が計算されていない）');
});

/* 6. 2月を選んだときに、日の選択肢が29個以下になる（うるう年考慮） */
test('2月を選択すると日の選択肢が29個以下になる（うるう年考慮）', () => {
  birthY.value = '2023'; fireChange(birthY); // 平年
  birthM.value = '2'; fireChange(birthM);
  const opts = Array.from(birthD.options).filter(o => o.value !== '');
  assert(opts.length === 28, `2023年2月の日数が ${opts.length}（期待値28）`);

  birthY.value = '2024'; fireChange(birthY); // うるう年
  birthM.value = '2'; fireChange(birthM);
  const optsLeap = Array.from(birthD.options).filter(o => o.value !== '');
  assert(optsLeap.length === 29, `2024年2月の日数が ${optsLeap.length}（期待値29）`);
  assert(optsLeap.length <= 29, '2月の日数が29を超えている');
});

console.log(`\n${pass} 件成功 / ${fail} 件失敗`);

if (fail > 0) {
  console.log('\n失敗した項目:');
  failures.forEach(f => console.log('  - ' + f.name));
  process.exit(1);
} else {
  console.log('date_select_test.js: すべて合格。生年月日プルダウンは正常に機能しています。');
}
