# ▶️ How to Run Pro Track

Two ways to run it. **Way 1** needs nothing but a browser (great for a demo/viva).
**Way 2** runs the real backend too.

> 💻 **Works on any Windows PC, Mac, or Linux.** The backend is pure JavaScript — no
> database to install and no build tools needed. If Node.js is installed, `npm install`
> just works.

---

## ✅ Prerequisites
| For | You need |
|-----|----------|
| Way 1 (frontend only) | Any modern web browser (Chrome, Edge, Safari, Firefox) |
| Way 2 (full stack)    | The above **+ Node.js 18 or newer** — download: https://nodejs.org (LTS) |

Check Node is installed (Way 2 only):
```bash
node -v      # should print v18.x or higher
npm -v
```

---

## Way 1 — Run the frontend only (fastest)

1. Open the project folder.
2. Double-click **`frontend/index.html`** — it opens in your browser and the app just works.
3. Sign in with a demo account (shown on the sign-in screen):
   - **Faculty:** `sharma@college.edu` / `faculty123`
   - **Team Lead:** `aarav@college.edu` / `student123`
   - Other students use `student123`.

> Data is saved inside your browser (localStorage). It stays on that one computer —
> perfect for a demo. To reset everything, use **"Reset demo data"** in the app, or
> clear the site data in your browser.

---

## Way 2 — Run the full stack (frontend + backend)

### Step 1 — Start the backend
Open a terminal in the project folder:
```bash
cd backend
npm install      # first time only — downloads dependencies
npm start
```
You should see:
```
✓ data seeded (demo faculty + 3 groups + tasks) -> data.json
🚀 Orbit API running at http://localhost:4000
```
Leave this terminal running. The API is now live at **http://localhost:4000**.

Quick check — open http://localhost:4000 in a browser, you should see:
`{"ok":true,"service":"Pro Track API",...}`

### Step 2 — Open the frontend
Open **`frontend/index.html`** in your browser (same as Way 1).

> By default the frontend still uses browser storage. To make it talk to the backend,
> follow **"Connecting the frontend"** in [`backend/README.md`](backend/README.md)
> (add the small `api()` adapter and point it at `http://localhost:4000`).

### Step 3 — Stop the backend
In the backend terminal, press **Ctrl + C**.
To reset all backend data, delete the file `backend/data.json` and start again.

---

## 🖥️ Full setup on localhost (step-by-step in the terminal)

This is the complete, proper way to run **both** the backend **and** the frontend on
`localhost` using the terminal. You will use **two terminal windows** — one for each.

### 0) Install Node.js (once)
Download the **LTS** version from https://nodejs.org and install it. Then open a new
terminal and confirm:
```bash
node -v
npm -v
```
Both should print a version number.

### 1) Get the project onto your computer
**Option A — clone with Git:**
```bash
git clone https://github.com/orbit-ai-project/ProTrack.git
cd ProTrack
```
**Option B — download the ZIP** from GitHub (green **Code ▸ Download ZIP**), unzip it,
then `cd` into the unzipped folder.

Opening a terminal *in the project folder*:
- **Windows:** open the folder in File Explorer → click the address bar → type `cmd` → Enter.
- **Mac:** right-click the folder in Finder → *New Terminal at Folder* (enable it in
  System Settings ▸ Keyboard ▸ Shortcuts ▸ Services if needed).

### 2) Terminal 1 — start the BACKEND (port 4000)
```bash
cd backend
npm install
npm start
```
Wait for:
```
🚀 Orbit API running at http://localhost:4000
```
Test it: open **http://localhost:4000** in your browser — you should see
`{"ok":true,"service":"Pro Track API",...}`. **Leave this terminal running.**

### 3) Terminal 2 — serve the FRONTEND on localhost
Open a **second** terminal in the project folder (don't close the first). Pick any one:

**Easiest (uses Node, no install):**
```bash
npx serve frontend
```
It prints a URL like `http://localhost:3000` — open that in your browser.

**Or with Python (already on most Macs/Linux):**
```bash
cd frontend
python3 -m http.server 5500      # Windows: python -m http.server 5500
```
Then open **http://localhost:5500**.

**Or in VS Code:** install the **Live Server** extension, right-click
`frontend/index.html` → **Open with Live Server**.

> Why serve it instead of double-clicking? Opening over `http://localhost` (not
> `file://`) is the correct way for a web app and is required for the frontend to call
> the backend API without browser security errors.

### 4) You now have both running
| Part | URL | Terminal |
|------|-----|----------|
| Backend API | http://localhost:4000 | Terminal 1 |
| Frontend app | http://localhost:3000 (or :5500) | Terminal 2 |

Sign in with a demo account (`aarav@college.edu` / `student123`).

### 5) Stop everything
Press **Ctrl + C** in **each** terminal.

> **Connecting the app to the API:** by default the frontend uses browser storage. To
> make it read/write through the backend on localhost:4000, add the small `api()`
> adapter from [`backend/README.md`](backend/README.md) and set `const API =
> 'http://localhost:4000'`. CORS is already enabled on the backend for local use.

---

## 🧪 Test the backend without the app (optional)
```bash
# log in and get a token
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"aarav@college.edu","password":"student123"}'
```
You'll get back a `token`. Use it to load data:
```bash
curl http://localhost:4000/api/bootstrap -H "Authorization: Bearer PASTE_TOKEN_HERE"
```

---

## 🛠️ Troubleshooting
| Problem | Fix |
|--------|-----|
| `command not found: node` / `npm` | Install Node.js from https://nodejs.org, then reopen the terminal. |
| `npm install` fails | Delete `backend/node_modules` and run `npm install` again. (No build tools are needed — every dependency is pure JavaScript.) |
| Port 4000 already in use | Windows: `set PORT=5000 && npm start` · Mac/Linux: `PORT=5000 npm start` (or edit `backend/.env`). |
| Want a clean database | Delete `backend/data.json` and restart the backend. |
| App looks empty after login | Click **"Reset demo data"** in the app to reseed the demo. |

---

## 🌐 Putting it online
See [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md) — deploy the frontend to
Netlify/Vercel/GitHub Pages and the backend to Render/Railway.
