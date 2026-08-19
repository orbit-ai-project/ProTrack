# 🛰️ Pro Track — College Project Tracker

[![Live Demo](https://img.shields.io/badge/%F0%9F%9A%80_Live_Demo-Open_App-4C5FD5?style=for-the-badge)](https://orbit-ai-project.github.io/ProTrack/)
[![License: MIT](https://img.shields.io/badge/License-MIT-1E8A5C.svg?style=for-the-badge)](LICENSE)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![Runs anywhere](https://img.shields.io/badge/Runs%20on-Windows%20%C2%B7%20Mac%20%C2%B7%20Linux-555)

> **🔗 Live app:** https://orbit-ai-project.github.io/ProTrack/ &nbsp;·&nbsp; sign in with `aarav@college.edu` / `student123`

An AI-assisted project-management app for college project teams and faculty, built
around **Amrita Vishwa Vidyapeetham, Faridabad — B.Tech Artificial Intelligence &
Data Science, Semester 3**.

Team members (Team Lead, Developer, Tester, QnA) collaborate on subject-wise task
boards; faculty supervise groups and leave review remarks.

> 💻 **Runs on any Windows PC, Mac, or Linux** — the frontend is a single HTML file and
> the backend is pure JavaScript (Node.js), with no database to install and no build tools.

---

## ✨ Key Features
- **📊 Interactive Gantt Timeline** — Horizontal visual roadmap mapping out tasks, due dates, progress, and assignments against project weeks.
- **📉 SVG Burndown Analytics Chart** — Dynamic ideal burndown curve vs. actual remaining task tracking.
- **🔍 Kanban Board Quick Filters** — Real-time task board filtering by Assignee, Topic, Priority, or "Only My Tasks".
- **🎓 Official Grade PDF Generator** — Institutional report exporter compiling grading rubrics, marks scorecard, and evaluator signatures.
- **✨ Glassmorphic Layout Theme** — Modern blurred-glass overlays, glows, and dark mode contrast optimizations.
- **Subject workspaces** — every Semester-3 course is a hub; open one to see its tasks and reports.
- **Confetti Celebration** — Confetti animation upon drag-and-drop completion of tasks.
- **Roles & permissions** — Team Lead assigns tasks and members; members update their own tasks; Faculty get read-only supervision + remarks.
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
                                                        │  JSON store       │
                                                        │  (data.json)      │
                                                        │  profiles, groups,│
                                                        │  tasks, activity, │
                                                        │  remarks          │
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
│   ├── db.js                  ← JSON-file store (data.json) + demo-data seed
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

> 📖 **Full step-by-step guide (with prerequisites & troubleshooting): [`HOW_TO_RUN.md`](HOW_TO_RUN.md)**

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
| Backend | Node.js, Express (pure JavaScript, no native modules) |
| Database | JSON file store (`data.json`) — zero-install, cross-platform |
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
