# Orbit AI — Backend API

A real backend for the Orbit project tracker: **Node.js + Express**, with
**JWT authentication** and **bcrypt-hashed passwords**. Data is kept in a simple
`data.json` file that is created and seeded automatically on first run.

> **Runs on any PC or Mac.** Every dependency is **pure JavaScript** — there is no
> native module and no database to install, so `npm install` never needs C/C++ build
> tools. If you have Node.js, it runs.

## Stack
- **Express** — HTTP server / REST API
- **JSON file store** (`data.json`) — zero-install persistence, pure JS
- **jsonwebtoken** — login tokens (JWT)
- **bcryptjs** — secure password hashing

## Run it (3 commands)
```bash
cd backend
npm install
npm start
```
The API starts at **http://localhost:4000**. First run prints
`✓ data seeded` and creates `data.json`.

> Optional: copy `.env.example` to `.env` and set a real `JWT_SECRET`.
> Delete `data.json` any time to reset all data.

## Demo logins (same as the app)
| Role | Email | Password |
|------|-------|----------|
| Faculty | `sharma@college.edu` | `faculty123` |
| Team Lead (Group 01) | `aarav@college.edu` | `student123` |
| Any seeded student | *see the app* | `student123` |

## How auth works
1. `POST /api/auth/login` returns `{ token, user }`.
2. Send that token on every other request:
   `Authorization: Bearer <token>`.
3. The server verifies it, loads your profile, and scopes what you can see
   (a student sees their group; faculty see only the groups they supervise).

## API reference
| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| POST | `/api/auth/login` | anyone | Sign in → token |
| POST | `/api/auth/register-lead` | anyone | Create a team lead + group |
| POST | `/api/auth/register-faculty` | anyone | Create a faculty account |
| GET | `/api/me` | signed in | Current user |
| GET | `/api/subjects` | anyone | Semester-3 subject list |
| GET | `/api/bootstrap` | signed in | **Everything you can see** (groups, users, tasks, activity, remarks) in one call |
| POST | `/api/members` | lead | Add a Developer/Tester/QnA (creates their login) |
| POST | `/api/members/:id/reset-password` | lead | Reset a member's password |
| DELETE | `/api/members/:id` | lead | Remove a member (their tasks pass to the lead) |
| GET | `/api/groups` | signed in | All groups (for the faculty "add group" picker) |
| PATCH | `/api/groups/:id/subject` | lead | Set the project's course/subject |
| POST | `/api/groups/:id/supervise` | faculty | Faculty starts supervising a group |
| DELETE | `/api/groups/:id/supervise` | faculty | Faculty stops supervising |
| POST | `/api/tasks` | lead | Create a task (with `courseCode`) |
| PATCH | `/api/tasks/:id` | assignee/lead | Update status, progress, subject, etc. |
| DELETE | `/api/tasks/:id` | lead | Delete a task |
| POST | `/api/tasks/:id/comments` | group members | Add a comment |
| POST | `/api/remarks` | faculty | Leave a review remark on a group |

### Quick test with curl
```bash
# login
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"aarav@college.edu","password":"student123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

# load everything
curl -s http://localhost:4000/api/bootstrap -H "Authorization: Bearer $TOKEN"
```

## Data model (`data.json`)
Collections: `profiles` · `groups` (with `facultyIds`) · `tasks` (with `comments`) ·
`activity` · `remarks`. See `db.js` — it mirrors the frontend's data model, including
`courseCode` on every task so each task belongs to a subject.

---

## Connecting the frontend (`index.html`)
The frontend currently reads/writes `localStorage` through a `DB` object. To use this
backend instead, add a tiny API layer and call it after login. Minimal example:

```js
const API = 'http://localhost:4000';
let TOKEN = localStorage.getItem('orbit.token') || null;

async function api(path, method = 'GET', body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json',
               ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// login
async function login(email, password) {
  const { token, user } = await api('/api/auth/login', 'POST', { email, password });
  TOKEN = token; localStorage.setItem('orbit.token', token);
  return user;
}

// load all data for the current user (replaces DB.load / seed)
async function loadAll() {
  const boot = await api('/api/bootstrap');
  DB.s = { users: boot.users, groups: boot.groups, tasks: boot.tasks,
           activity: boot.activity, remarks: boot.remarks };
  App.render();
}

// example writes
const createTask = t => api('/api/tasks', 'POST', t).then(loadAll);
const moveTask   = (id, status) => api('/api/tasks/' + id, 'PATCH', { status }).then(loadAll);
```
Replace each `DB.save()` / direct `DB.s.*` mutation with the matching `api(...)` call,
then `loadAll()` to refresh. The response fields already use the frontend's names
(`groupId`, `assigneeId`, `courseCode`, `desc`, …), so the UI code barely changes.

> For live multi-device updates, poll `GET /api/bootstrap` every few seconds, or add
> WebSockets (e.g. `socket.io`) later.

## Deploying the backend
- **Render / Railway / Fly.io** (free tiers) — push this folder, set `JWT_SECRET`,
  `HOST=0.0.0.0`, and `CORS_ORIGIN=https://your-frontend-url`, start command
  `npm start`. `data.json` is written to disk; on hosts with an ephemeral
  filesystem, attach a small persistent volume (or move to a managed database)
  so data survives restarts.
- Point the frontend's `const API = ...` at your deployed URL, then host the frontend
  on Netlify/Vercel (see `../docs/DEPLOYMENT_GUIDE.md`).

## Security notes
- Passwords are hashed with bcrypt — never stored in plaintext.
- Change `JWT_SECRET` before deploying.
- The server binds to `127.0.0.1` (localhost-only) by default — set `HOST=0.0.0.0`
  in `.env` only when deploying behind Render/Railway/Fly.io.
- CORS only allows the origins listed in `CORS_ORIGIN` (defaults to the local demo
  origins); add your deployed frontend URL there when hosting frontend and backend
  separately.
