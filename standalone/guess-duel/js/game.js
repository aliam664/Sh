"use strict";
/* ============================================================================
   دوئل رمز — منطق کامل بازی دونفره (Pass & Play روی یک گوشی)
   ----------------------------------------------------------------------------
   معماری: «ماشین‌حالت» — رندر کامل فقط هنگام عوض‌شدن حالت اتفاق می‌افتد.
           ضربه‌های کی‌پد فقط باکس ورودی و وضعیت دکمهٔ ✓ را به‌روز می‌کنند
           (بدون فلیکر/ری‌استارت انیمیشن) → فیکس باگ رندر دوبارهٔ ورژن قبل.
   سازنده: Ali369
   ========================================================================== */

const CFG = { LEN: 4, TURNS: 10 };

/** حالت‌های ممکن بازی */
const Phase = Object.freeze({
  INTRO:  "INTRO",    // ورود نام‌ها
  SECRET: "SECRET",   // ساخت رمز برای player(settingFor)
  PASS:   "PASS",     // «گوشی را بده به …» — passNext مقصد بعدی
  TURN:   "TURN",     // نوبت حدس‌زدن player(turn)
  RESULT: "RESULT",   // پایان و فینال
});

/* ------------------------------ وضعیت بازی ------------------------------ */

const G = {
  phase: Phase.INTRO,
  names: ["", ""],
  secrets: ["", ""],      // رمزها فقط در حافظه — هرگز رندر عمومی نمی‌شوند
  settingFor: 0,          // فاز SECRET برای کدام بازیکن است
  passNext: null,         // پس از فاز PASS به کدام وضعیت برویم
  turn: 0,
  attempts: [[], []],     // [{ g:'5211', tiles:[...], solved:false }] — جدیدترین اول
  winner: null,           // null | 0 | 1 | 'draw'
  reason: "",
};

/** بافر ورودی فعلی صفحه (رمز یا حدس) */
let input = "";
/** نمایش موقت ارقام هنگام ساخت رمز (👁) */
let peek = false;
/** بی‌صدای صوت */
let muted = false;

const stage = document.getElementById("stage");

/* ------------------------------ ابزار عمومی ----------------------------- */

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const vib = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

/** بارگذاری نام‌ها از حافظهٔ مرورگر (تجربهٔ بهتر در بازی دوباره) */
function loadNames() {
  try {
    const n1 = localStorage.getItem("duel.n1"), n2 = localStorage.getItem("duel.n2");
    if (n1) G.names[0] = n1;
    if (n2) G.names[1] = n2;
  } catch (e) {}
}
function saveNames() {
  try {
    localStorage.setItem("duel.n1", G.names[0]);
    localStorage.setItem("duel.n2", G.names[1]);
  } catch (e) {}
}

/* ------------------------------ صدا (WebAudio) --------------------------- */

let audioCtx = null;

/** ایجاد/بیدارکردن کانتکست صوتی — فیکس باگ سکوت مرورگرها (سیاست autoplay) */
function ensureAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}

function tone(freq, delay, dur, type, vol) {
  if (muted) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.13, ctx.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + delay);
    o.stop(ctx.currentTime + delay + dur);
  } catch (e) {}
}

const sClick = () => tone(520, 0, 0.055, "triangle", 0.07);
const sGood  = () => { tone(620, 0, 0.09); tone(830, 0.09, 0.12); };
const sBad   = () => tone(180, 0, 0.18, "sawtooth", 0.06);
const sWin   = () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.18));

/* ------------------------------- داور بازی ------------------------------- */

/**
 * داور «دوپاس» — با ارقام تکراری هرگز گول نمی‌زند.
 * خروجی: آرایه‌ای از 0=🟩 (دقیقاً سر جایش)، 1=🟨 (هست ولی جایش نه)، 2=🟥 (نیست)
 */
function judge(secret, guess) {
  const res = [2, 2, 2, 2], left = {};
  for (let i = 0; i < CFG.LEN; i++) {
    if (guess[i] === secret[i]) res[i] = 0;
    else left[secret[i]] = (left[secret[i]] || 0) + 1;
  }
  for (let i = 0; i < CFG.LEN; i++) {
    if (res[i] === 0) continue;
    const d = guess[i];
    if (left[d] > 0) { res[i] = 1; left[d]--; }
  }
  return res;
}

const isSolved = (tiles) => tiles.every((t) => t === 0);
const playerSolved = (i) => G.attempts[i].some((a) => a.solved);
/** حدسِ کسی که حل کرده منجمد می‌شود (دیگر حدس نمی‌زند) → length = تعداد حدس تا لحظهٔ حل */
const solvedTurns = (i) => (playerSolved(i) ? G.attempts[i].length : null);

/** بهترین حدس یک بازیکن: امتیاز (سبز×۱۰ + زرد) — برای تعیین نزدیک‌ترین */
function bestRank(list) {
  let best = -1;
  list.forEach((a) => {
    const g = a.tiles.filter((t) => t === 0).length;
    const y = a.tiles.filter((t) => t === 1).length;
    best = Math.max(best, g * 10 + y);
  });
  return best;
}

/* -------------------------- تعیین نتیجهٔ مسابقه -------------------------- */

function evaluateMatch() {
  const s = [solvedTurns(0), solvedTurns(1)];
  const full = [G.attempts[0].length >= CFG.TURNS, G.attempts[1].length >= CFG.TURNS];

  // هر دو حل کرده‌اند → حدسِ کمتر برنده؛ مساوی یعنی واقعاً مساوی!
  if (s[0] !== null && s[1] !== null) {
    if (s[0] === s[1]) return finish("draw", `هر دو با ${s[0]} حدس شکستید! چه رقابتی! 🤝`);
    return finish(s[0] < s[1] ? 0 : 1,
      s[0] < s[1] ? `با ${s[0]} حدس در برابر ${s[1]} — سریع‌تر بود ⚡`
                  : `با ${s[1]} حدس در برابر ${s[0]} — سریع‌تر بود ⚡`);
  }

  // یکی حل کرده و فرصت دیگری تمام شده
  if (s[0] !== null && full[1]) return finish(0, "رمز حریف را شکست و حریف نرسید 💥");
  if (s[1] !== null && full[0]) return finish(1, "رمز حریف را شکست و حریف نرسید 💥");

  // هیچ‌کس نرسید و فرصت هر دو تمام شد → نزدیک‌ترین حدس داوری می‌کند
  if (s[0] === null && s[1] === null && full[0] && full[1]) {
    const b0 = bestRank(G.attempts[0]), b1 = bestRank(G.attempts[1]);
    if (b0 === b1) return finish("draw", "نزدیکی حدس‌ها کاملاً برابر بود! 🤝");
    return finish(b0 > b1 ? 0 : 1, "حدس‌های نزدیک‌تر به جواب 🎯");
  }
}

function finish(winner, reason) {
  G.winner = winner;
  G.reason = reason;
  G.phase = Phase.RESULT;
  if (winner !== "draw") fireConfetti();
  sWin();
  vib([60, 40, 60, 40, 120]);
}

/* ------------------------------ اکشن‌های بازی ---------------------------- */

function startSetup() {
  const n1 = ($("#n1").value || "").trim().slice(0, 12) || "بازیکن ۱";
  const n2 = ($("#n2").value || "").trim().slice(0, 12) || "بازیکن ۲";
  if (n1 === n2) { shake("#introCard"); sBad(); return; }
  G.names = [n1, n2];
  saveNames();

  resetMatch();
  G.phase = Phase.SECRET;
  G.settingFor = 0;
  render();
}

function resetMatch() {
  G.secrets = ["", ""];
  G.attempts = [[], []];
  G.winner = null;
  G.reason = "";
  input = "";
  peek = false;
}

function confirmSecret() {
  if (input.length !== CFG.LEN) { shake("#digitBoxes"); sBad(); return; }
  G.secrets[G.settingFor] = input;
  input = "";
  peek = false;
  sGood();
  vib(30);

  if (G.settingFor === 0) {
    enterPass(1, Phase.SECRET);      // بعد از پاس: بازیکن ۲ رمزش را می‌سازد
  } else {
    enterPass(0, Phase.TURN);        // بعد از پاس: بازی — نوبت بازیکن ۱
  }
}

/** ورود به فاز «گوشی را بده به …» با مقصد مشخص */
function enterPass(toPlayer, nextPhase) {
  G.turn = toPlayer;                 // گیرندهٔ گوشی (هم برای PASS هم بعدش)
  G.passNext = nextPhase;
  if (nextPhase === Phase.SECRET) G.settingFor = toPlayer;
  G.phase = Phase.PASS;
  render();
}

function passReady() {
  if (G.phase !== Phase.PASS) return;
  G.phase = G.passNext === Phase.SECRET ? Phase.SECRET : Phase.TURN;
  sClick();
  render();
}

function submitGuess() {
  if (G.phase !== Phase.TURN) return;
  if (input.length !== CFG.LEN) { shake("#digitBoxes"); sBad(); return; }

  const me = G.turn, you = 1 - me;
  const tiles = judge(G.secrets[you], input);
  G.attempts[me].unshift({ g: input, tiles, solved: isSolved(tiles) });
  input = "";

  if (isSolved(tiles)) { sGood(); vib([50, 40, 50]); }
  else { sClick(); vib(22); }

  evaluateMatch();

  if (G.phase !== Phase.RESULT) enterPass(you, Phase.TURN);
  else render();
}

/** نوبتِ بازیکنی که قبلاً رمز حریف را شکسته — دیگر حدس نمی‌زند */
function passSolvedTurn() {
  enterPass(1 - G.turn, Phase.TURN);
}

function rematch() {
  resetMatch();
  G.phase = Phase.SECRET;
  G.settingFor = 0;
  render();
}

function backToIntro() {
  resetMatch();
  G.phase = Phase.INTRO;
  render();
}

/* --------------------------- کنترل کی‌پد (بدون رندر کامل) --------------------------- */

function kd(d) {
  if (![Phase.SECRET, Phase.TURN].includes(G.phase)) return;
  if (input.length >= CFG.LEN) return;
  input += d;
  sClick();
  syncInputUI();                     // ✅ به‌روزرسانی موضعی — فیکس اصلی فلیکر
}

function kb() {
  if (![Phase.SECRET, Phase.TURN].includes(G.phase)) return;
  if (!input) return;
  input = input.slice(0, -1);
  sClick();
  syncInputUI();
}

function togglePeek() {
  peek = !peek;
  sClick();
  syncInputUI();
  const b = $("#peekBtn");
  if (b) b.textContent = peek ? "🙈 پنهان‌نمایش" : "👁 نمایش موقت";
}

function toggleMute() {
  muted = !muted;
  sClick();
  const b = $("#muteBtn");
  if (b) b.textContent = muted ? "🔇 بی‌صدا" : "🔊 صدا روشن";
}

function shake(sel) {
  const el = $(sel);
  if (!el) return;
  el.classList.remove("shake");
  void el.offsetWidth;               // ری‌استارت انیمیشن
  el.classList.add("shake");
  vib([30, 30, 30]);
}

/* ----------------------- ساختِ DOM (فقط هنگام تغییر حالت) ----------------------- */

function render() {
  input = G.phase === Phase.SECRET || G.phase === Phase.TURN ? input : "";
  const html =
    G.phase === Phase.INTRO  ? vIntro()  :
    G.phase === Phase.SECRET ? vSecret() :
    G.phase === Phase.PASS   ? vPass()   :
    G.phase === Phase.TURN   ? vTurn()   :
                               vResult();
  stage.innerHTML = '<div class="fade">' + html + "</div>";
  syncInputUI();
}

/** به‌روزرسانی «فقط» باکس ارقام و دکمهٔ ✓ — بدون دست‌زدن به بقیهٔ صفحه */
function syncInputUI() {
  const boxes = $("#digitBoxes");
  if (boxes) {
    const masked = G.phase === Phase.SECRET && !peek;
    for (let i = 0; i < CFG.LEN; i++) {
      const cell = boxes.children[i];
      if (!cell) break;
      const c = input[i];
      const ch = c ? (masked ? "●" : c) : "·";
      if (cell.textContent !== ch) cell.textContent = ch;
      const cls = i === input.length ? "box next" : (c ? "box filld" : "box");
      if (cell.className !== cls) cell.className = cls;
    }
  }
  const ok = $("#keyOk");
  if (ok) {
    const cls = "key " + (input.length === CFG.LEN ? "ok" : "off");
    if (ok.className !== cls) ok.className = cls;
  }
}

/* ------------------------------ قالب صفحه‌ها ------------------------------ */

function boxesTemplate() {
  let h = '<div class="ltr" id="digitBoxes">';
  for (let i = 0; i < CFG.LEN; i++) h += '<div class="box">·</div>';
  return h + "</div>";
}

function keypadTemplate(action) {
  const rows = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]];
  let h = '<div class="pad">';
  rows.forEach((r) => {
    h += '<div class="prow">';
    r.forEach((d) => (h += '<div class="key" onclick="kd(\'' + d + "')\">" + d + "</div>"));
    h += "</div>";
  });
  h += '<div class="prow"><div class="key" onclick="kb()">⌫</div>'
     + '<div class="key" onclick="kd(\'0\')">0</div>'
     + '<div class="key off" id="keyOk" onclick="' + action + '()">✓</div></div></div>';
  return h;
}

function tilesRow(guess, tiles) {
  let h = '<div class="ltr">';
  for (let i = 0; i < CFG.LEN; i++) {
    const c = tiles[i] === 0 ? "tg" : tiles[i] === 1 ? "ty" : "tr";
    h += '<div class="tile ' + c + '">' + guess[i] + "</div>";
  }
  return h + "</div>";
}

function historyHtml(list) {
  if (!list.length)
    return '<div class="muted">رنگ‌ها راهنمایت‌اند:<br>🟩 درست سر جایش · 🟨 هست ولی جایش نه · 🟥 اصلاً نیست</div>';
  return list
    .map((a, i) =>
      '<div class="guessrow"><span class="muted">' + (list.length - i) + "</span>" +
      tilesRow(a.g, a.tiles) + "</div>"
    )
    .join("");
}

function attemptsDotsHtml(i) {
  const used = G.attempts[i].length, left = CFG.TURNS - used;
  let h = '<div class="dotrow">';
  for (let k = 0; k < CFG.TURNS; k++)
    h += '<div class="dot ' + (k < left ? "lefty" : "used") + '"></div>';
  return h + "</div>";
}

const muteBtn = () =>
  '<button class="btn ghost" id="muteBtn" style="padding:9px" onclick="toggleMute()">' +
  (muted ? "🔇 بی‌صدا" : "🔊 صدا روشن") + "</button>";

/* --- INTRO --- */
function vIntro() {
  loadNames();
  return (
    '<div class="center" style="padding-top:26px">' +
    '<div class="crown">🔐</div><div class="title">دوئل رمز</div>' +
    '<div class="sub">دو نفر، یک گوشی، یک ذهن تیزتر! حریف را با رنگ‌ها شکار کن 🟩🟨🟥</div>' +
    '<span class="badge">سازنده • Ali369</span></div>' +
    '<div class="card" id="introCard"><b>اسم‌ها را بنویسید</b>' +
    '<input type="text" id="n1" maxlength="12" placeholder="نام بازیکن ۱" autocomplete="off" value="' + esc(G.names[0]) + '">' +
    '<input type="text" id="n2" maxlength="12" placeholder="نام بازیکن ۲" autocomplete="off" value="' + esc(G.names[1]) + '"></div>' +
    '<button class="btn gold" onclick="startSetup()">شروع دوئل ⚔️</button>' +
    '<div class="card muted">📜 <b>قانون:</b> هر کس یک کد ۴ رقمی مخفی می‌سازد (تکرار مجاز، حتی با صفر اول). نوبت به نوبت رمز حریف را حدس می‌زنید؛ کسی که با <b>حدس کمتر</b> بشکند می‌برد 👑 — هرکدام <b>' + CFG.TURNS + " حدس</b> فرصت دارید.</div>" +
    muteBtn()
  );
}

/* --- SECRET --- */
function vSecret() {
  return (
    '<div class="card center"><div class="phone">🛡️</div>' +
    "<h2>" + esc(G.names[G.settingFor]) + "</h2>" +
    '<div class="muted" style="margin-top:4px">کد مخفی‌ات را بساز — حریفت نباید ببیند! 🤫</div></div>' +
    boxesTemplate() +
    '<button class="btn ghost" id="peekBtn" onclick="togglePeek()">👁 نمایش موقت</button>' +
    keypadTemplate("confirmSecret") +
    muteBtn()
  );
}

/* --- PASS --- */
function vPass() {
  const to = G.names[G.turn];
  const goalTxt =
    G.passNext === Phase.SECRET ? "او باید رمز مخفی‌اش را بسازد 🛡️" : "نوبتش است که حدس بزند 🎯";
  return (
    '<div class="passwrap"><div class="center">' +
    '<span class="phone">📲</span>' +
    '<div class="passbig">گوشی را بده به<br><span class="acc" style="font-size:32px">' + esc(to) + "</span></div>" +
    '<div class="muted" style="margin:10px 0 18px">' + goalTxt + "</div>" +
    '<button class="btn" style="max-width:260px;margin:auto" onclick="passReady()">آماده‌ام ✓</button>' +
    "</div></div>"
  );
}

/* --- TURN --- */
function vTurn() {
  const me = G.turn, you = 1 - me;
  const myList = G.attempts[me];
  const youSolved = playerSolved(you);

  // بازیکنی که قبلاً شکسته — دیگر حدس نمی‌زند (حدس‌هایش منصفانه منجمد شده)
  if (playerSolved(me)) {
    return (
      '<div class="okline">✔ رمز حریف را شکستی! حدس‌هایت ثبت شد (' + myList.length + ")</div>" +
      '<div class="card"><b>حدس‌های تو</b><div class="hist" style="margin-top:8px">' +
      historyHtml(myList) + "</div></div>" +
      '<button class="btn gold" onclick="passSolvedTurn()">پاس به حریف ←</button>'
    );
  }

  let warn = "";
  if (youSolved)
    warn = '<div class="warn">⚠️ حریف رمزت را شکسته — این فرصت‌های پایانی‌ات است! زودتر و با حدس کمتر بشکن تا ببری ⚡</div>';

  return (
    '<div class="turnbar"><div>🎯 نوبت: <b>' + esc(G.names[me]) + "</b></div>" +
    '<div class="muted">شکار رمزِ <b class="gold">' + esc(G.names[you]) + "</b></div></div>" +
    attemptsDotsHtml(me) +
    warn +
    '<div class="card"><b>حدس‌های تو</b><div class="hist" style="margin-top:8px">' +
    historyHtml(myList) + "</div></div>" +
    '<div class="muted center">حریف تا الان ' + G.attempts[you].length + " حدس زده" +
    (youSolved ? " و <b class='acc'>شکست!</b>" : "") + "</div>" +
    boxesTemplate() +
    keypadTemplate("submitGuess") +
    muteBtn()
  );
}

/* --- RESULT --- */
function vResult() {
  const draw = G.winner === "draw";
  const head = draw
    ? '<div class="crown">🤝</div><h2 class="center">مساوی!</h2><div class="muted center">' + esc(G.reason) + "</div>"
    : '<div class="crown">👑</div><h2 class="center gold" style="font-size:30px">' +
      esc(G.names[G.winner]) + '</h2><div class="muted center">برنده شد — ' + esc(G.reason) + " 🎉</div>";

  const secretsLine = [0, 1]
    .map((i) =>
      '<div class="center"><div class="muted">' + esc(G.names[i]) + "</div>" +
      '<div style="font-weight:900;font-size:22px;letter-spacing:4px;direction:ltr;margin:4px 0">' +
      esc(G.secrets[i]) + "</div>" +
      '<div class="muted">' + G.attempts[i].length + " حدس</div></div>"
    )
    .join('<div class="vs">VS</div>');

  return (
    '<div class="card" style="padding:22px 18px;margin-top:8px">' + head + "</div>" +
    '<div class="card"><div class="center muted" style="margin-bottom:10px">رمزها فاش شد:</div>' +
    '<div style="display:flex;justify-content:space-around;align-items:center">' + secretsLine + "</div></div>" +
    [0, 1].map((i) =>
      '<div class="card"><b>' + esc(G.names[i]) + '</b><div class="hist" style="margin-top:8px">' +
      historyHtml(G.attempts[i]) + "</div></div>"
    ).join("") +
    '<button class="btn gold" onclick="rematch()">بازی دوباره 🔁</button>' +
    '<button class="btn ghost" onclick="backToIntro()">تغییر بازیکن‌ها</button>' +
    '<div class="card center">🏆 سازندهٔ این بازی: <b class="gold">Ali369</b></div>'
  );
}

/* ------------------------------ بارش کاغذرنگی 🎊 ------------------------------ */

function fireConfetti() {
  const cv = document.getElementById("confetti"), cx = cv.getContext("2d");
  cv.width = innerWidth;
  cv.height = innerHeight;
  const colors = ["#2DD4BF", "#FBBF24", "#22C55E", "#EF4444", "#7C5CFF", "#EAB308"];
  const parts = [];
  for (let i = 0; i < 160; i++)
    parts.push({
      x: Math.random() * cv.width,
      y: -20 - Math.random() * cv.height * 0.5,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      vy: 2 + Math.random() * 3,
      vx: -1.5 + Math.random() * 3,
      c: colors[i % colors.length],
      r: Math.random() * Math.PI,
      vr: -0.1 + Math.random() * 0.2,
    });
  const t0 = performance.now();
  (function tick(t) {
    cx.clearRect(0, 0, cv.width, cv.height);
    parts.forEach((p) => {
      p.x += p.vx + Math.sin((t + p.y) / 300);
      p.y += p.vy;
      p.r += p.vr;
      cx.save();
      cx.translate(p.x, p.y);
      cx.rotate(p.r);
      cx.fillStyle = p.c;
      cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      cx.restore();
    });
    if (t - t0 < 4200) requestAnimationFrame(tick);
    else cx.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}

/* ------------------------------ بوت ------------------------------ */

loadNames();
render();
