# LINE LIFF Setup

This project is ready to test with real LINE LIFF after you provide a public
HTTPS URL and a LIFF ID from LINE Developers.

## 1. Start the local server

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\start-office-mes.ps1
```

Local app:

```text
http://localhost:8765/
http://localhost:8765/line.html
```

## 2. Expose the app with HTTPS

LINE LIFF requires an HTTPS endpoint that the phone can reach. `localhost`
cannot be used from LINE on a real phone.

Option A: use your own HTTPS domain and reverse proxy it to this server.

Option B: install Cloudflare Tunnel, then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\start-cloudflare-tunnel.ps1
```

Copy the generated URL, for example:

```text
https://example.trycloudflare.com
```

Your LIFF endpoint URL will be:

```text
https://example.trycloudflare.com/line.html
```

## 3. Create the LIFF app

In LINE Developers:

- Create or open a Provider.
- Create or open a LINE Login channel.
- Add a LIFF app.
- Set Endpoint URL to your HTTPS `/line.html` URL.
- Use size `Full`.
- Copy the LIFF ID.

## 4. Configure this project

Copy the example file:

```powershell
Copy-Item .env.line.example .env.line
```

Edit `.env.line`:

```text
LIFF_ID=your-liff-id
LINE_APP_URL=https://example.trycloudflare.com
PORT=8765
HOST=0.0.0.0
```

Then restart for LINE:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\stop-office-mes.ps1
powershell -ExecutionPolicy Bypass -File .\ops\start-line-liff.ps1
```

## 5. Link LINE users

Open the app as Admin:

```text
http://localhost:8765/
```

Go to Admin and fill each user's `LINE User ID`.

If a LINE user is not linked yet, the LINE Pilot page will show the LINE User ID
that should be copied into Admin.

## 6. Optional: Messaging API webhook

The LIFF flow above does not require this. Only set it up if you want the
LINE Official Account itself to receive events (user sends the OA a message,
follows/unfollows, taps a rich menu that posts back, etc.).

1. In LINE Developers, open (or create) a **Messaging API** channel under the
   same Provider as your LIFF app.
2. Under "Messaging API" tab, issue a **Channel access token** and copy the
   **Channel secret**.
3. Add both to `.env.line`:

   ```text
   LINE_CHANNEL_SECRET=your-channel-secret
   LINE_CHANNEL_ACCESS_TOKEN=your-channel-access-token
   ```

4. Restart the server (`stop-office-mes.ps1` then `start-line-liff.ps1`).
5. In the Messaging API channel settings, set **Webhook URL** to your public
   HTTPS URL + `/api/line/webhook`, e.g.:

   ```text
   https://example.trycloudflare.com/api/line/webhook
   ```

6. Enable "Use webhook" and click **Verify** — it should succeed once the
   channel secret matches.

The webhook handler (`lineWebhook` in `server.js`) verifies the
`x-line-signature` header against `LINE_CHANNEL_SECRET`, then for each event:

- `follow` — replies with a welcome message. If the LINE user id is not yet
  linked to an Office MES user, the reply includes the id so Admin can paste
  it into that user's `LINE User ID` field.
- `message` (text) — replies with a short acknowledgement, or the same
  "not linked yet" message if unlinked.

Both branches log to `activityLog` via `recordActivity`. Extend
`handleLineEvent` in `server.js` to add real command handling (e.g. checking
job status by typing an INQ number) or push proactive notifications using
`callLineApi("/v2/bot/message/push", ...)`.

`GET /api/line/config` now also returns `webhookUrl` and `webhookReady`
(true only when both `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN`
are set) so the Admin UI can surface webhook status if needed.

## Notes

- Real LINE LIFF login uses `/api/line/session`.
- Browser fallback remains available for local testing.
- Runtime data and `.env.line` are intentionally not committed to Git.
