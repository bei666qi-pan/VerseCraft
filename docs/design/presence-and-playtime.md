# Presence heartbeats and play time (wall-clock)

## Units

- All persisted rollups use **UTC** calendar boundaries for `date_key` / `admin_metrics_daily` rows and **server wall-clock** for per-session `last_seen_at` / `last_presence_ok_at`.
- Credited play increments are stored as **integer seconds** (`total_play_duration_sec` on `user_sessions` / `guest_sessions`, and daily `total_play_duration_sec` on `admin_metrics_daily` / `user_daily_tokens`).

## Client

- `POST /api/presence/heartbeat` about every **30s** from long-lived pages (`/play`, home).
- A heartbeat is sent only when `document.visibilityState === "visible"` **and** `document.hasFocus()`.
- `pagehide` uses `sendBeacon` with a synthetic `{ visible: true, focused: true }` so the last interval can be credited on unload; `window` `"online"` retries with `sendBeacon` (fallback `fetch` with `keepalive`).

## Online window (stable “在线”)

- Single constant: `ONLINE_WINDOW_SECONDS` in `src/lib/presence/onlineWindow.ts` (default **90**). Server and admin share it.
- **Redis** `active_users` ZSET and **DB** `last_seen_at` are both written from `markUserActive`; **merge** treats an actor as online if either source is in-window. If Redis is missing or errors, **DB still determines online** (avoids false offline).
- If Redis is up but a member is only found via DB, emit `presence_flaky` (throttled) for later replay.
- Realtime: `activeSessions` counts `user_sessions` in-window; `onlineGuests` counts `guest_sessions` rows in-window; `onlineUsers` counts merged registered actors.

## Server

- **Rate limit:** at most one successful apply per `session_id` per **8s** (`429` if faster); does not write audit for flood risk.
- **Dedup:** `presence_heartbeat_dedupe (session_id, bucket_start)` with **10s** UTC buckets — duplicate bucket → HTTP 200 `deduped: true`, no time credited.
- **Credited seconds per accepted beat:** `min(floor(now - last_seen_at), 60)` so tab-idle stalls credit at most 60s per beat.

## Chat route

- `/api/chat` no longer inflates `users.playTime` from a fixed 3600s per action. Analytics events `chat_request_finished` / `chat_action_completed` keep the same names and fields; `playDurationDeltaSec` is **0** from chat (play time is heartbeat-driven).

## Admin

- **区间内驻留** = sum of `admin_metrics_daily.total_play_duration_sec` over the selected **overview** date range.
- **全量会话驻留** = `SUM(user_sessions.total_play_duration_sec)` for rows with `user_id IS NOT NULL`.
- **历史累计** = `SUM(users.play_time)` (legacy, chat-inflated before migration / frozen after).
- Per-user table: **历史累计（旧口径）** = `users.play_time`; **会话驻留** = sum of `user_sessions.total_play_duration_sec` for that user; guests use `guest_sessions` by `guest_id`.

## Rollback

1. Stop calling `usePresenceHeartbeat` on clients (or feature-flag the hook off).
2. If needed for emergency, restore a positive `PLAY_TIME_PER_ACTION_SEC` in `/api/chat` and `persistTokenUsage` / `recordDailyTokenUsage` paths (see git history) — this is independent of the SSE stream format.

## Schema

- Tables: `user_sessions`, `guest_sessions`, `presence_heartbeat_dedupe` (created in `scripts/migrate.js` / `ensureRuntimeSchema`).
