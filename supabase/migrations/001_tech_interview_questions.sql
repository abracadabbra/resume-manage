-- v3 Schema: tech_interview_questions 公共题库
-- 防御性：若 001/旧版已执行过，drop 后重建（题目数据由 007 seed 灌入）
-- PK 用 text（external_id，如 "my-ql-001"），题目 ID 全局唯一且稳定

DROP TABLE IF EXISTS tech_user_ai_conversations CASCADE;
DROP TABLE IF EXISTS tech_practice_records CASCADE;
DROP TABLE IF EXISTS tech_interview_ai_answers CASCADE;
DROP TABLE IF EXISTS tech_interview_questions CASCADE;

CREATE TABLE tech_interview_questions (
  id            TEXT PRIMARY KEY,         -- 业务 ID（来自 src/data JSON 的 id 字段）
  question_text TEXT NOT NULL,
  mention_count INT  NOT NULL DEFAULT 1,
  companies     JSONB NOT NULL DEFAULT '[]'::jsonb,
  tech_field    VARCHAR(100),
  position      VARCHAR(100),
  round         VARCHAR(50),
  note_id       VARCHAR(100),
  note_title    VARCHAR(255),
  link          TEXT,
  published_at  VARCHAR(50),
  source        VARCHAR(20) NOT NULL DEFAULT 'bundled',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  tech_interview_questions IS '大厂面经题目表（公共只读，写入由 SQL migration 灌入）';
COMMENT ON COLUMN tech_interview_questions.id IS '业务唯一 ID（src/data JSON 的 id 字段，如 my-ql-001）';
COMMENT ON COLUMN tech_interview_questions.question_text IS '面试题原文';
COMMENT ON COLUMN tech_interview_questions.mention_count IS '该题目在所有笔记中出现的总次数';
COMMENT ON COLUMN tech_interview_questions.companies IS '出现该题的公司名数组';
COMMENT ON COLUMN tech_interview_questions.tech_field IS '技术领域分类';
COMMENT ON COLUMN tech_interview_questions.position IS '招聘岗位';
COMMENT ON COLUMN tech_interview_questions.round IS '面试轮次';
COMMENT ON COLUMN tech_interview_questions.note_id IS '小红书笔记 ID';
COMMENT ON COLUMN tech_interview_questions.note_title IS '原始笔记标题';
COMMENT ON COLUMN tech_interview_questions.link IS '原始笔记 URL';
COMMENT ON COLUMN tech_interview_questions.published_at IS '笔记发布时间 YYYY-MM-DD';
COMMENT ON COLUMN tech_interview_questions.source IS 'bundled | manual | imported';

-- 索引
CREATE INDEX idx_tech_interview_questions_field
  ON tech_interview_questions (tech_field, position);
CREATE INDEX idx_tech_interview_questions_published
  ON tech_interview_questions (published_at);