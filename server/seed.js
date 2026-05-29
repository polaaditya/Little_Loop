/* ─── Seed demo data ──────────────────────────────────────────────────────
   Run once with:  npm run seed
   Safe to re-run — checks whether data already exists before inserting.
   ──────────────────────────────────────────────────────────────────────── */

'use strict';
require('dotenv').config();
const db = require('./db');

async function seed() {
  await db.init();

  /* Skip if demo family already exists */
  const existing = await db.get("SELECT id FROM families WHERE name = 'Maya''s Family'");
  if (existing) {
    console.log('✓ Demo data already present — skipping seed.');
    process.exit(0);
  }

  /* Family */
  const family = await db.run("INSERT INTO families (name) VALUES (?)", ["Maya's Family"]);
  const fid = family.id;

  /* Members */
  const members = [
    { name: 'Maya',  role: 'Working Mother',        age_stage: null       },
    { name: 'Aarav', role: 'Child',                  age_stage: 'Big Kid'  },
    { name: 'Nora',  role: 'Teen',                   age_stage: 'Teen'     },
    { name: 'Milo',  role: 'Infant',                 age_stage: 'Infant'   },
    { name: 'Zoe',   role: 'Sibling',                age_stage: 'Big Kid'  },
  ];

  const memberIds = [];
  for (const m of members) {
    const r = await db.run(
      'INSERT INTO members (family_id, name, role, age_stage) VALUES (?, ?, ?, ?)',
      [fid, m.name, m.role, m.age_stage],
    );
    memberIds.push(r.id);
  }

  /* Loops */
  const loops = [
    { loop_type: 'Parent-child', prompt: 'What made you smile today?' },
    { loop_type: 'Parent-teen',  prompt: 'Want advice, space, or just someone to listen?' },
    { loop_type: 'Parent-infant',prompt: 'Save one tiny win from today.' },
    { loop_type: 'Sibling loop', prompt: 'Say one kind thing about each other.' },
  ];

  const loopIds = [];
  for (const l of loops) {
    const r = await db.run(
      'INSERT INTO loops (family_id, loop_type, prompt) VALUES (?, ?, ?)',
      [fid, l.loop_type, l.prompt],
    );
    loopIds.push(r.id);
  }

  /* Responses */
  await db.run(
    'INSERT INTO responses (loop_id, member_id, content) VALUES (?, ?, ?)',
    [loopIds[0], memberIds[1], 'The art table at school.'],
  );
  await db.run(
    'INSERT INTO responses (loop_id, member_id, content) VALUES (?, ?, ?)',
    [loopIds[1], memberIds[2], "Listening, please — it was a hard day."],
  );

  /* Memories */
  const memoryTexts = [
    'First sleepy laugh from Milo',
    "Nora's playlist for Friday dinner",
    'Zoe thanked Leo for helping with homework',
    "Aarav drew a rainbow at school today",
    "Maya sang a lullaby — Milo fell asleep in 2 minutes",
    "Family movie night — everyone picked a different snack",
    "Nora made breakfast for the whole family",
    "Aarav read a chapter book by himself for the first time",
  ];

  for (const content of memoryTexts) {
    await db.run(
      'INSERT INTO memories (family_id, content) VALUES (?, ?)',
      [fid, content],
    );
  }

  /* Care steps — last 7 days */
  for (let i = 0; i < 12; i++) {
    await db.run('INSERT INTO care_steps (family_id, member_id) VALUES (?, ?)', [fid, memberIds[0]]);
  }

  console.log('✓ Demo data seeded successfully!');
  console.log(`  Family: Maya's Family  (id=${fid})`);
  console.log(`  Members: ${members.map((m) => m.name).join(', ')}`);
  console.log(`  Loops: ${loopIds.length} | Memories: ${memoryTexts.length} | Care steps: 12`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
