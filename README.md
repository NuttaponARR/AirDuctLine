# Office MES Prototype

Internal browser-based MES workflow prototype for sales, production, warehouse,
planning, logistics, and admin handoffs.

## Project Structure

- `server.js` - Node.js backend and static file server
- `index.html`, `app.js`, `styles.css` - main Office MES web app
- `line-mes-starter.*` - LINE/LIFF-oriented workflow prototype
- `line-mobile-preview.*` - mobile preview prototype
- `ops/` - Windows PowerShell helper scripts for running, stopping, backing up,
  and checking the local service
- `scripts/` - utility scripts
- `data/` - runtime JSON data directory
- `uploads/` - runtime uploaded document directory

Runtime data, uploaded documents, logs, generated exports, and backups are not
committed to Git.

## Run Locally

From PowerShell in the project folder:

```powershell
.\ops\start-office-mes.ps1
```

Default URL:

```text
http://localhost:8765/
```

To stop the service:

```powershell
.\ops\stop-office-mes.ps1
```

To check service status:

```powershell
.\ops\status-office-mes.ps1
```

## LINE Pilot

Open the mobile-first LINE pilot page:

```text
http://localhost:8765/line.html
```

For local testing before LIFF is connected, simulate a LINE identity by adding a
registered LINE User ID:

```text
http://localhost:8765/line.html?lineUserId=Uxxxxxxxx
```

When a real LIFF app is ready, start the server with:

```powershell
$env:LIFF_ID="your-liff-id"; .\ops\start-office-mes.ps1
```

For the full real-LINE setup checklist, including HTTPS tunnel and LIFF app
settings, see:

```text
ops/README-LINE-LIFF.md
```

## Backup

Back up runtime data and uploads with:

```powershell
.\ops\backup-office-mes.ps1
```

Back up the full project folder with:

```powershell
.\ops\backup-project.ps1
```
