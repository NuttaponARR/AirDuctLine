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

## Notes

- Real LINE LIFF login uses `/api/line/session`.
- Browser fallback remains available for local testing.
- Runtime data and `.env.line` are intentionally not committed to Git.
