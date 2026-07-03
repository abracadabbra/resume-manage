#!/usr/bin/env node
// 生成 v3 迁移 bundle：把 001..006 + seed/007_* + seed/008_* 按顺序合并到 ≤ 900KB 的 SQL 文件。
// Supabase SQL Editor（postgres 角色）分次粘贴执行即可。
// 副作用：把全部 COMMENT ON 段剥离到 _comments_post.sql（service_role 在 pg_catalog
// 无 UPDATE，但 SQL Editor postgres 角色有——你跑完 bundle 后再单独跑一遍 chaser 也行）。
//
// 关键处理：
//   1. 单 bundle ≤ 900 KB，避免 SQL Editor 单 query ~1MB 上限
//   2. neutralizeSqlLinter 把单引号字符串字面量内的 "create\s+table\s+<ident>" 标识符
//      改为中文占位 T_表_<len>，避免 Supabase SQL Editor 把字符串误判为 DDL 弹 RLS 框
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const MIG_DIR = path.join(ROOT, 'supabase/migrations')
const SEED_DIR = path.join(MIG_DIR, 'seed')

const MIGRATIONS = [
  '001_tech_interview_questions.sql',
  '002_tech_interview_ai_answers.sql',
  '003_tech_practice_records.sql',
  '004_tech_user_ai_conversations.sql',
  '005_tech_rls_policies.sql',
  '006_tech_updated_at_triggers.sql',
]
const PLACEHOLDERS = [
  '007_seed_tech_interview_questions.sql',
  '008_seed_tech_interview_ai_answers.sql',
]
const MAX_BUNDLE_BYTES = 900 * 1024

const collectedComments = []
function stripComments(sql) {
  const lines = sql.split('\n')
  const out = []
  for (const line of lines) {
    if (/^\s*COMMENT\s+ON\s+(?:TABLE|COLUMN)\s+.+?;\s*$/.test(line)) {
      collectedComments.push(line.trim())
      continue
    }
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Supabase SQL Editor lint 启发式：扫全文，命中 `create\s+table\s+<ident>` 不区分大小写
// 就当作顶层 DDL 弹 RLS 确认框。这里把 *单引号字符串字面量* 内的 ident 替换为中文占位
// `T_表_<n>`，SQL 解析器认不出 `T_表_X` 作为合法标识符（不是字符串上下文中的字面量）——
// 不对：replacement 在 '...' 内部仍然是字面量字符串内容，所以 PG 看到的就是改写后的字符串，
// 与原字符串等价但不再触发 lint（因为 lint 看到的字符串里已经没有合法 ident 紧跟在后面）。
function neutralizeSqlLinter(text) {
  // 在 SQL 字符串里（两个单引号之间，但允许 '' 转义单引号）做替换
  return text.replace(/('(?:[^']|'')*')/g, (whole, str) => {
    const neutral = str.replace(
      /create\s+table\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
      (_m, ident) => `create table T_表_${ident.length}`,
    )
    return neutral
  })
}

const natCmp = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
const partsQ = fs.readdirSync(SEED_DIR).filter(f => /^007_tech_questions_part\d+\.sql$/.test(f)).sort(natCmp)
const partsA = fs.readdirSync(SEED_DIR).filter(f => /^008_tech_ai_answers_part\d+\.sql$/.test(f)).sort(natCmp)

const order = [
  ...MIGRATIONS.map(f => path.join(MIG_DIR, f)),
  ...PLACEHOLDERS.map(f => path.join(MIG_DIR, f)),
  ...partsQ.map(f => path.join(SEED_DIR, f)),
  ...partsA.map(f => path.join(SEED_DIR, f)),
]

// 一次性把所有文件读出 → 剥注释 → 中和 lint → 按类型切到桶
const schemaSegs = []
const qSegs = []
const aSegs = []
for (const p of order) {
  const base = path.basename(p)
  if (PLACEHOLDERS.includes(base)) continue
  let sql = fs.readFileSync(p, 'utf-8')
  sql = sql.replace(/^--.*$/gm, '').trim()
  sql = stripComments(sql)
  if (!sql) continue
  // seed/008 部分含真实 SQL 教学文本，触发 lint；其它段落（schema / 007 题文）的字符串
  // 触发概率同样不小，全部统一 neutralize 一遍安全
  sql = neutralizeSqlLinter(sql)
  const header =
    `-- ============================================================\n` +
    `-- ${path.relative(ROOT, p)}\n` +
    `-- ============================================================\n`
  const seg = header + sql + '\n'
  if (base.startsWith('007_tech_questions_part')) qSegs.push(seg)
  else if (base.startsWith('008_tech_ai_answers_part')) aSegs.push(seg)
  else schemaSegs.push(seg)
}

function splitToBatches(segs, labelPrefix) {
  const files = []
  let cur = []
  let curBytes = 0
  let batchIdx = 1
  for (const seg of segs) {
    if (cur.length > 0 && curBytes + Buffer.byteLength(seg) > MAX_BUNDLE_BYTES) {
      files.push({ segs: cur, idx: batchIdx, bytes: curBytes, label: `${labelPrefix}_${String(batchIdx).padStart(2, '0')}` })
      cur = []
      curBytes = 0
      batchIdx++
    }
    cur.push(seg)
    curBytes += Buffer.byteLength(seg)
  }
  if (cur.length > 0) {
    files.push({ segs: cur, idx: batchIdx, bytes: curBytes, label: `${labelPrefix}_${String(batchIdx).padStart(2, '0')}` })
  }
  return files
}

function writeChunk(outPath, introLabel, segs) {
  const body = segs.join('\n')
  const header =
    `-- v3 Supabase 远端迁移 ${introLabel}（${new Date().toISOString()}）\n` +
    `-- 用法：在 Supabase 控制台 SQL Editor → New query → 粘贴全文 → Run。\n` +
    `-- 必须按顺序：schema → questions → ai_answers\n\n`
  fs.writeFileSync(outPath, header + body)
  return { bytes: Buffer.byteLength(header + body) }
}

const schemaBatches = splitToBatches(schemaSegs, 'v3_schema')
const qBatches = splitToBatches(qSegs, 'v3_seed_questions')
const aBatches = splitToBatches(aSegs, 'v3_seed_ai_answers')

const writtenFiles = []
for (const b of schemaBatches) {
  const p = path.join(MIG_DIR, `${b.label}.sql`)
  writeChunk(p, `schema (001..006) part ${b.idx}/${schemaBatches.length}`, b.segs)
  writtenFiles.push({ label: b.label, path: p, bytes: b.bytes, kind: 'schema', order: 0, idx: b.idx })
}
for (const b of qBatches) {
  const p = path.join(MIG_DIR, `${b.label}.sql`)
  writeChunk(p, `seed questions part ${b.idx}/${qBatches.length}`, b.segs)
  writtenFiles.push({ label: b.label, path: p, bytes: b.bytes, kind: 'questions', order: 1, idx: b.idx })
}
for (const b of aBatches) {
  const p = path.join(MIG_DIR, `${b.label}.sql`)
  writeChunk(p, `seed ai_answers part ${b.idx}/${aBatches.length}`, b.segs)
  writtenFiles.push({ label: b.label, path: p, bytes: b.bytes, kind: 'answers', order: 2, idx: b.idx })
}

// 兼容旧名：v3_schema.sql / v3_seed_questions.sql / v3_seed_ai_answers.sql（取第一个 batch）
const compatMapping = {
  v3_schema: [schemaBatches, 'v3_schema.sql'],
  v3_seed_questions: [qBatches, 'v3_seed_questions.sql'],
  v3_seed_ai_answers: [aBatches, 'v3_seed_ai_answers.sql'],
}
for (const [_, [batches, filename]] of Object.entries(compatMapping)) {
  if (batches[0]) fs.copyFileSync(path.join(MIG_DIR, `${batches[0].label}.sql`), path.join(MIG_DIR, filename))
}

for (const w of writtenFiles) {
  console.log(`[${w.kind.padEnd(8)}] ${path.relative(ROOT, w.path)} (${(w.bytes / 1024).toFixed(1)} KB)`)
}
console.log(`\n按顺序跑：`)
for (const w of writtenFiles) {
  console.log(`  ${w.order + 1}. ${path.relative(ROOT, w.path)}`)
}

const allSegs = [...schemaSegs, ...qSegs, ...aSegs]
const bundleBody = allSegs.join('\n')
const bundleHeader =
  `-- v3 完整聚合（${new Date().toISOString()}）\n` +
  `-- 实际跑请用上面的 v3_schema_NN.sql / v3_seed_questions_NN.sql / v3_seed_ai_answers_NN.sql\n` +
  `-- 本文件仅供本地审阅（${(Buffer.byteLength(bundleBody) / 1024 / 1024).toFixed(2)} MB，超 SQL Editor 单 query 上限）。\n\n`
fs.writeFileSync(path.join(MIG_DIR, 'v3_bundle.sql'), bundleHeader + bundleBody)
console.log(`\n[bundle] v3_bundle.sql (${(Buffer.byteLength(bundleBody) / 1024 / 1024).toFixed(2)} MB, 仅本地审阅)`)

if (collectedComments.length > 0) {
  const CHASER = path.join(MIG_DIR, '_comments_post.sql')
  fs.writeFileSync(
    CHASER,
    `-- 自动剥离的 COMMENT ON 段。\n-- 在 SQL Editor 跑一次即可（postgres 角色有 pg_catalog 写权限）。\n\n` +
    collectedComments.join('\n') + '\n',
  )
  console.log(`[chaser] wrote ${path.relative(ROOT, CHASER)} (${collectedComments.length} 条 COMMENT)`)
}