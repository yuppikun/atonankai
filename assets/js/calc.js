/* =====================================================================
   あと何回。 — 計算エンジン
   ---------------------------------------------------------------------
   このサイトの計算は「平均寿命 − 今の年齢」という引き算をしていない。
   厚労省の生命表から起こした生存率曲線 l(x) を使い、
   ・自分が各時点まで生きている確率
   ・相手が各時点まで生きている確率
   の積を時間で積分して「二人が同時に生きていられる期間」を出している。
   人と会える残り回数は、すべてこの方式で計算している。
   ===================================================================== */

const DAY_MS = 86400000;

/* ---------- 年齢 ---------- */

/** 生年月日から今日時点の年齢を小数で返す */
function exactAge(birth, now = new Date()) {
  const b = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate());
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let years = t.getFullYear() - b.getFullYear();
  const anniv = new Date(b.getFullYear() + years, b.getMonth(), b.getDate());
  if (anniv > t) years -= 1;
  const prev = new Date(b.getFullYear() + years, b.getMonth(), b.getDate());
  const next = new Date(b.getFullYear() + years + 1, b.getMonth(), b.getDate());
  return years + (t - prev) / (next - prev);
}

/* ---------- 生命表 ---------- */

let LX_NA = null;
function lxTable(sex) {
  if (sex === 'female') return LX_F;
  if (sex === 'male') return LX_M;
  // 性別未回答: 男女の生存率の平均を用いる
  if (!LX_NA) LX_NA = LX_M.map((v, i) => (v + LX_F[i]) / 2);
  return LX_NA;
}

/** 0歳を1.0としたときの、年齢ageまでの生存割合。小数年齢は対数線形補間 */
function lx(sex, age) {
  const t = lxTable(sex);
  if (age <= 0) return 1;
  if (age >= t.length - 1) return t[t.length - 1];
  const i = Math.floor(age), f = age - i;
  if (f === 0) return t[i];
  const a = t[i], b = t[i + 1];
  if (a <= 0) return 0;
  if (b <= 0) return a * (1 - f);
  return a * Math.pow(b / a, f); // 対数線形＝死亡率一定の仮定
}

/** 現在ageの人が、age+years まで生きている条件付き確率 */
function survive(sex, age, years) {
  const base = lx(sex, age);
  if (base <= 0) return 0;
  return Math.min(1, lx(sex, age + years) / base);
}

/** 現在ageの人の平均余命 e(x)（生命表どおりの期待値） */
function lifeExpectancy(sex, age) {
  const STEP = 0.25;
  let sum = 0;
  for (let u = 0; u < 115 - age; u += STEP) {
    sum += survive(sex, age, u + STEP / 2) * STEP;
  }
  return sum;
}

/** 現在ageの人がtargetAgeまで到達する確率 */
function reachProbability(sex, age, targetAge) {
  if (targetAge <= age) return 1;
  return survive(sex, age, targetAge - age);
}

/* ---------- 二人が同時に生きていられる期間 ---------- */

/**
 * 自分と相手が「同時に生きている」年数の期待値。
 * ∫ P(自分が生存) × P(相手が生存) dt
 *
 * ここでは想定寿命モードであっても自分側を生存確率で重みづける。
 * 相手に会える回数は、相手が先に亡くなる可能性だけでなく
 * 自分が先に亡くなる可能性にも左右されるため、
 * 双方を確率で扱わないと本当の期待値にならない。
 */
function jointYears(self, other) {
  const STEP = 1 / 12; // 1か月刻み
  let sum = 0;
  for (let u = 0; u < 115 - Math.min(self.age, other.age); u += STEP) {
    const m = u + STEP / 2;
    sum += survive(self.sex, self.age, m) * survive(other.sex, other.age, m) * STEP;
  }
  return sum;
}

/** 相手の平均余命だけで計算した年数（＝よくある単純計算。比較表示用） */
function naiveYears(other) {
  return lifeExpectancy(other.sex, other.age);
}

/** 会える残り回数（年あたり頻度 × 同時生存年数） */
function meetingsLeft(self, other, timesPerYear) {
  return jointYears(self, other) * timesPerYear;
}

/** 自分が相手より先に亡くなる確率 */
function outlivedProbability(self, other) {
  const STEP = 1 / 12;
  let p = 0;
  for (let u = 0; u < 115 - self.age; u += STEP) {
    const sNow = survive(self.sex, self.age, u);
    const sNext = survive(self.sex, self.age, u + STEP);
    const dieHere = sNow - sNext;                  // この区間で自分が死ぬ確率
    const otherAlive = survive(other.sex, other.age, u + STEP / 2);
    p += dieHere * otherAlive;
  }
  return p;
}

/* ---------- 自分自身の残り時間 ---------- */

/**
 * 想定寿命モード: 残り年数 = 想定寿命 − 現在年齢
 * 統計モード:     残り年数 = 平均余命 e(x)
 */
function selfRemainingYears(self) {
  if (self.mode === 'target') return Math.max(0, self.targetAge - self.age);
  return lifeExpectancy(self.sex, self.age);
}

/** 元気に動ける残り年数（健康寿命まで）と、そうでない期間 */
function healthySplit(self) {
  const total = selfRemainingYears(self);
  const healthyAge = HEALTHY_LIFE[self.sex];
  const healthy = Math.max(0, Math.min(total, healthyAge - self.age));
  return { total, healthy, limited: Math.max(0, total - healthy) };
}

/* ---------- 人生の時計（24時間に圧縮） ---------- */

/** 人生を1日24時間に見立てたときの現在時刻 */
function lifeClock(self) {
  const span = self.mode === 'target'
    ? self.targetAge
    : self.age + lifeExpectancy(self.sex, self.age);
  const ratio = Math.min(0.9999, Math.max(0, self.age / span));
  const totalMin = ratio * 24 * 60;
  const h = Math.floor(totalMin / 60);
  const m = Math.floor(totalMin % 60);
  return { hour: h, minute: m, ratio, span, text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}

/* ---------- 大人の項目：パートナーとの夜 ---------- */

/** 年齢別の性行為頻度モデル（ロジスティック減衰。相対値） */
function intimacyActivity(age) {
  const { x0, k } = INTIMACY_CURVE;
  return 1 / (1 + Math.exp((age - x0) / k));
}

/**
 * パートナーと過ごせる夜の残り回数。
 *  decayed  : 年齢による頻度低下を織り込んだ期待値
 *  sustained: 今の頻度をこの先ずっと保てた場合
 * 差分＝「何もしなければ失われる回数」
 */
function intimacyLeft(self, partner, timesPerMonth) {
  const STEP = 1 / 12;
  const perYear = timesPerMonth * 12;
  const baseAge = (self.age + partner.age) / 2;
  const base = intimacyActivity(baseAge);
  let decayed = 0, sustained = 0;
  for (let u = 0; u < 115 - Math.min(self.age, partner.age); u += STEP) {
    const m = u + STEP / 2;
    const pBoth = survive(self.sex, self.age, m) * survive(partner.sex, partner.age, m);
    sustained += pBoth * STEP;
    decayed += pBoth * (intimacyActivity(baseAge + m) / base) * STEP;
  }
  return {
    decayed: decayed * perYear,
    sustained: sustained * perYear,
    jointYears: sustained,
    perYear
  };
}

/* ---------- 表示用ヘルパ ---------- */

const YEAR_DAYS = 365.2425;

function yearsToUnits(years) {
  const days = years * YEAR_DAYS;
  return {
    years,
    days,
    hours: days * 24,
    weeks: days / 7,
    weekends: days / 7,          // 週末＝土日の組を1回と数える
    months: years * 12,
    seasons: years * 4,
    springs: years                // 桜は年1回
  };
}

/* ---------- 3桁区切り・丸め ---------- */

function fmt(n, digits = 0) {
  if (!isFinite(n)) return '—';
  return Number(n.toFixed(digits)).toLocaleString('ja-JP', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function pct(p, digits = 1) {
  return fmt(p * 100, digits) + '%';
}
