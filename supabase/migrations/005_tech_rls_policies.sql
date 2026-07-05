-- v3 RLS Policies
-- 关键变更（相对旧版 001）：
--   1. 公共表（questions/ai_answers）只有 SELECT 策略，**无 INSERT/UPDATE/DELETE 策略**
--      → anon / authenticated 都无法写公共表；只有 service_role 绕过 RLS 才能写
--   2. 私有表（practice_records / user_ai_conversations）用 auth.uid() 隔离

-- 公共表：所有角色可读
ALTER TABLE tech_interview_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_interview_ai_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read questions"
  ON tech_interview_questions
  FOR SELECT
  USING (true);

CREATE POLICY "public read ai answers"
  ON tech_interview_ai_answers
  FOR SELECT
  USING (true);

-- 故意不写 INSERT/UPDATE/DELETE 策略 → 公共表只能由 service_role 写入
-- service_role 通过 Bypass RLS 绕过策略

-- 私有表：仅本人读写
ALTER TABLE tech_practice_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_user_ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own practice rows"
  ON tech_practice_records
  FOR ALL
  TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "own conversation rows"
  ON tech_user_ai_conversations
  FOR ALL
  TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());