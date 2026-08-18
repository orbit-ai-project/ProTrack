# Orbit AI — Real-World Implementation Guide

This guide explains how to take the Orbit project tracker (`index.html`) from a
browser-only prototype to something real people can use.

---

## 0. Understand what you have today

- **Frontend:** one file, `index.html` (HTML + CSS + vanilla JavaScript). No build step, no framework.
- **Database:** the browser's `localStorage`. Data is saved **only in the browser that created it**, on that one device.
- **Auth:** a demo password hash (`hash()` in the file). It is **not secure** — fine for a demo, not for real users.
- **"Live" sync:** `BroadcastChannel` + polling — only syncs **tabs of the same browser**, not different people/devices.

> **Takeaway:** As-is it is a great single-machine demo. To let real students/faculty
> on different devices share data, you must add a backend + database + real login.

You have **two paths**. Pick based on your goal.

| | Path A — Ship the demo | Path B — Real multi-user app |
|---|---|---|
| Effort | 10 minutes | 1–2 days |
| Cost | Free | Free tier |
| Data shared across devices? | ❌ per-browser | ✅ yes |
| Real secure login? | ❌ demo only | ✅ yes |
| Good for | College submission, viva, portfolio link | Actual usage by a class |

---

## PATH A — Deploy the demo as a live website (fastest)

Your app is a static site, so any static host works. Data still stays per-browser,
but you get a real public URL you can share and put in your report.

### Option A1 — Netlify Drop (no account/coding, ~2 min)
1. Rename the file to `index.html` (already done) and put it in an empty folder.
2. Go to **https://app.netlify.com/drop**.
3. **Drag the folder** onto the page.
4. You instantly get a URL like `https://your-name.netlify.app`. Done.

### Option A2 — GitHub Pages (good for your report/version history)
```bash
# in the folder that contains index.html
git init
git add index.html
git commit -m "Orbit AI project tracker"
# create an empty repo named "orbit" on github.com first, then:
git remote add origin https://github.com/<your-username>/orbit.git
git branch -M main
git push -u origin main
```
Then on GitHub: **Settings → Pages → Source: `main` / root → Save.**
Your site appears at `https://<your-username>.github.io/orbit/`.

### Option A3 — Vercel
1. Push to GitHub (as above).
2. Go to **https://vercel.com**, "Add New → Project", import the repo, click **Deploy**.

✅ **For a college minor project, Path A is usually all you need.** Mention in your
report that data is stored client-side (localStorage) as a design choice for the prototype.

---

## PATH B — Turn it into a real multi-user app (recommended: Supabase)

To let different people on different devices share the same live data with secure
login, you replace `localStorage` with a real backend. The easiest for a student is
**Supabase** (free Postgres database + authentication + realtime, no server to run).

### Step 1 — Create the project
1. Go to **https://supabase.com** → sign in → **New project**.
2. Note your **Project URL** and **anon public API key** (Settings → API).

### Step 2 — Create the database tables
Open Supabase **SQL Editor** and run this (it mirrors the app's data model):

```sql
-- profiles: one row per user (linked to Supabase Auth)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  email text unique not null,
  role text not null check (role in ('Team Lead','Developer','Tester','QnA','Faculty')),
  group_id text,
  color text default '#5A6BD8',
  created_at timestamptz default now()
);

create table groups (
  id text primary key,
  name text not null,
  project text,
  subject text,
  course_code text,
  lead_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- which faculty supervise which group (many-to-many)
create table group_faculty (
  group_id text references groups(id) on delete cascade,
  faculty_id uuid references profiles(id) on delete cascade,
  primary key (group_id, faculty_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  group_id text references groups(id) on delete cascade,
  assignee_id uuid references profiles(id),
  title text not null,
  descr text,
  status text default 'todo',
  progress int default 0,
  prio text default 'med',
  course_code text,
  due timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  user_id uuid references profiles(id),
  text text not null,
  ts timestamptz default now()
);

create table activity (
  id uuid primary key default gen_random_uuid(),
  group_id text references groups(id) on delete cascade,
  user_id uuid references profiles(id),
  text text,
  ts timestamptz default now()
);

create table remarks (
  id uuid primary key default gen_random_uuid(),
  group_id text references groups(id) on delete cascade,
  by_name text,
  text text,
  ts timestamptz default now()
);
```

### Step 3 — Turn on Row Level Security (so people only see their own data)
```sql
alter table profiles      enable row level security;
alter table groups        enable row level security;
alter table group_faculty enable row level security;
alter table tasks         enable row level security;
alter table comments      enable row level security;
alter table activity      enable row level security;
alter table remarks       enable row level security;

-- everyone signed in can read; tighten later as needed
create policy "read all" on profiles for select using (auth.role() = 'authenticated');
create policy "read all" on groups   for select using (auth.role() = 'authenticated');
create policy "read all" on tasks    for select using (auth.role() = 'authenticated');
-- a user can update a task if they are the assignee or the group's lead
create policy "edit own tasks" on tasks for update using (
  assignee_id = auth.uid()
  or exists (select 1 from groups g where g.id = tasks.group_id and g.lead_id = auth.uid())
);
create policy "insert own profile" on profiles for insert with check (id = auth.uid());
```
> Start permissive, then tighten. Supabase's docs have a full RLS tutorial.

### Step 4 — Add the Supabase client to the frontend
In `index.html`, just before your `<script>` block, add:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```
At the top of your script:
```js
const sb = supabase.createClient(
  'https://YOUR-PROJECT.supabase.co',  // Project URL
  'YOUR-ANON-PUBLIC-KEY'               // anon key (safe to expose in the browser)
);
```

### Step 5 — Replace the demo auth with real auth
Delete the `hash()` function and use Supabase Auth. Replace `Auth.signin()`:
```js
async signin(){
  const email = document.getElementById('si_email').value.trim();
  const pw    = document.getElementById('si_pass').value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) return Auth.showErr('si_err', error.message);
  await App.boot();               // load data for the signed-in user
}
```
Team-lead registration becomes:
```js
const { data, error } = await sb.auth.signUp({ email, password: pw });
// then insert into profiles + groups
await sb.from('profiles').insert({ id: data.user.id, name, email, role: 'Team Lead' });
```
> When a team lead "adds a member", have them create the member's auth user via a
> small Supabase **Edge Function** (so the lead doesn't handle raw passwords in the
> browser), or invite by email.

### Step 6 — Replace localStorage reads/writes with database calls
Wherever the app currently does `DB.s.tasks`, `DB.save()`, etc., swap to Supabase.
Examples:
```js
// load everything for the current user
const { data: tasks }  = await sb.from('tasks').select('*');
const { data: groups } = await sb.from('groups').select('*');

// create a task
await sb.from('tasks').insert({
  group_id: gid, assignee_id, title, descr: desc,
  status, prio, course_code: courseCode, due
});

// move a task
await sb.from('tasks').update({ status, updated_at: new Date() }).eq('id', id);
```
Keep the exact same UI functions (`Page.*`, `Board.*`) — only change where the data
comes from. Load once after sign-in into an in-memory object and re-render from it.

### Step 7 — Real live sync (replaces BroadcastChannel)
```js
sb.channel('tasks')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' },
      () => App.reloadAndRender())
  .subscribe();
```
Now every device updates in real time — this is the true version of your "Live" badge.

### Step 8 — Deploy the frontend
Same as Path A (Netlify/Vercel/GitHub Pages). The anon key is meant to live in the
browser; RLS is what actually protects data.

---

## Recommended order of work (Path B)
1. Supabase project + tables + RLS (Steps 1–3).
2. Add client + real login (Steps 4–5). Test signup/login.
3. Migrate **tasks** first (Step 6) end-to-end, then groups, comments, activity, remarks.
4. Add realtime (Step 7).
5. Deploy (Step 8).
6. Tighten RLS policies and add faculty "add group" / member-invite via Edge Function.

---

## Security checklist before real users
- [ ] Remove the demo `hash()` and the "Demo accounts" panel on the sign-in screen.
- [ ] Use Supabase Auth (bcrypt-backed) — never store plaintext/weak-hashed passwords.
- [ ] Turn on and test **Row Level Security** on every table.
- [ ] Don't let the browser create other users' passwords — use invites/Edge Functions.
- [ ] Add basic input validation server-side (RLS + column checks).
- [ ] Set a custom domain + HTTPS (automatic on Netlify/Vercel).

---

## Tech summary (for your report)
- **Frontend:** HTML, CSS, vanilla JavaScript (SPA, no framework).
- **Prototype storage:** browser localStorage.
- **Production backend (Path B):** Supabase — PostgreSQL, Auth, Row Level Security, Realtime.
- **Hosting:** Netlify / Vercel / GitHub Pages (static).
- **Curriculum data:** Amrita Vishwa Vidyapeetham, Faridabad — B.Tech AI & Data Science, Semester 3.

*Alternative to Supabase:* Firebase (Firestore + Firebase Auth) works the same way if
you prefer Google's stack. Node.js + Express + MongoDB/PostgreSQL is the "build your own
server" route — more control, more work.
