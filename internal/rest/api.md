# Anova4All Go API

The browser reads and writes its own data (device names, members, invites, cook history)
straight from Supabase through RLS. This API covers only what needs the live cooker:
status, cook operations, pairing and the live stream. MCP tools (`/mcp`) call the same
code, so they behave exactly like these endpoints.

## Auth

Every `/api` route needs `Authorization: Bearer <Supabase access token>` from a normal
browser session. Tokens issued to OAuth apps (MCP clients), anonymous sessions, and any
token with `client_id` get `401`. On `401`, refresh the session once and retry.

## Errors

```json
{"error": {"code": "device_offline", "message": "the cooker is not connected to the server"}}
```

| HTTP | code | meaning / what the UI should do |
|---|---|---|
| 400 | `invalid_input` | message says which field and range |
| 401 | `unauthorized` | refresh the token once, then sign in again |
| 403 | `not_member` | no access (also for unknown device ids) |
| 403 | `owner_only` | only the owner can do this |
| 404 | `not_found` | unknown endpoint |
| 409 | `device_offline` | cooker not connected; show offline state |
| 409 | `key_mismatch` | pairing: the cooker hasn't reported the new key yet; keep polling |
| 409 | `cook_in_progress` | start refused: already heating; offer update/stop |
| 409 | `no_active_cook` | update refused: not heating; use start |
| 429 | `rate_limited` | slow down |
| 500 | `internal` | server error |

## Types

`DeviceStatus`:

```json
{
  "id": "uuid",
  "name": "Anova",
  "is_owner": true,
  "online": true,
  "last_seen_at": "2026-10-01T10:00:00Z",
  "state": {
    "status": "running",            // running | stopped | low water | heater error | power loss | user change parameter
    "current_temperature": 56.4,
    "target_temperature": 57,
    "timer_running": true,
    "timer_value": 58,              // minutes left
    "unit": "c",                    // c | f
    "speaker_status": true
  },
  "cook": {                         // open cook, else the last one; omitted if none ever
    "id": "uuid",
    "started_at": "…",
    "auto_stop": true,
    "stops_at": "…",                // only while open, auto_stop on and timer running
    "timer_waiting": true,          // open cook whose timer waits for the set point; omitted when false
    "ended_at": "…",                // closed cooks only
    "end_reason": "auto_stop",      // auto_stop | stopped | manual
    "alarm": true                   // ended by auto-stop and not silenced yet; omitted when false
  }
}
```

`state` is omitted while the cooker is offline. A cook is active exactly when
`state.status == "running"`.

## Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` (no auth) | — | `{"cookers": 1}` |
| GET | `/api/server-info` | — | `{"host": "203.0.113.7", "port": 8080}`: what setup writes with `server para` |
| GET | `/api/devices` | — | `{"devices": [DeviceStatus]}` |
| GET | `/api/devices/:device_id` | — | `DeviceStatus` |
| POST | `/api/devices/pair` | `{"id_card", "key"}` | `{"id", "name"}` |
| POST | `/api/devices/:device_id/cook` | `StartCook` | `DeviceStatus` |
| PATCH | `/api/devices/:device_id/cook` | `UpdateCook` | `DeviceStatus` |
| POST | `/api/devices/:device_id/cook/stop` | — | `DeviceStatus` |
| GET | `/api/devices/:device_id/events` | — | SSE stream |

Status reads never send commands to the cooker; they use the last polled state (every 2 s).

### Pairing

`key` is the 10-character `[a-z0-9]` key the setup wrote over Bluetooth (`set number`),
from `crypto.getRandomValues`, never stored. `id_card` is what `connect()` returned.
Poll every 2 s for up to 60 s while the cooker re-dials: `device_offline` and
`key_mismatch` mean "not yet". Limit: 1 request/s per user (burst 2). On success the
caller is the owner; pairing a cooker you already own keeps its id and members, pairing
someone else's creates a new device row (old members, invites and cooks are deleted).

### Cooks

Ranges: 25–100 °C, 77–211 °F, timer 0–6000 minutes.

`StartCook`: `{"temperature": 57, "unit": "c", "minutes": 60, "auto_stop": true}`.
`minutes` and `auto_stop` are optional; `auto_stop` needs `minutes > 0`.
Refused with `cook_in_progress` while heating.

Timer start: as in the Anova app, the timer is set at Start but counts down only once
the water reaches the set point (within 0.5 °C / 1 °F below it, or anywhere above it).
Until then the open cook has `timer_waiting: true`, `timer_running` is false and there is
no `stops_at`; the server starts the timer when a reading (or the cooker's temp-reached
event) shows the water there. Stopping the timer from the cooker afterwards is left alone.

`UpdateCook`: any of `{"temperature", "unit", "minutes", "auto_stop"}`; `temperature`
and `unit` go together. `minutes` sets the timer and starts it, or leaves it waiting while the water is
below the set point (`0` stops it and turns auto-stop off). `auto_stop: true` needs a
running or waiting timer, or `minutes`. Refused with
`no_active_cook` when not heating, so an update never starts the heater.

Stop: stops heating and the timer and silences the alarm (not a low-water alarm). Works
with no cook running, which is how the UI silences the alarm after an auto-stop.

**Idle-draft rule (cook screen):** while not heating, edits are a local draft and nothing
is sent until Start sends the whole draft. While heating, each edit is a PATCH.

Auto-stop: when the timer of a cook with `auto_stop` finishes, the server stops heating
and leaves the alarm sounding; the cook ends with `end_reason: "auto_stop"` and
`alarm: true` until someone calls Stop. The cooker can't report its alarm, so the server
remembers this in memory (a server restart forgets it).

### Live stream

`GET /api/devices/:device_id/events` with the bearer header (use fetch streaming, not
`EventSource`). Events:

- `status`: a full `DeviceStatus`. Sent first, then whenever it changes (identical
  states are not repeated). Offline is `online: false` without `state`.
- `cook_ended`: `{"reason": "auto_stop" | "stopped" | "manual"}`, followed by a `status`.
- `: ping` comment every 15 s.

The server ends the stream when access is lost (member removed, cooker unpaired or
re-paired to another owner); reconnecting then answers `403 not_member`. Reconnect on
any other end with backoff (1 s → 30 s, jitter).
