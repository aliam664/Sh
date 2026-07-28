/**
 * js/database.js
 * ─────────────────────────────────────────────────────────────
 * نقش: Firebase Architect
 * لایه‌ی داده — تنها جایی که مستقیماً با Firestore حرف می‌زند.
 * بقیه‌ی ماژول‌ها فقط از توابع این فایل استفاده می‌کنند.
 *
 * قواعد معماری:
 *  - خواندن لحظه‌ای فقط با onSnapshot (هیچ polling)
 *  - هر عملیات وابسته به حالت قبلی داخل runTransaction
 *  - history فقط create (تغییرناپذیر)
 * ─────────────────────────────────────────────────────────────
 */

import { initFirebase, getDb, getFs } from "./firebase-auth.js";
import {
  log, generateRoomCode, sanitizeText, clampInt, withRetry, setClockOffset
} from "./security.js";

/* ═══════════════ ثابت‌ها ═══════════════ */

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const BID_TIMEOUT_MS       = 30000;
export const CHALLENGE_TIMEOUT_MS = 60000;
export const OPEN_QUESTION_SOFT_CAP = 30;
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

export const PHASE = Object.freeze({
  LOBBY: "lobby", TOPIC: "topic", BIDDING: "bidding",
  CHALLENGE: "challenge", REVEAL: "reveal",
  ROUND_END: "roundEnd", GAME_OVER: "gameOver"
});

export const STATUS = Object.freeze({
  WAITING: "waiting", PLAYING: "playing", FINISHED: "finished"
});

/* ═══════════════ مرجع‌ها ═══════════════ */

function F() { return getFs(); }
function D() { return getDb(); }

export function roomRef(roomId)            { return F().doc(D(), "rooms", roomId); }
export function playersCol(roomId)         { return F().collection(D(), "rooms", roomId, "players"); }
export function playerRef(roomId, uid)     { return F().doc(D(), "rooms", roomId, "players", uid); }
export function roundsCol(roomId)          { return F().collection(D(), "rooms", roomId, "rounds"); }
export function roundRef(roomId, roundId)  { return F().doc(D(), "rooms", roomId, "rounds", String(roundId)); }
export function historyCol(roomId)         { return F().collection(D(), "rooms", roomId, "history"); }
export function historyRef(roomId, rid)    { return F().doc(D(), "rooms", roomId, "history", String(rid)); }

export function ts() { return F().serverTimestamp(); }

/** تبدیل امن Timestamp فایرستور به میلی‌ثانیه. */
export function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

/* ═══════════════ تنظیمات پیش‌فرض ═══════════════ */

export const DEFAULT_SETTINGS = Object.freeze({
  endMode: "rounds",
  maxRounds: 5,
  targetScore: 15,
  bidTimeout: BID_TIMEOUT_MS,
  challengeTimeout: CHALLENGE_TIMEOUT_MS,
  categories: []
});

export function normalizeSettings(input = {}) {
  const endMode = input.endMode === "target" ? "target" : "rounds";
  return {
    endMode,
    maxRounds: [5, 10].includes(Number(input.maxRounds)) ? Number(input.maxRounds) : 5,
    targetScore: clampInt(input.targetScore ?? 15, 5, 50),
    bidTimeout: BID_TIMEOUT_MS,
    challengeTimeout: CHALLENGE_TIMEOUT_MS,
    categories: Array.isArray(input.categories)
      ? input.categories.filter((c) => typeof c === "string").slice(0, 10)
      : []
  };
}

/* ═══════════════ ساخت اتاق ═══════════════ */

/**
 * ساخت اتاق با کد یکتا. اگر کد تصادفی تکراری بود، دوباره تلاش می‌شود.
 * ساخت اتاق و سند بازیکن میزبان در یک batch انجام می‌شود.
 */
export async function createRoom({ uid, name, settings, difficulty = "mixed" }) {
  await initFirebase();
  const fs = F();
  const cleanSettings = normalizeSettings(settings);

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateRoomCode();
    const ref = roomRef(code);
    const existing = await fs.getDoc(ref);
    if (existing.exists()) continue;

    const batch = fs.writeBatch(D());
    batch.set(ref, {
      roomId: code,
      hostId: uid,
      status: STATUS.WAITING,
      createdAt: ts(),
      updatedAt: ts(),
      playerCount: 1,
      turnOrder: [uid],
      currentRound: 0,
      phase: PHASE.LOBBY,
      topic: null,
      difficulty: ["easy", "medium", "hard", "mixed"].includes(difficulty) ? difficulty : "mixed",
      currentBid: 0,
      currentBidder: "",
      currentTurn: "",
      challengeActive: false,
      challengerId: "",
      timerStart: null,
      timerDuration: 0,
      settings: cleanSettings
    });
    batch.set(playerRef(code, uid), {
      userId: uid,
      name: sanitizeText(name, 16),
      score: 0,
      joinedAt: ts(),
      isOnline: true,
      lastSeen: ts(),
      isReady: true,
      isHost: true,
      seat: 0
    });
    await batch.commit();
    return code;
  }
  throw new Error("room-code-collision");
}

/* ═══════════════ ورود به اتاق ═══════════════ */

export class RoomError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * ورود بازیکن به اتاق.
 * داخل transaction انجام می‌شود تا سقف ۸ نفره و شماره‌ی صندلی race نخورد.
 */
export async function joinRoom({ roomId, uid, name }) {
  await initFirebase();
  const fs = F();

  return withRetry(() => fs.runTransaction(D(), async (tx) => {
    const rSnap = await tx.get(roomRef(roomId));
    if (!rSnap.exists()) throw new RoomError("not-found", "اتاق پیدا نشد");
    const room = rSnap.data();

    const pRef = playerRef(roomId, uid);
    const pSnap = await tx.get(pRef);
    const alreadyIn = pSnap.exists();

    if (!alreadyIn) {
      if (room.status === STATUS.PLAYING) throw new RoomError("in-progress", "بازی شروع شده است");
      if (room.status === STATUS.FINISHED) throw new RoomError("finished", "این بازی تمام شده است");
      if ((room.playerCount || 0) >= MAX_PLAYERS) throw new RoomError("full", "اتاق پر است");
    }

    const cleanName = sanitizeText(name, 16);

    if (alreadyIn) {
      // بازگشت مجدد (reconnect) — امتیاز و صندلی حفظ می‌شود
      tx.update(pRef, { name: cleanName, isOnline: true, lastSeen: ts() });
      return { rejoined: true, room };
    }

    const order = Array.isArray(room.turnOrder) ? room.turnOrder.slice() : [];
    order.push(uid);

    tx.set(pRef, {
      userId: uid,
      name: cleanName,
      score: 0,
      joinedAt: ts(),
      isOnline: true,
      lastSeen: ts(),
      isReady: false,
      isHost: false,
      seat: order.length - 1
    });
    tx.update(roomRef(roomId), {
      playerCount: order.length,
      turnOrder: order,
      updatedAt: ts()
    });
    return { rejoined: false, room };
  }));
}

/** خروج داوطلبانه از اتاق. */
export async function leaveRoom({ roomId, uid }) {
  await initFirebase();
  const fs = F();
  try {
    await fs.runTransaction(D(), async (tx) => {
      const rSnap = await tx.get(roomRef(roomId));
      if (!rSnap.exists()) return;
      const room = rSnap.data();
      const order = (room.turnOrder || []).filter((id) => id !== uid);
      tx.delete(playerRef(roomId, uid));
      tx.update(roomRef(roomId), {
        turnOrder: order,
        playerCount: Math.max(0, order.length),
        updatedAt: ts()
      });
    });
  } catch (e) { log.warn("leaveRoom", e); }
}

/* ═══════════════ Presence ═══════════════ */

/** ضربان قلب: هر ۱۵ ثانیه یک نوشتن کوچک. */
export async function heartbeat(roomId, uid) {
  try {
    const localBefore = Date.now();
    await F().updateDoc(playerRef(roomId, uid), { lastSeen: ts(), isOnline: true });
    // کالیبراسیون ساعت با استفاده از همین نوشتن (بدون خواندن اضافه: از cache می‌آید)
    const snap = await F().getDoc(playerRef(roomId, uid));
    const m = toMillis(snap.data()?.lastSeen);
    if (m) setClockOffset(m, (localBefore + Date.now()) / 2);
  } catch (e) { log.warn("heartbeat", e); }
}

/** علامت‌زدن خروج نرم (بستن تب / رفتن به پس‌زمینه). */
export async function markOffline(roomId, uid) {
  try { await F().updateDoc(playerRef(roomId, uid), { isOnline: false }); }
  catch (e) { log.warn("markOffline", e); }
}

/* ═══════════════ Listenerها ═══════════════ */

export function watchRoom(roomId, cb, onError) {
  return F().onSnapshot(roomRef(roomId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (err) => { log.error("watchRoom", err); onError && onError(err); });
}

export function watchPlayers(roomId, cb, onError) {
  const q = F().query(playersCol(roomId), F().orderBy("seat", "asc"));
  return F().onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => { log.error("watchPlayers", err); onError && onError(err); });
}

export function watchRound(roomId, roundNumber, cb, onError) {
  return F().onSnapshot(roundRef(roomId, roundNumber), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, (err) => { log.error("watchRound", err); onError && onError(err); });
}

export function watchHistory(roomId, cb, onError) {
  const q = F().query(historyCol(roomId), F().orderBy("roundNumber", "asc"));
  return F().onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => { log.error("watchHistory", err); onError && onError(err); });
}

/* ═══════════════ خواندن‌های تک‌باره ═══════════════ */

export async function getRoom(roomId) {
  await initFirebase();
  const snap = await F().getDoc(roomRef(roomId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getPlayers(roomId) {
  await initFirebase();
  const snap = await F().getDocs(F().query(playersCol(roomId), F().orderBy("seat", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getRound(roomId, roundNumber) {
  await initFirebase();
  const snap = await F().getDoc(roundRef(roomId, roundNumber));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getHistory(roomId) {
  await initFirebase();
  const snap = await F().getDocs(F().query(historyCol(roomId), F().orderBy("roundNumber", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/* ═══════════════ نوشتن‌های اتاق ═══════════════ */

export async function setReady(roomId, uid, isReady) {
  await initFirebase();
  await F().updateDoc(playerRef(roomId, uid), { isReady: !!isReady, lastSeen: ts() });
}

export async function updateSettings(roomId, settings, difficulty) {
  await initFirebase();
  const patch = { settings: normalizeSettings(settings), updatedAt: ts() };
  if (difficulty) patch.difficulty = difficulty;
  await F().updateDoc(roomRef(roomId), patch);
}

/** به‌روزرسانی دلخواه سند اتاق (فقط از سوی Host فراخوانی می‌شود). */
export async function patchRoom(roomId, patch) {
  await initFirebase();
  await F().updateDoc(roomRef(roomId), { ...patch, updatedAt: ts() });
}

export async function createRoundDoc(roomId, roundNumber, data) {
  await initFirebase();
  await F().setDoc(roundRef(roomId, roundNumber), {
    roundNumber,
    bids: [],
    answers: [],
    challengerId: "",
    defenderId: "",
    startedAt: ts(),
    ...data
  });
}

export async function patchRound(roomId, roundNumber, patch) {
  await initFirebase();
  await F().updateDoc(roundRef(roomId, roundNumber), patch);
}

/** ثبت رکورد تغییرناپذیر تاریخچه (فقط create). */
export async function writeHistory(roomId, roundNumber, record) {
  await initFirebase();
  await F().setDoc(historyRef(roomId, roundNumber), { ...record, endedAt: ts() });
}

/** حذف اتاق و زیرمجموعه‌ها — فقط Host. */
export async function deleteRoom(roomId) {
  await initFirebase();
  const fs = F();
  const subs = ["players", "rounds", "history"];
  for (const sub of subs) {
    const snap = await fs.getDocs(fs.collection(D(), "rooms", roomId, sub));
    // batch حداکثر ۵۰۰ عمل — تکه‌تکه commit می‌کنیم
    let batch = fs.writeBatch(D());
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref); n++;
      if (n === 400) { await batch.commit(); batch = fs.writeBatch(D()); n = 0; }
    }
    if (n) await batch.commit();
  }
  await fs.deleteDoc(roomRef(roomId));
}

/**
 * پاکسازی تنبل: اتاق‌های قدیمی‌تر از ۲۴ ساعت که کاربر Host آن‌هاست.
 * هنگام ورود به Lobby صدا زده می‌شود (نه با تایمر).
 */
export async function cleanupOldRooms(uid) {
  await initFirebase();
  const fs = F();
  try {
    const cutoff = new Date(Date.now() - ROOM_TTL_MS);
    const q = fs.query(
      fs.collection(D(), "rooms"),
      fs.where("hostId", "==", uid),
      fs.where("createdAt", "<", cutoff),
      fs.limit(5)
    );
    const snap = await fs.getDocs(q);
    for (const d of snap.docs) await deleteRoom(d.id);
    return snap.size;
  } catch (e) { log.warn("cleanupOldRooms", e); return 0; }
}

/* ═══════════════ عملیات ترنزکشنی بازی ═══════════════ */

/**
 * ثبت Bid.
 * همه‌ی شرط‌ها داخل transaction بررسی می‌شود: نوبت، فاز، بزرگ‌تر بودن عدد، سقف.
 */
export async function placeBid({ roomId, uid, name, value, maxBid }) {
  await initFirebase();
  const fs = F();
  return fs.runTransaction(D(), async (tx) => {
    const rSnap = await tx.get(roomRef(roomId));
    if (!rSnap.exists()) throw new RoomError("not-found", "اتاق پیدا نشد");
    const room = rSnap.data();

    if (room.phase !== PHASE.BIDDING) throw new RoomError("bad-phase", "الان مرحله‌ی مناقصه نیست");
    if (room.currentTurn !== uid) throw new RoomError("not-your-turn", "نوبت شما نیست");

    const v = Math.floor(Number(value));
    if (!Number.isFinite(v)) throw new RoomError("bad-value", "عدد نامعتبر است");
    if (v <= (room.currentBid || 0)) throw new RoomError("too-low", "عدد باید بزرگ‌تر از پیشنهاد فعلی باشد");
    const cap = Number(maxBid) || OPEN_QUESTION_SOFT_CAP;
    if (v > cap) throw new RoomError("too-high", `حداکثر پیشنهاد ممکن ${cap} است`);

    const order = room.turnOrder || [];
    const idx = order.indexOf(uid);
    const nextTurn = order.length ? order[(idx + 1) % order.length] : uid;

    tx.update(roomRef(roomId), {
      currentBid: v,
      currentBidder: uid,
      currentTurn: nextTurn,
      timerStart: ts(),
      timerDuration: room.settings?.bidTimeout || BID_TIMEOUT_MS,
      updatedAt: ts()
    });

    const rdRef = roundRef(roomId, room.currentRound);
    tx.update(rdRef, {
      bids: fs.arrayUnion({ uid, name: sanitizeText(name, 16), value: v, at: Date.now() })
    });

    return { nextTurn, value: v };
  });
}

/**
 * ثبت BLUFF (چالش).
 * مدافع = آخرین پیشنهاددهنده. فاز به challenge می‌رود و تایمر ۶۰ ثانیه‌ای شروع می‌شود.
 */
export async function placeChallenge({ roomId, uid }) {
  await initFirebase();
  const fs = F();
  return fs.runTransaction(D(), async (tx) => {
    const rSnap = await tx.get(roomRef(roomId));
    if (!rSnap.exists()) throw new RoomError("not-found", "اتاق پیدا نشد");
    const room = rSnap.data();

    if (room.phase !== PHASE.BIDDING) throw new RoomError("bad-phase", "الان نمی‌شود بلوف زد");
    if (room.currentTurn !== uid) throw new RoomError("not-your-turn", "نوبت شما نیست");
    if (!room.currentBid || !room.currentBidder) throw new RoomError("no-bid", "هنوز پیشنهادی ثبت نشده");
    if (room.currentBidder === uid) throw new RoomError("self-challenge", "نمی‌توانی به پیشنهاد خودت بلوف بزنی");

    tx.update(roomRef(roomId), {
      phase: PHASE.CHALLENGE,
      challengeActive: true,
      challengerId: uid,
      timerStart: ts(),
      timerDuration: room.settings?.challengeTimeout || CHALLENGE_TIMEOUT_MS,
      updatedAt: ts()
    });
    tx.update(roundRef(roomId, room.currentRound), {
      challengerId: uid,
      defenderId: room.currentBidder
    });
    return { defenderId: room.currentBidder, bid: room.currentBid };
  });
}

/** افزودن یک جواب به دور جاری (فقط مدافع). */
export async function submitAnswer({ roomId, uid, text, valid, method }) {
  await initFirebase();
  const fs = F();
  await fs.updateDoc(roundRef(roomId, await currentRoundNumber(roomId)), {
    answers: fs.arrayUnion({
      text: sanitizeText(text, 60),
      valid: !!valid,
      by: uid,
      at: Date.now(),
      method: method || "auto"
    })
  });
}

async function currentRoundNumber(roomId) {
  const room = await getRoom(roomId);
  return room ? room.currentRound : 1;
}

/**
 * تایید/رد دستی جواب توسط Host (سوال‌های آزاد).
 * چون آرایه است، کل آرایه بازنویسی می‌شود — داخل transaction تا هم‌زمانی مشکل نسازد.
 */
export async function judgeAnswer({ roomId, roundNumber, index, valid }) {
  await initFirebase();
  const fs = F();
  await fs.runTransaction(D(), async (tx) => {
    const ref = roundRef(roomId, roundNumber);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const answers = (snap.data().answers || []).slice();
    if (!answers[index]) return;
    answers[index] = { ...answers[index], valid: !!valid, method: "host" };
    tx.update(ref, { answers });
  });
}

/**
 * اعمال نتیجه‌ی دور: امتیازها + رکورد history + آماده‌سازی دور بعد.
 * کل کار در یک transaction تا هیچ race conditionی روی امتیاز رخ ندهد.
 *
 * deltas: { uid: number }
 * nextState: فیلدهایی که باید روی سند اتاق نوشته شوند
 */
export async function commitRoundResult({ roomId, roundNumber, deltas, historyRecord, nextState }) {
  await initFirebase();
  const fs = F();
  await fs.runTransaction(D(), async (tx) => {
    const rRef = roomRef(roomId);
    const rSnap = await tx.get(rRef);
    if (!rSnap.exists()) throw new RoomError("not-found", "اتاق پیدا نشد");

    const hRef = historyRef(roomId, roundNumber);
    const hSnap = await tx.get(hRef);
    if (hSnap.exists()) return;    // idempotent: این دور قبلاً بسته شده

    const uids = Object.keys(deltas || {});
    const playerSnaps = await Promise.all(uids.map((u) => tx.get(playerRef(roomId, u))));

    playerSnaps.forEach((snap, i) => {
      if (!snap.exists()) return;
      const cur = Number(snap.data().score) || 0;
      tx.update(playerRef(roomId, uids[i]), { score: cur + Number(deltas[uids[i]] || 0) });
    });

    tx.set(hRef, { ...historyRecord, roundNumber, endedAt: ts() });
    tx.update(rRef, { ...nextState, updatedAt: ts() });
  });
}

/**
 * ادعای میزبانی (Host Migration).
 * فقط اگر Host فعلی بیش از PRESENCE_TIMEOUT آفلاین باشد و مدعی قدیمی‌ترین آنلاین باشد.
 */
export async function claimHost({ roomId, uid, timeoutMs }) {
  await initFirebase();
  const fs = F();
  return fs.runTransaction(D(), async (tx) => {
    const rSnap = await tx.get(roomRef(roomId));
    if (!rSnap.exists()) throw new RoomError("not-found", "اتاق پیدا نشد");
    const room = rSnap.data();
    if (room.hostId === uid) return { changed: false };

    const hostSnap = await tx.get(playerRef(roomId, room.hostId));
    const meSnap = await tx.get(playerRef(roomId, uid));
    if (!meSnap.exists()) throw new RoomError("not-player", "شما عضو این اتاق نیستید");

    const hostSeen = hostSnap.exists() ? toMillis(hostSnap.data().lastSeen) : 0;
    const now = Date.now();
    if (hostSnap.exists() && now - hostSeen < timeoutMs) return { changed: false };

    tx.update(roomRef(roomId), { hostId: uid, updatedAt: ts() });
    tx.update(playerRef(roomId, uid), { isHost: true });
    if (hostSnap.exists()) tx.update(playerRef(roomId, room.hostId), { isHost: false });
    return { changed: true };
  });
}
