import { loadJson, saveJson } from '@/services/safeStorage'
import {
  normalizeAiAnswers,
  normalizePracticeRecords,
  normalizeQuestion,
} from './normalizers'
import type { AiAnswerData, PracticeRecord, Question } from './types'

export const STORAGE_KEY = 'question-bank-added-questions'
export const PRACTICE_STORAGE_KEY = 'question-bank-practice-records'
export const AI_ANSWERS_STORAGE_KEY = 'question-bank-ai-answers'
export const QUESTION_BANK_LOCAL_SCHEMA_VERSION = 1

interface AddedQuestionsStorageData {
  schemaVersion: typeof QUESTION_BANK_LOCAL_SCHEMA_VERSION
  questions: Question[]
}

interface PracticeRecordsStorageData {
  schemaVersion: typeof QUESTION_BANK_LOCAL_SCHEMA_VERSION
  records: Record<string, PracticeRecord>
}

interface AiAnswersStorageData {
  schemaVersion: typeof QUESTION_BANK_LOCAL_SCHEMA_VERSION
  answers: Record<string, AiAnswerData>
}

export function loadAddedQuestions(): Question[] {
  const value = loadJson<AddedQuestionsStorageData | Question[]>(localStorage, STORAGE_KEY, []).value
  const questions = Array.isArray(value) ? value : Array.isArray(value.questions) ? value.questions : []
  return questions.map((item) => normalizeQuestion(item, 'manual'))
}

export function saveAddedQuestions(questions: Question[]) {
  saveJson(localStorage, STORAGE_KEY, {
    schemaVersion: QUESTION_BANK_LOCAL_SCHEMA_VERSION,
    questions,
  } satisfies AddedQuestionsStorageData)
}

export function loadPracticeRecords(): Record<string, PracticeRecord> {
  const value = loadJson<PracticeRecordsStorageData | Record<string, PracticeRecord>>(
    localStorage,
    PRACTICE_STORAGE_KEY,
    {},
  ).value
  const records =
    value && typeof value === 'object' && !Array.isArray(value) && 'records' in value
      ? value.records
      : value
  return normalizePracticeRecords(records)
}

export function savePracticeRecords(records: Record<string, PracticeRecord>) {
  saveJson(localStorage, PRACTICE_STORAGE_KEY, {
    schemaVersion: QUESTION_BANK_LOCAL_SCHEMA_VERSION,
    records,
  } satisfies PracticeRecordsStorageData)
}

export function loadAiAnswers(): Record<string, AiAnswerData> {
  const value = loadJson<AiAnswersStorageData | Record<string, AiAnswerData>>(
    localStorage,
    AI_ANSWERS_STORAGE_KEY,
    {},
  ).value
  const answers =
    value && typeof value === 'object' && !Array.isArray(value) && 'answers' in value
      ? value.answers
      : value
  return normalizeAiAnswers(answers)
}

export function saveAiAnswers(answers: Record<string, AiAnswerData>) {
  saveJson(localStorage, AI_ANSWERS_STORAGE_KEY, {
    schemaVersion: QUESTION_BANK_LOCAL_SCHEMA_VERSION,
    answers,
  } satisfies AiAnswersStorageData)
}

export function cloneAiAnswers(answers: Record<string, AiAnswerData>): Record<string, AiAnswerData> {
  return Object.fromEntries(
    Object.entries(answers).map(([questionId, data]) => [
      questionId,
      { ...data, conversations: [...data.conversations] },
    ]),
  )
}

export function clonePracticeRecords(records: Record<string, PracticeRecord>): Record<string, PracticeRecord> {
  return Object.fromEntries(
    Object.entries(records).map(([questionId, record]) => [
      questionId,
      {
        ...record,
        aiReview: record.aiReview
          ? {
              ...record.aiReview,
              strengths: [...record.aiReview.strengths],
              improvements: [...record.aiReview.improvements],
            }
          : null,
      },
    ]),
  )
}
