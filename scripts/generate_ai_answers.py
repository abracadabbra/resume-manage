#!/usr/bin/env python3
"""批量为大厂面经题目生成 AI 答案，写入 ai-answers.json。

用法：
  # 生成全部分类（8线程并发）
  python scripts/generate_ai_answers.py --workers 8

  # 只生成特定分类
  python scripts/generate_ai_answers.py --categories AI MySQL Redis --workers 4

  # 从指定进度继续（跳过已存在的）
  python scripts/generate_ai_answers.py --workers 8
"""

import json
import os
import sys
import time
import argparse
import http.client
import urllib.parse
import urllib.error
import threading
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
INPUT_FILE = os.path.join(PROJECT_ROOT, 'src', 'data', 'tech-interview-questions.json')
OUTPUT_FILE = os.path.join(PROJECT_ROOT, 'src', 'data', 'ai-answers.json')
PROGRESS_FILE = os.path.join(PROJECT_ROOT, 'src', 'data', 'ai-answers-progress.json')

# 线程安全的结果锁
results_lock = threading.Lock()
print_lock = threading.Lock()

# 从环境变量或配置文件读取 AI 配置
AI_CONFIG_FILE = os.path.join(PROJECT_ROOT, 'ai-config.json')


def load_ai_config() -> dict[str, str]:
    """加载 AI 配置，支持 ai-config.json 或环境变量。"""
    if os.path.exists(AI_CONFIG_FILE):
        with open(AI_CONFIG_FILE) as f:
            config = json.load(f)
            return {
                'api_url': config.get('apiUrl', '') or config.get('api_url', ''),
                'api_token': config.get('apiToken', '') or config.get('api_token', ''),
                'model_name': config.get('modelName', '') or config.get('model_name', ''),
            }
    return {
        'api_url': os.environ.get('AI_API_URL', ''),
        'api_token': os.environ.get('AI_API_TOKEN', ''),
        'model_name': os.environ.get('AI_MODEL_NAME', ''),
    }


def build_first_prompt(question: dict[str, Any]) -> str:
    """复刻 techInterviewAnswerGenerationService.ts 的 buildFirstPrompt。"""
    meta: list[str] = []
    if question.get('company'):
        meta.append(f"公司：{question['company']}")
    if question.get('position'):
        meta.append(f"岗位：{question['position']}")
    if question.get('round'):
        meta.append(f"轮次：{question['round']}")
    if question.get('techField'):
        meta.append(f"技术领域：{question['techField']}")

    lines = [
        '你是一名资深的技术面试官。',
        '请为以下大厂面经题目生成一份详细、结构化、适合面试口头回答的参考答案。',
        '',
        '要求：',
        '1. 按照面试表达习惯组织答案，条理清晰，分点明确。',
        '2. 每个要点需包含"为什么"和"怎么做"，让面试官感受到你的深度理解。',
        '3. 结合具体的代码示例或实际场景会让你的回答更有说服力。',
        '4. 涵盖题目涉及的所有核心知识点。',
        '5. 回答长度适中，既完整又精炼，控制在 400-600 字。',
        '6. 必要的时候（如讲解架构、组件关系、流程、模块划分时），用 ASCII 线框图辅助说明，例如：',
        '   Client -> API Gateway -> Auth Service -> Order Service -> MySQL',
        '   线框图使用 -> 表达调用方向、用 |-> 表示包含或归属，文字尽量贴近代码风格。',
        '',
        f"题目：{question['q']}",
    ]
    if meta:
        lines.append(f"背景：{' | '.join(meta)}")
    if question.get('noteTitle'):
        lines.append(f"来源：{question['noteTitle']}")
    return '\n'.join(lines)


def normalize_url(url: str) -> str:
    """复刻 aiClient.ts 的 normalizeChatCompletionsUrl。"""
    base = url.strip().rstrip('/')
    if '/v1/chat/completions' not in base:
        if not base.endswith('/v1'):
            base += '/v1'
        base += '/chat/completions'
    return base


def stream_generate(api_url: str, api_token: str, model_name: str, prompt: str) -> str:
    """调用流式 API，返回完整文本。"""
    parsed = urllib.parse.urlparse(api_url)
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_token}',
    }
    payload = {
        'model': model_name,
        'messages': [
            {
                'role': 'system',
                'content': '你是一个专业的技术面试教练，擅长生成详细、结构化的大厂面经参考答案。',
            },
            {'role': 'user', 'content': prompt},
        ],
        'stream': True,
    }
    body = json.dumps(payload).encode('utf-8')

    conn = http.client.HTTPSConnection(parsed.netloc, timeout=120)
    try:
        conn.request('POST', parsed.path or '/v1/chat/completions', body=body, headers=headers)
        response = conn.getresponse()
    except http.client.HTTPException as e:
        raise RuntimeError(f"连接失败: {e}")

    if not response.status == 200:
        text = response.read().decode('utf-8', errors='replace')
        try:
            err = json.loads(text)
            msg = err.get('error', {}).get('message') or err.get('message', '') or text
        except Exception:
            msg = text
        raise RuntimeError(f"API 请求失败 ({response.status}): {msg}")

    full_text = ''
    for line in response:
        if not line:
            continue
        decoded = line.decode('utf-8').strip()
        if not decoded.startswith('data:'):
            continue
        data = decoded[5:].strip()
        if data == '[DONE]':
            break
        try:
            parsed_line = json.loads(data)
        except json.JSONDecodeError:
            continue
        choices = parsed_line.get('choices', [])
        if not choices:
            continue
        delta = choices[0].get('delta', {})
        content = delta.get('content', '')
        if content:
            full_text += content

    return full_text


def make_question_id(question: dict[str, Any]) -> str:
    """使用题目稳定 id 作为 key（与 src/data/tech-interview-questions.json 中的 q.id 一致）。

    题库中每道题已分配形如 'my-ql-001'、'java-001' 的稳定 id，
    用它做 key 才能让前端 store.getAiAnswerData(qid) 正确命中。
    历史脏数据（题文前 40 字做 key）会留在 ai-answers.json 中，可后续 migrate_ai_answers_keys.py 清理。
    """
    qid = question.get('id')
    if not qid:
        raise ValueError(f"题目缺少 id 字段: {question.get('q', '')[:40]}")
    return qid


def thread_safe_print(msg: str):
    with print_lock:
        print(msg, flush=True)


def generate_single_answer(
    qid: str,
    question: dict[str, Any],
    config: dict[str, str],
) -> tuple[str, dict[str, Any] | None]:
    """为单道题生成答案，返回 (qid, result_dict)。失败返回 None。"""
    try:
        prompt = build_first_prompt(question)
        answer = stream_generate(
            config['api_url'],
            config['api_token'],
            config['model_name'],
            prompt,
        )
        if not answer.strip():
            thread_safe_print(f"[{qid[:20]}...] 警告：返回答案为空")
            return qid, None

        return qid, {
            'answer': answer,
            'conversations': [],
            'updatedAt': int(time.time() * 1000),
            'question': question['q'],
            'category': question.get('techField', ''),
        }
    except Exception as e:
        thread_safe_print(f"[{qid[:20]}...] 错误: {e}")
        return qid, None


def main():
    parser = argparse.ArgumentParser(description='大厂面经 AI 答案批量生成')
    parser.add_argument('--workers', type=int, default=3, help='并发线程数 (默认3)')
    parser.add_argument('--categories', nargs='+', default=None, help='指定分类，不指定则全部')
    parser.add_argument('--limit', type=int, default=99999, help='每分类限制数量')
    parser.add_argument('--resume', action='store_true', default=True, help='从已有进度继续（跳过已生成的，默认开启）')
    parser.add_argument('--no-resume', dest='resume', action='store_false', help='强制重跑，不跳过已有')
    args = parser.parse_args()

    print("=" * 60)
    print("大厂面经 AI 答案批量生成脚本 (并发版)")
    print("=" * 60)

    # 加载配置
    config = load_ai_config()
    if not all([config['api_url'], config['api_token'], config['model_name']]):
        print("错误：请在 ai-config.json 或环境变量中配置 AI_API_URL、AI_API_TOKEN、AI_MODEL_NAME")
        sys.exit(1)

    print(f"API: {config['api_url']}")
    print(f"Model: {config['model_name']}")
    print(f"并发: {args.workers} 线程")
    print()

    # 加载题目
    if not os.path.exists(INPUT_FILE):
        print(f"错误：找不到 {INPUT_FILE}")
        sys.exit(1)

    with open(INPUT_FILE, encoding='utf-8') as f:
        data = json.load(f)

    # 选择分类
    categories = args.categories if args.categories else list(data.get('questions', {}).keys())
    all_questions: list[tuple[str, dict[str, Any]]] = []
    for cat in categories:
        qs = data.get('questions', {}).get(cat, [])
        for q in qs:
            qid = make_question_id(q)
            all_questions.append((qid, q))
            if len(all_questions) >= args.limit:
                break
        if len(all_questions) >= args.limit:
            break

    if not all_questions:
        print("错误：未找到任何题目")
        sys.exit(1)

    print(f"待处理题目：{len(all_questions)} 道")
    for cat in categories:
        cnt = len(data.get('questions', {}).get(cat, []))
        print(f"  {cat}: {cnt} 题")
    print()

    # 加载已有答案
    results: dict[str, Any] = {}
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, encoding='utf-8') as f:
            results = json.load(f)
        print(f"已有答案：{len(results)} 条")

    skipped = 0
    to_process: list[tuple[str, dict[str, Any]]] = []
    for qid, q in all_questions:
        if args.resume and qid in results:
            skipped += 1
            continue
        to_process.append((qid, q))

    print(f"本次将生成：{len(to_process)} 道 ({skipped} 道已存在将跳过)")
    print()

    if not to_process:
        print("没有需要处理的题目")
        sys.exit(0)

    # 并发生成
    completed = 0
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(generate_single_answer, qid, q, config): (qid, q)
            for qid, q in to_process
        }

        for future in as_completed(futures):
            qid, q = futures[future]
            completed += 1

            try:
                result_qid, result_data = future.result()
                if result_data:
                    with results_lock:
                        results[result_qid] = result_data
                        # 每完成一个就保存
                        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                            json.dump(results, f, ensure_ascii=False, indent=2)
                    thread_safe_print(
                        f"[{completed}/{len(to_process)}] ✅ {result_qid[:30]}... "
                        f"({len(result_data['answer'])} 字)"
                    )
            except Exception as e:
                thread_safe_print(f"[{completed}/{len(to_process)}] ❌ {qid[:30]}... {e}")

    print()
    print("=" * 60)
    print(f"完成！共 {len(results)} 条答案")
    print(f"输出文件：{OUTPUT_FILE}")


if __name__ == '__main__':
    main()
