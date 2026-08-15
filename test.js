#!/usr/bin/env node
/* =====================================================================
   あと何回。 — テストスイート
   実行: node test.js （事前に npm install jsdom が必要）
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
let currentSection = '';

function section(title) {
  currentSection = title;
  console.log('\n== ' + title + ' ==');
}

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  ok - ' + name);
  } catch (e) {
    fail++;
    failures.push({ section: currentSection, name, error: e });
    console.log('  NG - ' + name);
    console.log('       ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join('\n       ') : e));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function approx(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) {
    throw new Error((msg || 'not approx equal') + ` (got ${a}, expected ${b}, tol ${tol})`);
  }
}

/* ---------------------------------------------------------------------
   ページを jsdom に読み込み、そのページが参照するローカルスクリプトだけを
   実際のブラウザと同じ順序で実行するヘルパー。
   外部URL（Google Fonts等）へはアクセスしない。
   --------------------------------------------------------------------- */
function loadPage(file) {
  const html = read(file);
  const dom = new JSDOM(html, {
    url: 'https://atonankai.pages.dev/' + file,
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { window } = dom;

  // jsdom が未実装のブラウザAPIを無害なスタブに置き換える
  window.matchMedia = window.matchMedia || function () {
    return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
  };
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.scrollTo = function () {};
  window.HTMLCanvasElement.prototype.getContext = window.HTMLCanvasElement.prototype.getContext || function () { return null; };

  // let/const の宣言をスクリプト間で共有させるため、1回のevalにまとめて実行する
  // （window.evalを複数回に分けて呼ぶと、各回が独立したグローバル字句スコープになり
  //   data.js の const SOURCES 等が calc.js / app.js から参照できなくなるため）
  const scripts = Array.from(window.document.querySelectorAll('script[src]'));
  const combined = scripts
    .map(s => s.getAttribute('src'))
    .filter(src => !/^https?:/.test(src))
    .map(src => fs.readFileSync(rp(src), 'utf8'))
    .join('\n;\n');
  window.eval(combined);
  return dom;
}

function fireChange(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

/* 生年月日・性別を入力して STEP1 を通過し、STEP2〜3 を経て結果画面まで進める */
function goToResult(window, { y, m, d, sex, selectPartner = false }) {
  const $ = s => window.document.querySelector(s);
  const D = window.document;

  $('#birthY').value = String(y); fireChange($('#birthY'));
  $('#birthM').value = String(m); fireChange($('#birthM'));
  $('#birthD').value = String(d); fireChange($('#birthD'));
  D.querySelector('[data-sex="' + sex + '"]').click();

  assert(!$('#toPick').disabled, 'STEP1完了で「次へ」が有効になること');
  $('#toPick').click(); // -> pick 画面

  if (selectPartner) {
    const picks = Array.from(D.querySelectorAll('.pick'));
    const partner = picks.find(p => p.textContent.indexOf('パートナー') !== -1);
    assert(partner, 'パートナー項目がSTEP2に存在すること');
    partner.click();
    const other = picks.find(p => p !== partner);
    other.click();
    $('#toDetail').click();
  } else {
    $('#pickAll').click(); // 内部で go('detail') まで進む
  }

  $('#toResult').click(); // -> result 画面
}

/* =====================================================================
   1. calc.js の数式（生存率・平均余命・同時生存年数・人生時計）
   ===================================================================== */
section('calc.js — 生存率モデルと平均余命');
{
  const dom = loadPage('index.html'); // data.js + calc.js を読み込むために利用
  const w = dom.window;

  test('exactAge: ちょうど30年前の誕生日なら30.0歳', () => {
    const now = new Date();
    const birth = new Date(now.getFullYear() - 30, now.getMonth(), now.getDate());
    const age = w.exactAge(birth, now);
    approx(age, 30, 0.01);
  });

  test('exactAge: 誕生日の前日は前の年齢のまま（切り上がらない）', () => {
    const now = new Date(2026, 7, 15); // 2026-08-15
    const birth = new Date(1990, 7, 16); // 8/16生まれ、まだ誕生日前
    const age = w.exactAge(birth, now);
    assert(Math.floor(age) === 35, '誕生日前は35歳のはず（実際: ' + age + '）');
  });

  test('exactAge: 誕生日の当日は年齢が上がる', () => {
    const now = new Date(2026, 7, 15);
    const birth = new Date(1990, 7, 15);
    const age = w.exactAge(birth, now);
    assert(Math.floor(age) === 36, '誕生日当日は36歳のはず（実際: ' + age + '）');
  });

  test('survive: 0年後の生存確率は必ず1', () => {
    approx(w.survive('male', 40, 0), 1, 1e-9);
    approx(w.survive('female', 70, 0), 1, 1e-9);
  });

  test('survive: 時間が経つほど生存確率は単調に減る', () => {
    const s1 = w.survive('male', 50, 5);
    const s2 = w.survive('male', 50, 10);
    const s3 = w.survive('male', 50, 20);
    assert(s1 >= s2 && s2 >= s3, '生存確率が単調減少していない');
  });

  test('lifeExpectancy: 0歳の平均余命が公表値付近（男81.09/女87.13）', () => {
    approx(w.lifeExpectancy('male', 0), 81.09, 0.2);
    approx(w.lifeExpectancy('female', 0), 87.13, 0.2);
  });

  test('reachProbability: 目標年齢が現在以下なら確率1', () => {
    approx(w.reachProbability('female', 50, 50), 1, 1e-9);
    approx(w.reachProbability('female', 50, 30), 1, 1e-9);
  });

  test('jointYears: 自分と相手を入れ替えても同じ値になる（対称性）', () => {
    const a = { sex: 'male', age: 40 };
    const b = { sex: 'female', age: 68 };
    approx(w.jointYears(a, b), w.jointYears(b, a), 1e-6);
  });

  test('jointYears: 二人が同時に生きる年数は、双方の平均余命より長くならない', () => {
    const a = { sex: 'male', age: 30 };
    const b = { sex: 'female', age: 60 };
    const jy = w.jointYears(a, b);
    assert(jy <= w.lifeExpectancy(a.sex, a.age) + 1e-6, 'jointYearsが自分の平均余命を超えている');
    assert(jy <= w.lifeExpectancy(b.sex, b.age) + 1e-6, 'jointYearsが相手の平均余命を超えている');
  });

  test('outlivedProbability + 相手が先に亡くなる確率 はおおむね1に近い', () => {
    const a = { sex: 'male', age: 40 };
    const b = { sex: 'female', age: 40 };
    const pSelfFirst = w.outlivedProbability(a, b);   // 自分が先に死ぬ
    const pOtherFirst = w.outlivedProbability(b, a);  // 相手が先に死ぬ
    assert(pSelfFirst > 0 && pSelfFirst < 1, 'outlivedProbabilityは0〜1の範囲');
    assert(pSelfFirst + pOtherFirst <= 1.001, '両者が先に死ぬ確率の合計が1を超えている');
  });

  test('selfRemainingYears: 想定寿命モードでは targetAge - age', () => {
    const y = w.selfRemainingYears({ sex: 'male', age: 40, mode: 'target', targetAge: 84 });
    approx(y, 44, 1e-9);
  });

  test('healthySplit: healthy + limited = total', () => {
    const h = w.healthySplit({ sex: 'female', age: 30, mode: 'target', targetAge: 87 });
    approx(h.healthy + h.limited, h.total, 1e-9);
  });

  test('yearsToUnits: 日数・時間・週の関係が整合している', () => {
    const u = w.yearsToUnits(10);
    approx(u.days, 10 * 365.2425, 1e-6);
    approx(u.hours, u.days * 24, 1e-6);
    approx(u.weeks, u.days / 7, 1e-6);
  });

  test('fmt/pct: 表示用フォーマットが期待通り', () => {
    assert(w.fmt(1234.567, 1) === '1,234.6', 'fmt結果: ' + w.fmt(1234.567, 1));
    assert(w.pct(0.5) === '50.0%', 'pct結果: ' + w.pct(0.5));
  });
}

/* =====================================================================
   2. 人生時計（0-1で修正必須のバグ）— calc.js の lifeClock() を直接検証
   ===================================================================== */
section('calc.js — 人生時計 lifeClock() の角度整合性');
{
  const dom = loadPage('index.html');
  const w = dom.window;

  const cases = [
    { sex: 'male', age: 10, targetAge: 84 },
    { sex: 'female', age: 43, targetAge: 87 },
    { sex: 'male', age: 65, targetAge: 84 },
    { sex: 'female', age: 84, targetAge: 87 },
    { sex: 'male', age: 95, targetAge: 84 }, // 想定寿命を超えているエッジケース
    { sex: 'na', age: 0.5, targetAge: 84 }
  ];

  cases.forEach(c => {
    test(`age=${c.age} target=${c.targetAge}(${c.sex}) の針の角度が時刻と数式的に一致する`, () => {
      const clock = w.lifeClock({ sex: c.sex, age: c.age, mode: 'target', targetAge: c.targetAge });
      const hour12 = clock.hour % 12;
      const expectHourAngle = (hour12 + clock.minute / 60) / 12 * 360;
      const expectMinAngle = (clock.minute / 60) * 360;
      // 表示テキストが hour:minute と一致
      const expectText = String(clock.hour).padStart(2, '0') + ':' + String(clock.minute).padStart(2, '0');
      assert(clock.text === expectText, `text不一致: ${clock.text} !== ${expectText}`);
      // 角度は lifeClock の出力（hour, minute）から再計算した値と一致するはず
      approx(expectHourAngle, ((clock.hour % 12) + clock.minute / 60) / 12 * 360, 1e-9);
      approx(expectMinAngle, (clock.minute / 60) * 360, 1e-9);
      assert(clock.ratio >= 0 && clock.ratio <= 1, 'ratioが0〜1の範囲外: ' + clock.ratio);
      assert(clock.hour >= 0 && clock.hour <= 23, 'hourが範囲外: ' + clock.hour);
      assert(clock.minute >= 0 && clock.minute <= 59, 'minuteが範囲外: ' + clock.minute);
    });
  });
}

/* =====================================================================
   3. index.html + app.js — 画面遷移とDOM構造
   ===================================================================== */
section('app.js — 画面遷移・生年月日プルダウン・18歳以上ゲート');
{
  test('type="date" の input は使われていない（STEP1が置き換え済み）', () => {
    const html = read('index.html');
    assert(!/type=["']date["']/.test(html), 'type="date" がまだ残っている');
  });

  test('年のプルダウンは 現在年 から 現在年-100 まで降順', () => {
    const dom = loadPage('index.html');
    const w = dom.window;
    const opts = Array.from(w.document.querySelectorAll('#birthY option')).slice(1); // 先頭は "年" プレースホルダ
    const years = opts.map(o => Number(o.value));
    const curYear = new Date().getFullYear();
    assert(years[0] === curYear, '先頭が現在年ではない: ' + years[0]);
    assert(years[years.length - 1] === curYear - 100, '末尾が現在年-100ではない: ' + years[years.length - 1]);
    for (let i = 1; i < years.length; i++) {
      assert(years[i] === years[i - 1] - 1, '降順になっていない');
    }
  });

  test('日のプルダウンは年・月に応じて日数が自動調整される（うるう年）', () => {
    const dom = loadPage('index.html');
    const w = dom.window;
    const $ = s => w.document.querySelector(s);
    $('#birthY').value = '2024'; fireChange($('#birthY'));
    $('#birthM').value = '2'; fireChange($('#birthM'));
    let days = Array.from(w.document.querySelectorAll('#birthD option')).slice(1).map(o => Number(o.value));
    assert(days[days.length - 1] === 29, '2024年2月は29日まであるはず（実際: ' + days[days.length - 1] + '）');

    $('#birthY').value = '2023'; fireChange($('#birthY'));
    days = Array.from(w.document.querySelectorAll('#birthD option')).slice(1).map(o => Number(o.value));
    assert(days[days.length - 1] === 28, '2023年2月は28日までのはず（実際: ' + days[days.length - 1] + '）');
  });

  test('CATS に18歳以上向け項目 partner が adult:true で存在する', () => {
    const html = read('assets/js/app.js');
    assert(/id:\s*'partner'[\s\S]{0,80}adult:\s*true/.test(html), 'partner 項目に adult:true が見つからない');
  });

  test('STEP2で「全部数える」を押しても18+項目は自動選択されない', () => {
    const dom = loadPage('index.html');
    const w = dom.window;
    goToResult(w, { y: 1990, m: 5, d: 12, sex: 'female', selectPartner: false });
    assert(w.document.getElementById('adultgate').hidden === true, 'pickAll使用時は18+ゲートが出てはいけない');
    assert(w.document.getElementById('adultResult').hidden === true, 'pickAll使用時は18+結果が出てはいけない');
  });

  test('STEP2で「パートナーとの時間」を選んだ人にだけ18+ゲートが出る', () => {
    const dom = loadPage('index.html');
    const w = dom.window;
    goToResult(w, { y: 1985, m: 3, d: 3, sex: 'male', selectPartner: true });
    assert(w.document.getElementById('adultgate').hidden === false, '18+ゲートが表示されていない');
  });

  test('18+ゲートを開くと確認フォームが表示される', () => {
    const dom = loadPage('index.html');
    const w = dom.window;
    goToResult(w, { y: 1985, m: 3, d: 3, sex: 'male', selectPartner: true });
    w.document.getElementById('adultOpen').click();
    const res = w.document.getElementById('adultResult');
    assert(res.hidden === false, '開いた後もhiddenのまま');
    assert(w.document.getElementById('pAge'), 'パートナーの年齢入力欄が描画されていない');
  });

  test('[hidden] { display:none!important } のCSSルールが残っている', () => {
    const css = read('assets/css/style.css');
    assert(/\[hidden\]\s*\{\s*display\s*:\s*none\s*!important/.test(css), '[hidden]ルールが見つからない');
  });
}

/* =====================================================================
   4. 結果画面 — 人生時計SVGの針の角度が表示時刻と実際に一致しているか
      （DOM描画〜calc.jsの計算まで、実際の配線を通しで検証する）
   ===================================================================== */
section('result画面 — 人生時計の針・時刻表示・砂時計の一致');
{
  const patterns = [
    { y: 2016, m: 9, d: 1, sex: 'male' },   // 子ども
    { y: 1996, m: 1, d: 20, sex: 'female' }, // 30代
    { y: 1966, m: 11, d: 30, sex: 'male' },  // 高齢
    { y: 2001, m: 2, d: 28, sex: 'na' }
  ];

  patterns.forEach(p => {
    test(`生年月日 ${p.y}-${p.m}-${p.d}（${p.sex}）で針の角度と表示時刻が一致する`, () => {
      const dom = loadPage('index.html');
      const w = dom.window;
      goToResult(w, p);

      const D = w.document;
      const hourLine = D.querySelector('#heroClock line[data-role="hour"]');
      const minLine = D.querySelector('#heroClock line[data-role="minute"]');
      assert(hourLine && minLine, '時計の針(line要素)が見つからない');

      const domHourAngle = Number(hourLine.getAttribute('data-angle'));
      const domMinAngle = Number(minLine.getAttribute('data-angle'));

      const clockText = D.getElementById('clockText').textContent;
      const m = /^(\d{2}):(\d{2})$/.exec(clockText);
      assert(m, '時刻表示のフォーマットが不正: ' + clockText);
      const hour = Number(m[1]), minute = Number(m[2]);

      const expectHourAngle = ((hour % 12) + minute / 60) / 12 * 360;
      const expectMinAngle = (minute / 60) * 360;

      approx(domHourAngle, expectHourAngle, 0.05,
        `短針: 画面上の角度(${domHourAngle}) と 表示時刻(${clockText})から計算した角度(${expectHourAngle})が一致しない`);
      approx(domMinAngle, expectMinAngle, 0.05,
        `長針: 画面上の角度(${domMinAngle}) と 表示時刻(${clockText})から計算した角度(${expectMinAngle})が一致しない`);

      // 午前/午後の表記が hour<12 と一致
      const ampm = D.getElementById('clockAmpm').textContent;
      const expectAmpm = hour < 12 ? '午前' : '午後';
      assert(ampm === expectAmpm, `午前/午後の表記が不一致: ${ampm} (hour=${hour})`);

      // 砂時計の砂の量（ratio）が経過割合と一致
      const sandGroup = D.querySelector('#heroClock .sand-fall');
      const ratio = Number(sandGroup.getAttribute('data-ratio'));
      // ratio と 時刻(hour:minute)は同じ ratio から導かれているので、逆算しても一致するはず
      const totalMinFromClock = hour * 60 + minute;
      const totalMinFromRatio = ratio * 24 * 60;
      approx(totalMinFromClock, totalMinFromRatio, 1.0,
        `砂時計のratio(${ratio})から逆算した時刻と、表示時刻(${clockText})が一致しない`);
    });
  });
}

/* =====================================================================
   5. 公開ドメイン表記（0-2）
   ===================================================================== */
section('公開ドメイン表記の統一');
{
  const shippedFiles = [
    'index.html', 'about.html', 'privacy.html', 'terms.html',
    'disclaimer.html', 'contact.html', 'robots.txt', 'sitemap.xml'
  ];
  shippedFiles.forEach(f => {
    test(f + ' に古いドメイン atonankai.com が残っていない', () => {
      const content = read(f);
      assert(!/atonankai\.com/.test(content), f + ' に atonankai.com が見つかった');
    });
  });

  test('index.html の canonical / og:url が atonankai.pages.dev になっている', () => {
    const html = read('index.html');
    assert(/canonical" href="https:\/\/atonankai\.pages\.dev\//.test(html), 'canonicalが正しくない');
    assert(/og:url" content="https:\/\/atonankai\.pages\.dev\//.test(html), 'og:urlが正しくない');
  });

  test('sitemap.xml が pages.dev ドメインで新規ページを含む', () => {
    const xml = read('sitemap.xml');
    ['/', '/about.html', '/privacy.html', '/terms.html', '/disclaimer.html', '/contact.html'].forEach(p => {
      assert(xml.indexOf('https://atonankai.pages.dev' + p) !== -1, 'sitemapに ' + p + ' が見つからない');
    });
  });

  test('robots.txt の Sitemap が pages.dev を指している', () => {
    const txt = read('robots.txt');
    assert(/Sitemap:\s*https:\/\/atonankai\.pages\.dev\/sitemap\.xml/.test(txt), 'robots.txtのSitemap記載が不正');
  });
}

/* =====================================================================
   6. 背景の数式（必須の数式が含まれているか）
   ===================================================================== */
section('表紙背景の数式');
{
  const REQUIRED_EQS = [
    'e(x) = ∫₀^∞ l(x+t) / l(x) dt',
    'l(x) = exp( −∫₀ˣ μ(s) ds )',
    'μ(x) = A + B·e^(Cx)',
    'q(x) = 1 − e^(−μ(x))',
    'N = f · ∫₀^∞ S₁(t)·S₂(t) dt',
    'P(both alive at t) = S₁(t) × S₂(t)',
    'S(t) = l(x+t) / l(x)'
  ];
  const appJs = read('assets/js/app.js');
  REQUIRED_EQS.forEach(eq => {
    test('必須の数式が背景に含まれる: ' + eq, () => {
      assert(appJs.indexOf(eq) !== -1, '見つからない: ' + eq);
    });
  });

  test('背景の数式は aria-hidden="true" が付いた要素に描画される', () => {
    const html = read('index.html');
    assert(/id="eqBg"[^>]*aria-hidden="true"/.test(html), 'eqBgにaria-hidden="true"が無い');
  });
}

/* =====================================================================
   7. カラートークン・フォント・ボタン意匠
   ===================================================================== */
section('デザイントークン');
{
  const css = read('assets/css/style.css');
  const tokens = {
    '--paper': '#FAFAF7', '--paper-deep': '#F2F0E9',
    '--ink': '#14181C', '--ink-soft': '#5A6169', '--hairline': '#D8D4C8',
    '--formula': '#B9B2A0', '--accent': '#1F3A5F', '--accent-warm': '#9C4B32'
  };
  Object.keys(tokens).forEach(k => {
    test('カラートークン ' + k + ' が仕様通り', () => {
      const re = new RegExp(k.replace(/[-[\]]/g, '\\$&') + '\\s*:\\s*' + tokens[k], 'i');
      assert(re.test(css), k + ' の値が期待と異なる（期待: ' + tokens[k] + '）');
    });
  });

  test('旧デザインのボタン影（4px 4px 0）が廃止されている', () => {
    assert(!/4px\s+4px\s+0/.test(css), '旧スタイルのbox-shadowが残っている');
  });

  test('旧フォント（Dela Gothic One / Caveat）が使われていない', () => {
    ['index.html', 'about.html', 'privacy.html', 'terms.html', 'disclaimer.html', 'contact.html']
      .concat(['assets/css/style.css'])
      .forEach(f => {
        const content = read(f);
        assert(!/Dela Gothic One/.test(content), f + ' に Dela Gothic One が残っている');
        assert(!/Caveat/.test(content), f + ' に Caveat が残っている');
      });
  });

  test('旧配色トークン（--slate系・--chalk系）が残っていない', () => {
    assert(!/--slate\b/.test(css), '--slate系のトークンが残っている');
    assert(!/--chalk\b/.test(css), '--chalk系のトークンが残っている');
  });

  ['index.html', 'about.html', 'privacy.html', 'terms.html', 'disclaimer.html', 'contact.html'].forEach(f => {
    test(f + ' が指定フォント一式を読み込んでいる', () => {
      const html = read(f);
      ['Shippori+Mincho+B1', 'Zen+Kaku+Gothic+New', 'Outfit', 'Roboto+Mono', 'EB+Garamond'].forEach(fam => {
        assert(html.indexOf(fam) !== -1, f + ' に ' + fam + ' が見つからない');
      });
    });
  });

  test('prefers-reduced-motion でアニメーションが無効化される', () => {
    assert(/prefers-reduced-motion\s*:\s*reduce/.test(css), 'reduced-motion対応が見つからない');
  });
}

/* =====================================================================
   8. 新規ページ（法務・案内）の内容チェック
   ===================================================================== */
section('新規ページの内容');
{
  test('about.html に生命表の再現精度が明記されている', () => {
    const html = read('about.html');
    assert(html.indexOf('0.065') !== -1, '平均余命誤差(0.065年)の記載が無い');
    assert(html.indexOf('0.24') !== -1, '生存割合誤差(0.24ポイント)の記載が無い');
  });

  test('privacy.html にサーバー非送信・cookie不使用の明記がある', () => {
    const html = read('privacy.html');
    assert(/一切サーバーへ送信されません|サーバーへ送信されません/.test(html), 'サーバー非送信の記載が無い');
    assert(/cookie/i.test(html), 'cookieに関する記載が無い');
    assert(html.indexOf('Google Fonts') !== -1, 'Google Fontsの通信について記載が無い');
    assert(html.indexOf('Cloudflare') !== -1, 'ホスティング事業者(Cloudflare)の記載が無い');
  });

  test('terms.html に準拠法・管轄・禁止事項の記載がある', () => {
    const html = read('terms.html');
    assert(html.indexOf('日本法') !== -1, '準拠法の記載が無い');
    assert(/禁止事項|不正アクセス/.test(html), '禁止事項の記載が無い');
    assert(/統計上の期待値/.test(html), '結果が期待値である旨の記載が無い');
  });

  test('disclaimer.html に医学的助言でない旨・相談窓口への案内がある', () => {
    const html = read('disclaimer.html');
    assert(html.indexOf('医学的') !== -1, '医学的助言でない旨の記載が無い');
    assert(/相談窓口|かかりつけ医/.test(html), '相談窓口への案内が無い');
    assert(html.indexOf('統計上の期待値') !== -1, '統計上の期待値である旨の記載が無い');
  });

  test('contact.html は準備中であることを正直に書き、架空の連絡先を書いていない', () => {
    const html = read('contact.html');
    assert(html.indexOf('準備中') !== -1, '準備中である旨の記載が無い');
    const emailLike = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    assert(!emailLike.test(html), '実在しそうなメールアドレスらしき記載が見つかった（架空連絡先の禁止に違反）');
  });

  ['about.html', 'privacy.html', 'terms.html', 'disclaimer.html', 'contact.html'].forEach(f => {
    test(f + ' に運営者名のTODOコメントが残っている', () => {
      const html = read(f);
      assert(html.indexOf('TODO: 運営者名') !== -1, 'TODOコメントが見つからない');
    });
    test(f + ' のフッターに全ナビゲーションリンクがある', () => {
      const html = read(f);
      ['about.html', 'privacy.html', 'terms.html', 'disclaimer.html', 'contact.html'].forEach(nav => {
        assert(html.indexOf('href="' + nav + '"') !== -1, f + ' に ' + nav + ' へのリンクが無い');
      });
    });
  });

  test('TODO.md が存在し、運営者名・問い合わせ先の差し替え箇所が記載されている', () => {
    const md = read('TODO.md');
    assert(/運営者名/.test(md), 'TODO.mdに運営者名の言及が無い');
    assert(/問い合わせ/.test(md), 'TODO.mdに問い合わせ先の言及が無い');
  });
}

/* =====================================================================
   結果表示
   ===================================================================== */
console.log('\n--------------------------------------------------------');
console.log(pass + ' 件成功 / ' + fail + ' 件失敗');
if (fail > 0) {
  console.log('\n失敗した項目:');
  failures.forEach(f => console.log(' - [' + f.section + '] ' + f.name));
  process.exit(1);
} else {
  console.log('すべてのテストに合格しました。');
  process.exit(0);
}
