/**
 * js/room.js
 * ─────────────────────────────────────────────────────────────
 * نقش: Firebase Architect + Senior Developer
 * چرخه‌ی حیات اتاق در سمت کلاینت:
 *   اتصال، Presence (Heartbeat)، تشخیص آفلاین، Host Migration، Reconnect.
 *
 * چرا Heartbeat؟ Firestore معادل onDisconnect() ندارد (آن فقط در RTDB است).
 * بنابراین هر بازیکن هر ۱۵ ثانیه lastSeen را می‌نویسد و هر کلاینت به‌صورت
 * «محلی» تصمیم می‌گیرد چه کسی آفلاین است — بدون هیچ نوشتن اضافه.
 * ─────────────────────────────────────────────────────────────
 */

import {
  watchRoom, watchPlayers, watchRound, heartbeat, markOffline,
  claimHost, leaveRoom, getRoom, joinRoom, RoomError, toMillis, MAX_PLAYERS
} from "./database.js";
import {
  PRESENCE_HEARTBEAT_MS, PRESENCE_TIMEOUT_MS, store, log, createCleanup, serverNow
} from "./security.js";
import { isPlayerOnline } from "./game-engine.js";
import { initFirebase } from "./firebase-auth.js";

/**
 * RoomSession: یک شیء زنده که وضعیت اتاق را نگه می‌دارد و رویداد پخش می‌کند.
 *
 * رویدادها:
 *   'room'      → (room|null)
 *   'players'   → (players[])
 *   'round'     → (round|null)
 *   'host'      → ({ hostId, name })
 *   'connection'→ ('online'|'offline')
 *   'gone'      → ()  اتاق حذف شده
 *   'error'     → (err)
 */
export class RoomSession {
  constructor({ roomId, uid, name }) {
    this.roomId = roomId;
    this.uid = uid;
    this.name = name;

    this.room = null;
    this.players = [];
    this.round = null;

    this._listeners = new Map();
    this._cleanup = createCleanup();
    this._unsubRound = null;
    this._watchedRound = null;
    this._heartbeatId = 0;
    this._migrationTimer = 0;
    this._lastHostId = "";
    this._started = false;
  }

  /* ── سیستم رویداد ساده ── */
  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this._listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try { fn(payload); } catch (e) { log.error(`handler:${event}`, e); }
    }
  }

  /* ── وضعیت مشتق‌شده ── */
  get isHost() { return !!this.room && this.room.hostId === this.uid; }
  get me() { return this.players.find((p) => (p.userId || p.id) === this.uid) || null; }
  get onlinePlayers() { return this.players.filter((p) => isPlayerOnline(p)); }

  playerById(uid) { return this.players.find((p) => (p.userId || p.id) === uid) || null; }
  nameOf(uid) { return this.playerById(uid)?.name || "بازیکن"; }

  /* ── شروع ── */
  async start() {
    if (this._started) return;
    this._started = true;
    await initFirebase();

    store.set("activeRoomId", this.roomId);

    this._cleanup.add(watchRoom(this.roomId, (room) => {
      if (!room) { this.emit("gone"); return; }
      const prevHost = this._lastHostId;
      this.room = room;
      this._lastHostId = room.hostId;
      this._syncRoundListener();
      this.emit("room", room);
      if (prevHost && prevHost !== room.hostId) {
        this.emit("host", { hostId: room.hostId, name: this.nameOf(room.hostId) });
      }
    }, (err) => this.emit("error", err)));

    this._cleanup.add(watchPlayers(this.roomId, (players) => {
      this.players = players;
      this.emit("players", players);
      this._maybeClaimHost();
    }, (err) => this.emit("error", err)));

    this._startHeartbeat();
    this._bindConnectivity();
    this._bindVisibility();
  }

  /* ── تنظیم listener دور جاری بر اساس شماره‌ی دور ── */
  _syncRoundListener() {
    const rn = this.room?.currentRound || 0;
    if (!rn) return;
    if (this._watchedRound === rn) return;
    if (this._unsubRound) { this._unsubRound(); this._cleanup.remove(this._unsubRound); }
    this._watchedRound = rn;
    this._unsubRound = watchRound(this.roomId, rn, (round) => {
      this.round = round;
      this.emit("round", round);
    }, (err) => this.emit("error", err));
    this._cleanup.add(this._unsubRound);
  }

  /* ── Heartbeat ── */
  _startHeartbeat() {
    const beat = () => { heartbeat(this.roomId, this.uid); };
    beat();
    // setInterval فقط برای نوشتن ضربان است، نه برای خواندن دیتابیس
    this._heartbeatId = setInterval(beat, PRESENCE_HEARTBEAT_MS);
    this._cleanup.add(() => clearInterval(this._heartbeatId));
  }

  /* ── وضعیت اتصال ── */
  _bindConnectivity() {
    const online = () => this.emit("connection", "online");
    const offline = () => this.emit("connection", "offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    this._cleanup.add(() => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    });
    this.emit("connection", navigator.onLine ? "online" : "offline");
  }

  /* ── ترک صفحه ── */
  _bindVisibility() {
    const onHide = () => {
      if (document.visibilityState === "hidden") markOffline(this.roomId, this.uid);
      else heartbeat(this.roomId, this.uid);
    };
    document.addEventListener("visibilitychange", onHide);
    const onPageHide = () => { markOffline(this.roomId, this.uid); };
    window.addEventListener("pagehide", onPageHide);
    this._cleanup.add(() => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    });
  }

  /**
   * Host Migration:
   * اگر Host بیش از ۴۰ ثانیه آفلاین باشد، «قدیمی‌ترین بازیکن آنلاین» ادعای میزبانی می‌کند.
   * تصمیم محلی است ولی نوشتن داخل transaction انجام می‌شود تا دو Host هم‌زمان نداشته باشیم.
   */
  _maybeClaimHost() {
    if (!this.room || !this.players.length) return;
    if (this.room.hostId === this.uid) return;

    const host = this.playerById(this.room.hostId);
    const hostSeen = host ? toMillis(host.lastSeen) : 0;
    const hostGone = !host || (serverNow() - hostSeen > PRESENCE_TIMEOUT_MS);
    if (!hostGone) return;

    const candidates = this.onlinePlayers
      .filter((p) => (p.userId || p.id) !== this.room.hostId)
      .sort((a, b) => (toMillis(a.joinedAt) - toMillis(b.joinedAt)) || String(a.seat).localeCompare(String(b.seat)));

    if (!candidates.length) return;
    if ((candidates[0].userId || candidates[0].id) !== this.uid) return;

    // تاخیر کوچک تصادفی تا چند کلاینت هم‌زمان نزنند
    if (this._migrationTimer) return;
    this._migrationTimer = setTimeout(async () => {
      this._migrationTimer = 0;
      try {
        const res = await claimHost({ roomId: this.roomId, uid: this.uid, timeoutMs: PRESENCE_TIMEOUT_MS });
        if (res.changed) this.emit("host", { hostId: this.uid, name: this.nameOf(this.uid) });
      } catch (e) { log.warn("claimHost", e); }
    }, 300 + Math.random() * 700);
    this._cleanup.add(() => clearTimeout(this._migrationTimer));
  }

  /* ── پایان ── */
  async leave({ removePlayer = true } = {}) {
    this.destroy();
    if (removePlayer) await leaveRoom({ roomId: this.roomId, uid: this.uid });
    store.del("activeRoomId");
  }

  destroy() {
    if (this._migrationTimer) clearTimeout(this._migrationTimer);
    this._cleanup.runAll();
    this._listeners.clear();
    this._started = false;
  }
}

/* ═══════════════ توابع کمکی سطح صفحه ═══════════════ */

/**
 * ورود به اتاق با پیام خطای فارسی.
 * خروجی: { ok:true } یا { ok:false, message }
 */
export async function attemptJoin({ roomId, uid, name }) {
  try {
    await joinRoom({ roomId, uid, name });
    store.set("activeRoomId", roomId);
    return { ok: true };
  } catch (err) {
    if (err instanceof RoomError) return { ok: false, code: err.code, message: err.message };
    if (String(err?.code || "").includes("permission-denied")) {
      return { ok: false, code: "denied", message: "دسترسی به این اتاق مجاز نیست" };
    }
    log.error("attemptJoin", err);
    return { ok: false, code: "unknown", message: "خطا در اتصال به اتاق. دوباره تلاش کن" };
  }
}

/** بررسی وجود اتاق پیش از ورود، برای پیام خطای دقیق‌تر. */
export async function probeRoom(roomId) {
  const room = await getRoom(roomId);
  if (!room) return { ok: false, message: "اتاق پیدا نشد" };
  if ((room.playerCount || 0) >= MAX_PLAYERS) return { ok: false, message: "اتاق پر است" };
  if (room.status === "playing") return { ok: false, message: "بازی شروع شده است" };
  if (room.status === "finished") return { ok: false, message: "این بازی تمام شده است" };
  return { ok: true, room };
}

/** اتاق فعالی که کاربر در آن بوده (برای دکمه‌ی «بازگشت به بازی»). */
export function getActiveRoomId() {
  return store.get("activeRoomId", null);
}

export function clearActiveRoom() {
  store.del("activeRoomId");
}

/** لینک دعوت با پشتیبانی Deep Link. */
export function inviteLink(roomId) {
  const url = new URL("./lobby.html", location.href);
  url.searchParams.set("code", roomId);
  return url.toString();
}
