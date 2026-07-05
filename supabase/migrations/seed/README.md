# Seed 灌入顺序

1. 先执行 supabase/migrations/001..006 全部建表 + RLS + trigger
2. 再执行本目录所有 007_tech_questions_part*.sql（先灌题目表，AI 答案表 FK 才能插）
3. 最后执行所有 008_tech_ai_answers_part*.sql

Supabase Studio SQL Editor 单 query 限制 ~1MB，本目录已按 500 题 / 200 答案 拆分。
