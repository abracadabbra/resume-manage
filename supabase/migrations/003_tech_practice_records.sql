-- v3 Schema: tech_practice_records 个人练习记录（RLS 私有）

CREATE TABLE tech_practice_records (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES tech_interview_questions(id) ON DELETE CASCADE,
  mastery     TEXT NOT NULL DEFAULT 'unpracticed'
                CHECK (mastery IN ('unpracticed','practicing','mastered','weak')),
  answer      TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)
);

COMMENT ON TABLE  tech_practice_records IS '个人练习记录（每用户一行/题，RLS 隔离）';
COMMENT ON COLUMN tech_practice_records.user_id IS 'auth.users.id';
COMMENT ON COLUMN tech_practice_records.question_id IS 'tech_interview_questions.id';
COMMENT ON COLUMN tech_practice_records.mastery IS 'unpracticed | practicing | mastered | weak';
COMMENT ON COLUMN tech_practice_records.answer IS '用户回答文本';
COMMENT ON COLUMN tech_practice_records.notes IS '用户笔记';

CREATE INDEX idx_tech_practice_records_user_updated
  ON tech_practice_records (user_id, updated_at DESC);