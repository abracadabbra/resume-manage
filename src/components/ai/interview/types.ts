import type { InterviewTurnScore } from '@/services/interviewService'

export interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  score: InterviewTurnScore | null
}

/**
 * 追问问题及答案
 */
export interface FollowUpItem {
  question: string
  answer: string
}

/**
 * 题目参考答案结构
 */
export interface QuestionAnswer {
  content: string
  followUp: FollowUpItem[]
}

/**
 * 答案展示状态
 */
export interface AnswerDisplayState {
  questionId: string
  isExpanded: boolean
}

/**
 * 题目答案展示数据（包含答案内容和展开状态）
 */
export interface QuestionWithAnswer {
  questionId: string
  answer: QuestionAnswer | null
}

/**
 * 追问项展示数据
 */
export interface FollowUpDisplay {
  question: string
  answer: string
  isExpanded: boolean
}
