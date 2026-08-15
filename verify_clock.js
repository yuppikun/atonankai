#!/usr/bin/env node
/* =====================================================================
   verify_clock.js
   ---------------------------------------------------------------------
   人生時計（12時間アナログ時計＋砂時計）の針の角度が、
   画面に表示される時刻・砂の量と数学的に一致しているかを、
   多数の年齢パターンで検証する。

   検証対象の式（IMPROVEMENTS.md 0-1 に定める仕様どおりか）:
     短針 = ((hour % 12) + minute / 60) / 12 * 360度
     長針 = minute / 60 * 360度
     午前 = hour < 12 / 午後 = hour >= 12
     砂時計の砂の量（ratio） = 人生の経過割合 = hour*60+minute を24時間換算したもの

   実行: node verify_clock.js
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname;
const rp = (...p) => path.join(ROOT, ...p);

let checked = 0, failed = 0;
const failures = [];
const samples = [];

function fail(label, msg) {
  failed++;
  failures.push(label + ': ' + msg);
}

/* ---------- 1. calc.js の lifeClock() を直接、数式で総当たり検証 ---------- */

function loadCalc() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' });
  const code = [
    fs.readFileSync(rp('assets/js/data.js'), 'utf8'),
    fs.readFileSync(rp('assets/js/calc.js'), 'utf8')
  ].join('\n;\n');
  dom.window.eval(code);
  return dom.window;
}

function verifyClockMath(w, sex, age, targetAge) {
  checked++;
  const clock = w.lifeClock({ sex, age, mode: 'target', targetAge });

  // --- 仕様の式を、calc.js の実装とは独立に再計算する ---
  const span = targetAge;
  const expectRatio = Math.min(0.9999, Math.max(0, age / span));
  const totalMin = expectRatio * 24 * 60;
  const expectHour = Math.floor(totalMin / 60);
  const expectMinute = Math.floor(totalMin % 60);
  const expectHourAngle = ((expectHour % 12) + expectMinute / 60) / 12 * 360;
  const expectMinAngle = (expectMinute / 60) * 360;
  const expectAmpm = expectHour < 12 ? '午前' : '午後';

  const label = `sex=${sex} age=${age} target=${targetAge}`;

  if (clock.hour !== expectHour) fail(label, `hour不一致: got=${clock.hour} expect=${expectHour}`);
  if (clock.minute !== expectMinute) fail(label, `minute不一致: got=${clock.minute} expect=${expectMinute}`);
  if (Math.abs(clock.ratio - expectRatio) > 1e-9) fail(label, `ratio不一致: got=${clock.ratio} expect=${expectRatio}`);

  // 針の角度（表示から導かれる値）が仕様の式と一致するか
  const actualHourAngle = ((clock.hour % 12) + clock.minute / 60) / 12 * 360;
  const actualMinAngle = (clock.minute / 60) * 360;
  if (Math.abs(actualHourAngle - expectHourAngle) > 1e-9) {
    fail(label, `短針の角度不一致: got=${actualHourAngle.toFixed(3)} expect=${expectHourAngle.toFixed(3)}`);
  }
  if (Math.abs(actualMinAngle - expectMinAngle) > 1e-9) {
    fail(label, `長針の角度不一致: got=${actualMinAngle.toFixed(3)} expect=${expectMinAngle.toFixed(3)}`);
  }
  const actualAmpm = clock.hour < 12 ? '午前' : '午後';
  if (actualAmpm !== expectAmpm) fail(label, `午前/午後不一致: got=${actualAmpm} expect=${expectAmpm}`);

  // 針は必ず0〜360度の範囲
  if (actualHourAngle < 0 || actualHourAngle > 360) fail(label, `短針の角度が範囲外: ${actualHourAngle}`);
  if (actualMinAngle < 0 || actualMinAngle >= 360) fail(label, `長針の角度が範囲外: ${actualMinAngle}`);

  return { clock, expectHourAngle, expectMinAngle, expectAmpm };
}

console.log('== 1. lifeClock() の数式総当たり検証 ==');
{
  const w = loadCalc();
  const sexes = ['male', 'female', 'na'];
  const fixedCases = [
    { age: 0, targetAge: 84 },
    { age: 0.001, targetAge: 84 },
    { age: 1, targetAge: 84 },
    { age: 10, targetAge: 84 },
    { age: 20, targetAge: 84 },
    { age: 42, targetAge: 84 },
    { age: 62, targetAge: 84 },
    { age: 83.99, targetAge: 84 },
    { age: 84, targetAge: 84 },       // ちょうど寿命に到達（真夜中）
    { age: 90, targetAge: 84 },       // 想定寿命を超過（クランプされる）
    { age: 43.5, targetAge: 87 },
    { age: 65, targetAge: 110 },
    { age: 12, targetAge: 40 }
  ];

  fixedCases.forEach(c => {
    sexes.forEach(sex => {
      const r = verifyClockMath(w, sex, c.age, c.targetAge);
      samples.push({ sex, age: c.age, targetAge: c.targetAge, ...r });
    });
  });

  // 乱数で広く検証（再現性のため固定シード相当の単純LCGを使用）
  let seed = 20260815;
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 300; i++) {
    const sex = sexes[Math.floor(rand() * sexes.length)];
    const targetAge = 40 + Math.floor(rand() * 71); // 40〜110
    const age = rand() * (targetAge + 10); // 目標を超えるケースも含める
    verifyClockMath(w, sex, age, targetAge);
  }

  console.log(`  検証件数: ${checked}件`);
}

/* ---------- 2. 実際の結果画面DOMで、SVGの針・時刻表示・砂時計を横断検証 ---------- */

function loadIndexPage() {
  const html = fs.readFileSync(rp('index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://atonankai.pages.dev/index.html', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  /* prefers-reduced-motion は true を返す：結果画面直前の演出（約2秒の
     非同期シーケンス）をスキップさせ、このテストが検証したい「時計の
     針・砂時計・表示時刻の数学的な一致」を同期的に検証できるようにする。
     演出そのものの見た目は Playwright の目視確認で別途確認している。 */
  window.matchMedia = window.matchMedia || function (q) {
    return {
      matches: /prefers-reduced-motion/.test(String(q)),
      media: String(q),
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}
    };
  };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.scrollTo = function () {};
  const scripts = Array.from(window.document.querySelectorAll('script[src]'))
    .map(s => s.getAttribute('src'))
    .filter(src => !/^https?:/.test(src))
    .map(src => fs.readFileSync(rp(src.replace(/\?.*$/, '')), 'utf8'))
    .join('\n;\n');
  window.eval(scripts);
  return dom;
}

function fireChange(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

function renderResultFor(y, m, d, sex) {
  const dom = loadIndexPage();
  const w = dom.window;
  const D = w.document;
  const $ = s => D.querySelector(s);

  $('#birthY').value = String(y); fireChange($('#birthY'));
  $('#birthM').value = String(m); fireChange($('#birthM'));
  $('#birthD').value = String(d); fireChange($('#birthD'));
  D.querySelector('[data-sex="' + sex + '"]').click();
  $('#toPick').click();
  $('#pickAll').click();
  $('#toResult').click();

  return { window: w, document: D };
}

console.log('\n== 2. 結果画面（実際のDOM描画）での一致確認 ==');
{
  const cases = [
    { y: 2020, m: 6, d: 15, sex: 'male',   label: '5歳・男性' },
    { y: 2011, m: 4, d: 3,  sex: 'female', label: '中学生・女性' },
    { y: 2000, m: 12, d: 25, sex: 'na',    label: '20代半ば・未回答' },
    { y: 1985, m: 8, d: 15, sex: 'male',   label: '40代・男性' },
    { y: 1970, m: 1, d: 1,  sex: 'female', label: '50代・女性' },
    { y: 1955, m: 3, d: 20, sex: 'male',   label: '70代・男性' },
    { y: 1940, m: 9, d: 9,  sex: 'female', label: '80代・女性' },
    { y: 1930, m: 5, d: 5,  sex: 'male',   label: '90代・男性（想定寿命超過の可能性）' }
  ];

  cases.forEach(c => {
    checked++;
    const { document: D } = renderResultFor(c.y, c.m, c.d, c.sex);

    const clockText = D.getElementById('clockText').textContent;
    const ampm = D.getElementById('clockAmpm').textContent;
    const m2 = /^(\d{2}):(\d{2})$/.exec(clockText);
    if (!m2) { fail(c.label, '時刻表示の書式が不正: ' + clockText); return; }
    const hour = Number(m2[1]), minute = Number(m2[2]);

    const hourLine = D.querySelector('#heroClock line[data-role="hour"]');
    const minLine = D.querySelector('#heroClock line[data-role="minute"]');
    const domHourAngle = Number(hourLine.getAttribute('data-angle'));
    const domMinAngle = Number(minLine.getAttribute('data-angle'));

    const expectHourAngle = ((hour % 12) + minute / 60) / 12 * 360;
    const expectMinAngle = (minute / 60) * 360;
    const expectAmpm = hour < 12 ? '午前' : '午後';

    const sandRatio = Number(D.querySelector('#heroClock .sand-fall').getAttribute('data-ratio'));
    const ratioFromClock = (hour * 60 + minute) / (24 * 60);

    let ok = true;
    if (Math.abs(domHourAngle - expectHourAngle) > 0.05) {
      fail(c.label, `短針角度不一致 got=${domHourAngle} expect=${expectHourAngle.toFixed(3)}`); ok = false;
    }
    if (Math.abs(domMinAngle - expectMinAngle) > 0.05) {
      fail(c.label, `長針角度不一致 got=${domMinAngle} expect=${expectMinAngle.toFixed(3)}`); ok = false;
    }
    if (ampm !== expectAmpm) { fail(c.label, `午前/午後不一致 got=${ampm} expect=${expectAmpm}`); ok = false; }
    if (Math.abs(sandRatio - ratioFromClock) > 1 / (24 * 60) + 1e-6) {
      fail(c.label, `砂時計のratio(${sandRatio})が表示時刻(${clockText}, ratio換算=${ratioFromClock.toFixed(5)})とずれている`); ok = false;
    }

    console.log(
      `  [${ok ? '一致' : '不一致'}] ${c.label.padEnd(28, '　')} 生年月日=${c.y}-${c.m}-${c.d} ` +
      `→ 時刻=${clockText}(${ampm})  短針=${domHourAngle.toFixed(1)}°  長針=${domMinAngle.toFixed(1)}°  砂time=${(sandRatio * 100).toFixed(1)}%`
    );
  });
}

/* ---------- まとめ ---------- */

console.log('\n--------------------------------------------------------');
console.log(`検証件数: ${checked}件 / 不一致: ${failed}件`);
if (failed > 0) {
  console.log('\n不一致の詳細:');
  failures.forEach(f => console.log(' - ' + f));
  console.log('\n人生時計の針・砂時計・表示時刻のいずれかが数学的に一致していません。');
  process.exit(1);
} else {
  console.log('すべての年齢パターンで、時計の針の角度・午前午後・砂時計の量が表示時刻と数学的に一致しました。');
  process.exit(0);
}
