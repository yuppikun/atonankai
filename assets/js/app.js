/* =====================================================================
   あと何回。 — 画面制御
   ===================================================================== */
(function () {
'use strict';

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- 状態 ---------- */

const S = {
  birth: null, sex: null, targetAge: 84, age: 0,
  picked: new Set(),
  a: {                       // 回答
    sleep: null, meal: null, phone: null, media: null,
    parents: [], children: [], dears: [], pets: [],
    partner: null
  },
  adultOpen: false
};

const self = () => ({ sex: S.sex || 'na', age: S.age, mode: 'target', targetAge: S.targetAge });

/* ---------- 会う頻度の選択肢 ---------- */

const FREQ = [
  { v: 0.5,  t: '2年に1回' },
  { v: 1,    t: '年1回' },
  { v: 2,    t: '年2回' },
  { v: 3,    t: '年3回' },
  { v: 4,    t: '年4回' },
  { v: 6,    t: '2か月に1回' },
  { v: 12,   t: '月1回' },
  { v: 24,   t: '月2回' },
  { v: 52,   t: '週1回' },
  { v: 104,  t: '週2回' },
  { v: 365,  t: 'ほぼ毎日' }
];
const freqOptions = sel => FREQ.map(f =>
  `<option value="${f.v}"${f.v === sel ? ' selected' : ''}>${f.t}</option>`).join('');
const freqLabel = v => (FREQ.find(f => f.v === Number(v)) || { t: '' }).t;

/* ---------- 診断項目 ---------- */

const CATS = [
  { id: 'time',    t: '残された時間',        d: '日・時間・週末・季節に換算します' },
  { id: 'healthy', t: '元気に動ける時間',    d: '健康寿命との差を出します' },
  { id: 'sleep',   t: '眠りの残り回数',      d: '人生の何割を眠って過ごすか' },
  { id: 'meal',    t: '食事の残り回数',      d: 'あと何食できるか' },
  { id: 'parent',  t: '親に会える回数',      d: '二人が同時に生きている確率で計算' },
  { id: 'child',   t: '子どもと過ごす時間',  d: '巣立つまでに残された日数' },
  { id: 'dear',    t: '大切な人に会える回数', d: '友人・祖父母など自由に追加できます' },
  { id: 'pet',     t: 'ペットと過ごす時間',  d: '犬・猫の平均寿命から計算' },
  { id: 'phone',   t: 'スマホを置いたら',    d: '減らすと戻ってくる時間' },
  { id: 'media',   t: '動画・テレビ',        d: '同じく、取り戻せる時間' },
  { id: 'sakura',  t: '桜を見られる回数',    d: '年に一度しかない景色' }
];

/* ---------- 画面遷移 ---------- */

const SCREENS = ['basic', 'pick', 'detail', 'result'];

function go(name) {
  $('#cover').hidden = (name !== 'cover');
  SCREENS.forEach(s => { $('#screen-' + s).hidden = (s !== name); });
  if (name === 'pick') renderPicks();
  if (name === 'detail') renderQuestions();
  if (name === 'result') renderResult();
  window.scrollTo({ top: 0, behavior: 'auto' });
}

$$('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));

/* ---------- STEP1 基本 ---------- */

const birthEl  = $('#birth');
const targetEl = $('#target');

birthEl.max = new Date().toISOString().slice(0, 10);

function syncBasic() {
  const ok = !!S.birth && !!S.sex;
  $('#toPick').disabled = !ok;

  if (S.birth) {
    S.age = exactAge(S.birth);
    $('#ageHint').textContent = '今日で ' + Math.floor(S.age) + '歳 ' +
      Math.floor((S.age % 1) * 12) + 'か月です。';
  }
  if (S.sex && S.birth) {
    const p = reachProbability(S.sex, S.age, S.targetAge);
    const e = lifeExpectancy(S.sex, S.age);
    $('#reachNote').innerHTML =
      'いまのあなたが ' + S.targetAge + '歳まで生きる確率は、生命表のうえで <b>' + pct(p) + '</b>。<br>' +
      '統計どおりなら、平均であと <b>' + fmt(e, 1) + '年</b>です。';
  } else if (S.sex === null && S.birth) {
    $('#reachNote').textContent = '性別を選ぶと、到達確率も表示されます。';
  }
}

birthEl.addEventListener('change', () => {
  if (!birthEl.value) { S.birth = null; return syncBasic(); }
  const d = new Date(birthEl.value + 'T00:00:00');
  if (isNaN(d) || d > new Date()) { S.birth = null; return syncBasic(); }
  S.birth = d;
  syncBasic();
});

$$('[data-sex]').forEach(b => b.addEventListener('click', () => {
  $$('[data-sex]').forEach(x => x.setAttribute('aria-pressed', 'false'));
  b.setAttribute('aria-pressed', 'true');
  S.sex = b.dataset.sex;
  S.targetAge = Math.round(LIFE_EXPECTANCY[S.sex]);
  targetEl.value = S.targetAge;
  $('#targetVal').textContent = S.targetAge;
  syncBasic();
}));

targetEl.addEventListener('input', () => {
  S.targetAge = Number(targetEl.value);
  $('#targetVal').textContent = S.targetAge;
  syncBasic();
});

/* ---------- STEP2 項目選択 ---------- */

function renderPicks() {
  const box = $('#picks');
  box.innerHTML = '';
  CATS.forEach(c => {
    const b = el('button', 'pick');
    b.type = 'button';
    b.setAttribute('aria-pressed', S.picked.has(c.id) ? 'true' : 'false');
    b.innerHTML = '<span class="pick__mark" aria-hidden="true">✓</span>' +
      '<span><span class="pick__t">' + c.t + '</span>' +
      '<span class="pick__d">' + c.d + '</span></span>';
    b.addEventListener('click', () => {
      if (S.picked.has(c.id)) S.picked.delete(c.id); else S.picked.add(c.id);
      b.setAttribute('aria-pressed', S.picked.has(c.id) ? 'true' : 'false');
      $('#toDetail').disabled = S.picked.size === 0;
    });
    box.appendChild(b);
  });
  $('#toDetail').disabled = S.picked.size === 0;
}

$('#pickAll').addEventListener('click', () => {
  CATS.forEach(c => S.picked.add(c.id));
  renderPicks();
  go('detail');
});

/* ---------- STEP3 質問 ---------- */

function group(title) {
  const g = el('div', 'qgroup');
  g.appendChild(el('h3', 'qgroup__h', title));
  return g;
}

function numQ(label, hint, unit, val, min, max, step, onInput) {
  const q = el('div', 'q');
  q.appendChild(el('label', 'q__l', label));
  if (hint) q.appendChild(el('p', 'q__h', hint));
  const row = el('div', 'q__row');
  const i = el('input', 'input');
  i.type = 'number'; i.inputMode = 'decimal';
  i.min = min; i.max = max; i.step = step;
  if (val != null) i.value = val;
  i.addEventListener('input', () => onInput(i.value === '' ? null : Number(i.value)));
  row.appendChild(i);
  row.appendChild(el('span', 'q__unit', unit));
  q.appendChild(row);
  return q;
}

function personRow(p, opts, onChange, onDelete) {
  const box = el('div', 'person');
  const grid = el('div', 'person__grid');

  if (opts.label) {
    const lab = el('input', 'input');
    lab.type = 'text'; lab.placeholder = opts.labelPh || '呼び名（例：親友）';
    lab.value = p.label || '';
    lab.addEventListener('input', () => { p.label = lab.value; onChange(); });
    grid.appendChild(lab);
  }

  const age = el('input', 'input');
  age.type = 'number'; age.inputMode = 'numeric';
  age.min = 0; age.max = 110; age.placeholder = opts.agePh || '年齢';
  if (p.age != null) age.value = p.age;
  age.addEventListener('input', () => {
    p.age = age.value === '' ? null : Number(age.value); onChange();
  });
  grid.appendChild(age);

  if (opts.sex) {
    const sx = el('select', 'select');
    sx.innerHTML = '<option value="female">女性</option><option value="male">男性</option><option value="na">答えない</option>';
    sx.value = p.sex || 'female';
    sx.addEventListener('change', () => { p.sex = sx.value; onChange(); });
    grid.appendChild(sx);
  }
  box.appendChild(grid);

  const row = el('div', 'q__row');
  if (opts.freq) {
    const f = el('select', 'select');
    f.innerHTML = freqOptions(p.freq || 3);
    f.addEventListener('change', () => { p.freq = Number(f.value); onChange(); });
    row.appendChild(f);
  }
  if (opts.leave) {
    const lv = el('select', 'select');
    lv.innerHTML = [15, 18, 20, 22, 25, 30].map(v =>
      `<option value="${v}"${v === (p.leave || 18) ? ' selected' : ''}>${v}歳で巣立つ</option>`).join('');
    lv.addEventListener('change', () => { p.leave = Number(lv.value); onChange(); });
    row.appendChild(lv);
  }
  if (opts.kind) {
    const k = el('select', 'select');
    k.innerHTML = '<option value="dog">犬</option><option value="cat">猫</option>';
    k.value = p.kind || 'dog';
    k.addEventListener('change', () => { p.kind = k.value; onChange(); });
    row.appendChild(k);
  }
  if (onDelete) {
    const d = el('button', 'q__del', '×');
    d.type = 'button'; d.setAttribute('aria-label', '削除');
    d.addEventListener('click', onDelete);
    row.appendChild(d);
  }
  if (row.children.length) box.appendChild(row);
  return box;
}

function listQ(g, label, hint, arr, opts, addLabel, factory) {
  const q = el('div', 'q');
  q.appendChild(el('label', 'q__l', label));
  if (hint) q.appendChild(el('p', 'q__h', hint));
  const host = el('div');
  const draw = () => {
    host.innerHTML = '';
    arr.forEach((p, i) => host.appendChild(
      personRow(p, opts, () => {}, () => { arr.splice(i, 1); draw(); })));
    const add = el('button', 'q__add', '＋ ' + addLabel);
    add.type = 'button';
    add.addEventListener('click', () => { arr.push(factory()); draw(); });
    host.appendChild(add);
  };
  draw();
  q.appendChild(host);
  g.appendChild(q);
}

function renderQuestions() {
  const box = $('#questions');
  box.innerHTML = '';
  const P = S.picked;

  if (P.has('sleep') || P.has('meal') || P.has('phone') || P.has('media')) {
    const g = group('毎日のこと');
    if (P.has('sleep')) g.appendChild(numQ('1日の睡眠時間',
      '全国平均は7時間54分です（社会生活基本調査）。空欄なら平均で計算します。',
      '時間', S.a.sleep, 0, 16, 0.5, v => S.a.sleep = v));
    if (P.has('meal')) g.appendChild(numQ('1日の食事回数', '間食は数えなくて構いません。',
      '回', S.a.meal, 1, 8, 1, v => S.a.meal = v));
    if (P.has('phone')) g.appendChild(numQ('1日にスマホを見る時間',
      'スマホの「スクリーンタイム」で確認できます。',
      '時間', S.a.phone, 0, 18, 0.5, v => S.a.phone = v));
    if (P.has('media')) g.appendChild(numQ('1日に動画・テレビを見る時間',
      '全国平均は2時間8分です。', '時間', S.a.media, 0, 18, 0.5, v => S.a.media = v));
    box.appendChild(g);
  }

  if (P.has('parent')) {
    const g = group('親のこと');
    if (!S.a.parents.length) {
      S.a.parents = [
        { label: '母', age: null, sex: 'female', freq: 3 },
        { label: '父', age: null, sex: 'male', freq: 3 }
      ];
    }
    listQ(g, '親の年齢と、会う頻度',
      '年齢を入れた人だけ計算します。すでに亡くなっている場合は空欄のままで。',
      S.a.parents, { label: true, labelPh: '続柄（母・父など）', sex: true, freq: true },
      '親を追加', () => ({ label: '', age: null, sex: 'female', freq: 3 }));
    box.appendChild(g);
  }

  if (P.has('child')) {
    const g = group('子どものこと');
    listQ(g, '子どもの年齢',
      '同じ家で暮らせる期間を計算します。すでに独立している場合は「大切な人」に入れてください。',
      S.a.children, { label: true, labelPh: '呼び名（長男など）', leave: true },
      '子どもを追加', () => ({ label: '', age: null, leave: 18 }));
    box.appendChild(g);
  }

  if (P.has('dear')) {
    const g = group('大切な人のこと');
    listQ(g, '会える回数を知りたい人',
      '友人、祖父母、恩師、離れて暮らす家族。誰でも追加できます。',
      S.a.dears, { label: true, sex: true, freq: true },
      '人を追加', () => ({ label: '', age: null, sex: 'female', freq: 4 }));
    box.appendChild(g);
  }

  if (P.has('pet')) {
    const g = group('ペットのこと');
    listQ(g, 'ペットの種類と年齢', '犬・猫の平均寿命から、一緒にいられる時間を出します。',
      S.a.pets, { label: true, labelPh: '名前', kind: true },
      'ペットを追加', () => ({ label: '', age: null, kind: 'dog' }));
    box.appendChild(g);
  }

  if (!box.children.length) {
    box.appendChild(el('p', 'lead', '追加の質問はありません。そのまま結果へ進んでください。'));
  }
}

$('#toResult').addEventListener('click', () => go('result'));

/* ---------- 人生時計 SVG ---------- */

function clockSVG(ratio, size) {
  const R = 100, cx = 120, cy = 120;
  const a = ratio * Math.PI * 2 - Math.PI / 2;
  const large = ratio > 0.5 ? 1 : 0;
  const ex = cx + R * Math.cos(a), ey = cy + R * Math.sin(a);
  let ticks = '';
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const r1 = i % 6 === 0 ? 78 : 88;
    ticks += `<line x1="${(cx + r1 * Math.cos(t)).toFixed(1)}" y1="${(cy + r1 * Math.sin(t)).toFixed(1)}" x2="${(cx + 96 * Math.cos(t)).toFixed(1)}" y2="${(cy + 96 * Math.sin(t)).toFixed(1)}" stroke="#4A5590" stroke-width="${i % 6 === 0 ? 3 : 1.5}"/>`;
  }
  return `<svg viewBox="0 0 240 240" role="img" aria-label="人生の進み具合">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#2C3670" stroke-width="14"/>
    <path d="M ${cx} ${cy - R} A ${R} ${R} 0 ${large} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}"
          fill="none" stroke="#FF5B2E" stroke-width="14" stroke-linecap="round"/>
    ${ticks}
    <line x1="${cx}" y1="${cy}" x2="${(cx + 66 * Math.cos(a)).toFixed(1)}" y2="${(cy + 66 * Math.sin(a)).toFixed(1)}"
          stroke="#FFCF3F" stroke-width="6" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="9" fill="#FFCF3F"/>
  </svg>`;
}

/* 表紙の飾り時計 */
$('#coverClock').innerHTML = clockSVG(0.42);

/* ---------- 週末ドット ---------- */

function drawDots(host, spent, left) {
  host.innerHTML = '';
  const total = spent + left;
  let scale = 1;
  while ((total / scale) > 3600) scale++;
  const nSpent = Math.round(spent / scale), nLeft = Math.round(left / scale);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < nSpent; i++) frag.appendChild(el('span', 'dot dot--spent'));
  for (let i = 0; i < nLeft; i++) frag.appendChild(el('span', 'dot'));
  host.appendChild(frag);
  return scale;
}

/* ---------- 結果 ---------- */

const srcTag = k => `<p class="card__src">出典：<a href="${SOURCES[k].url}" target="_blank" rel="noopener">${SOURCES[k].label}</a></p>`;

function card(cls, label, title, numHTML, subHTML, rows, src) {
  const c = el('div', 'card ' + (cls || ''));
  let h = '<p class="card__label">' + label + '</p><h3 class="card__t">' + title + '</h3>';
  if (numHTML) h += '<p class="card__num">' + numHTML + '</p>';
  if (subHTML) h += '<p class="card__sub">' + subHTML + '</p>';
  if (rows && rows.length) {
    h += '<ul class="card__rows">' + rows.map(r =>
      '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>').join('') + '</ul>';
  }
  if (src) h += srcTag(src);
  c.innerHTML = h;
  return c;
}

const bigNum = (n, unit) => '<b>' + n + '</b><span>' + unit + '</span>';

function renderResult() {
  const me = self();
  const rem = selfRemainingYears(me);
  const u = yearsToUnits(rem);
  const clock = lifeClock(me);

  /* ヒーロー：人生の時刻 */
  $('#heroClock').innerHTML = clockSVG(clock.ratio);
  $('#clockText').textContent = clock.text;
  $('#clockSub').innerHTML =
    S.targetAge + '歳までの人生を、1日24時間に縮めたときの現在地です。<br>' +
    '夜が明けてから <b>' + fmt(clock.ratio * 100, 1) + '%</b> が過ぎました。';

  /* 見出し：残された週末 */
  const spentWeekends = S.age * WEEKS_PER_YEAR;
  const leftWeekends = u.weekends;
  $('#weekendNum').textContent = fmt(leftWeekends);
  const scale = drawDots($('#weekendDots'), spentWeekends, leftWeekends);
  $('#weekendNote').innerHTML =
    (scale === 1 ? '点のひとつが、1回の週末です。' : '点のひとつが、' + scale + '回の週末です。') +
    '濃い点は、もう過ぎたぶん。';

  /* カード群 */
  const box = $('#cards');
  box.innerHTML = '';
  const P = S.picked;

  if (P.has('time')) {
    box.appendChild(card('card--yellow card--wide', 'REMAINING', '残された時間のすべて',
      bigNum(fmt(u.days), '日'),
      '<b>' + fmt(u.hours) + '</b> 時間。眠っている時間も、すべて含めた総量です。',
      [['年', fmt(rem, 1) + ' 年'], ['か月', fmt(u.months) + ' か月'],
       ['週', fmt(u.weeks) + ' 週'], ['季節の移り変わり', fmt(u.seasons) + ' 回']], 'life'));
  }

  if (P.has('healthy')) {
    const h = healthySplit(me);
    box.appendChild(card('card--green card--wide', 'HEALTHY LIFE', '自分の足で動ける時間',
      bigNum(fmt(h.healthy * YEAR_DAYS), '日'),
      '健康寿命は' + (S.sex === 'female' ? '女性で75.45歳' : S.sex === 'male' ? '男性で72.57歳' : '男女平均で74.01歳') +
      '。旅にも山にも行けるのは <b>' + fmt(h.healthy, 1) + '年</b>、残りの <b>' + fmt(h.limited, 1) +
      '年</b>は日常生活に何らかの制限が出る期間として推計されています。',
      [['元気に動ける期間', fmt(h.healthy, 1) + ' 年'],
       ['制限が出る期間', fmt(h.limited, 1) + ' 年'],
       ['残り時間に占める割合', pct(h.healthy / h.total)]], 'healthy'));
  }

  if (P.has('sleep')) {
    const hrs = S.a.sleep != null ? S.a.sleep : AVG_TIME.sleep / 60;
    const nights = u.days;
    const sleepYears = rem * (hrs / 24);
    box.appendChild(card('', 'SLEEP', 'これから眠る回数',
      bigNum(fmt(nights), '回'),
      'そのうち <b>' + fmt(sleepYears, 1) + '年分</b>を眠って過ごします。目を開けている残り時間は <b>' +
      fmt((rem - sleepYears) * YEAR_DAYS) + '日</b>ぶんです。',
      [['1日あたり', fmt(hrs, 1) + ' 時間'],
       ['生涯の睡眠時間', fmt(sleepYears * YEAR_DAYS * 24) + ' 時間'],
       ['起きている残り時間', fmt((rem - sleepYears) * YEAR_DAYS * 24) + ' 時間']], 'time'));
  }

  if (P.has('meal')) {
    const n = S.a.meal != null ? S.a.meal : 3;
    box.appendChild(card('', 'MEALS', 'あと何回、食べられるか',
      bigNum(fmt(u.days * n), '食'),
      '好きなものを食べられる回数にも、上限があります。1年でいえば <b>' + fmt(365 * n) + '食</b>。',
      [['1日あたり', n + ' 食'], ['1年あたり', fmt(365 * n) + ' 食']], 'life'));
  }

  /* 親 */
  const parents = S.a.parents.filter(p => p.age != null && p.age >= 0);
  if (P.has('parent') && parents.length) {
    parents.forEach(p => {
      const other = { sex: p.sex || 'female', age: p.age };
      const jy = jointYears(me, other);
      const meet = jy * p.freq;
      const naive = naiveYears(other) * p.freq;
      const out = outlivedProbability(me, other);
      box.appendChild(card('card--pink card--wide', 'FAMILY',
        (esc(p.label) || '親') + 'に会えるのは、あと',
        bigNum(fmt(meet), '回'),
        '<b>' + freqLabel(p.freq) + '</b>のペースなら、この数字です。' +
        '相手の平均余命だけで数えると' + fmt(naive) + '回ですが、' +
        'あなた自身が先に亡くなる可能性（<b>' + pct(out) + '</b>）も差し引いています。',
        [['二人が同時に生きている期間', fmt(jy, 1) + ' 年'],
         [(esc(p.label) || '親') + 'の平均余命', fmt(lifeExpectancy(other.sex, other.age), 1) + ' 年'],
         ['一緒に過ごせる日数（会う日のみ）', fmt(meet) + ' 日']], 'life'));
    });
  }

  /* 子ども */
  const kids = S.a.children.filter(c => c.age != null && c.age >= 0);
  if (P.has('child') && kids.length) {
    kids.forEach(c => {
      const leave = c.leave || 18;
      const yrs = leave - c.age;
      if (yrs <= 0) {
        box.appendChild(card('card--green card--wide', 'CHILD',
          (esc(c.label) || 'この子') + 'は、もう巣立ちの年齢です',
          null,
          '同じ家で数える時間は、ここまででした。' +
          '「大切な人」に追加すると、これから会える回数を計算できます。'));
        return;
      }
      const pAlive = survive(me.sex, me.age, yrs);
      box.appendChild(card('card--green card--wide', 'CHILD',
        (esc(c.label) || '子ども') + 'と同じ家で過ごせるのは、あと',
        bigNum(fmt(yrs * YEAR_DAYS), '日'),
        '<b>' + fmt(yrs, 1) + '年</b>後に' + leave + '歳。' +
        '毎日顔を合わせられるのは、そこまでです。夏休みでいえば、あと <b>' + Math.max(0, Math.floor(yrs)) + '回</b>。',
        [['一緒に暮らせる年数', fmt(yrs, 1) + ' 年'],
         ['残りの誕生日', Math.max(0, Math.ceil(yrs)) + ' 回'],
         ['あなたがその日を迎える確率', pct(pAlive)]], 'life'));
    });
  }

  /* 大切な人 */
  const dears = S.a.dears.filter(d => d.age != null && d.age >= 0);
  if (P.has('dear') && dears.length) {
    dears.forEach(d => {
      const other = { sex: d.sex || 'female', age: d.age };
      const jy = jointYears(me, other);
      box.appendChild(card('card--wide', 'DEAR',
        (esc(d.label) || 'この人') + 'に会えるのは、あと',
        bigNum(fmt(jy * d.freq), '回'),
        '<b>' + freqLabel(d.freq) + '</b>会うとして。二人が同時に生きている期間は <b>' +
        fmt(jy, 1) + '年</b>と見積もられます。',
        [['同時に生きている期間', fmt(jy, 1) + ' 年'],
         ['あなたが先に逝く確率', pct(outlivedProbability(me, other))]], 'life'));
    });
  }

  /* ペット */
  const pets = S.a.pets.filter(p => p.age != null && p.age >= 0);
  if (P.has('pet') && pets.length) {
    pets.forEach(p => {
      const span = PET_LIFESPAN[p.kind || 'dog'];
      const yrs = span - p.age;
      if (yrs <= 0) {
        box.appendChild(card('card--yellow card--wide', 'PET',
          (esc(p.label) || 'この子') + 'は、もう平均寿命を越えています',
          null,
          (p.kind === 'cat' ? '猫' : '犬') + 'の平均寿命は' + span + '歳。' +
          'ここから先は、統計の外側にある時間です。1日ずつ、数えてください。'));
        return;
      }
      box.appendChild(card('card--yellow card--wide', 'PET',
        (esc(p.label) || 'この子') + 'と一緒にいられるのは、あと',
        bigNum(fmt(yrs * YEAR_DAYS), '日'),
        (p.kind === 'cat' ? '猫' : '犬') + 'の平均寿命は <b>' + span + '歳</b>。' +
        '散歩や膝の上の時間は、あと <b>' + fmt(yrs, 1) + '年</b>ぶんです。',
        [['残りの年数', fmt(yrs, 1) + ' 年'],
         ['残りの季節', fmt(yrs * 4) + ' 回']], 'pet'));
    });
  }

  /* スマホ・動画（減らすと戻る時間として提示） */
  if (P.has('phone') && S.a.phone != null) {
    const back = rem * (0.5 / 24);
    box.appendChild(card('', 'SCREEN', 'スマホを30分置いたら',
      bigNum('+' + fmt(back * YEAR_DAYS), '日'),
      '1日に <b>' + fmt(S.a.phone, 1) + '時間</b>。そのうち30分を手放すだけで、' +
      'まるごと <b>' + fmt(back * YEAR_DAYS) + '日</b>が戻ってきます。',
      [['今のペースでの生涯合計', fmt(rem * (S.a.phone / 24) * YEAR_DAYS) + ' 日'],
       ['1日1時間減らすと', '+' + fmt(rem * (1 / 24) * YEAR_DAYS) + ' 日']], 'time'));
  }

  if (P.has('media') && S.a.media != null) {
    const mBack = rem * (0.5 / 24) * YEAR_DAYS;
    box.appendChild(card('', 'SCREEN', '動画を30分ぶん減らしたら',
      bigNum('+' + fmt(mBack), '日'),
      '1日 <b>' + fmt(S.a.media, 1) + '時間</b>。全国平均は2時間8分です。' +
      '30分を別のことに回すだけで、<b>' + fmt(mBack) + '日</b>ぶんの時間が手元に戻ります。',
      [['1日あたり', fmt(S.a.media, 1) + ' 時間'],
       ['1日1時間減らすと', '+' + fmt(rem * (1 / 24) * YEAR_DAYS) + ' 日'],
       ['1日2時間減らすと', '+' + fmt(rem * (2 / 24) * YEAR_DAYS) + ' 日']], 'time'));
  }

  if (P.has('sakura')) {
    box.appendChild(card('card--pink', 'SPRING', '桜を見られる回数',
      bigNum(fmt(u.springs), '回'),
      '来年の春も、その次の春も、この回数のうちの1回です。'));
  }

  setupShare(leftWeekends, clock);
}

/* ---------- 共有 ---------- */

let shareState = { weekends: 0, clock: null };

function shareText() {
  return '私に残された週末は、あと' + fmt(shareState.weekends) + '回でした。\n' +
    '人生の時刻は ' + (shareState.clock ? shareState.clock.text : '--:--') + '。\n#あと何回';
}

function setupShare(weekends, clock) {
  shareState = { weekends: weekends, clock: clock };
}

const siteUrl = () => window.location.origin + window.location.pathname;

$('#shareX').addEventListener('click', () => {
  const u = 'https://twitter.com/intent/tweet?text=' +
    encodeURIComponent(shareText()) + '&url=' + encodeURIComponent(siteUrl());
  window.open(u, '_blank', 'noopener');
});

$('#shareLine').addEventListener('click', () => {
  const u = 'https://line.me/R/msg/text/?' +
    encodeURIComponent(shareText() + '\n' + siteUrl());
  window.open(u, '_blank', 'noopener');
});

$('#shareCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareText() + '\n' + siteUrl());
    status('コピーしました。');
  } catch (e) {
    status('コピーできませんでした。URLを手動で選択してください。');
  }
});

function status(msg) {
  const s = $('#shareStatus');
  s.textContent = msg;
  clearTimeout(status._t);
  status._t = setTimeout(() => { s.textContent = ''; }, 4000);
}

function downloadBlob(blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'atonankai.png';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  status('画像を保存しました。');
}

$('#shareImg').addEventListener('click', async () => {
  status('画像をつくっています…');
  let blob;
  try {
    blob = await buildImage();
  } catch (e) {
    status('画像をつくれませんでした。');
    return;
  }
  // iOS では blob 生成の待機中にユーザー操作の有効期限が切れ、
  // navigator.share が NotAllowedError で失敗することがある。
  // その場合は黙って保存にフォールバックする。
  try {
    const file = new File([blob], 'atonankai.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: shareText() });
      status('');
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') { status(''); return; } // 本人がキャンセルした
  }
  downloadBlob(blob);
});

async function buildImage() {
  const c = $('#shareCanvas'), x = c.getContext('2d');
  const W = c.width, H = c.height;
  if (document.fonts && document.fonts.load) {
    try {
      await Promise.all([
        document.fonts.load('400 260px Anton'),
        document.fonts.load('400 62px "Dela Gothic One"'),
        document.fonts.load('500 30px "Roboto Mono"')
      ]);
      await document.fonts.ready;
    } catch (e) { /* 読めなくても代替フォントで描画する */ }
  }

  x.fillStyle = '#131C40'; x.fillRect(0, 0, W, H);

  /* 蛍光の版ズレ帯 */
  x.fillStyle = '#FF5B2E'; x.fillRect(0, 0, W, 26);
  x.fillStyle = '#FF3D8B'; x.fillRect(0, 26, W, 10);

  x.textAlign = 'center';

  x.fillStyle = '#FF5B2E';
  x.font = '500 30px "Roboto Mono", monospace';
  x.fillText('A T O N A N K A I', W / 2, 150);

  x.fillStyle = '#F0EDE3';
  x.font = '400 62px "Dela Gothic One", sans-serif';
  x.fillText('私に残された週末は', W / 2, 300);

  x.fillStyle = '#FFCF3F';
  x.font = '400 260px Anton, Impact, sans-serif';
  x.fillText(fmt(shareState.weekends), W / 2, 560);

  x.fillStyle = '#F0EDE3';
  x.font = '400 68px "Dela Gothic One", sans-serif';
  x.fillText('回', W / 2, 660);

  /* 週末ドット */
  const cols = 44, rows = 16, gap = 20, r = 5.5;
  const startX = (W - (cols - 1) * gap) / 2, startY = 760;
  const totalDots = cols * rows;
  const spent = S.age / (S.targetAge || 84);
  for (let i = 0; i < totalDots; i++) {
    const cx0 = startX + (i % cols) * gap, cy0 = startY + Math.floor(i / cols) * gap;
    x.beginPath(); x.arc(cx0, cy0, r, 0, Math.PI * 2);
    x.fillStyle = (i / totalDots) < spent ? 'rgba(240,237,227,.16)' : '#FF5B2E';
    x.fill();
  }

  /* 人生の時刻 */
  x.fillStyle = '#8E98C6';
  x.font = '500 28px "Roboto Mono", monospace';
  x.fillText('人生の時刻', W / 2, 1145);
  x.fillStyle = '#FFCF3F';
  x.font = '400 118px Anton, Impact, sans-serif';
  x.fillText(shareState.clock ? shareState.clock.text : '--:--', W / 2, 1250);

  x.fillStyle = '#F0EDE3';
  x.font = '400 34px "Dela Gothic One", sans-serif';
  x.fillText('あと何回。', W / 2, 1315);

  return new Promise(res => c.toBlob(res, 'image/png'));
}

/* ---------- 大人のページ ---------- */

$('#adultOpen').addEventListener('click', () => {
  S.adultOpen = true;
  $('#adultgate').hidden = true;
  renderAdult();
  $('#adultResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function renderAdult() {
  const host = $('#adultResult');
  host.hidden = false;
  host.innerHTML =
    '<div class="qgroup"><h3 class="qgroup__h">パートナーのこと</h3>' +
    '<div class="q"><label class="q__l" for="pAge">パートナーの年齢</label>' +
    '<div class="q__row"><input class="input" id="pAge" type="number" inputmode="numeric" min="18" max="110" placeholder="年齢"><span class="q__unit">歳</span></div></div>' +
    '<div class="q"><label class="q__l" for="pSex">パートナーの性別</label>' +
    '<select class="select" id="pSex"><option value="female">女性</option><option value="male">男性</option><option value="na">答えない</option></select></div>' +
    '<div class="q"><label class="q__l" for="pFreq">いまの頻度</label>' +
    '<p class="q__h">おおよそで構いません。月あたりの回数でお答えください。</p>' +
    '<div class="q__row"><input class="input" id="pFreq" type="number" inputmode="decimal" min="0" max="60" step="0.5" placeholder="例：2"><span class="q__unit">回 / 月</span></div></div>' +
    '<button class="btn btn--adult" type="button" id="pCalc">計算する</button></div>' +
    '<div id="adultCards"></div>';

  $('#pCalc').addEventListener('click', calcAdult);
}

function calcAdult() {
  const age = Number($('#pAge').value);
  const sex = $('#pSex').value;
  const f = Number($('#pFreq').value);
  const out = $('#adultCards');
  if (!age || age < 18 || isNaN(f)) {
    out.innerHTML = '<p class="note">パートナーの年齢と、月あたりの回数を入れてください。</p>';
    return;
  }
  const me = self();
  const partner = { sex: sex, age: age };
  const r = intimacyLeft(me, partner, f);
  const plus = intimacyLeft(me, partner, f + 1);
  const lost = r.sustained - r.decayed;

  out.innerHTML = '';
  const box = el('div', 'cards');

  box.appendChild(card('card--pink card--wide', 'INTIMACY',
    'パートナーと過ごせる夜は、あと',
    bigNum(fmt(r.decayed), '回'),
    '月 <b>' + fmt(f, 1) + '回</b> のいまのペースから、年齢による頻度の低下を織り込んだ期待値です。' +
    '二人が同時に生きている期間は <b>' + fmt(r.jointYears, 1) + '年</b>と見積もられます。',
    [['二人が同時に生きている期間', fmt(r.jointYears, 1) + ' 年'],
     ['いまの頻度を保てた場合', fmt(r.sustained) + ' 回'],
     ['年齢による低下で失われる分', '−' + fmt(lost) + ' 回']], 'jss'));

  box.appendChild(card('card--yellow card--wide', 'IF',
    'もし月にあと1回、増やせたら',
    bigNum('+' + fmt(plus.decayed - r.decayed), '回'),
    '生涯で <b>' + fmt(plus.decayed) + '回</b>になります。' +
    '「いつかまた」で先送りにした1回は、この総量から静かに引かれていきます。',
    [['いまのまま', fmt(r.decayed) + ' 回'],
     ['月+1回にしたら', fmt(plus.decayed) + ' 回']]));

  box.appendChild(card('card--wide', 'CONTEXT', '日本の現実',
    null,
    'あなたが特別なわけではありません。数字のうえでは、こちらのほうが多数派です。',
    [['1か月以上ないカップル', pct(SEXLESS_FACTS.overallRate, 1)],
     ['既婚者のセックスレス傾向（20〜50代）', pct(SEXLESS_FACTS.marriedTendency, 1)],
     ['うち完全なセックスレス', pct(SEXLESS_FACTS.marriedComplete, 1)],
     ['1年以上ない人（男性 / 女性）',
      pct(SEXLESS_FACTS.noSexOneYear.male, 1) + ' / ' + pct(SEXLESS_FACTS.noSexOneYear.female, 1)]],
    'jss'));

  out.appendChild(box);
  out.appendChild(el('p', 'note',
    '年齢による頻度の変化は、各種調査で観察される傾向に形を合わせたモデルです。' +
    '特定の調査の実測値そのものではありません。回数の多い少ないに、良し悪しはありません。'));
}

/* ---------- 出典一覧 ---------- */

$('#srcList').innerHTML = Object.keys(SOURCES).map(k =>
  '<li><a href="' + SOURCES[k].url + '" target="_blank" rel="noopener">' +
  SOURCES[k].label + '</a></li>').join('');

})();
