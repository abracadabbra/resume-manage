#!/usr/bin/env python3
"""
牛客网面经爬虫
采集滴滴/大厂后端面经

使用: python scrape_nowcoder.py --company "滴滴" --pages 3
"""

import argparse
import json
import re
import time
from pathlib import Path

import urllib.request
import urllib.parse

OUTPUT_DIR = Path(__file__).parent / "output"
NOWCODER_API = "https://www.nowcoder.com/nccommon/search"
NOWCODER_DETAIL = "https://www.nowcoder.com/discuss"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nowcoder.com/",
}


def setup_dirs():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def fetch_url(url: str) -> str:
    """简单 HTTP GET"""
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def search_nowcoder(keyword: str, page: int = 1) -> list[dict]:
    """
    搜索牛客网讨论帖
    牛客网搜索 API: https://www.nowcoder.com/nccommon/search?q=xxx&type=post&page=x
    """
    encoded_kw = urllib.parse.quote(keyword)
    url = f"{NOWCODER_API}?q={encoded_kw}&type=post&page={page}&pageSize=20"

    try:
        html = fetch_url(url)
        # 牛客网搜索返回 HTML，需要解析
        results = []

        # 提取帖子链接和标题
        # 格式: <a href="/discuss/123456">标题</a>
        pattern = r'href="(/discuss/\d+)"[^>]*>([^<]+)</a>'
        matches = re.findall(pattern, html)

        seen_ids = set()
        for path, title in matches:
            post_id = path.split("/")[-1]
            if post_id not in seen_ids:
                seen_ids.add(post_id)
                # 清理 HTML 标签
                clean_title = re.sub(r'<[^>]+>', '', title).strip()
                results.append({
                    "id": post_id,
                    "title": clean_title,
                    "url": f"https://www.nowcoder.com{path}",
                })

        return results
    except Exception as e:
        print(f"  [!] 搜索失败: {e}")
        return []


def fetch_post_detail(url: str) -> dict:
    """获取帖子详情"""
    detail = {"content": "", "tags": [], "author": "", "date": ""}

    try:
        html = fetch_url(url)

        # 提取正文内容
        # 牛客网帖子正文在 nc-post-content 或 post-topic 中
        content_patterns = [
            r'class="nc-post-content"[^>]*>(.*?)</div>',
            r'class="post-topic"[^>]*>(.*?)</div>',
            r'class="article-content"[^>]*>(.*?)</div>',
            r'<article[^>]*>(.*?)</article>',
        ]

        for pattern in content_patterns:
            match = re.search(pattern, html, re.DOTALL)
            if match:
                raw = match.group(1)
                # 清理 HTML 标签
                clean = re.sub(r'<[^>]+>', '\n', raw)
                clean = re.sub(r'\n{3,}', '\n\n', clean)
                clean = re.sub(r'&nbsp;', ' ', clean)
                clean = re.sub(r'&lt;', '<', clean)
                clean = re.sub(r'&gt;', '>', clean)
                clean = re.sub(r'&amp;', '&', clean)
                detail["content"] = clean.strip()
                break

        # 提取作者
        author_match = re.search(r'class="name"[^>]*>([^<]+)</', html)
        if author_match:
            detail["author"] = author_match.group(1).strip()

        # 提取日期
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', html)
        if date_match:
            detail["date"] = date_match.group(1)

    except Exception as e:
        print(f"    [!] 获取详情失败: {e}")

    return detail


def scrape_nowcoder(company: str, extra_keywords: list[str] = None, max_pages: int = 3):
    """主采集流程"""
    setup_dirs()

    keywords = [f"{company}后端面经", f"{company} Java面经", f"{company} 后端"]
    if extra_keywords:
        keywords.extend(extra_keywords)

    all_posts = []
    seen_ids = set()

    for keyword in keywords:
        print(f"\n{'=' * 50}")
        print(f"  搜索: {keyword}")
        print(f"{'=' * 50}")

        for page in range(1, max_pages + 1):
            print(f"\n  第 {page}/{max_pages} 页...")
            results = search_nowcoder(keyword, page)
            print(f"  找到 {len(results)} 条结果")

            for post in results:
                if post["id"] in seen_ids:
                    continue
                seen_ids.add(post["id"])

                print(f"\n  [{len(all_posts) + 1}] {post['title']}")
                print(f"      {post['url']}")

                # 获取详情
                detail = fetch_post_detail(post["url"])
                post.update(detail)
                post["search_keyword"] = keyword
                post["scraped_at"] = time.strftime("%Y-%m-%d %H:%M:%S")

                if detail["content"]:
                    preview = detail["content"][:100].replace("\n", " ")
                    print(f"      内容预览: {preview}...")
                else:
                    print(f"      [!] 未提取到正文内容")

                all_posts.append(post)
                time.sleep(1)  # 避免频率限制

            if not results:
                break

            time.sleep(2)

    # 保存结果
    output_file = OUTPUT_DIR / f"{company}_interview.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_posts, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 50}")
    print(f"  采集完成！共 {len(all_posts)} 篇面经")
    print(f"  结果: {output_file}")
    print(f"{'=' * 50}")


def main():
    parser = argparse.ArgumentParser(description="牛客网面经爬虫")
    parser.add_argument("--company", "-c", type=str, default="滴滴", help="公司名 (默认: 滴滴)")
    parser.add_argument("--pages", "-p", type=int, default=3, help="每个关键词采集页数")
    parser.add_argument("--keywords", "-k", type=str, nargs="*", help="额外搜索关键词")

    args = parser.parse_args()
    scrape_nowcoder(args.company, args.keywords, args.pages)


if __name__ == "__main__":
    main()
