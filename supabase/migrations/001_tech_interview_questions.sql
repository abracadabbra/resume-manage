-- Supabase SQL migration for tech interview questions
-- Run this in Supabase SQL Editor

-- 主表：tech_interview_questions
CREATE TABLE IF NOT EXISTS tech_interview_questions (
  id              BIGSERIAL PRIMARY KEY,
  question_text   TEXT NOT NULL,
  mention_count   INT NOT NULL DEFAULT 1,
  companies       JSONB NOT NULL DEFAULT '[]'::jsonb,
  tech_field      VARCHAR(100),
  position        VARCHAR(100),
  round           VARCHAR(50),
  note_id         VARCHAR(100),
  note_title      VARCHAR(255),
  link            TEXT,
  published_at    VARCHAR(50),
  source          VARCHAR(20) NOT NULL DEFAULT 'bundled',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tech_interview_questions IS '大厂面经题目表';
COMMENT ON COLUMN tech_interview_questions.id IS '题目唯一 ID，自增主键';
COMMENT ON COLUMN tech_interview_questions.question_text IS '面试题原文，用户可编辑此字段';
COMMENT ON COLUMN tech_interview_questions.mention_count IS '该题目在所有笔记中出现的总次数';
COMMENT ON COLUMN tech_interview_questions.companies IS '出现该题的公司名数组，格式 ["字节","阿里"]';
COMMENT ON COLUMN tech_interview_questions.tech_field IS '技术领域分类，如 AI / Java / 系统设计';
COMMENT ON COLUMN tech_interview_questions.position IS '招聘岗位，如 后端开发';
COMMENT ON COLUMN tech_interview_questions.round IS '面试轮次，如 一面 / 二面';
COMMENT ON COLUMN tech_interview_questions.note_id IS '小红书笔记 ID，用于溯源';
COMMENT ON COLUMN tech_interview_questions.note_title IS '原始笔记标题';
COMMENT ON COLUMN tech_interview_questions.link IS '原始笔记 URL';
COMMENT ON COLUMN tech_interview_questions.published_at IS '笔记发布时间，格式 YYYY-MM-DD';
COMMENT ON COLUMN tech_interview_questions.source IS 'bundled=打包自带, manual=用户新增, imported=外部导入';
COMMENT ON COLUMN tech_interview_questions.created_at IS '记录创建时间';
COMMENT ON COLUMN tech_interview_questions.updated_at IS '最后修改时间';

-- 索引
CREATE INDEX IF NOT EXISTS idx_tech_field ON tech_interview_questions(tech_field);
CREATE INDEX IF NOT EXISTS idx_published_at ON tech_interview_questions(published_at);

-- AI 答案表
CREATE TABLE IF NOT EXISTS tech_interview_ai_answers (
  id              BIGSERIAL PRIMARY KEY,
  question_id     BIGINT NOT NULL REFERENCES tech_interview_questions(id) ON DELETE CASCADE,
  answer          TEXT NOT NULL,
  conversations   JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tech_interview_ai_answers IS 'AI 生成的题目参考答案表';
COMMENT ON COLUMN tech_interview_ai_answers.id IS '答案记录 ID，自增主键';
COMMENT ON COLUMN tech_interview_ai_answers.question_id IS '关联题目 ID';
COMMENT ON COLUMN tech_interview_ai_answers.answer IS 'Markdown 格式的 AI 参考答案';
COMMENT ON COLUMN tech_interview_ai_answers.conversations IS 'AI 追问对话历史 [{role, content}, ...]';
COMMENT ON COLUMN tech_interview_ai_answers.updated_at IS '最后更新时间';

CREATE UNIQUE INDEX IF NOT EXISTS idx_question_id ON tech_interview_ai_answers(question_id);

-- RLS
ALTER TABLE tech_interview_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_interview_ai_answers ENABLE ROW LEVEL SECURITY;

-- 公开读取（匿名可读，供展示用）
CREATE POLICY "Allow public read questions" ON tech_interview_questions
  FOR SELECT USING (true);

CREATE POLICY "Allow public read answers" ON tech_interview_ai_answers
  FOR SELECT USING (true);

-- 需要认证才能写入
CREATE POLICY "Allow authenticated insert questions" ON tech_interview_questions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated update questions" ON tech_interview_questions
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated delete questions" ON tech_interview_questions
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated upsert answers" ON tech_interview_ai_answers
  FOR ALL USING (auth.role() = 'authenticated');

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_updated_at_questions
  BEFORE UPDATE ON tech_interview_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_updated_at_answers
  BEFORE UPDATE ON tech_interview_ai_answers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
