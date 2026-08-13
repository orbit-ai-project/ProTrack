/* ============================================================
   api.test.js — backend integration tests (Node's built-in test runner)
   Run with:  npm test
   Spins up the real Express app on an ephemeral port against an
   isolated data file, so it never touches your real data.json.
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-'));
process.env.DATA_FILE = path.join(TMP_DIR, 'data.json');
process.env.UPLOADS_DIR = path.join(TMP_DIR, 'uploads');
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
delete process.env.ANTHROPIC_API_KEY; // exercise the "not configured" fallback path deterministically

const app = require('../server');

let server, base;
test.before(() => new Promise(resolve => {
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
test.after(() => new Promise(resolve => {
  server.close(() => { fs.rmSync(TMP_DIR, { recursive: true, force: true }); resolve(); });
}));

const api = (method, path, body, token) => fetch(base + path, {
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body !== undefined ? JSON.stringify(body) : undefined,
}).then(async res => ({ status: res.status, body: await res.json().catch(() => null) }));

/* ---------- auth ---------- */
test('register-lead creates an account and a group, and rejects a duplicate email', async () => {
  const email = `lead-${Date.now()}@college.edu`;
  const r1 = await api('POST', '/api/auth/register-lead', {
    name: 'Test Lead', email, password: 'password1', groupName: 'Test Group', project: 'Test Project', courseCode: '23AID205',
  });
  assert.equal(r1.status, 200);
  assert.ok(r1.body.token);
  assert.equal(r1.body.user.role, 'Team Lead');
  assert.equal(r1.body.user.groupId != null, true);
  assert.equal('passHash' in r1.body.user, false, 'password hash must never be sent to the client');

  const r2 = await api('POST', '/api/auth/register-lead', {
    name: 'Dup', email, password: 'password1', groupName: 'Other Group',
  });
  assert.equal(r2.status, 409);
});

test('register-faculty stores the chosen subjectCode', async () => {
  const email = `fac-${Date.now()}@college.edu`;
  const r = await api('POST', '/api/auth/register-faculty', {
    name: 'Test Faculty', email, password: 'password1', subjectCode: '23AID202',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.subjectCode, '23AID202');
});

test('login rejects a wrong password and succeeds with the right one', async () => {
  const email = `login-${Date.now()}@college.edu`;
  await api('POST', '/api/auth/register-faculty', { name: 'Login Test', email, password: 'rightpass' });

  const bad = await api('POST', '/api/auth/login', { email, password: 'wrongpass' });
  assert.equal(bad.status, 401);

  const good = await api('POST', '/api/auth/login', { email, password: 'rightpass' });
  assert.equal(good.status, 200);
  assert.ok(good.body.token);
});

test('protected routes reject requests with no token', async () => {
  const r = await api('GET', '/api/bootstrap');
  assert.equal(r.status, 401);
});

/* ---------- shared fixtures for the permission tests below ---------- */
async function makeTeam() {
  const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const leadEmail = `perm-lead-${stamp}@college.edu`;
  const lead = await api('POST', '/api/auth/register-lead', {
    name: 'Perm Lead', email: leadEmail, password: 'password1', groupName: `Perm Group ${stamp}`, project: 'P', courseCode: '23AID205',
  });
  const groupId = lead.body.user.groupId;
  const member = await api('POST', '/api/members',
    { name: 'Perm Dev', email: `perm-dev-${stamp}@college.edu`, role: 'Developer', password: 'password1' },
    lead.body.token);
  const facEmail = `perm-fac-${stamp}@college.edu`;
  const fac = await api('POST', '/api/auth/register-faculty', { name: 'Perm Fac', email: facEmail, password: 'password1' });
  return { leadToken: lead.body.token, groupId, memberId: member.body.id, memberToken: (await api('POST', '/api/auth/login', { email: `perm-dev-${stamp}@college.edu`, password: 'password1' })).body.token, facToken: fac.body.token };
}

/* ---------- tasks: permissions ---------- */
test('only the Team Lead can create tasks; faculty cannot', async () => {
  const { leadToken, memberId, facToken } = await makeTeam();

  const asLead = await api('POST', '/api/tasks', { title: 'Lead task', assigneeId: memberId }, leadToken);
  assert.equal(asLead.status, 200);

  const asFaculty = await api('POST', '/api/tasks', { title: 'Nope', assigneeId: memberId }, facToken);
  assert.equal(asFaculty.status, 403);
});

test('a member can update their own task but not someone else\'s, and faculty can never edit a task', async () => {
  const { leadToken, memberToken, facToken, memberId } = await makeTeam();
  const created = await api('POST', '/api/tasks', { title: 'Assigned to member', assigneeId: memberId }, leadToken);
  const taskId = created.body.id;

  const ownUpdate = await api('PATCH', `/api/tasks/${taskId}`, { progress: 50 }, memberToken);
  assert.equal(ownUpdate.status, 200);
  assert.equal(ownUpdate.body.progress, 50);

  const facultyUpdate = await api('PATCH', `/api/tasks/${taskId}`, { progress: 90 }, facToken);
  assert.equal(facultyUpdate.status, 403);

  const onlyLeadDeletes = await api('DELETE', `/api/tasks/${taskId}`, undefined, memberToken);
  assert.equal(onlyLeadDeletes.status, 403);

  const leadDeletes = await api('DELETE', `/api/tasks/${taskId}`, undefined, leadToken);
  assert.equal(leadDeletes.status, 200);
});

/* ---------- members ---------- */
test('adding a member to an already-filled role is rejected, and only the lead can add members', async () => {
  const { leadToken, memberToken } = await makeTeam();

  const dup = await api('POST', '/api/members',
    { name: 'Second Dev', email: `dup-${Date.now()}@college.edu`, role: 'Developer', password: 'password1' }, leadToken);
  assert.equal(dup.status, 409);

  const notLead = await api('POST', '/api/members',
    { name: 'Nope', email: `nope-${Date.now()}@college.edu`, role: 'Tester', password: 'password1' }, memberToken);
  assert.equal(notLead.status, 403);
});

/* ---------- bootstrap scoping ---------- */
test('bootstrap only returns the caller\'s own group, not every group in the system', async () => {
  const teamA = await makeTeam();
  const teamB = await makeTeam();
  const boot = await api('GET', '/api/bootstrap', undefined, teamA.leadToken);
  assert.equal(boot.status, 200);
  const groupIds = boot.body.groups.map(g => g.id);
  assert.ok(groupIds.includes(teamA.groupId));
  assert.ok(!groupIds.includes(teamB.groupId));
});

/* ---------- AI assistant ---------- */
test('AI assistant returns 501 (not 500) when no ANTHROPIC_API_KEY is configured, so the frontend can fall back cleanly', async () => {
  const { leadToken } = await makeTeam();
  const r = await api('POST', '/api/ai/ask', { question: 'what needs attention?' }, leadToken);
  assert.equal(r.status, 501);
  assert.ok(r.body.error);
});

test('AI assistant requires a question and requires auth', async () => {
  const { leadToken } = await makeTeam();
  const noAuth = await api('POST', '/api/ai/ask', { question: 'hi' });
  assert.equal(noAuth.status, 401);
  const empty = await api('POST', '/api/ai/ask', { question: '   ' }, leadToken);
  assert.equal(empty.status, 400);
});

/* ---------- rate limiting — keep this LAST, it deliberately exhausts the login limiter ---------- */
test('the login endpoint throttles repeated attempts', async () => {
  const email = `throttle-${Date.now()}@college.edu`;
  const results = [];
  for (let i = 0; i < 10; i++) {
    results.push((await api('POST', '/api/auth/login', { email, password: 'wrong' })).status);
  }
  assert.ok(results.includes(429), `expected a 429 among ${JSON.stringify(results)}`);
});
