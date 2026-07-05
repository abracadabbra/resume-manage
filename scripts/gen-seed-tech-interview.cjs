#!/usr/bin/env node
/**
 * 生成 Supabase seed SQL：
 *   - 007_tech_questions_partNNN.sql  按 500/批拆
 *   - 008_tech_ai_answers_partNNN.sql 按 200/批拆
 *
 * 字段映射（src/data JSON → PG）：
 *   id             <- id (TEXT)
 *   question_text  <- q
 *   mention_count  <- f
 *   companies      <- c (JSONB)
 *   tech_field     <- techField
 *   position       <- position
 *   round          <- round
 *   note_id        <- noteId
 *   note_title     <- noteTitle
 *   link           <- link
 *   published_at   <- publishedAt
 *   source         <- 'bundled'
 *
 * AI 答案（ai-answers.json）：
 *   question_id <- key
 *   answer      <- answer
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const DATA = {
  questions: path.join(ROOT, 'src/data/tech-interview-questions.json'),
  answers:   path.join(ROOT, 'src/data/ai-answers.json'),
}
const OUT_DIR = path.join(ROOT, 'supabase/migrations/seed')

const Q_BATCH = 500
const A_BATCH = 200

function sqlEscape(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (Array.isArray(value) || typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

function flattenQuestions(data) {
  const all = []
  for (const cat of Object.keys(data.questions || {})) {
    for (const q of data.questions[cat]) {
      all.push({ ...q, _category: cat })
    }
  }
  return all
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function writeQuestionsSeed(rows) {
  const batches = chunk(rows, Q_BATCH)
  batches.forEach((b, idx) => {
    const file = path.join(OUT_DIR, `007_tech_questions_part${String(idx + 1).padStart(3, '0')}.sql`)
    const values = b.map(q =>
      `(${sqlEscape(q.id)}, ${sqlEscape(q.q)}, ${sqlEscape(q.f ?? 1)}, ${sqlEscape(q.c ?? [])}, ` +
      `${sqlEscape(q.techField ?? null)}, ${sqlEscape(q.position ?? null)}, ${sqlEscape(q.round ?? null)}, ` +
      `${sqlEscape(q.noteId ?? null)}, ${sqlEscape(q.noteTitle ?? null)}, ${sqlEscape(q.link ?? null)}, ` +
      `${sqlEscape(q.publishedAt ?? null)}, 'bundled')`
    ).join(',\n  ')
    const sql = `-- v3 seed part ${idx + 1}/${batches.length}: ${b.length} questions\n` +
                `INSERT INTO tech_interview_questions (id, question_text, mention_count, companies, tech_field, position, round, note_id, note_title, link, published_at, source) VALUES\n  ${values}\n` +
                `ON CONFLICT (id) DO NOTHING;\n`
    fs.writeFileSync(file, sql)
    console.log(`wrote ${file} (${(sql.length / 1024).toFixed(1)} KB, ${b.length} rows)`)
  })
}

function writeAnswersSeed(answers) {
  const ids = Object.keys(answers)
  const batches = chunk(ids, A_BATCH)
  batches.forEach((batchIds, idx) => {
    const file = path.join(OUT_DIR, `008_tech_ai_answers_part${String(idx + 1).padStart(3, '0')}.sql`)
    const values = batchIds.map(id => {
      const a = answers[id]
      return `(${sqlEscape(id)}, ${sqlEscape(a.answer || '')})`
    }).join(',\n  ')
    const sql = `-- v3 seed part ${idx + 1}/${batches.length}: ${batchIds.length} ai answers\n` +
                `INSERT INTO tech_interview_ai_answers (question_id, answer) VALUES\n  ${values}\n` +
                `ON CONFLICT (question_id) DO UPDATE SET answer = EXCLUDED.answer, updated_at = NOW();\n`
    fs.writeFileSync(file, sql)
    console.log(`wrote ${file} (${(sql.length / 1024).toFixed(1)} KB, ${batchIds.length} rows)`)
  })
}

function main() {
  ensureDir(OUT_DIR)
  const qData = JSON.parse(fs.readFileSync(DATA.questions, 'utf-8'))
  const aData = JSON.parse(fs.readFileSync(DATA.answers, 'utf-8'))
  const all = flattenQuestions(qData)
  console.log(`flattened ${all.length} questions, ${Object.keys(aData).length} answers`)
  writeQuestionsSeed(all)
  writeAnswersSeed(aData)

  // 写一个 README，提示执行顺序
  const readme = `# Seed 灌入顺序

1. 先执行 supabase/migrations/001..006 全部建表 + RLS + trigger
2. 再执行本目录所有 007_tech_questions_part*.sql（先灌题目表，AI 答案表 FK 才能插）
3. 最后执行所有 008_tech_ai_answers_part*.sql

Supabase Studio SQL Editor 单 query 限制 ~1MB，本目录已按 500 题 / 200 答案 拆分。
`
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), readme)
}

main()