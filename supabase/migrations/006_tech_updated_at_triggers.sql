-- v3 updated_at triggers
-- 函数名沿用 set_updated_at()，与 v2 文档一致

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tech_practice_records_updated
  BEFORE UPDATE ON tech_practice_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tech_user_ai_conversations_updated
  BEFORE UPDATE ON tech_user_ai_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tech_interview_ai_answers_updated
  BEFORE UPDATE ON tech_interview_ai_answers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();