/* ============================================================
   db.js — SQLite database: schema + first-run seed
   Uses better-sqlite3 (synchronous, simple). Creates orbit.db
   in this folder on first run.
   ============================================================ */
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'orbit.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const uid = () => crypto.randomUUID();

/* ---------- schema ---------- */
db.exec(`
CREATE TABLE IF NOT EXISTS profiles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  pass_hash  TEXT NOT NULL,
  role       TEXT NOT NULL,
  group_id   TEXT,
  color      TEXT DEFAULT '#5A6BD8',
  created_at INTEGER DEFAULT (strftime('%s','now')*1000)
);

CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  project     TEXT,
  subject     TEXT,
  course_code TEXT,
  lead_id     TEXT,
  created_at  INTEGER DEFAULT (strftime('%s','now')*1000)
);

CREATE TABLE IF NOT EXISTS group_faculty (
  group_id   TEXT NOT NULL,
  faculty_id TEXT NOT NULL,
  PRIMARY KEY (group_id, faculty_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL,
  assignee_id TEXT,
  title       TEXT NOT NULL,
  descr       TEXT,
  status      TEXT DEFAULT 'todo',
  progress    INTEGER DEFAULT 0,
  prio        TEXT DEFAULT 'med',
  course_code TEXT,
  due         INTEGER,
  created_at  INTEGER DEFAULT (strftime('%s','now')*1000),
  updated_at  INTEGER DEFAULT (strftime('%s','now')*1000)
);

CREATE TABLE IF NOT EXISTS comments (
  id      TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT,
  text    TEXT NOT NULL,
  ts      INTEGER DEFAULT (strftime('%s','now')*1000)
);

CREATE TABLE IF NOT EXISTS activity (
  id       TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id  TEXT,
  text     TEXT,
  ts       INTEGER DEFAULT (strftime('%s','now')*1000)
);

CREATE TABLE IF NOT EXISTS remarks (
  id       TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  by_name  TEXT,
  text     TEXT,
  ts       INTEGER DEFAULT (strftime('%s','now')*1000)
);
`);

/* ---------- Semester-3 subjects (Amrita Faridabad, B.Tech AI & DS) ---------- */
const SUBJECTS = [
  { code: '23MAT204', name: 'Mathematics for Intelligent Systems 3', cr: 3, cat: 'Sciences' },
  { code: '23AID201', name: 'Modelling, Simulation & Analysis', cr: 3, cat: 'AI&DS Core' },
  { code: '23AID202', name: 'Introduction to Robotics', cr: 3, cat: 'AI&DS Core' },
  { code: '23AID203', name: 'Software-Defined Communication Systems', cr: 3, cat: 'AI&DS Core' },
  { code: '23AID204', name: 'Advanced Data Structures & Algorithm Analysis', cr: 3, cat: 'AI&DS Core' },
  { code: '23AID205', name: 'Introduction to AI and Machine Learning', cr: 3, cat: 'AI&DS Core' },
  { code: '23AID206', name: 'Introduction to Computer Networks', cr: 3, cat: 'AI&DS Core' },
  { code: '23LSE201', name: 'Life Skills for Engineers I', cr: 'P/F', cat: 'Humanities' },
];

/* ---------- first-run seed (only if empty) ---------- */
function seed() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM profiles').get().n;
  if (count > 0) return;

  const now = Date.now(), day = 864e5;
  const AVC = ['#5A6BD8','#2E8A6B','#B0651A','#A64A6E','#3C7FBF','#7A5AB8','#B0573F','#4A7A45'];
  const ROLES = ['Team Lead', 'Developer', 'Tester', 'QnA'];
  const facHash = bcrypt.hashSync('faculty123', 10);
  const stuHash = bcrypt.hashSync('student123', 10);

  const insUser = db.prepare(
    `INSERT INTO profiles (id,name,email,pass_hash,role,group_id,color,created_at)
     VALUES (@id,@name,@email,@pass,@role,@group_id,@color,@created_at)`);
  const insGroup = db.prepare(
    `INSERT INTO groups (id,name,project,subject,course_code,lead_id,created_at)
     VALUES (@id,@name,@project,@subject,@course_code,@lead_id,@created_at)`);
  const insGF = db.prepare('INSERT INTO group_faculty (group_id,faculty_id) VALUES (?,?)');
  const insTask = db.prepare(
    `INSERT INTO tasks (id,group_id,assignee_id,title,descr,status,progress,prio,course_code,due,created_at,updated_at)
     VALUES (@id,@group_id,@assignee_id,@title,@descr,@status,@progress,@prio,@course_code,@due,@created_at,@updated_at)`);
  const insAct = db.prepare('INSERT INTO activity (id,group_id,user_id,text,ts) VALUES (@id,@group_id,@user_id,@text,@ts)');

  const facId = 'u-fac1';
  insUser.run({ id: facId, name: 'Dr. Anjali Sharma', email: 'sharma@college.edu', pass: facHash,
    role: 'Faculty', group_id: null, color: '#5A6BD8', created_at: now - 40*day });

  const defs = [
    { g: 'g1', name: 'Group 01', project: 'Smart Attendance System', course: '23AID205',
      ms: [['Aarav Mehta','aarav@college.edu'],['Diya Sharma','diya@college.edu'],['Kabir Nair','kabir@college.edu'],['Ishita Rao','ishita@college.edu']] },
    { g: 'g2', name: 'Group 02', project: 'Campus Food Delivery App', course: '23AID204',
      ms: [['Rohan Gupta','rohan@college.edu'],['Sanya Kapoor','sanya@college.edu'],['Vivaan Joshi','vivaan@college.edu'],['Meera Iyer','meera@college.edu']] },
    { g: 'g3', name: 'Group 03', project: 'AI Study Planner', course: '23AID201',
      ms: [['Aditya Verma','aditya@college.edu'],['Nisha Bansal','nisha@college.edu'],['Arjun Reddy','arjun@college.edu'],['Tara Menon','tara@college.edu']] },
  ];

  defs.forEach((d, gi) => {
    const ids = d.ms.map(([name, email], i) => {
      const id = 'u-' + d.g + i;
      insUser.run({ id, name, email, pass: stuHash, role: ROLES[i], group_id: d.g,
        color: AVC[(gi*4+i) % AVC.length], created_at: now - (30-i)*day });
      return id;
    });
    const c = SUBJECTS.find(s => s.code === d.course);
    insGroup.run({ id: d.g, name: d.name, project: d.project,
      subject: c ? `${c.code} · ${c.name}` : '—', course_code: d.course,
      lead_id: ids[0], created_at: now - 30*day });
    if (gi < 2) insGF.run(d.g, facId);   // faculty already supervises g1, g2
  });

  const rows = [
    ['g1',0,'Finalise project scope and timeline','Lock the SRS and split the modules.','done',100,'high',-3],
    ['g1',1,'Build face-recognition module','OpenCV + dlib pipeline, target >92% accuracy.','progress',65,'high',4],
    ['g1',2,'Write test cases for enrolment flow','Cover happy path, duplicate face, poor lighting.','progress',40,'med',3],
    ['g1',3,'Accessibility and documentation review','Contrast audit and user-manual first pass.','todo',0,'med',6],
    ['g1',1,'Set up SQLite schema and migrations','Tables for students, sessions, attendance_log.','done',100,'med',-1],
    ['g1',2,'Regression run on the v0.3 build','Re-run the full suite after camera refactor.','blocked',20,'high',2],
    ['g1',0,'Prepare the mid-review presentation','Twelve slides plus a live demo script.','review',85,'high',1],
    ['g2',0,'Assign modules and set sprint goals','Two-week sprint, definition of done agreed.','done',100,'high',-5],
    ['g2',1,'Restaurant listing and cart screens','React Native screens wired to the mock API.','progress',72,'high',3],
    ['g2',1,'Payment gateway sandbox integration','Order create, signature verify, failure handling.','todo',0,'high',7],
    ['g2',2,'Load test the order API','500 concurrent orders, capture p95 latency.','progress',35,'med',4],
    ['g2',3,'Verify order-status edge cases','Cancelled after pickup, partial refund.','review',90,'med',1],
    ['g3',0,'Define the ML feature set','Decide which signals the planner learns from.','done',100,'high',-4],
    ['g3',1,'Train the scheduling model','Baseline plus gradient boosting.','progress',55,'high',5],
    ['g3',2,'Validate model output sanity','No overlapping slots, respects exam dates.','progress',48,'high',2],
    ['g3',3,'Audit the dataset for bias','Check subject and time-of-day skew.','blocked',15,'med',3],
    ['g3',0,'Weekly progress report for the guide','Summarise blockers and next-week plan.','review',80,'low',1],
    ['g3',1,'Build the calendar sync','Two-way sync with a calendar provider.','todo',0,'med',8],
  ];
  const CORE = ['23AID205','23AID204','23AID201','23AID203'];
  rows.forEach(([g, mi, title, descr, status, progress, prio, dd], i) => {
    insTask.run({ id: 't'+i, group_id: g, assignee_id: 'u-'+g+mi, title, descr, status, progress, prio,
      course_code: CORE[i % CORE.length], due: now + dd*day,
      created_at: now - (10 - i%7)*day, updated_at: now - (i%5)*36e5 });
  });

  insAct.run({ id: uid(), group_id: 'g1', user_id: 'u-g11', text: 'moved <b>Build face-recognition module</b> to In Progress', ts: now - 3*36e5 });
  insAct.run({ id: uid(), group_id: 'g2', user_id: 'u-g21', text: 'updated progress on <b>Restaurant listing and cart screens</b> to 72%', ts: now - 1*36e5 });

  console.log('✓ database seeded (demo faculty + 3 groups + tasks)');
}

seed();

module.exports = { db, uid, SUBJECTS };
