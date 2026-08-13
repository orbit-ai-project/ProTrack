/* ============================================================
   server.js — Pro Track REST API
   Express + JWT auth (bcrypt) + a pure-JS JSON store.
   No native modules, no database install — runs on any
   PC or Mac with just Node.js.  Run:  npm install && npm start
   ============================================================ */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { store, save, uid, SUBJECTS } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.use(cors());
app.use(express.json());

/* ---------- helpers ---------- */
const now = () => Date.now();
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
const sign = id => jwt.sign({ id }, SECRET, { expiresIn: '7d' });

const findUser  = id => store.profiles.find(u => u.id === id);
const byEmail   = e => store.profiles.find(u => u.email.toLowerCase() === String(e).trim().toLowerCase());
const findGroup = id => store.groups.find(g => g.id === id);
const findTask  = id => store.tasks.find(t => t.id === id);

const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role,
  groupId: u.groupId, color: u.color, photo: u.photo, createdAt: u.createdAt });

const isFaculty = u => u.role === 'Faculty';
const isLead    = u => u.role === 'Team Lead';

function scopeGroupIds(u) {
  if (isFaculty(u)) return store.groups.filter(g => (g.facultyIds || []).includes(u.id)).map(g => g.id);
  return u.groupId ? [u.groupId] : [];
}
function logAct(groupId, userId, text) {
  store.activity.unshift({ id: uid(), groupId, userId, text, ts: now() });
  store.activity = store.activity.slice(0, 300);
}

/* ---------- auth middleware ---------- */
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  try {
    const { id } = jwt.verify(token, SECRET);
    const u = findUser(id);
    if (!u) return res.status(401).json({ error: 'Account not found' });
    req.user = u;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/* ============================================================
   AUTH
   ============================================================ */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Enter email and password.' });
  const u = byEmail(email);
  if (!u || !bcrypt.compareSync(password, u.passHash))
    return res.status(401).json({ error: 'That email and password combination is not recognised.' });
  res.json({ token: sign(u.id), user: publicUser(u) });
});

app.post('/api/auth/register-lead', (req, res) => {
  const { name, email, password, groupName, project, courseCode } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Enter your full name.' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if ((password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (!groupName) return res.status(400).json({ error: 'Give your group a name.' });
  if (byEmail(email)) return res.status(409).json({ error: 'An account with that email already exists.' });

  const gid = 'g-' + uid().slice(0, 8), userId = 'u-' + uid().slice(0, 8);
  const c = SUBJECTS.find(s => s.code === courseCode);
  const u = { id: userId, name, email, passHash: bcrypt.hashSync(password, 10),
    role: 'Team Lead', groupId: gid, color: '#5A6BD8', createdAt: now() };
  store.profiles.push(u);
  store.groups.push({ id: gid, name: groupName, project: project || '',
    subject: c ? `${c.code} · ${c.name}` : '—', courseCode: c ? c.code : null,
    leadId: userId, facultyIds: [], createdAt: now() });
  save();
  res.json({ token: sign(userId), user: publicUser(u) });
});

app.post('/api/auth/register-faculty', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Enter your full name.' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if ((password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (byEmail(email)) return res.status(409).json({ error: 'An account with that email already exists.' });
  const u = { id: 'u-' + uid().slice(0, 8), name, email, passHash: bcrypt.hashSync(password, 10),
    role: 'Faculty', groupId: null, color: '#5A6BD8', createdAt: now() };
  store.profiles.push(u); save();
  res.json({ token: sign(u.id), user: publicUser(u) });
});

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));
app.get('/api/subjects', (req, res) => res.json(SUBJECTS));

/* ============================================================
   BOOTSTRAP — everything the signed-in user can see, in one call
   ============================================================ */
app.get('/api/bootstrap', auth, (req, res) => {
  const gids = scopeGroupIds(req.user);
  const groups = store.groups.filter(g => gids.includes(g.id));
  const users  = store.profiles.filter(u => gids.includes(u.groupId)).map(publicUser);
  const tasks  = store.tasks.filter(t => gids.includes(t.groupId));
  const activity = store.activity.filter(a => gids.includes(a.groupId)).slice(0, 100);
  const remarks  = store.remarks.filter(r => gids.includes(r.groupId));
  res.json({ me: publicUser(req.user), groups, users, tasks, activity, remarks, subjects: SUBJECTS });
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
  if (byEmail(email)) return res.status(409).json({ error: 'An account with that email already exists.' });
  if (store.profiles.some(u => u.groupId === req.user.groupId && u.role === role))
    return res.status(409).json({ error: 'That role is already filled.' });

  const u = { id: 'u-' + uid().slice(0, 8), name, email, passHash: bcrypt.hashSync(password, 10),
    role, groupId: req.user.groupId, color: '#2E8A6B', createdAt: now() };
  store.profiles.push(u);
  logAct(req.user.groupId, req.user.id, `added <b>${name}</b> as ${role}`);
  save();
  res.json(publicUser(u));
});

app.post('/api/members/:id/reset-password', auth, (req, res) => {
  if (!isLead(req.user)) return res.status(403).json({ error: 'Only the Team Lead can reset passwords.' });
  const m = findUser(req.params.id);
  if (!m || m.groupId !== req.user.groupId) return res.status(404).json({ error: 'Member not found.' });
  if ((req.body.password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  m.passHash = bcrypt.hashSync(req.body.password, 10); save();
  res.json({ ok: true });
});

app.delete('/api/members/:id', auth, (req, res) => {
  if (!isLead(req.user)) return res.status(403).json({ error: 'Only the Team Lead can remove members.' });
  const m = findUser(req.params.id);
  if (!m || m.groupId !== req.user.groupId || m.id === req.user.id)
    return res.status(400).json({ error: 'Cannot remove that member.' });
  store.tasks.forEach(t => { if (t.assigneeId === m.id) t.assigneeId = req.user.id; });
  store.profiles = store.profiles.filter(u => u.id !== m.id);
  logAct(req.user.groupId, req.user.id, `removed <b>${m.name}</b> from the team`);
  save();
  res.json({ ok: true });
});

/* ============================================================
   GROUPS — subject selection (lead) + faculty supervise
   ============================================================ */
app.get('/api/groups', auth, (req, res) => {
  res.json(store.groups.map(g => {
    const lead = findUser(g.leadId);
    return { ...g, leadName: lead ? lead.name : null, leadEmail: lead ? lead.email : null };
  }));
});

app.patch('/api/groups/:id/subject', auth, (req, res) => {
  if (!isLead(req.user) || req.user.groupId !== req.params.id)
    return res.status(403).json({ error: 'Only the group\'s Team Lead can set the subject.' });
  const c = SUBJECTS.find(s => s.code === req.body.courseCode);
  if (!c) return res.status(400).json({ error: 'Unknown subject code.' });
  const g = findGroup(req.params.id);
  g.courseCode = c.code; g.subject = `${c.code} · ${c.name}`;
  logAct(g.id, req.user.id, `set the project subject to <b>${c.code} ${c.name}</b>`);
  save();
  res.json({ ok: true });
});

app.post('/api/groups/:id/supervise', auth, (req, res) => {
  if (!isFaculty(req.user)) return res.status(403).json({ error: 'Only faculty can supervise groups.' });
  const g = findGroup(req.params.id);
  if (!g) return res.status(404).json({ error: 'Group not found.' });
  g.facultyIds = g.facultyIds || [];
  if (!g.facultyIds.includes(req.user.id)) g.facultyIds.push(req.user.id);
  logAct(g.id, req.user.id, `<b>${req.user.name}</b> started supervising this group`);
  save();
  res.json({ ok: true });
});

app.delete('/api/groups/:id/supervise', auth, (req, res) => {
  if (!isFaculty(req.user)) return res.status(403).json({ error: 'Only faculty can do this.' });
  const g = findGroup(req.params.id);
  if (g) g.facultyIds = (g.facultyIds || []).filter(x => x !== req.user.id);
  save();
  res.json({ ok: true });
});

/* ============================================================
   TASKS
   ============================================================ */
function canEditTask(u, t) {
  if (isFaculty(u)) return false;
  if (t.groupId !== u.groupId) return false;
  return isLead(u) || t.assigneeId === u.id;
}

app.post('/api/tasks', auth, (req, res) => {
  if (!isLead(req.user)) return res.status(403).json({ error: 'Only the Team Lead can create tasks.' });
  const { title, desc, assigneeId, prio, status, courseCode, due } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Give the task a title.' });
  const t = { id: uid(), groupId: req.user.groupId, assigneeId, title, desc: desc || '',
    status: status || 'todo', progress: status === 'done' ? 100 : 0, prio: prio || 'med',
    courseCode: courseCode || null, due: due || now() + 5*864e5,
    createdAt: now(), updatedAt: now(), comments: [] };
  store.tasks.push(t);
  logAct(req.user.groupId, req.user.id, `assigned <b>${title}</b>`);
  save();
  res.json(t);
});

app.patch('/api/tasks/:id', auth, (req, res) => {
  const t = findTask(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  if (!canEditTask(req.user, t)) return res.status(403).json({ error: 'You can only update your own tasks.' });
  const b = req.body || {};
  ['title', 'desc', 'status', 'progress', 'prio', 'courseCode', 'assigneeId', 'due']
    .forEach(f => { if (b[f] !== undefined) t[f] = b[f]; });
  if (b.status === 'done' && b.progress === undefined) t.progress = 100;
  t.updatedAt = now();
  logAct(t.groupId, req.user.id, `updated <b>${t.title}</b>`);
  save();
  res.json(t);
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  const t = findTask(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  if (!isLead(req.user) || t.groupId !== req.user.groupId)
    return res.status(403).json({ error: 'Only the Team Lead can delete tasks.' });
  store.tasks = store.tasks.filter(x => x.id !== t.id);
  logAct(t.groupId, req.user.id, `deleted <b>${t.title}</b>`);
  save();
  res.json({ ok: true });
});

app.post('/api/tasks/:id/comments', auth, (req, res) => {
  const t = findTask(req.params.id);
  if (!t) return res.status(404).json({ error: 'Task not found.' });
  if (!scopeGroupIds(req.user).includes(t.groupId))
    return res.status(403).json({ error: 'No access to that task.' });
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Empty comment.' });
  t.comments.push({ userId: req.user.id, text, ts: now() });
  t.updatedAt = now(); save();
  res.json({ ok: true, comments: t.comments });
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
  store.remarks.unshift({ id: uid(), groupId, by: req.user.name, text: text.trim(), ts: now() });
  logAct(groupId, req.user.id, 'posted a review remark');
  save();
  res.json({ ok: true });
});
const sseClients = new Set();
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcastSync() {
  for (const client of sseClients) {
    try { client.write('data: {"type":"sync"}\n\n'); } catch (e) {}
  }
}

app.post('/api/sync', (req, res) => {
  const { users, groups, tasks, activity, remarks } = req.body || {};
  if (users) store.profiles = users;
  if (groups) store.groups = groups;
  if (tasks) store.tasks = tasks;
  if (activity) store.activity = activity;
  if (remarks) store.remarks = remarks;
  save();
  broadcastSync();
  res.json({ ok: true });
});
app.get('/api/sync', (req, res) => {
  res.json({
    users: store.profiles,
    groups: store.groups,
    tasks: store.tasks,
    activity: store.activity,
    remarks: store.remarks
  });
});


/* ---------- health + start ---------- */
app.get('/', (req, res) => res.json({ ok: true, service: 'ProTrack API', endpoints: '/api/*' }));
app.listen(PORT, () => console.log(`\n🚀 ProTrack API running at http://localhost:${PORT}\n`));
