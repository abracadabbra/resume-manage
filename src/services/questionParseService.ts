import { useAiConfigStore } from '@/stores/aiConfig'

export interface ParsedQuestion {
  chapterId: string
  chapterName: string
  title: string
  difficulty: 'basic' | 'intermediate' | 'advanced'
  labels: string[]
  answer: {
    content: string
    followUp: { question: string; answer: string }[]
  }
}

export interface ParseQuestionCallbacks {
  onChunk: (text: string) => void
  onDone: (question: ParsedQuestion) => void
  onError: (error: string) => void
}

const CHAPTERS_CONTEXT = `题目库有以下14个章节：
ch1: Java基础 & 并发 - 线程池、锁机制、volatile、CAS、ThreadLocal、并发容器
ch2: JVM - 运行时数据区、GC算法、垃圾收集器、OOM排查、JVM调优
ch3: Spring & 框架 - Bean生命周期、循环依赖、事务传播、失效场景、Dubbo、Sentinel、MyBatis
ch4: 数据库 & 缓存 - MySQL索引、事务隔离、MVCC、Redis数据结构、持久化、淘汰策略、主从复制、HBase、MongoDB、ES
ch5: 消息队列 - Kafka可靠性、Rebalance、顺序性、RocketMQ对比、常见问题
ch6: 大数据 - Flink状态管理、Checkpoint、Spark调度、Shuffle、数据倾斜、Hive、HDFS
ch7: 项目深挖-风控系统 - 决策引擎、特征平台、关系图谱、AB实验、RAG知识库
ch8: 项目深挖-毛利系统 - 毛利计算、QPS优化、Function Calling
ch9: 项目深挖-算法工程平台 - 仿真系统、Spark AQE、LangChain Agent
ch10: 系统设计 - 实时风控系统设计、接口变慢排查、延迟任务调度、幂等方案
ch11: AI应用 - RAG流程、Prompt工程、大模型应用
ch12: 架构 & 设计原则 - 技术选型、微服务拆分、分布式事务、高可用、可扩展性
ch13: 团队 & 软技能 - 带人方法、技术方案评审、技术债平衡
ch14: 开放问题 - 新技术学习、技术亮点、职业规划`

export async function parseQuestionText(
  rawText: string,
  callbacks: ParseQuestionCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const config = useAiConfigStore()

  if (!config.apiUrl || !config.apiToken) {
    callbacks.onError('请先在设置中配置 AI API')
    return
  }

  const systemPrompt = `你是一个面试题库管理助手。用户会输入一段题目描述（可能包含题目、答案、追问方向等），你需要从中提取信息并生成结构化的题目数据。

${CHAPTERS_CONTEXT}

标签可选：["必须掌握", "高频追问", "深入理解", "设计能力"]

难度级别：basic(基础)、intermediate(中等)、advanced(高级)

请根据用户输入的内容，判断：
1. 属于哪个章节
2. 题目难度
3. 适合的标签

直接输出JSON格式，不要有其他内容：
{
  "chapterId": "ch1",
  "chapterName": "章节名",
  "title": "题目",
  "difficulty": "intermediate",
  "labels": ["必须掌握"],
  "answer": {
    "content": "标准答案内容",
    "followUp": [
      { "question": "追问1", "answer": "针对追问1的标准答案" },
      { "question": "追问2", "answer": "针对追问2的标准答案" }
    ]
  }
}`

  const userMessage = `请解析以下题目内容：

${rawText}`

  let baseUrl = config.apiUrl.trim().replace(/\/+$/, '')
  if (!baseUrl.includes('/v1/chat/completions')) {
    if (!baseUrl.endsWith('/v1')) {
      baseUrl += '/v1'
    }
    baseUrl += '/chat/completions'
  }

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiToken}`,
      },
      body: JSON.stringify({
        model: config.modelName || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        stream: true,
      }),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      callbacks.onError(`API 请求失败 (${response.status}): ${errorText || response.statusText}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      callbacks.onError('无法读取 API 响应流')
      return
    }

    const decoder = new TextDecoder()
    let fullText = ''
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content
          if (content) {
            fullText += content
            callbacks.onChunk(fullText)
          }
        } catch {
          // Ignore malformed chunks
        }
      }
    }

    // Parse JSON from response
    const jsonMatch = fullText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ParsedQuestion
      callbacks.onDone(parsed)
    } else {
      callbacks.onError('无法解析 AI 返回的数据，请重试')
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    callbacks.onError(`请求出错: ${message}`)
  }
}
