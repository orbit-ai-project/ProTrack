/* ============================================================
   db.js — pure-JavaScript data store (no native modules)
   Data lives in a plain JSON file (data.json) next to this file,
   so the backend runs on ANY PC or Mac with just Node.js — no
   database to install, no C/C++ build tools needed.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_FILE = path.join(__dirname, 'data.json');
const uid = () => crypto.randomUUID();

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

/* ---------- in-memory store (persisted to data.json) ---------- */
let store = { profiles: [], groups: [], tasks: [], activity: [], remarks: [] };

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function load() {
  if (fs.existsSync(DATA_FILE)) {
    try { store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); return; }
    catch (e) { console.warn('data.json unreadable, reseeding…'); }
  }
  seed();
  save();
  console.log('✓ data seeded (demo faculty + 3 groups + tasks) -> data.json');
}

/* ---------- first-run demo data ---------- */
function seed() {
  const now = Date.now(), day = 864e5;
  const AVC = ['#5A6BD8','#2E8A6B','#B0651A','#A64A6E','#3C7FBF','#7A5AB8','#B0573F','#4A7A45'];
  const ROLES = ['Team Lead', 'Developer', 'Tester', 'QnA'];
  const facHash = bcrypt.hashSync('faculty123', 10);
  const stuHash = bcrypt.hashSync('student123', 10);

  store = { profiles: [], groups: [], tasks: [], activity: [], remarks: [], invites: [] };

  const facId = 'u-fac1';
  store.profiles.push({ id: facId, name: 'Dr. Anjali Sharma', email: 'sharma@college.edu',
    passHash: facHash, role: 'Faculty', subjectCode: '23AID205', groupId: null, color: '#5A6BD8', createdAt: now - 40*day });

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
      store.profiles.push({ id, name, email, passHash: stuHash, role: ROLES[i],
        groupId: d.g, color: AVC[(gi*4+i) % AVC.length], createdAt: now - (30-i)*day });
      return id;
    });
    const c = SUBJECTS.find(s => s.code === d.course);
    store.groups.push({ id: d.g, name: d.name, project: d.project,
      subject: c ? `${c.code} · ${c.name}` : '—', courseCode: d.course,
      leadId: ids[0], facultyIds: gi < 2 ? [facId] : [],
      subjectFacultyMap: gi < 2 ? { [d.course]: facId } : {},
      createdAt: now - 30*day });
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
  rows.forEach(([g, mi, title, desc, status, progress, prio, dd], i) => {
    store.tasks.push({ id: 't'+i, groupId: g, assigneeId: 'u-'+g+mi, title, desc, status, progress, prio,
      courseCode: CORE[i % CORE.length], due: now + dd*day,
      createdAt: now - (10 - i%7)*day, updatedAt: now - (i%5)*36e5, comments: [] });
  });

  store.activity.push(
    { id: uid(), groupId: 'g1', userId: 'u-g11', text: 'moved <b>Build face-recognition module</b> to In Progress', ts: now - 3*36e5 },
    { id: uid(), groupId: 'g2', userId: 'u-g21', text: 'updated progress on <b>Restaurant listing and cart screens</b> to 72%', ts: now - 1*36e5 },
  );
}

load();

module.exports = { store, save, uid, SUBJECTS };
