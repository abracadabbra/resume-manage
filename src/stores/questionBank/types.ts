import type { ChatMessage } from '@/services/aiClient'

export interface Question {
  id: string
  chapterId: string
  number: number
  title: string
  difficulty: 'basic' | 'intermediate' | 'advanced'
  labels: string[]
  source?: QuestionSource
  projectNames?: string[]
  techStacks?: string[]
  answer: {
    content: string
    followUp: { question: string; answer: string }[]
  }
}

export type QuestionDraft = Omit<Question, 'id' | 'number'>
export type QuestionSource = 'bundled' | 'manual' | 'resume-generated' | 'project-generated' | 'interview-review'
export type QuestionViewFilter = 'all' | 'resume-generated' | 'review'
export type PracticeMastery = 'unpracticed' | 'practicing' | 'mastered' | 'weak'
export type QuestionSourceFilter = 'all' | QuestionSource
export type PracticeMasteryFilter = 'all' | PracticeMastery

export interface PracticeAiReview {
  overallScore: number
  completenessScore: number
  accuracyScore: number
  depthScore: number
  deliveryScore: number
  summary: string
  strengths: string[]
  improvements: string[]
  improvedAnswer: string
  updatedAt: number | null
}

export interface PracticeRecord {
  answer: string
  notes: string
  mastery: PracticeMastery
  updatedAt: number | null
  aiReview: PracticeAiReview | null
}

export interface Chapter {
  id: string
  name: string
  shortName: string
  order: number
  questionCount: number
}

export interface QuestionBankDataset {
  chapters: Chapter[]
  questions: Question[]
}

export interface AiAnswerData {
  answer: string
  conversations: ChatMessage[]
  updatedAt: number
}
