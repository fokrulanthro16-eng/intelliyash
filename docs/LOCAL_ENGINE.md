# Running IntelliYash as a Local Engine / Background Service

IntelliYash backend is a standard Python/FastAPI process. You can run it persistently in the background so it's always available on your machine — even when you're not actively using the UI.

---

## 1. Quick start (manual)

```bash
cd intelliyash/backend
python run.py          # default: http://localhost:8000
```

Set `INTELLIYASH_HOST=0.0.0.0` to accept connections from other machines on your LAN.

---

## 2. Windows — NSSM service

[NSSM](https://nssm.cc/) wraps any executable as a Windows service.

```powershell
# Install NSSM, then:
nssm install IntelliYash "C:\path\to\python.exe" "C:\path\to\intelliyash\backend\run.py"
nssm set IntelliYash AppDirectory "C:\path\to\intelliyash\backend"
nssm set IntelliYash AppEnvironmentExtra "INTELLIYASH_HOST=0.0.0.0"
nssm start IntelliYash
```

Stop / uninstall:
```powershell
nssm stop IntelliYash
nssm remove IntelliYash confirm
```

---

## 3. Linux — systemd unit

Create `/etc/systemd/system/intelliyash.service`:

```ini
[Unit]
Description=IntelliYash Local AI Backend
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/intelliyash/backend
ExecStart=/home/youruser/.venv/bin/python run.py
Restart=on-failure
RestartSec=5
Environment=INTELLIYASH_HOST=0.0.0.0

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable intelliyash
sudo systemctl start intelliyash
sudo systemctl status intelliyash
```

---

## 4. macOS — launchd plist

Create `~/Library/LaunchAgents/com.intelliyash.backend.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>          <string>com.intelliyash.backend</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/youruser/.venv/bin/python</string>
    <string>/Users/youruser/intelliyash/backend/run.py</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/youruser/intelliyash/backend</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>INTELLIYASH_HOST</key><string>0.0.0.0</string>
  </dict>
  <key>RunAtLoad</key>       <true/>
  <key>KeepAlive</key>       <true/>
  <key>StandardOutPath</key> <string>/tmp/intelliyash.log</string>
  <key>StandardErrorPath</key><string>/tmp/intelliyash.err</string>
</dict>
</plist>
```

Load it:
```bash
launchctl load ~/Library/LaunchAgents/com.intelliyash.backend.plist
launchctl start com.intelliyash.backend
```

---

## 5. Remote access via Cloudflare Tunnel

Cloudflare Tunnel exposes your local backend over HTTPS without opening firewall ports.

### Prerequisites
- Free Cloudflare account
- `cloudflared` CLI: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

### Quick tunnel (no domain required)

```bash
# Start IntelliYash backend first, then:
cloudflared tunnel --url http://localhost:8000
```

Cloudflare prints a temporary `*.trycloudflare.com` URL. Use it as `NEXT_PUBLIC_API_URL` in the frontend.

### Named tunnel (persistent URL)

```bash
cloudflared login
cloudflared tunnel create intelliyash
cloudflared tunnel route dns intelliyash ai.yourdomain.com

# Run tunnel
cloudflared tunnel run intelliyash
```

Config file (`~/.cloudflared/config.yml`):
```yaml
tunnel: intelliyash
credentials-file: /home/youruser/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: ai.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
```

Then set `NEXT_PUBLIC_API_URL=https://ai.yourdomain.com` in the frontend `.env.local`.

---

## 6. Remote access via ngrok

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 8000
```

ngrok prints a `https://<random>.ngrok-free.app` URL. Set it as `NEXT_PUBLIC_API_URL`.

For a stable URL on ngrok's free tier, add `--hostname` with a reserved domain:
```bash
ngrok http 8000 --hostname your-chosen-name.ngrok-free.app
```

---

## 7. Security notes

- The backend currently has **no authentication** for the web UI endpoints (`/api/*`).
- The `/v1/chat/completions` endpoint is protected by Developer API keys (see Settings → Developer API).
- Before exposing to the internet, consider placing a reverse proxy (nginx, Caddy) in front with basic auth, or restrict access to known IPs via Cloudflare Access.
- Never expose `INTELLIYASH_CLOUD_*` env vars to untrusted networks — they contain provider API keys.

---

## 8. Environment variables reference

| Variable | Default | Description |
|---|---|---|
| `INTELLIYASH_HOST` | `127.0.0.1` | Bind address |
| `INTELLIYASH_PORT` | `8000` | HTTP port |
| `INTELLIYASH_CLOUD_PROVIDER` | — | `anthropic`, `openai`, `gemini`, `huggingface` |
| `INTELLIYASH_CLOUD_API_KEY` | — | Anthropic key |
| `INTELLIYASH_OPENAI_API_KEY` | — | OpenAI key |
| `INTELLIYASH_GEMINI_API_KEY` | — | Gemini key |
| `INTELLIYASH_HF_TOKEN` | — | HuggingFace token |
