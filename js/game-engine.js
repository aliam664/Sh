/**
 * js/game-engine.js
 * ─────────────────────────────────────────────────────────────
 * نقش: Game Designer + Senior Developer
 * ماشین حالت بازی، تایمر، اعتبارسنجی جواب و امتیازدهی.
 *
 * مدل: Host-Authoritative
 *   همه‌ی کلاینت‌ها همان state را می‌بینند، ولی فقط Host «گذارِ فاز» را می‌نویسد.
 *   دلیل: در پلن Spark هیچ سروری وجود ندارد؛ اگر همه بنویسند، نتیجه غیرقطعی می‌شود.
 *   کنش‌های خود بازیکن (Bid, Bluff, Answer) را خودش می‌نویسد و Rules آن را می‌سنجد.
 *
 * ماشین حالت:
 *   lobby → topic → bidding ⇄ bidding → challenge → reveal → roundEnd → (topic | gameOver)
 * ─────────────────────────────────────────────────────────────
 */

import {
  PHASE, STATUS, MIN_PLAYERS, patchRoom, createRoundDoc, patchRound,
  commitRoundResult, placeBid, placeChallenge, judgeAnswer, toMillis,
  BID_TIMEOUT_MS, CHALLENGE_TIMEOUT_MS, ts
} from "./database.js";
import { getRandomQuestion, toTopic, getQuestionById, checkAnswer, maxBidFor, makeCustomTopic } from "./questions.js";
import { serverNow, log, normalizeAnswer, PRESENCE_TIMEOUT_MS, sanitizeText } from "./security.js";
import { bumpStats } from "./firebase-auth.js";

/* ═══════════════ امتیازدهی ═══════════════ */

export const SCORE = Object.freeze({
  DEFENDER_WIN: 2,     // مدافع موفق شد
  CHALLENGER_WIN: 1,   // بلوف درست بود
  LOSER_PENALTY: -2,   // بازیکن شکست‌خورده
  BAD_CHALLENGE: -1    // جریمه‌ی چالش بی‌جا
});

/**
 * محاسبه‌ی تغییرات امتیاز یک دور.
 * defenderSucceeded=true  ⇒ مدافع +۲ و چالش‌کننده −۱ (جریمه‌ی چالش بی‌جا)
 * defenderSucceeded=false ⇒ چالش‌کننده +۱ و مدافع −۲
 */
export function computeDeltas({ defenderId, challengerId, defenderSucceeded }) {
  const deltas = {};
  if (defenderSucceeded) {
    deltas[defenderId] = SCORE.DEFENDER_WIN;
    if (challengerId) deltas[challengerId] = SCORE.BAD_CHALLENGE;
  } else {
    if (challengerId) deltas[challengerId] = SCORE.CHALLENGER_WIN;
    deltas[defenderId] = SCORE.LOSER_PENALTY;
  }
  return deltas;
}

/* ═══════════════ تایمر ═══════════════ */

/**
 * زمان باقی‌مانده بر حسب میلی‌ثانیه — بر مبنای ساعت سرور (clock skew اصلاح‌شده).
 * هیچ شمارنده‌ای در دیتابیس ذخیره نمی‌شود.
 */
export function remainingMs(room) {
  if (!room || !room.timerStart || !room.timerDuration) return 0;
  const start = toMillis(room.timerStart);
  if (!start) return room.timerDuration;   // هنوز serverTimestamp روی سرور ننشسته
  return Math.max(0, start + room.timerDuration - serverNow());
}

/**
 * حلقه‌ی رندر تایمر با requestAnimationFrame.
 * onTick(remainingMs, ratio) با هر فریم صدا زده می‌شود.
 * خروجی: تابع stop
 */
export function startTimerLoop(getRoom, onTick, onExpire) {
  let raf = 0;
  let expired = false;
  const frame = () => {
    const room = getRoom();
    const total = room && room.timerDuration ? room.timerDuration : 0;
    const left = remainingMs(room);
    const ratio = total ? left / total : 0;
    onTick(left, ratio);
    if (total && left <= 0 && !expired) {
      expired = true;
      try { onExpire && onExpire(); } catch (e) { log.error("timer expire", e); }
    }
    if (total && left > 0) expired = false;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/* ═══════════════ کمکی‌های Presence ═══════════════ */

export function isPlayerOnline(player, timeoutMs = PRESENCE_TIMEOUT_MS) {
  if (!player) return false;
  const seen = toMillis(player.lastSeen);
  if (!seen) return false;
  return serverNow() - seen < timeoutMs;
}

/** اولین بازیکن آنلاین بعد از uid داده‌شده در ترتیب نوبت. */
export function nextOnlineTurn(turnOrder, players, fromUid) {
  if (!Array.isArray(turnOrder) || !turnOrder.length) return fromUid || "";
  const map = new Map(players.map((p) => [p.userId || p.id, p]));
  const startIdx = Math.max(0, turnOrder.indexOf(fromUid));
  for (let i = 1; i <= turnOrder.length; i++) {
    const uid = turnOrder[(startIdx + i) % turnOrder.length];
    if (isPlayerOnline(map.get(uid))) return uid;
  }
  return fromUid || turnOrder[0];
}

export function onlinePlayers(players) {
  return players.filter((p) => isPlayerOnline(p));
}

/* ═══════════════ کنش‌های بازیکن ═══════════════ */

/** ثبت پیشنهاد — اعتبارسنجی نهایی داخل transaction انجام می‌شود. */
export async function actionBid({ roomId, uid, name, value, topic }) {
  return placeBid({ roomId, uid, name, value, maxBid: maxBidFor(topic) });
}

/** زدن BLUFF. */
export async function actionBluff({ roomId, uid }) {
  return placeChallenge({ roomId, uid });
}

/**
 * ثبت یک جواب توسط مدافع.
 * برای سوال بسته، اعتبارسنجی خودکار انجام می‌شود؛ برای سوال آزاد وضعیت «در انتظار Host».
 * خروجی: { accepted, valid, reason, canonical }
 */
export async function actionAnswer({ roomId, roundNumber, uid, topic, text, existingAnswers }) {
  const clean = sanitizeText(text, 60);
  if (!clean) return { accepted: false, valid: false, reason: "empty" };

  const prevCanonicals = (existingAnswers || [])
    .filter((a) => a.valid || a.canonical)
    .map((a) => normalizeAnswer(a.canonical || a.text));

  let valid = false;
  let reason = "pending";
  let canonical = normalizeAnswer(clean);

  if (topic && !topic.isOpen && getQuestionById(topic.id)) {
    const res = checkAnswer(topic.id, clean, prevCanonicals);
    valid = res.valid;
    reason = res.reason;
    canonical = res.canonical || canonical;
    if (!valid && reason === "duplicate") return { accepted: false, valid: false, reason, canonical };
    if (!valid && reason === "off-topic") return { accepted: false, valid: false, reason, canonical };
  } else {
    // سوال آزاد: فقط تکراری بودن را خودکار رد می‌کنیم
    if (prevCanonicals.includes(canonical)) {
      return { accepted: false, valid: false, reason: "duplicate", canonical };
    }
  }

  const entry = {
    text: clean,
    canonical,
    valid,
    by: uid,
    at: Date.now(),
    method: topic && topic.isOpen ? "host" : "auto"
  };
  const answers = [...(existingAnswers || []), entry];
  await patchRound(roomId, roundNumber, { answers });
  return { accepted: true, valid, reason, canonical, answers };
}

/** داوری دستی Host روی یک جواب سوال آزاد. */
export async function actionJudge({ roomId, roundNumber, index, valid }) {
  await judgeAnswer({ roomId, roundNumber, index, valid });
}

/* ═══════════════ گذارهای حالت (فقط Host) ═══════════════ */

/** شروع بازی: از lobby به topic. */
export async function hostStartGame({ roomId, room, players }) {
  const online = onlinePlayers(players);
  if (online.length < MIN_PLAYERS) throw new Error(`برای شروع حداقل ${MIN_PLAYERS} بازیکن آنلاین لازم است`);

  const order = players.map((p) => p.userId || p.id);
  await patchRoom(roomId, {
    status: STATUS.PLAYING,
    phase: PHASE.TOPIC,
    currentRound: 1,
    turnOrder: order,
    currentTurn: order[0],
    currentBid: 0,
    currentBidder: "",
    challengeActive: false,
    challengerId: "",
    topic: null,
    timerStart: null,
    timerDuration: 0
  });
}

/**
 * انتخاب موضوع و آغاز مناقصه (فقط Host).
 * source: 'random' | { questionId } | { customTitle }
 * timerStart همیشه serverTimestamp است تا شمارش همه‌ی گوشی‌ها یکسان باشد.
 */
export async function hostPickTopic({ roomId, room, usedTopicIds = [], source = "random" }) {
  let topic = null;
  if (source === "random") {
    topic = getRandomQuestion(room.settings?.categories || [], room.difficulty || "mixed", usedTopicIds);
  } else if (source && source.questionId) {
    topic = toTopic(getQuestionById(source.questionId));
  } else if (source && source.customTitle) {
    const title = sanitizeText(source.customTitle, 60);
    if (title.length >= 2) topic = makeCustomTopic(title);
  }
  if (!topic) topic = getRandomQuestion([], "mixed", usedTopicIds);

  const roundNumber = room.currentRound || 1;
  const starter = room.currentTurn || (room.turnOrder || [])[0] || "";

  await createRoundDoc(roomId, roundNumber, { topic, bids: [], answers: [] });
  await patchRoom(roomId, {
    topic,
    phase: PHASE.BIDDING,
    currentBid: 0,
    currentBidder: "",
    currentTurn: starter,
    challengeActive: false,
    challengerId: "",
    timerStart: ts(),
    timerDuration: room.settings?.bidTimeout || BID_TIMEOUT_MS
  });
  return topic;
}

/**
 * تایم‌اوت نوبت مناقصه ⇒ ثبت خودکار BLUFF از سوی بازیکنِ نوبت.
 * فقط Host این را می‌نویسد تا چند نفر هم‌زمان اقدام نکنند.
 * اگر هنوز هیچ پیشنهادی نباشد (بازیکن اول تعلل کرد)، نوبت به نفر بعد می‌رود.
 */
export async function hostHandleBidTimeout({ roomId, room, players }) {
  if (room.phase !== PHASE.BIDDING) return;
  if (remainingMs(room) > 0) return;

  if (!room.currentBid || !room.currentBidder) {
    // هنوز پیشنهادی نیست ⇒ فقط نوبت جابه‌جا می‌شود
    const next = nextOnlineTurn(room.turnOrder, players, room.currentTurn);
    await patchRoom(roomId, {
      currentTurn: next,
      timerStart: ts(),
      timerDuration: room.settings?.bidTimeout || BID_TIMEOUT_MS
    });
    return;
  }

  // بلوف خودکار به نام بازیکنِ نوبت
  await patchRoom(roomId, {
    phase: PHASE.CHALLENGE,
    challengeActive: true,
    challengerId: room.currentTurn,
    timerStart: ts(),
    timerDuration: room.settings?.challengeTimeout || CHALLENGE_TIMEOUT_MS
  });
  await patchRound(roomId, room.currentRound, {
    challengerId: room.currentTurn,
    defenderId: room.currentBidder
  }).catch((e) => log.warn("timeout round patch", e));
}

/** شمارش جواب‌های معتبر یک دور. */
export function countValidAnswers(round) {
  return (round?.answers || []).filter((a) => a.valid).length;
}

/** آیا مدافع کارش را تمام کرده؟ */
export function defenderSucceeded(room, round) {
  return countValidAnswers(round) >= (room.currentBid || 0);
}

/**
 * بستن دور — فقط Host.
 * امتیازها + رکورد تغییرناپذیر history + آماده‌سازی دور بعد، همه در یک transaction.
 */
export async function hostResolveRound({ roomId, room, round, players, reason = "auto" }) {
  if (!round) return null;
  const defenderId = round.defenderId || room.currentBidder;
  const challengerId = round.challengerId || room.challengerId;
  if (!defenderId) return null;

  const success = defenderSucceeded(room, round);
  const deltas = computeDeltas({ defenderId, challengerId, defenderSucceeded: success });

  const nameOf = (uid) => players.find((p) => (p.userId || p.id) === uid)?.name || "بازیکن";
  const loserId = success ? challengerId : defenderId;

  // امتیاز نهایی پس از اعمال دلتاها — برای تصمیم پایان بازی
  const projected = new Map(players.map((p) => [
    p.userId || p.id,
    (Number(p.score) || 0) + (deltas[p.userId || p.id] || 0)
  ]));

  const settings = room.settings || {};
  const isLastRound = settings.endMode === "rounds" && (room.currentRound || 1) >= (settings.maxRounds || 5);
  const targetHit = settings.endMode === "target" &&
    [...projected.values()].some((s) => s >= (settings.targetScore || 15));
  const gameOver = isLastRound || targetHit;

  // شروع‌کننده‌ی دور بعد = بازنده‌ی این دور (اگر آفلاین است، نفر آنلاین بعدی)
  let nextStarter = loserId || defenderId;
  const loserPlayer = players.find((p) => (p.userId || p.id) === nextStarter);
  if (!isPlayerOnline(loserPlayer)) nextStarter = nextOnlineTurn(room.turnOrder, players, nextStarter);

  const historyRecord = {
    roundNumber: room.currentRound || 1,
    topic: (room.topic && room.topic.title) || "—",
    topicId: (room.topic && room.topic.id) || "",
    finalBid: room.currentBid || 0,
    defenderId,
    defenderName: nameOf(defenderId),
    challengerId: challengerId || "",
    challengerName: challengerId ? nameOf(challengerId) : "—",
    answersGiven: countValidAnswers(round),
    success,
    deltas,
    reason
  };

  const nextState = gameOver
    ? {
        phase: PHASE.GAME_OVER,
        status: STATUS.FINISHED,
        challengeActive: false,
        timerStart: null,
        timerDuration: 0
      }
    : {
        phase: PHASE.ROUND_END,
        challengeActive: false,
        currentTurn: nextStarter,
        timerStart: null,
        timerDuration: 0
      };

  await commitRoundResult({
    roomId,
    roundNumber: room.currentRound || 1,
    deltas,
    historyRecord,
    nextState
  });

  return { success, deltas, gameOver, historyRecord, nextStarter };
}

/** رفتن به دور بعد — فقط Host، از overlay نتیجه. */
export async function hostNextRound({ roomId, room }) {
  await patchRoom(roomId, {
    currentRound: (room.currentRound || 1) + 1,
    phase: PHASE.TOPIC,
    topic: null,
    currentBid: 0,
    currentBidder: "",
    challengeActive: false,
    challengerId: "",
    timerStart: null,
    timerDuration: 0
  });
}

/** بازگرداندن اتاق به حالت انتظار برای بازی مجدد. */
export async function hostRestartGame({ roomId, players }) {
  await patchRoom(roomId, {
    status: STATUS.WAITING,
    phase: PHASE.LOBBY,
    currentRound: 0,
    topic: null,
    currentBid: 0,
    currentBidder: "",
    currentTurn: "",
    challengeActive: false,
    challengerId: "",
    timerStart: null,
    timerDuration: 0
  });
}

/* ═══════════════ نتیجه‌ی نهایی بازی ═══════════════ */

/** رتبه‌بندی بازیکنان بر اساس امتیاز (نزولی). */
export function ranking(players) {
  return [...players].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
}

export function winnerOf(players) {
  const r = ranking(players);
  return r.length ? r[0] : null;
}

/**
 * ثبت آمار کلی بازیکن در پروفایل — هر کلاینت فقط آمار خودش را می‌نویسد.
 * (Security Rules اجازه‌ی نوشتن روی users/{uid} دیگران را نمی‌دهد.)
 */
export async function recordPersonalStats({ uid, players, history }) {
  const me = players.find((p) => (p.userId || p.id) === uid);
  if (!me) return;
  const win = winnerOf(players);
  const isWinner = win && (win.userId || win.id) === uid;

  let successfulBluffs = 0, caughtBluffs = 0, roundsWon = 0;
  for (const h of history || []) {
    if (h.challengerId === uid && !h.success) { successfulBluffs++; roundsWon++; }
    if (h.challengerId === uid && h.success) { caughtBluffs++; }
    if (h.defenderId === uid && h.success) { roundsWon++; }
  }

  await bumpStats(uid, {
    gamesPlayed: 1,
    wins: isWinner ? 1 : 0,
    totalScore: Number(me.score) || 0,
    successfulBluffs,
    caughtBluffs,
    roundsWon
  });
}
