# Supabase 远端迁移 Runner（v3 Tech Practice Sync）

把 `supabase/migrations/001..006` 与 `supabase/migrations/seed/007_*.sql` / `008_*.sql` 一键推到远端 Supabase。
**脚本不存 `service_role` key**——你通过 `.env.local`、`process.env` 或 `--service-role` 一次性提供；`.env*` 已在 `.gitignore` 忽略，不会进仓库。

## 一次性准备

### 1) 在 Supabase 控制台拿到 service_role key

- Project Settings → API → `service_role` secret（不要拿成 `anon`）。
- Clerk/Email/SMS 用户不需要注册就能跑迁移——`service_role` 是数据库管理员角色，不走 auth。

### 2) 准备 `.env.local`（仓库根或 `scripts/` 同级）

```env
SUPABASE_URL=https://plymffomjwgaisicytbl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...（你的 service_role 完整 JWT）
```

`.gitignore` 已忽略 `.env*`，确认你不会 `git add .env.local`。

### 3) 一次性 Bootstrap Exec SQL RPC

PostgREST 不允许任意 SQL；runner 通过 `public.exec_sql(p_sql text)` 函数执行迁移，你需要**在 Supabase SQL Editor 一次性粘贴下面这段跑一次**：

```sql
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

REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
```

> 走 SQL Editor 是为了避免 runner 在没有 RPC 的情况下再次外发敏感通道——你只需贴一次即可。

## 用法

```bash
# 1. 干跑（不连远端，预演顺序与字节数）
node scripts/supabase-remote-apply.cjs --dry-run

# 2. 实际推送（从 .env.local 读 URL + service_role）
node scripts/supabase-remote-apply.cjs --dotenv .env.local

# 3. 只打印 Bootstrap SQL（核对/给协作者看）
node scripts/supabase-remote-apply.cjs --bootstrap-only

# 4. 覆盖某一项（CI/高安全环境推荐，token 不入进程环境）
node scripts/supabase-remote-apply.cjs --url https://<project>.supabase.co --service-role "$(security find-generic-password -s supabase-service-role -w)"
```

优先级：CLI flag > `--dotenv` 文件 > `process.env`。

## 执行顺序

```
001 tech_interview_questions.sql    -- 公共题库表
002 tech_interview_ai_answers.sql   -- 公共 AI 答案表
003 tech_practice_records.sql       -- 私有练习记录
004 tech_user_ai_conversations.sql  -- 私有追问对话
005 tech_rls_policies.sql           -- RLS（四张表策略）
006 tech_updated_at_triggers.sql    -- updated_at 自动维护
seed/007_tech_questions_part001..006.sql  -- 题目（含 companies JSONB）首次灌
seed/008_tech_ai_answers_part001..014.sql -- AI 答案，按 200/批
```

## 关键约束

- 单文件最大 `008_tech_ai_answers_part012.sql` ≈ 869.5 KB，仍在 PostgREST RPC body ~1 MB 安全线内。
- 001/002 包含 `DROP TABLE IF EXISTS ... CASCADE` 防御段，重跑不会留脏 schema；seed 文件用 `ON CONFLICT DO NOTHING/UPDATE`，可重跑且幂等。
- 私有表（`tech_practice_records` / `tech_user_ai_conversations`）建表后 RLS 立刻生效——**未登录用户不能 SELECT**，正常 anon key 直连流程不会受影响。
- 公共表只保留 `SELECT` 给 `anon`，不暴露写路径；写操作只能走 `service_role`（即仅本 runner）。

## 退出码

| 退出码 | 含义 |
|---|---|
| `0` | 全部成功（dry-run 同样 0） |
| `1` | 参数 / env / RPC 调用失败 |
| `2` | dry-run 发现有文件超过 RPC body 软上限（脚本会自动列表） |
| `3` | 缺 `exec_sql` RPC，已打印待粘贴 SQL |

## 失败暂停与恢复

runner 在**第一个 RPC 失败处立即中止**（不改 `lastSyncedAt` 等所有状态）。直接 re-run 就够——seed 用 ON CONFLICT 幂等。001/002 也已包含防御性 drop，无需手动删表。

## 完集成后建议回滚

迁移成功后你可以删除 `exec_sql` RPC（它在生产无意义，仅是本次迁移通道）：

```sql
DROP FUNCTION IF EXISTS public.exec_sql(text);
```

但保留也没副作用（`grant` 仅 `service_role`；前端 anon 直连路径不会暴露）。

## 安全 & 凭据处置

- runner 仅接收 `--service-role <jwt>` 字符串，**永不落盘、不打印、不写日志**。
- `--bootstrap-only` 走 stdout，但仅打印 SQL 框、不连远端、不暴露 key。
- 若误把 service_role JWT 写进 chat/PR，请到 Supabase 控制台 Project Settings → API → `service_role` → Roll & regenerate，旧 key 即时失效。