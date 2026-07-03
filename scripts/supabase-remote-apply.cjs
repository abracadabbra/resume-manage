#!/usr/bin/env node
// scripts/supabase-remote-apply.cjs
//
// 把 supabase/migrations/001..006 与 supabase/migrations/seed/007..008_*.sql
// 一键推送到远端 Supabase。设计原则：
//   1. 脚本内不存 service_role key —— 由用户从 --dotenv / process env / 命令行提供
//   2. 通道为 RPC public.exec_sql(text)，由用户在 SQL Editor 一次性粘贴 bootstrap 启程
//      （runner 自检 RPC 存在；缺则打印待粘贴 SQL 让用户手动跑一次）
//   3. dry-run 不连远端、可独立预演整套
//   4. 顺序：001..006 → seed/007_tech_questions_part001..006.sql → seed/008_*_part001..014.sql

'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const MIG_DIR = path.join(ROOT, 'supabase/migrations')
const SEED_DIR = path.join(MIG_DIR, 'seed')

const MIGRATION_FILES = [
  '001_tech_interview_questions.sql',
  '002_tech_interview_ai_answers.sql',
  '003_tech_practice_records.sql',
  '004_tech_user_ai_conversations.sql',
  '005_tech_rls_policies.sql',
  '006_tech_updated_at_triggers.sql',
]

const RPC_BODY_LIMIT_BYTES = 900 * 1024  // 单 RPC body 软上限（PostgREST≈1MB，留 buffer）
const BOOTSTRAP_SQL = `-- 一次性 bootstrap：在 Supabase SQL Editor 粘贴执行，run 完成后跑 runner 即生效
-- 该函数只能由 service_role 调用（SECURITY DEFINER + 内层校验 p_sql 不为空）
-- 用 pg_catalog 搜索路径，禁止用户函数内取默认重名函数解析偏差
CREATE OR REPLACE FUNCTION public.exec_sql(p_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_sql IS NULL OR length(trim(p_sql)) = 0 THEN
    RAISE EXCEPTION 'exec_sql: empty payload';
  END IF;
  EXECUTE p_sql;
END
$$;

-- 仅 service_role 能调用；anon/authenticated 会拒绝
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
`

// ---------- env & CLI ----------

function readDotenv(dotenvPath) {
  if (!fs.existsSync(dotenvPath)) {
    throw new Error(`--dotenv file not found: ${dotenvPath}`)
  }
  const text = fs.readFileSync(dotenvPath, 'utf-8')
  const out = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i)
    if (!m) continue
    let value = m[2]
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

function parseArgs(argv) {
  const opts = {
    dotenv: null,
    url: process.env.SUPABASE_URL || null,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
    dryRun: false,
    skipBootstrap: false,
    bootstrapOnly: false,
    help: false,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dotenv') opts.dotenv = argv[++i]
    else if (a === '--url') opts.url = argv[++i]
    else if (a === '--service-role') opts.serviceRole = argv[++i]
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--skip-bootstrap-check') opts.skipBootstrap = true
    else if (a === '--bootstrap-only') opts.bootstrapOnly = true
    else if (a === '--help' || a === '-h') opts.help = true
    else throw new Error(`未知参数: ${a}`)
  }

  if (opts.dotenv) {
    const fromFile = readDotenv(path.resolve(opts.dotenv))
    if (fromFile.SUPABASE_URL) opts.url = opts.url || fromFile.SUPABASE_URL
    if (fromFile.SUPABASE_SERVICE_ROLE_KEY) {
      opts.serviceRole = opts.serviceRole || fromFile.SUPABASE_SERVICE_ROLE_KEY
    }
  }

  return opts
}

function printHelp() {
  console.log(`
用法：
  node scripts/supabase-remote-apply.cjs \\
       [--dotenv <path-to-env>]\\
       [--url https://<project>.supabase.co]\\
       [--service-role <jwt>]\\
       [--dry-run] [--skip-bootstrap-check] [--bootstrap-only]

要求：
  - 提供 service_role key（来自 process.env / --dotenv .env.local / --service-role）
  - 首次跑会在缺 exec_sql 时打印 SQL 框，让用户在 SQL Editor 一次性粘贴
    （脚本本身不会上传此 SQL，避免再次外发敏感通道）

可选：
  --dry-run               不连远端，预演顺序与字节数
  --skip-bootstrap-check  跳过 RPC 是否存在的检查（默认开启）
  --bootstrap-only        仅打印 bootstrap SQL 后退出

提示：
  service_role key 写入仓库会泄权。本仓库 .gitignore 已忽略 .env*
`)
}

// ---------- plan & order ----------

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function planFiles() {
  // 防御性：004_tech_rls_policies.sql 顺序排在 005；按命名顺序自然序
  // 显式固定 001..006 的顺序以防未来加内部子文件扰乱列表
  const mig = MIGRATION_FILES.map(n => path.join(MIG_DIR, n))
  for (const p of mig) {
    if (!fs.existsSync(p)) throw new Error(`缺失迁移: ${p}`)
  }
  const qSeed = fs
    .readdirSync(SEED_DIR)
    .filter(f => f.startsWith('007_tech_questions_part') && f.endsWith('.sql'))
    .sort(naturalCompare)
    .map(f => path.join(SEED_DIR, f))
  const aSeed = fs
    .readdirSync(SEED_DIR)
    .filter(f => f.startsWith('008_tech_ai_answers_part') && f.endsWith('.sql'))
    .sort(naturalCompare)
    .map(f => path.join(SEED_DIR, f))

  if (qSeed.length === 0) throw new Error(`seed 缺失：${SEED_DIR} no 007_*_part*.sql`)
  if (aSeed.length === 0) throw new Error(`seed 缺失：${SEED_DIR} no 008_*_part*.sql`)
  return [...mig, ...qSeed, ...aSeed]
}

function dryRun() {
  const plan = planFiles()
  console.log(`[dry-run] 计划执行 ${plan.length} 个 SQL 文件：`)
  let totalBytes = 0
  let tooBig = []
  for (const p of plan) {
    const buf = fs.readFileSync(p)
    const size = buf.length
    totalBytes += size
    const relPath = path.relative(ROOT, p)
    if (size > RPC_BODY_LIMIT_BYTES) tooBig.push({ p: relPath, size })
    console.log(`  - ${relPath.padEnd(54)} ${(size / 1024).toFixed(1).padStart(8)} KB`)
  }
  console.log(`合计：${(totalBytes / 1024 / 1024).toFixed(2)} MB`)
  if (tooBig.length > 0) {
    console.error(`\n[dry-run] ⚠️  以下文件超出单 RPC body 软上限：`)
    for (const x of tooBig) {
      console.error(`  - ${x.p}  ${(x.size / 1024).toFixed(1)} KB`)
    }
    process.exitCode = 2
    return
  }
  console.log(`[dry-run] OK\n不连远端，预演通过。`)
}

function stripComments(sql) {
  // 与 applyFile 内逻辑一致；保持 COMMENT 集中到 chaser
  const lines = sql.split('\n')
  const out = []
  for (const line of lines) {
    if (/^\s*COMMENT\s+ON\s+(?:TABLE|COLUMN)\s+.+?;\s*$/.test(line)) {
      accumulatedComments.push(line.trim())
      continue
    }
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ---------- remote ----------

async function getSupabaseJs() {
  // 动态 require，失败给清晰提示（避免在 dry-run 模式下抛错）
  try {
    return require('@supabase/supabase-js')
  } catch (err) {
    throw new Error(
      `找不到 @supabase/supabase-js。请先 \`npm i\` 装依赖。底层错误: ${err.message}`,
    )
  }
}

async function probeExecSql(client) {
  // 用 rpc 试探 + 兜底用 pg_proc 查元数据，无法直接查时回退为让 exec_sql 跑一次无害句
  const { data, error } = await client
    .from('pg_proc')
    .select('proname')
    .eq('proname', 'exec_sql')
    .limit(1)
  if (!error && Array.isArray(data) && data.length > 0) return true
  // 兜底：直接执行一行无害 SQL，若 RPC 不存在会拿到 PGRES_RPC_NOT_FOUND 之类
  const probe = await client.rpc('exec_sql', { p_sql: 'SELECT 1;' })
  if (!probe.error) return true
  // 错误码非 400/404 系列直接报
  if (probe.error && !/(not found|pgrst|fn_not_found)/i.test(probe.error.message)) {
    throw new Error(`检查 exec_sql RPC 失败: ${probe.error.message}`)
  }
  return false
}

async function ensureBootstrap(client, opts) {
  if (opts.skipBootstrap) return
  const has = await probeExecSql(client)
  if (has) {
    console.log(`[bootstrap] exec_sql RPC 已存在，跳过。`)
    return
  }
  console.error(`[bootstrap] ✗ 缺 exec_sql RPC。请在 Supabase SQL Editor 一次性粘贴下面这段：\n`)
  console.error('─'.repeat(80))
  console.error(BOOTSTRAP_SQL)
  console.error('─'.repeat(80))
  console.error(`\n[bootstrap] 跑完后再重试本脚本 runner。`)
  process.exitCode = 3
  throw new Error('exec_sql RPC not installed')
}

const accumulatedComments = []  // 内存集中 COMMENT 由 runner 在末尾写为 _comments_post.sql
const COMMENT_RE = /^\s*COMMENT\s+ON\s+(?:TABLE|COLUMN)\s+.+?;$/gm

function stripComments(sql) {
  const out = []
  for (const line of sql.split('\n')) {
    if (COMMENT_RE.test(line)) {
      accumulatedComments.push(line.trim())
      COMMENT_RE.lastIndex = 0
      continue
    }
    COMMENT_RE.lastIndex = 0
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function applyFile(client, filePath) {
  const name = path.relative(ROOT, filePath)
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^--.*$/gm, '').trim()
  // 内存剥离 COMMENT ON 段（service_role 在 pg_catalog 上无 UPDATE 权限，会 403）
  const sql = stripComments(raw)
  // 空 SQL（如 placeholder）跳过
  if (!sql) {
    console.log(`  · ${name} (empty, skip)`)
    return
  }
  if (sql.length > RPC_BODY_LIMIT_BYTES) {
    throw new Error(`${name} 超出 RPC body 软上限 ${RPC_BODY_LIMIT_BYTES}B`)
  }
  const { error } = await client.rpc('exec_sql', { p_sql: sql })
  if (error) {
    throw new Error(`${name} 失败: ${error.message}`)
  }
  console.log(`  ✓ ${name}`)
}

async function runRemote(opts) {
  if (!opts.url || !opts.serviceRole) {
    throw new Error('缺 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  const { createClient } = await getSupabaseJs()
  const client = createClient(opts.url, opts.serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  if (opts.bootstrapOnly) {
    console.log(BOOTSTRAP_SQL)
    return
  }
  await ensureBootstrap(client, opts)
  console.log(`[run] 连接 ${opts.url}`)
  const plan = planFiles()
  let i = 0
  for (const p of plan) {
    i++
    console.log(`[${i}/${plan.length}]`)
    await applyFile(client, p)
  }
  console.log(`\n[done] 全部 ${plan.length} 个 SQL 推送完成。`)

  if (accumulatedComments.length > 0) {
    const chaser = path.join(MIG_DIR, '_comments_post.sql')
    const header =
      `-- 自动剥离的 COMMENT ON 段（service_role 在 pg_catalog 写权限不足）\n` +
      `-- 请在 Supabase SQL Editor 一次性粘贴执行（postgres 角色有权限）\n` +
      `-- 跑完即可，失败不影响表结构本身\n\n`
    fs.writeFileSync(chaser, header + accumulatedComments.join('\n') + '\n')
    console.log(`\n[chaser] ${accumulatedComments.length} 条 COMMENT 已写出：${path.relative(ROOT, chaser)}`)
    console.log(`        请在 Supabase SQL Editor 一次性粘贴执行。`)
  }
}

// ---------- main ----------

async function main() {
  let args
  try {
    args = parseArgs(process.argv)
  } catch (err) {
    console.error(`参数错误: ${err.message}\n`)
    printHelp()
    process.exit(1)
  }
  if (args.help) {
    printHelp()
    return
  }
  if (args.dryRun) {
    dryRun()
    return
  }
  try {
    await runRemote(args)
  } catch (err) {
    console.error(`[fatal] ${err.message}`)
    process.exit(1)
  }
}

main()