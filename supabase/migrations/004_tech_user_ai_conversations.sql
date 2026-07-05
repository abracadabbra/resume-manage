-- v3 Schema: tech_user_ai_conversations 个人追问对话（RLS 私有）
-- v3 关键决策：只存 conversations，不存 answer 字段（与公共 tech_interview_ai_answers.answer 语义不重叠）

CREATE TABLE tech_user_ai_conversations (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id   TEXT NOT NULL REFERENCES tech_interview_questions(id) ON DELETE CASCADE,
  conversations JSONB NOT NULL DEFAULT '[]'::jsonb
                   CHECK (jsonb_typeof(conversations) = 'array'),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

COMMENT ON TABLE  tech_user_ai_conversations IS '个人追问对话（私有，不存储 answer 文本）';
COMMENT ON COLUMN tech_user_ai_conversations.user_id IS 'auth.users.id';
COMMENT ON COLUMN tech_user_ai_conversations.question_id IS 'tech_interview_questions.id';
COMMENT ON COLUMN tech_user_ai_conversations.conversations IS '追问对话数组 [{role, content, ts}, ...]';

CREATE INDEX idx_tech_user_ai_conversations_user_updated
  ON tech_user_ai_conversations (user_id, updated_at DESC);