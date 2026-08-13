/* ============================================================
   server.js — Orbit AI REST API
   Express + JWT auth (bcrypt) + a pure-JS JSON store.
   No native modules, no database install — runs on any
   PC or Mac with just Node.js.  Run:  npm install && npm start
   ============================================================ */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { store, save, uid, SUBJECTS } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

app.use(cors());
app.use(express.json({ limit: '4mb' })); // photos arrive as base64 JSON, need headroom over the default 100kb
app.use('/uploads', express.static(UPLOADS_DIR));

/* ---------- helpers ---------- */
const now = () => Date.now();
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
const sign = id => jwt.sign({ id }, SECRET, { expiresIn: '7d' });

const findUser  = id => store.profiles.find(u => u.id === id);
const byEmail   = e => store.profiles.find(u => u.email.toLowerCase() === String(e).trim().toLowerCase());
const findGroup = id => store.groups.find(g => g.id === id);
const findTask  = id => store.tasks.find(t => t.id === id);

const publicUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role,
  groupId: u.groupId, color: u.color, photo: u.photo || null, subjectCode: u.subjectCode || null, createdAt: u.createdAt });

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

/* ---------- presence (in-memory only, not persisted — it's just "who's online") ---------- */
const presence = new Map();
const ONLINE_WINDOW = 12000;

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
    presence.set(u.id, now());
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
  presence.set(u.id, now());
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
    subjects: c ? [c.code] : [], topics: {}, subjectFacultyMap: {},
    leadId: userId, facultyIds: [], createdAt: now() });
  save();
  res.json({ token: sign(userId), user: publicUser(u) });
});

app.post('/api/auth/register-faculty', (req, res) => {
  const { name, email, password, subjectCode } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Enter your full name.' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if ((password || '').length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (byEmail(email)) return res.status(409).json({ error: 'An account with that email already exists.' });
  const sc = SUBJECTS.find(s => s.code === subjectCode) ? subjectCode : null;
  const u = { id: 'u-' + uid().slice(0, 8), name, email, passHash: bcrypt.hashSync(password, 10),
    role: 'Faculty', subjectCode: sc, groupId: null, color: '#5A6BD8', createdAt: now() };
  store.profiles.push(u); save();
  res.json({ token: sign(u.id), user: publicUser(u) });
});

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));
app.get('/api/subjects', (req, res) => res.json(SUBJECTS));

/* ============================================================
   ME — self-service profile, photo, password
   ============================================================ */
app.patch('/api/me', auth, (req, res) => {
  const name = (req.body && req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Enter your full name.' });
  req.user.name = name; save();
  res.json(publicUser(req.user));
});

app.post('/api/me/change-password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!bcrypt.compareSync(oldPassword || '', req.user.passHash))
    return res.status(400).json({ error: 'Your current password is incorrect.' });
  if ((newPassword || '').length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  req.user.passHash = bcrypt.hashSync(newPassword, 10); save();
  res.json({ ok: true });
});

function deleteOwnedUpload(u) {
  if (u.photo && u.photo.startsWith('/uploads/')) {
    const p = path.join(UPLOADS_DIR, path.basename(u.photo));
    fs.existsSync(p) && fs.unlinkSync(p);
  }
}

app.post('/api/me/photo', auth, (req, res) => {
  const dataUrl = (req.body && req.body.dataUrl) || '';
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'Please provide a valid image.' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) return res.status(400).json({ error: 'Image too large.' });
  deleteOwnedUpload(req.user);
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const filename = `${req.user.id}-${now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
  req.user.photo = `/uploads/${filename}`;
  save();
  res.json(publicUser(req.user));
});

app.delete('/api/me/photo', auth, (req, res) => {
  deleteOwnedUpload(req.user);
  delete req.user.photo; save();
  res.json(publicUser(req.user));
});

app.post('/api/presence/beat', auth, (req, res) => { presence.set(req.user.id, now()); res.json({ ok: true }); });

/* ============================================================
   BOOTSTRAP — everything the signed-in user can see, in one call
   ============================================================ */
app.get('/api/bootstrap', auth, (req, res) => {
  const gids = scopeGroupIds(req.user);
  const groups = store.groups.filter(g => gids.includes(g.id));
  // members of the scoped groups, plus the faculty guides supervising them (they have groupId:null
  // so the membership filter alone misses them — leads/students need to see who their guide is)
  const guideIds = new Set();
  groups.forEach(g => (g.facultyIds || []).forEach(id => guideIds.add(id)));
  const users = store.profiles
    .filter(u => gids.includes(u.groupId) || guideIds.has(u.id))
    .map(publicUser);
  const tasks  = store.tasks.filter(t => gids.includes(t.groupId));
  const activity = store.activity.filter(a => gids.includes(a.groupId)).slice(0, 100);
  const remarks  = store.remarks.filter(r => gids.includes(r.groupId));
  const invites  = isFaculty(req.user)
    ? store.invites.filter(i => i.facultyId === req.user.id)
    : store.invites.filter(i => gids.includes(i.groupId));
  const cutoff = now() - ONLINE_WINDOW;
  const online = [...presence.entries()].filter(([, ts]) => ts >= cutoff).map(([id]) => id);
  res.json({ me: publicUser(req.user), groups, users, tasks, activity, remarks, invites, online, subjects: SUBJECTS });
});

/* ============================================================
   FACULTY / GROUP DIRECTORY — needed so faculty & leads can find
   people/groups outside their current scope (search, add-guide UIs)
   ============================================================ */
app.get('/api/faculty', auth, (req, res) => {
  res.json(store.profiles.filter(u => isFaculty(u)).map(publicUser));
});

app.get('/api/groups', auth, (req, res) => {
  res.json(store.groups.map(g => {
    const lead = findUser(g.leadId);
    return { ...g, leadName: lead ? lead.name : null, leadEmail: lead ? lead.email : null };
  }));
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

/* whole-set replace — mirrors the "tick every subject that applies" UI */
app.put('/api/groups/:id/subjects', auth, (req, res) => {
  if (!isLead(req.user) || req.user.groupId !== req.params.id)
    return res.status(403).json({ error: 'Only the group\'s Team Lead can select subjects.' });
  const codes = Array.isArray(req.body.codes) ? req.body.codes.filter(c => SUBJECTS.some(s => s.code === c)) : [];
  if (!codes.length) return res.status(400).json({ error: 'Select at least one subject.' });
  const g = findGroup(req.params.id);
  g.subjects = codes;
  g.topics = g.topics || {};
  Object.keys(g.topics).forEach(k => { if (!codes.includes(k)) delete g.topics[k]; });
  g.courseCode = codes[0];
  const c0 = SUBJECTS.find(s => s.code === codes[0]);
  g.subject = c0 ? `${c0.code} · ${c0.name}` : g.subject;
  logAct(g.id, req.user.id, `updated the team's subjects to <b>${codes.join(', ')}</b>`);
  save();
  res.json(g);
});

/* add one subject on top of the existing set */
app.post('/api/groups/:id/subjects', auth, (req, res) => {
  if (!isLead(req.user) || req.user.groupId !== req.params.id)
    return res.status(403).json({ error: 'Only the group\'s Team Lead can add a subject.' });
  const c = SUBJECTS.find(s => s.code === req.body.courseCode);
  if (!c) return res.status(400).json({ error: 'Unknown subject code.' });
  const g = findGroup(req.params.id);
  g.subjects = g.subjects || [];
  if (!g.subjects.includes(c.code)) g.subjects.push(c.code);
  g.topics = g.topics || {};
  g.courseCode = g.courseCode || c.code;
  logAct(g.id, req.user.id, `added subject <b>${c.code} ${c.name}</b>`);
  save();
  res.json(g);
});

app.post('/api/groups/:id/topics', auth, (req, res) => {
  if (!isLead(req.user) || req.user.groupId !== req.params.id)
    return res.status(403).json({ error: 'Only the group\'s Team Lead can manage topics.' });
  const { courseCode, topic } = req.body || {};
  const txt = (topic || '').trim();
  if (!txt) return res.status(400).json({ error: 'Enter a topic name.' });
  const g = findGroup(req.params.id);
  g.topics = g.topics || {};
  g.topics[courseCode] = g.topics[courseCode] || [];
  if (g.topics[courseCode].some(x => x.toLowerCase() === txt.toLowerCase()))
    return res.status(409).json({ error: 'That topic already exists.' });
  g.topics[courseCode].push(txt);
  logAct(g.id, req.user.id, `added topic <b>${txt}</b> under ${courseCode}`);
  save();
  res.json(g);
});

app.delete('/api/groups/:id/topics/:courseCode/:index', auth, (req, res) => {
  if (!isLead(req.user) || req.user.groupId !== req.params.id)
    return res.status(403).json({ error: 'Only the group\'s Team Lead can manage topics.' });
  const g = findGroup(req.params.id);
  const code = req.params.courseCode, i = Number(req.params.index);
  if (!g.topics || !g.topics[code] || !g.topics[code][i]) return res.status(404).json({ error: 'Topic not found.' });
  const removed = g.topics[code][i];
  g.topics[code].splice(i, 1);
  store.tasks.forEach(t => { if (t.groupId === g.id && t.courseCode === code && t.topic === removed) t.topic = null; });
  logAct(g.id, req.user.id, `removed topic <b>${removed}</b> from ${code}`);
  save();
  res.json(g);
});

/* faculty guides — lead adds/removes a faculty member as project guide */
app.post('/api/groups/:id/guides', auth, (req, res) => {
  if (!isLead(req.user) || req.user.groupId !== req.params.id)
    return res.status(403).json({ error: 'Only the group\'s Team Lead can add a guide.' });
  const g = findGroup(req.params.id);
  let f = null;
  if (req.body.facultyId) f = findUser(req.body.facultyId);
  else if (req.body.email) {
    if (!emailOk(req.body.email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    f = byEmail(req.body.email);
    if (!f) return res.status(404).json({ error: 'No account found with that email. Ask them to register as faculty first.' });
  }
  if (!f) return res.status(400).json({ error: 'Pick a teacher or enter their email.' });
  if (!isFaculty(f)) return res.status(400).json({ error: 'That account is not a faculty member.' });
  g.facultyIds = g.facultyIds || [];
  if (g.facultyIds.includes(f.id)) return res.status(409).json({ error: 'That teacher is already a guide for this group.' });
  g.facultyIds.push(f.id);
  logAct(g.id, req.user.id, `added <b>${f.name}</b> as the project guide`);
  save();
  res.json(publicUser(f));
});

app.delete('/api/groups/:id/guides/:facultyId', auth, (req, res) => {
  if (!isLead(req.user) || req.user.groupId !== req.params.id)
    return res.status(403).json({ error: 'Only the group\'s Team Lead can remove a guide.' });
  const g = findGroup(req.params.id);
  const f = findUser(req.params.facultyId);
  g.facultyIds = (g.facultyIds || []).filter(x => x !== req.params.facultyId);
  logAct(g.id, req.user.id, `removed <b>${f ? f.name : 'a teacher'}</b> as the project guide`);
  save();
  res.json({ ok: true });
});

/* faculty self-service — pick / drop a group to supervise */
app.post('/api/groups/:id/supervise', auth, (req, res) => {
  if (!isFaculty(req.user)) return res.status(403).json({ error: 'Only faculty can supervise groups.' });
  const g = findGroup(req.params.id);
  if (!g) return res.status(404).json({ error: 'Group not found.' });
  g.facultyIds = g.facultyIds || [];
  if (g.facultyIds.includes(req.user.id)) return res.status(409).json({ error: 'You already supervise that group.' });
  g.facultyIds.push(req.user.id);
  logAct(g.id, req.user.id, `<b>${req.user.name}</b> started supervising this group`);
  save();
  res.json({ ok: true });
});

app.delete('/api/groups/:id/supervise', auth, (req, res) => {
  if (!isFaculty(req.user)) return res.status(403).json({ error: 'Only faculty can do this.' });
  const g = findGroup(req.params.id);
  if (g) { g.facultyIds = (g.facultyIds || []).filter(x => x !== req.user.id); logAct(g.id, req.user.id, `<b>${req.user.name}</b> stopped supervising this group`); }
  save();
  res.json({ ok: true });
});

/* ============================================================
   INVITES — faculty-initiated supervision requests
   ============================================================ */
app.post('/api/invites', auth, (req, res) => {
  if (!isFaculty(req.user)) return res.status(403).json({ error: 'Only faculty can send supervision requests.' });
  const { groupId, subjectCode } = req.body || {};
  const g = findGroup(groupId);
  if (!g) return res.status(404).json({ error: 'Group not found.' });
  if ((g.facultyIds || []).includes(req.user.id)) return res.status(409).json({ error: 'You already supervise that group.' });
  const already = store.invites.find(i => i.groupId === groupId && i.facultyId === req.user.id && i.status === 'pending');
  if (already) return res.status(409).json({ error: `You already have a pending request for ${g.name}.` });
  const inv = { id: 'inv-' + uid().slice(0, 8), groupId, groupName: g.name,
    facultyId: req.user.id, facultyName: req.user.name, facultyEmail: req.user.email,
    subjectCode: subjectCode || req.user.subjectCode || null, status: 'pending', ts: now() };
  store.invites.unshift(inv);
  logAct(groupId, req.user.id, `sent a supervision request for subject <b>${inv.subjectCode || ''}</b>`);
  save();
  res.json(inv);
});

app.post('/api/invites/:id/respond', auth, (req, res) => {
  const inv = store.invites.find(i => i.id === req.params.id);
  if (!inv) return res.status(404).json({ error: 'Request not found.' });
  if (!isLead(req.user) || req.user.groupId !== inv.groupId)
    return res.status(403).json({ error: 'Only that group\'s Team Lead can respond.' });
  if (inv.status !== 'pending') return res.status(409).json({ error: 'That request was already handled.' });
  const action = req.body && req.body.action;
  if (action !== 'accept' && action !== 'decline') return res.status(400).json({ error: 'Invalid action.' });

  if (action === 'accept') {
    const g = findGroup(inv.groupId);
    g.facultyIds = g.facultyIds || [];
    if (!g.facultyIds.includes(inv.facultyId)) g.facultyIds.push(inv.facultyId);
    g.subjectFacultyMap = g.subjectFacultyMap || {};
    if (inv.subjectCode) g.subjectFacultyMap[inv.subjectCode] = inv.facultyId;
    inv.status = 'accepted';
    logAct(inv.groupId, req.user.id, `accepted supervision request from <b>${inv.facultyName}</b> for <b>${inv.subjectCode || ''}</b>`);
  } else {
    inv.status = 'declined';
    logAct(inv.groupId, req.user.id, `declined supervision request from <b>${inv.facultyName}</b>`);
  }
  save();
  res.json(inv);
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
  const { title, desc, assigneeId, prio, status, courseCode, topic, due } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Give the task a title.' });
  const t = { id: uid(), groupId: req.user.groupId, assigneeId, title, desc: desc || '',
    status: status || 'todo', progress: status === 'done' ? 100 : 0, prio: prio || 'med',
    courseCode: courseCode || null, topic: topic || null, due: due || now() + 5*864e5,
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
  ['title', 'desc', 'status', 'progress', 'prio', 'courseCode', 'topic', 'assigneeId', 'due']
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
  const { groupId, text, grade, score } = req.body || {};
  if (!scopeGroupIds(req.user).includes(groupId))
    return res.status(403).json({ error: 'You do not supervise that group.' });
  if (!(text || '').trim()) return res.status(400).json({ error: 'Write your remark first.' });
  const r = { id: uid(), groupId, by: req.user.name, text: text.trim(),
    grade: grade || null, score: score || null, ts: now() };
  store.remarks.unshift(r);
  logAct(groupId, req.user.id, 'posted a review remark');
  save();
  res.json(r);
});

/* ---------- health + start ---------- */
app.get('/', (req, res) => res.json({ ok: true, service: 'Orbit AI API', endpoints: '/api/*' }));
app.listen(PORT, () => console.log(`\n🚀 Orbit API running at http://localhost:${PORT}\n`));
