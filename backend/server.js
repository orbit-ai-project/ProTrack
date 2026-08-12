/* ============================================================
   server.js — Orbit AI REST API
   Express + SQLite + JWT auth (bcrypt passwords).
   Run:  npm install  &&  npm start
   ============================================================ */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, uid, SUBJECTS } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(cors());               // allow the frontend (any origin) during development
app.use(express.json());

/* ---------- small helpers ---------- */
const now = () => Date.now();
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const sign = id => jwt.sign({ id }, SECRET, { expiresIn: '7d' });

const TASK_COLS = `id, group_id AS groupId, assignee_id AS assigneeId, title,
  descr AS "desc", status, progress, prio, course_code AS courseCode, due,
  created_at AS createdAt, updated_at AS updatedAt`;

const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role,
  groupId: u.group_id, color: u.color, createdAt: u.created_at });

function logAct(groupId, userId, text) {
  db.prepare('INSERT INTO activity (id,group_id,user_id,text,ts) VALUES (?,?,?,?,?)')
    .run(uid(), groupId, userId, text, now());
}
function commentsFor(taskId) {
  return db.prepare('SELECT user_id AS userId, text, ts FROM comments WHERE task_id=? ORDER BY ts')
    .all(taskId);
}

/* ---------- auth middleware ---------- */
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const { id } = jwt.verify(token, SECRET);
    const u = db.prepare('SELECT * FROM profiles WHERE id=?').get(id);
    if (!u) return res.status(401).json({ error: 'Account not found' });
    req.user = u;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}
const isFaculty = u => u.role === 'Faculty';
const isLead = u => u.role === 'Team Lead';

/* which group ids can this user see */
function scopeGroupIds(u) {
  if (isFaculty(u)) {
    return db.prepare('SELECT group_id FROM group_faculty WHERE faculty_id=?')
      .all(u.id).map(r => r.group_id);
  }
  return u.group_id ? [u.group_id] : [];
}

/* ============================================================
   AUTH
   ============================================================ */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Enter email and password.' });
  const u = db.prepare('SELECT * FROM profiles WHERE lower(email)=lower(?)').get(email.trim());
  if (!u || !bcrypt.compareSync(password, u.pass_hash))
    return res.status(401).json({ error: 'That email and password combination is not recognised.' });
  res.json({ token: sign(u.id), user: publicUser(u) });
});

app.post('/api/auth/register-lead', (req, res) => {
  const { name, email, password, groupName, project, courseCode } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Enter your full name.' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if ((password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!groupName) return res.status(400).json({ error: 'Give your group a name.' });
  if (db.prepare('SELECT 1 FROM profiles WHERE lower(email)=lower(?)').get(email))
    return res.status(409).json({ error: 'An account with that email already exists.' });

  const gid = 'g-' + uid().slice(0, 8), userId = 'u-' + uid().slice(0, 8);
  const c = SUBJECTS.find(s => s.code === courseCode);
  db.prepare(`INSERT INTO profiles (id,name,email,pass_hash,role,group_id,color,created_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(userId, name, email, bcrypt.hashSync(password, 10), 'Team Lead', gid, '#5A6BD8', now());
  db.prepare(`INSERT INTO groups (id,name,project,subject,course_code,lead_id,created_at)
    VALUES (?,?,?,?,?,?,?)`)
    .run(gid, groupName, project || '', c ? `${c.code} · ${c.name}` : '—', c ? c.code : null, userId, now());

  const u = db.prepare('SELECT * FROM profiles WHERE id=?').get(userId);
  res.json({ token: sign(userId), user: publicUser(u) });
});

app.post('/api/auth/register-faculty', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Enter your full name.' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if ((password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (db.prepare('SELECT 1 FROM profiles WHERE lower(email)=lower(?)').get(email))
    return res.status(409).json({ error: 'An account with that email already exists.' });
  const id = 'u-' + uid().slice(0, 8);
  db.prepare(`INSERT INTO profiles (id,name,email,pass_hash,role,group_id,color,created_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, name, email, bcrypt.hashSync(password, 10), 'Faculty', null, '#5A6BD8', now());
  const u = db.prepare('SELECT * FROM profiles WHERE id=?').get(id);
  res.json({ token: sign(id), user: publicUser(u) });
});

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));
app.get('/api/subjects', (req, res) => res.json(SUBJECTS));

/* ============================================================
   BOOTSTRAP — everything the signed-in user can see, in one call
   ============================================================ */
app.get('/api/bootstrap', auth, (req, res) => {
  const gids = scopeGroupIds(req.user);
  const ph = gids.map(() => '?').join(',') || 'NULL';
  const groups = gids.length ? db.prepare(`SELECT * FROM groups WHERE id IN (${ph})`).all(...gids) : [];
  const users = gids.length
    ? db.prepare(`SELECT * FROM profiles WHERE group_id IN (${ph})`).all(...gids).map(publicUser)
    : [];
  const tasks = gids.length
    ? db.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE group_id IN (${ph})`).all(...gids)
    : [];
  tasks.forEach(t => (t.comments = commentsFor(t.id)));
  const activity = gids.length
    ? db.prepare(`SELECT id, group_id AS groupId, user_id AS userId, text, ts
                  FROM activity WHERE group_id IN (${ph}) ORDER BY ts DESC LIMIT 100`).all(...gids)
    : [];
  const remarks = gids.length
    ? db.prepare(`SELECT id, group_id AS groupId, by_name AS by, text, ts
                  FROM remarks WHERE group_id IN (${ph}) ORDER BY ts DESC`).all(...gids)
    : [];
  const faculty = {};
  gids.forEach(g => faculty[g] = db.prepare('SELECT faculty_id FROM group_faculty WHERE group_id=?')
    .all(g).map(r => r.faculty_id));
  res.json({ me: publicUser(req.user), groups: groups.map(g => ({ ...g, groupId: g.id })),
    users, tasks, activity, remarks, faculty, subjects: SUBJECTS });
});

/* ============================================================
   MEMBERS (team lead manages their group)
   ============================================================ */
app.post('/api/members', auth, (req, res) => {
  if (!isLead(req.user)) return res.status(403).json({ error: 'Only the Team Lead can add members.' });
  const { name, email, role, password } = req.body || {};
  const ROLES = ['Developer', 'Tester', 'QnA'];
  if (!name) return res.status(400).json({ error: 'Enter the member\'s name.' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if ((password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (db.prepare('SELECT 1 FROM profiles WHERE lower(email)=lower(?)').get(email))
    return res.status(409).json({ error: 'An account with that email already exists.' });
  if (db.prepare('SELECT 1 FROM profiles WHERE group_id=? AND role=?').get(req.user.group_id, role))
    return res.status(409).json({ error: 'That role is already filled.' });

  const id = 'u-' + uid().slice(0, 8);
  db.prepare(`INSERT INTO profiles (id,name,email,pass_hash,role,group_id,color,created_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, name, email, bcrypt.hashSync(password, 10), role, req.user.group_id, '#2E8A6B', now());
  logAct(req.user.group_id, req.user.id, `added <b>${name}</b> as ${role}`);
  res.json(publicUser(db.prepare('SELECT * FROM profiles WHERE id=?').get(id)));
});

app.post('/api/members/:id/reset-password', auth, (req, res) => {
  if (!isLead(req.user)) return res.status(403).json({ error: 'Only the Team Lead can reset passwords.' });
  const m = db.prepare('SELECT * FROM profiles WHERE id=?').get(req.params.id);
  if (!m || m.group_id !== req.user.group_id) return res.status(404).json({ error: 'Member not found.' });
  if ((req.body.password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  db.prepare('UPDATE profiles SET pass_hash=? WHERE id=?').run(bcrypt.hashSync(req.body.password, 10), m.id);
  res.json({ ok: true });
});

app.delete('/api/members/:id', auth, (req, res) => {
  if (!isLead(req.user)) return res.status(403).json({ error: 'Only the Team Lead can remove members.' });
  const m = db.prepare('SELECT * FROM profiles WHERE id=?').get(req.params.id);
  if (!m || m.group_id !== req.user.group_id || m.id === req.user.id)
    return res.status(400).json({ error: 'Cannot remove that member.' });
  db.prepare('UPDATE tasks SET assignee_id=? WHERE assignee_id=?').run(req.user.id, m.id); // reassign to lead
  db.prepare('DELETE FROM profiles WHERE id=?').run(m.id);
  logAct(req.user.group_id, req.user.id, `removed <b>${m.name}</b> from the team`);
  res.json({ ok: true });
});

/* ============================================================
   GROUPS — subject selection (lead) + faculty supervise
   ============================================================ */
app.get('/api/groups', auth, (req, res) => {
  // faculty add-group picker: all groups
  const rows = db.prepare(`SELECT g.*, p.name AS leadName, p.email AS leadEmail
    FROM groups g LEFT JOIN profiles p ON p.id=g.lead_id`).all();
  res.json(rows);
});

app.patch('/api/groups/:id/subject', auth, (req, res) => {
  if (!isLead(req.user) || req.user.group_id !== req.params.id)
    return res.status(403).json({ error: 'Only the group\'s Team Lead can set the subject.' });
  const c = SUBJECTS.find(s => s.code === req.body.courseCode);
  if (!c) return res.status(400).json({ error: 'Unknown subject code.' });
  db.prepare('UPDATE groups SET course_code=?, subject=? WHERE id=?')
    .run(c.code, `${c.code} · ${c.name}`, req.params.id);
  logAct(req.params.id, req.user.id, `set the project subject to <b>${c.code} ${c.name}</b>`);
  res.json({ ok: true });
});

app.post('/api/groups/:id/supervise', auth, (req, res) => {
  if (!isFaculty(req.user)) return res.status(403).json({ error: 'Only faculty can supervise groups.' });
  const g = db.prepare('SELECT * FROM groups WHERE id=?').get(req.params.id);
  if (!g) return res.status(404).json({ error: 'Group not found.' });
  db.prepare('INSERT OR IGNORE INTO group_faculty (group_id,faculty_id) VALUES (?,?)')
    .run(g.id, req.user.id);
  logAct(g.id, req.user.id, `<b>${req.user.name}</b> started supervising this group`);
  res.json({ ok: true });
});

app.delete('/api/groups/:id/supervise', auth, (req, res) => {
  if (!isFaculty(req.user)) return res.status(403).json({ error: 'Only faculty can do this.' });
  db.prepare('DELETE FROM group_faculty WHERE group_id=? AND faculty_id=?')
    .run(req.params.id, req.user.id);
  res.json({ ok: true });
});

/* ============================================================
   TASKS
   ============================================================ */
function canEditTask(u, t) {
  if (isFaculty(u)) return false;
  if (t.group_id !== u.group_id) return false;
  return isLead(u) || t.assignee_id === u.id;
}

app.post('/api/tasks', auth, (req, res) => {
  if (!isLead(req.user)) return res.status(403).json({ error: 'Only the Team Lead can create tasks.' });
  const { title, desc, assigneeId, prio, status, courseCode, due } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Give the task a title.' });
  const id = uid();
  db.prepare(`INSERT INTO tasks (id,group_id,assignee_id,title,descr,status,progress,prio,course_code,due,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.group_id, assigneeId, title, desc || '', status || 'todo',
      status === 'done' ? 100 : 0, prio || 'med', courseCode || null,
      due || now() + 5*864e5, now(), now());
  logAct(req.user.group_id, req.user.id, `assigned <b>${title}</b>`);
  res.json(db.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE id=?`).get(id));
});

app.patch('/api/tasks/:id', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  if (!canEditTask(req.user, t)) return res.status(403).json({ error: 'You can only update your own tasks.' });
  const b = req.body || {};
  const fields = ['title', 'desc', 'status', 'progress', 'prio', 'courseCode', 'assigneeId', 'due'];
  const map = { desc: 'descr', courseCode: 'course_code', assigneeId: 'assignee_id' };
  const sets = [], vals = [];
  fields.forEach(f => { if (b[f] !== undefined) { sets.push(`${map[f] || f}=?`); vals.push(b[f]); } });
  if (b.status === 'done' && b.progress === undefined) { sets.push('progress=?'); vals.push(100); }
  sets.push('updated_at=?'); vals.push(now());
  db.prepare(`UPDATE tasks SET ${sets.join(',')} WHERE id=?`).run(...vals, t.id);
  logAct(t.group_id, req.user.id, `updated <b>${t.title}</b>`);
  res.json(db.prepare(`SELECT ${TASK_COLS} FROM tasks WHERE id=?`).get(t.id));
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  if (!isLead(req.user) || t.group_id !== req.user.group_id)
    return res.status(403).json({ error: 'Only the Team Lead can delete tasks.' });
  db.prepare('DELETE FROM tasks WHERE id=?').run(t.id);
  logAct(t.group_id, req.user.id, `deleted <b>${t.title}</b>`);
  res.json({ ok: true });
});

app.post('/api/tasks/:id/comments', auth, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  if (!scopeGroupIds(req.user).includes(t.group_id))
    return res.status(403).json({ error: 'No access to that task.' });
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Empty comment.' });
  db.prepare('INSERT INTO comments (id,task_id,user_id,text,ts) VALUES (?,?,?,?,?)')
    .run(uid(), t.id, req.user.id, text, now());
  res.json({ ok: true, comments: commentsFor(t.id) });
});

/* ============================================================
   REMARKS (faculty)
   ============================================================ */
app.post('/api/remarks', auth, (req, res) => {
  if (!isFaculty(req.user)) return res.status(403).json({ error: 'Only faculty can leave remarks.' });
  const { groupId, text } = req.body || {};
  if (!scopeGroupIds(req.user).includes(groupId))
    return res.status(403).json({ error: 'You do not supervise that group.' });
  if (!(text || '').trim()) return res.status(400).json({ error: 'Write your remark first.' });
  db.prepare('INSERT INTO remarks (id,group_id,by_name,text,ts) VALUES (?,?,?,?,?)')
    .run(uid(), groupId, req.user.name, text.trim(), now());
  logAct(groupId, req.user.id, 'posted a review remark');
  res.json({ ok: true });
});

/* ---------- health + start ---------- */
app.get('/', (req, res) => res.json({ ok: true, service: 'Orbit AI API', endpoints: '/api/*' }));
app.listen(PORT, () => console.log(`\n🚀 Orbit API running at http://localhost:${PORT}\n`));
