# Automator Email

A multi-user React + Node service for running email campaigns. Each person
registers with their own Gmail account (address + App Password), logs in, and
everything they create — campaigns, recipients, send history — is private to
them, stored in **MongoDB**.

1. **Register** with your name, email/password, and the Gmail address + App
   Password you want to send from (verified against Gmail right at signup).
2. **Create a campaign** — a name, subject, email body, and your **resume**
   (PDF/DOCX).
3. **Upload a CSV** of recipients (one row per person, an `email` column, and
   optionally `name` + any extra columns — or just a bare list of addresses).
4. **Set the batch size**, hit **Send next batch**, and the server sends that
   many to the still-pending recipients — throttled, one by one, from *your*
   Gmail account — writing progress to the database after each email.
5. **Stops on the first failed email** — a batch (manual, scheduled, or retry)
   halts the instant one send fails, instead of burning through the rest of
   the list. Nothing after it is touched; retry the failure or send the next
   batch to skip it and continue.
6. **Schedule daily sending** — turn on a campaign's schedule (a time + a
   daily count) from its **Edit** panel and the server sends that many
   automatically every day, no one needing to click anything.
7. **Watch it send live** — the campaign page shows who's being emailed right
   now (over Server-Sent Events), and the Recipients table highlights the
   in-flight row.
8. **Analytics dashboard** — per campaign or across all of them: emails
   sent/failed per day, batch history, and a **failed-recipients list with a
   one-click Retry** (per address or all at once).

```
Automator-email/
├── client/   Vite + React + Tailwind + shadcn/ui
└── server/   Node + Express + MongoDB + JWT auth + Gmail (per-user App Password)
```

---

## 1. Prerequisites

- Node.js 18+
- A MongoDB connection string (Atlas or local)
- Each user just needs their own Gmail account with a 2-Step-Verification App
  Password — nothing to set up in Google Cloud

## 2. Install

```bash
# from the repo root
npm run install:all
```

## 3. Configure the backend

```bash
cd server
copy .env.example .env      # Windows  (use `cp` on macOS/Linux)
```

Fill in `server/.env`:

| Variable | What it is |
| --- | --- |
| `MONGO_URI` | MongoDB connection string, database name included in the path |
| `JWT_SECRET` / `CREDENTIAL_ENCRYPTION_KEY` | leave blank — generated automatically on first boot and saved back to this file |
| `SEND_DELAY_MS` | pause between each email in a batch (default 2000) |
| `MAX_BATCH_SIZE` | server-side ceiling per send/retry request (default 200) |

That's the whole backend config — **no global Gmail credentials**. Each user
supplies their own Gmail address + App Password when they register (Google
Account → Security → 2-Step Verification → App passwords), and it's what the
app sends from once they log in. It's encrypted (`CREDENTIAL_ENCRYPTION_KEY`,
AES-256-GCM) before it's stored in MongoDB, and a bad password/address is
rejected right at signup — the server does a real `SMTP VERIFY` against Gmail
before creating the account.

> **DNS note:** if the server logs `querySrv ECONNREFUSED` on startup with a
> `mongodb+srv://` URI, some networks/VPNs block raw DNS SRV lookups. `db.js`
> already points Node at public DNS (8.8.8.8 / 1.1.1.1) to work around this —
> if it still fails, resolve the SRV/TXT records yourself (`nslookup -type=SRV
> _mongodb._tcp.<cluster>`) and use the expanded standard `mongodb://` string
> with the shard hosts instead.

## 4. Run

```bash
# two terminals
cd server && npm run dev     # http://localhost:5000
cd client && npm run dev     # http://localhost:5173

# …or one terminal from the repo root
npm run dev
```

Open **http://localhost:5173** — you'll land on **Register**. Use
`sample-recipients.csv` (full sheet) or `sample-emails-only.csv` (bare list)
to try a campaign out. The sun/moon button toggles light/dark; both are tuned
for a professional look and pass through every shadcn component automatically
(`client/src/index.css`).

## 5. Deploying

Client and server deploy as two separate services (e.g. client on
Vercel/Netlify, server on Render/Railway) — they end up on different domains,
which two things depend on:

- **Client → server URL**: in dev the client talks to `/api` and rides
  Vite's proxy (`vite.config.js`) to `localhost:5000`. There's no proxy in a
  production build, so `client/.env.production` sets
  `VITE_API_URL=https://your-backend.example.com/api`, which Vite bakes into
  the build (`import.meta.env.VITE_API_URL` in `client/src/lib/api.js`) —
  update that file's URL when your backend's URL changes, then rebuild.
- **Cross-site cookies**: the session cookie is `httpOnly` and, once
  `NODE_ENV=production`, switches to `SameSite=None; Secure` (both required
  for a browser to send it on a cross-origin `fetch`/`EventSource` at all —
  see `cookieOptions()` in `authController.js`). This needs HTTPS on both
  sides, which Render/Vercel/Netlify give you by default.

Server environment variables to set on your host: `MONGO_URI`, `JWT_SECRET`,
`CREDENTIAL_ENCRYPTION_KEY`, `CLIENT_URL` (your deployed frontend's exact
origin — the backend's CORS is locked to just this one), `NODE_ENV=production`.
Don't set `PORT` — the platform injects it and `server/src/index.js` already
reads `process.env.PORT`. Also add the platform's outbound IPs (or `0.0.0.0/0`
for simplicity) to your MongoDB Atlas cluster's Network Access list.

---

## How it sends — and how to stay out of spam

Sending **as a real, authenticated Gmail mailbox** — via App Password over
`smtp.gmail.com` — is the single biggest factor: the message goes out on
Google's own infrastructure from the user's actual account, so SPF/DKIM/DMARC
for `gmail.com` already pass and align. That puts you far ahead of a random
SMTP relay.

What this project does for deliverability:

- Every send authenticates as **the logged-in user's own Gmail account**
  (`server/src/services/mailer.js`), pooled per address.
- **Real `From` name**, `multipart/alternative` with **both `text/plain` and
  `text/html`** parts (spam filters distrust HTML-only mail).
- **`List-Unsubscribe` + `List-Unsubscribe-Post` headers** on every message
  (required by Gmail/Yahoo bulk-sender rules and a positive inbox signal).
- **Throttling** — one email at a time with `SEND_DELAY_MS` between them, sent
  in **small batches you control**, and the whole run **stops on the first
  failure** rather than plowing through a broken list.
- **De-duplication and basic validation** of the CSV before anything is queued.

What's still on the sender (Google enforces this since Nov 2025 — failing mail
now gets hard `5xx` rejections, not just spam-foldering):

- **Only email people who expect it.** Keep the spam-complaint rate **under
  0.3%** (ideally < 0.1%) — this matters more than any technical setting.
- **Warm up.** Start with a handful per day and increase gradually.
- **Clean the list** between batches; remove bounces and dead addresses.
- **Write like a human** — personalise with `{{name|there}}`, keep formatting
  simple, avoid link shorteners.
- **Mind Gmail's own limits** — a normal Gmail account allows ~500
  recipients/day; Google Workspace ~2,000/day.
- For real volume from **your own domain**, set up SPF, DKIM and a DMARC
  record (`p=none` to start) on that domain and consider a dedicated ESP.

Sources:
- [Gmail — Email sender guidelines FAQ](https://support.google.com/a/answer/14229414?hl=en)
- [GMass — Gmail Bulk Sender Guidelines (what's actually enforced)](https://www.gmass.co/blog/gmail-bulk-sender-guidelines/)
- [Smartlead — How to send bulk email under the Gmail spam update](https://www.smartlead.ai/blog/gmail-spam-update-how-to-send-bulk-email-in-2025)
- [Nodemailer — OAuth2 / App Password transports](https://nodemailer.com/smtp/oauth2)

---

## API

All `/api/campaigns*` and `/api/analytics` routes require an authenticated
session (`requireAuth` — a JWT in an httpOnly cookie) and are always scoped to
`req.userId`; one user can never see or touch another's data.

| Method & path | Purpose |
| --- | --- |
| `POST /api/auth/register` | name, email, password, `gmailAddress`, `gmailSenderName`, `gmailAppPassword` — verifies the Gmail credentials before creating the account |
| `POST /api/auth/login` | email + password → sets the session cookie |
| `POST /api/auth/logout` | clears the session cookie |
| `GET /api/auth/me` | the current user |
| `PATCH /api/auth/me` | update name / Gmail address / sender name / rotate the App Password (re-verified) |
| `GET /api/auth/mailer-health` | checks the current user's stored Gmail credentials |
| `POST /api/campaigns` | `multipart/form-data`: `name`, `subject`, `body`, `resume` (file), `csv` (file), `pickFrom`, `pickOffset`, `scheduleEnabled`, `scheduleTime`, `scheduleCount` |
| `GET /api/campaigns` | list your campaigns with counts |
| `GET /api/campaigns/:id` | one campaign incl. recipients |
| `PATCH /api/campaigns/:id` | edit `name`, `subject`, `body`, `isHtml`, `pickFrom`, `pickOffset`, `schedule` |
| `DELETE /api/campaigns/:id` | delete a campaign |
| `POST /api/campaigns/:id/send` | `{ "count": 25 }` — send the next N pending; **stops on the first failure** |
| `POST /api/campaigns/:id/send-selected` | `{ "emails": "a@x.com, b@y.com" }` — send to exactly these; anyone not already in the campaign is added as a new recipient first |
| `POST /api/campaigns/:id/retry-failed` | `{ "ids"?: [...], "count"? }` — reset failed recipients to pending and resend (defaults to all) |
| `GET /api/campaigns/:id/stream` | Server-Sent Events — live `sending` / `sent` / `failed` / `batch-done` |
| `GET /api/campaigns/:id/analytics` | counts, per-day sent/failed series, batch history, failed-recipient list |
| `GET /api/analytics` | the same, aggregated across all of your campaigns |

### Stopping on failure

`runBatch` (`server/src/services/sendService.js`) is the one code path behind
every send — manual, scheduled, and retry. The moment one recipient fails, it
stops immediately: nothing after that recipient in the batch is touched. The
campaign's status becomes **`paused`** (if recipients are still pending) so
it's obviously not finished. From there: **Retry failed** to go after the
address that broke, or **Send next batch** to leave it failed and move on.

### Scheduling daily sends (real cron, via `node-cron`)

Every campaign has a **sending mode** — **Manual** or **Scheduled** — chosen
right on the create form (and changeable any time via **Edit**). A cron job
is only ever created when **Scheduled** is explicitly picked; Manual
campaigns never touch the scheduler at all.

`schedule: { enabled, time, count }` — `server/src/scheduler.js` turns `time`
("09:30") into an actual cron expression (`"30 9 * * *"`) and registers it
with [`node-cron`](https://www.npmjs.com/package/node-cron) — one job per
scheduled campaign, kept in an in-memory `Map<campaignId, ScheduledTask>`:

- **Picking Scheduled mode at creation** (`POST /campaigns` with
  `scheduleEnabled=true`) registers the job immediately, before the response
  even comes back.
- **Editing a schedule** (`PATCH /campaigns/:id`) calls
  `syncCampaignSchedule(campaign)`, which stops any existing job for that
  campaign and registers a fresh one from the new `time`/`enabled` value —
  switching back to Manual simply doesn't re-register it, removing the job.
- **Deleting a campaign** calls `removeCampaignSchedule(id)` to stop its job.
- **On server boot**, `startScheduler()` loads every campaign with
  `schedule.enabled: true` from MongoDB and registers a job for each, so
  schedules created before a restart keep firing afterwards.

When a job fires it loads the campaign's owner, decrypts their App Password,
and runs a batch of `count` pending recipients through the exact same
`runBatch` engine as a manual send (same sending order, same stop-on-failure).
Times are the **server's local time zone**. There's still no OS-level cron or
separate process — the jobs live inside the Node process, so a schedule only
fires while the backend is running (see limitations below).

### Server heartbeat (every 4 minutes)

`server/src/heartbeat.js` registers its own `node-cron` job (`*/4 * * * *`)
that self-checks the MongoDB connection and self-pings `GET /api/health`,
logging `[heartbeat] ... db=up http=200` every 4 minutes. It runs once
immediately on boot, then on that cadence for as long as the process is up.

This keeps the app's own DB connection and HTTP stack demonstrably alive and
surfaces a hung connection in the logs quickly — but it's **not** a
substitute for an external uptime monitor. On hosting platforms that suspend
a service after a period of no *inbound* traffic (Render/Railway/Heroku free
tiers, etc.), a same-process self-ping generally doesn't count as external
traffic and won't stop the platform from sleeping the service. If you deploy
somewhere with that behaviour, point an external pinger (UptimeRobot,
cron-job.org, …) at your public `/api/health` URL every few minutes instead.

### Realtime tracking

`GET /api/campaigns/:id/stream` is a Server-Sent Events endpoint the campaign
page subscribes to with `EventSource`. Every send — wherever it was triggered
from — pushes `sending` / `sent` / `failed` / `batch-done` events, so the page
shows the current recipient and a live activity feed without polling.

### Sending to specific people

Below the batch controls on a campaign page, **"Send to specific people"**
takes a comma-separated list of addresses and sends to exactly those — an
alternative to batch-size/sending-order when you just want a handful of
people emailed right now. Addresses are matched case-insensitively against
this campaign's existing recipients:

- Already in the list and still `pending` → sent as-is.
- Already in the list but `sent`/`failed` → skipped and reported back (use
  **Retry failed** for a failed one instead of retyping it here).
- **Not in the list at all → added to the campaign as a new recipient and
  sent anyway.** This is the way to email someone outside the uploaded CSV
  without needing to re-upload a sheet — they end up in the Recipients table
  and analytics like anyone else, just without `{{name}}`/CSV-column data.

Malformed addresses are rejected individually and reported back rather than
failing the whole request. Same stop-on-failure behaviour, same batch history
entry (`trigger: "selected"`).

### Sending order (where a batch starts in the sheet)

Set on the create form and editable any time via **Edit**:

| `pickFrom` | Effect |
| --- | --- |
| `start` (default) | next batch takes the first still-`pending` rows, top-down |
| `end` | next batch takes the last `pending` rows, bottom-up |
| `offset` | skip the first `pickOffset` rows of the sheet, then go top-down |

### CSV format

Anything that gets the email addresses in works — a full sheet
(`name,email,role,company`), just an `email` column, or a bare list with no
header at all (`sample-emails-only.csv`). A **name** column (if present) fills
`{{name}}`; every other column is a placeholder too. For lists with no
name/company, use a fallback so the copy still reads naturally:
`Hi {{name|there}},`.

---

## Security & multi-user notes

- **Auth**: bcrypt-hashed passwords, JWT in an **httpOnly** cookie (not
  readable from JS), 30-day expiry.
- **Gmail App Passwords** are encrypted at rest with AES-256-GCM
  (`CREDENTIAL_ENCRYPTION_KEY`) and never returned by any API response.
- **Isolation**: every campaign query is filtered by `user: req.userId` at the
  database level — a wrong/other user's campaign ID simply 404s.
- Logout clears the cookie but, like any stateless JWT, an already-issued
  token stays valid until it expires — there's no server-side revocation list.
  Fine for a small internal tool; add one if that matters for your use case.

## Notes & limitations

- Sending is **synchronous** within a request: a batch of 50 with a 2s delay
  takes ~100s to return. Keep batches modest, or move sending to a
  queue/worker for higher volume.
- Uploaded resumes live in `server/uploads/` and are deleted with the campaign
  (not currently scoped per-user on disk — fine for a small deployment).
- **Scheduling requires the backend to be running** at the scheduled time —
  if the process is down when a slot passes, that day's send is skipped, not
  queued for later.
- A batch that stops on a failure **doesn't retry automatically**, by design —
  a broken address or an expired App Password won't quietly burn through the
  rest of the list. Use **Retry failed** once it's fixed.
