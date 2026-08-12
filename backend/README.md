# Orbit AI — Backend API

A real backend for the Orbit project tracker: **Node.js + Express + SQLite**, with
**JWT authentication** and **bcrypt-hashed passwords**. No external database to install —
SQLite creates a local `orbit.db` file automatically and seeds demo data on first run.

## Stack
- **Express** — HTTP server / REST API
- **better-sqlite3** — embedded SQL database (file: `orbit.db`)
- **jsonwebtoken** — login tokens (JWT)
- **bcryptjs** — secure password hashing

## Run it (3 commands)
```bash
cd backend
npm install
npm start
```
The API starts at **http://localhost:4000**. First run prints
`✓ database seeded` and creates `orbit.db`.

> Optional: copy `.env.example` to `.env` and set a real `JWT_SECRET`.
> Delete `orbit.db` any time to reset all data.

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

## Database tables
`profiles` · `groups` · `group_faculty` · `tasks` · `comments` · `activity` · `remarks`
(see `db.js` for the exact schema — it mirrors the frontend's data model, including
`course_code` on tasks so every task belongs to a subject).

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
  start command `npm start`. Note: SQLite needs a persistent disk; on ephemeral hosts
  use their volume feature, or switch to their managed Postgres.
- Point the frontend's `const API = ...` at your deployed URL, then host the frontend
  on Netlify/Vercel (see `../DEPLOYMENT_GUIDE.md`).

## Security notes
- Passwords are hashed with bcrypt — never stored in plaintext.
- Change `JWT_SECRET` before deploying.
- CORS is fully open for development; restrict `origin` in production.
