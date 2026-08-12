# 🛰️ Orbit AI — College Project Tracker

An AI-assisted project-management app for college project teams and faculty, built
around **Amrita Vishwa Vidyapeetham, Faridabad — B.Tech Artificial Intelligence &
Data Science, Semester 3**.

Team members (Team Lead, Developer, Tester, QnA) collaborate on subject-wise task
boards; faculty supervise groups and leave review remarks.

---

## ✨ Key Features
- **Subject workspaces** — every Semester-3 course is a hub; open one to see its tasks and reports.
- **Kanban task board** — drag-and-drop across To Do → In Progress → Blocked → In Review → Done, with animated card movement and a confetti celebration on completion.
- **Roles & permissions** — Team Lead assigns tasks and members; members update their own tasks; Faculty get read-only supervision + remarks.
- **Faculty adds groups** — teachers choose which teams they supervise.
- **AI insights & project health** — data-driven risk detection, workload balance, and a health score.
- **Calendar** of task deadlines and a **notifications** centre.
- **Real Semester-3 subject list** with Amrita AI&DS course codes (23AID2xx, 23MAT204, …).

---

## 🏗️ Architecture

```
┌──────────────────────┐        HTTPS / JSON        ┌──────────────────────────┐
│   FRONTEND (browser) │  ───────────────────────▶  │   BACKEND (Node.js)      │
│   frontend/index.html│   POST /api/auth/login     │   Express REST API       │
│   HTML · CSS · JS    │   GET  /api/bootstrap      │   JWT auth · bcrypt      │
│   (single-page app)  │   POST /api/tasks ...      │                          │
└──────────────────────┘  ◀───────────────────────  └───────────┬──────────────┘
                                                                 │
                                                        ┌────────▼─────────┐
                                                        │  SQLite (orbit.db)│
                                                        │  profiles, groups,│
                                                        │  tasks, comments, │
                                                        │  activity, remarks│
                                                        └───────────────────┘
```

> The frontend also runs **standalone** (browser `localStorage`) with no backend —
> handy for a quick demo. The backend upgrades it to a real, multi-user system.

---

## 📁 Folder Structure
```
Orbit-AI-Project/
├── README.md                  ← this file
├── frontend/
│   └── index.html             ← the complete web app (HTML + CSS + JavaScript)
├── backend/
│   ├── server.js              ← Express REST API (auth, tasks, groups, remarks…)
│   ├── db.js                  ← SQLite schema + demo-data seed
│   ├── package.json           ← dependencies & scripts
│   ├── package-lock.json
│   ├── .env.example           ← config template (copy to .env)
│   ├── .gitignore
│   └── README.md              ← full API reference + how to connect the frontend
└── docs/
    └── DEPLOYMENT_GUIDE.md     ← how to deploy (static host + Supabase/this backend)
```

---

## 🚀 How to Run

### Option 1 — Frontend only (fastest, for a demo)
Just open **`frontend/index.html`** in any modern browser. Data is stored in the
browser. Use the demo logins shown on the sign-in screen.

### Option 2 — Full stack (frontend + backend)
```bash
# 1) start the backend
cd backend
npm install
npm start                     # → API on http://localhost:4000

# 2) open frontend/index.html in a browser
#    (see backend/README.md to point the app at the API)
```

### Demo logins
| Role | Email | Password |
|------|-------|----------|
| Faculty | `sharma@college.edu` | `faculty123` |
| Team Lead | `aarav@college.edu` | `student123` |
| Students | *shown in app* | `student123` |

---

## 🔌 Backend API (summary)
`POST /api/auth/login` · `POST /api/auth/register-lead` · `GET /api/bootstrap` ·
`POST /api/tasks` · `PATCH /api/tasks/:id` · `POST /api/members` ·
`PATCH /api/groups/:id/subject` · `POST /api/groups/:id/supervise` · `POST /api/remarks`

Full reference with request/response details: **`backend/README.md`**.

---

## 🧰 Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | HTML, CSS, Vanilla JavaScript (single-page app, no framework) |
| Backend | Node.js, Express |
| Database | SQLite (via better-sqlite3) |
| Auth | JWT (jsonwebtoken) + bcrypt password hashing |
| Hosting (suggested) | Netlify / Vercel / GitHub Pages (frontend) · Render / Railway (backend) |

---

## 🌐 Deployment
Step-by-step in **`docs/DEPLOYMENT_GUIDE.md`** — covers both a quick static deploy and
a full multi-user setup.

---

## 👤 Credits
College minor project. Curriculum data: **Amrita Vishwa Vidyapeetham, Faridabad —
B.Tech AI & Data Science (2023 curriculum), Semester 3**.
