-- v3 Schema: tech_interview_ai_answers 公共 AI 答案
-- v3 重要变更：移除 conversations 字段（追问对话迁到 tech_user_ai_conversations 私有表）
-- 公共表只保留 answer 文本，跨用户共享只读

CREATE TABLE tech_interview_ai_answers (
  question_id TEXT PRIMARY KEY
              REFERENCES tech_interview_questions(id) ON DELETE CASCADE,
  answer      TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  tech_interview_ai_answers IS 'AI 公共参考答案（每题一份，跨用户共享，只读）';
COMMENT ON COLUMN tech_interview_ai_answers.question_id IS '关联题目 ID（与 tech_interview_questions.id 同语义）';
COMMENT ON COLUMN tech_interview_ai_answers.answer IS 'Markdown 格式的 AI 参考答案';
COMMENT ON COLUMN tech_interview_ai_answers.updated_at IS '最后更新时间（service_role 灌入时设置）';