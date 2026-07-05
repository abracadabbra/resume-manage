#!/usr/bin/env python3
"""
小红书面试题爬虫 (v3 - xhshow 签名版)
使用 xhshow 生成 x-s 签名，直接调用 API，无需浏览器

使用:
    1. pip install xhshow requests
    2. python scrape_xhs_api.py --cookie "你的cookie字符串"
    3. python scrape_xhs_api.py --keyword "滴滴后端面经"
"""

import argparse
import json
import time
from pathlib import Path

import requests
from xhshow import Xhshow

OUTPUT_DIR = Path(__file__).parent / "output"
COOKIES_FILE = Path(__file__).parent / "xhs_cookies.json"

BASE_URL = "https://edith.xiaohongshu.com"
SEARCH_URI = "/api/sns/web/v1/search/notes"

HEADERS_BASE = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Origin": "https://www.xiaohongshu.com",
    "Referer": "https://www.xiaohongshu.com/",
    "Content-Type": "application/json;charset=UTF-8",
}


def setup_dirs():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def load_cookies() -> dict:
    """加载 Cookie"""
    if not COOKIES_FILE.exists():
        print("[!] 未找到 Cookie 文件")
        print("    请先运行: python scrape_xhs.py --login")
        return {}

    with open(COOKIES_FILE, "r", encoding="utf-8") as f:
        cookie_list = json.load(f)

    # 转换为 dict 格式
    cookies = {}
    if isinstance(cookie_list, list):
        for c in cookie_list:
            cookies[c["name"]] = c["value"]
    elif isinstance(cookie_list, dict):
        cookies = cookie_list

    print(f"[✓] 加载了 {len(cookies)} 个 Cookie")
    return cookies


def search_notes(keyword: str, cookies: dict, page: int = 1, page_size: int = 20) -> dict:
    """
    调用小红书搜索 API
    """
    client = Xhshow()

    # 使用 xhshow 的 SessionManager
    a1 = cookies.get("a1", client.generate_a1())
    session = client.sign_headers_post.__self__  # 获取 client 实例
    
    # 构建 payload
    payload = {
        "keyword": keyword,
        "page": page,
        "page_size": page_size,
        "search_id": client.get_search_id(),
        "sort": "general",
        "note_type": 0,
    }

    url = f"{BASE_URL}{SEARCH_URI}"
    body = client.build_json_body(payload)

    # 生成签名 - 使用 xys 格式
    cookie_str = "; ".join([f"{k}={v}" for k, v in cookies.items()])
    sign_headers = client.sign_headers_post(
        uri=SEARCH_URI,
        cookies=cookie_str,
        payload=payload,
    )

    # 完整 headers
    headers = {
        **HEADERS_BASE,
        **sign_headers,
        "Cookie": cookie_str,
        "x-b3-traceid": client.get_b3_trace_id(),
        "x-xray-traceid": client.get_xray_trace_id(),
    }

    print(f"  发送搜索请求: keyword={keyword}, page={page}")
    print(f"  a1: {a1[:20]}...")

    # 尝试 POST
    resp = requests.post(url, headers=headers, data=body, timeout=30)
    print(f"  POST 状态码: {resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        if data.get("code") == 0 or data.get("success"):
            return data

    # POST 失败，尝试 GET
    print("  POST 失败，尝试 GET 方式...")
    get_url = client.build_url(url, {
        "keyword": keyword,
        "page": page,
        "page_size": page_size,
        "search_id": payload["search_id"],
        "sort": "general",
        "note_type": 0,
    })
    get_headers = {
        **HEADERS_BASE,
        "Cookie": cookie_str,
        "x-b3-traceid": client.get_b3_trace_id(),
    }
    # GET 签名
    get_sign = client.sign_headers_get(
        uri=SEARCH_URI,
        cookies=cookie_str,
        params={
            "keyword": keyword,
            "page": page,
            "page_size": page_size,
            "search_id": payload["search_id"],
            "sort": "general",
            "note_type": 0,
        },
    )
    get_headers.update(get_sign)
    resp2 = requests.get(get_url, headers=get_headers, timeout=30)
    print(f"  GET 状态码: {resp2.status_code}")

    if resp2.status_code == 200:
        return resp2.json()

    # 返回 POST 的结果
    return resp.json() if resp.status_code == 200 else {}


def extract_notes(api_data: dict) -> list[dict]:
    """从 API 响应提取笔记数据"""
    notes = []

    data = api_data.get("data", {})
    items = data.get("items", [])
    has_more = data.get("has_more", False)

    for item in items:
        note_card = item.get("note_card", {})
        note_id = item.get("id", "")

        # 基本信息
        title = note_card.get("display_title", "")
        desc = note_card.get("desc", "")
        note_type = note_card.get("type", "")

        # 图片
        images = []
        for img in note_card.get("image_list", []):
            url = img.get("url_default", "") or img.get("url", "")
            if url:
                if url.startswith("//"):
                    url = "https:" + url
                images.append(url)

        # 封面
        cover = note_card.get("cover", {})
        cover_url = ""
        if isinstance(cover, dict):
            cover_url = cover.get("url_default", "") or cover.get("url", "")
            if cover_url and cover_url.startswith("//"):
                cover_url = "https:" + cover_url

        # 用户
        user = note_card.get("user", {})
        author = user.get("nickname", "")
        user_id = user.get("user_id", "")

        # 互动数据
        interact = note_card.get("interact_info", {})
        likes = interact.get("liked_count", "0")

        # 标签
        tags = [t.get("name", "") for t in note_card.get("tag_list", [])]

        notes.append({
            "note_id": note_id,
            "title": title,
            "desc": desc,
            "type": note_type,
            "author": author,
            "user_id": user_id,
            "likes": likes,
            "tags": tags,
            "cover_url": cover_url,
            "images": images,
            "url": f"https://www.xiaohongshu.com/explore/{note_id}",
        })

    return notes


def download_image(url: str, filepath: Path) -> bool:
    """下载图片"""
    try:
        headers = {
            "User-Agent": HEADERS_BASE["User-Agent"],
            "Referer": "https://www.xiaohongshu.com/",
        }
        resp = requests.get(url, headers=headers, timeout=30)
        if resp.status_code == 200:
            with open(filepath, "wb") as f:
                f.write(resp.content)
            return True
    except Exception as e:
        print(f"    [!] 下载失败: {e}")
    return False


def main():
    parser = argparse.ArgumentParser(description="小红书面试题爬虫 (xhshow签名版)")
    parser.add_argument("--keyword", "-k", type=str, default="滴滴后端面经",
                        help="搜索关键词 (默认: 滴滴后端面经)")
    parser.add_argument("--pages", "-p", type=int, default=3, help="采集页数 (默认 3)")
    parser.add_argument("--no-images", action="store_true", help="不下载图片")
    parser.add_argument("--keywords", type=str, nargs="*",
                        help="多个关键词，如: --keywords '滴滴面经' '美团面经'")

    args = parser.parse_args()
    setup_dirs()

    # 加载 Cookie
    cookies = load_cookies()
    if not cookies:
        return

    # 关键词列表
    keywords = [args.keyword]
    if args.keywords:
        keywords.extend(args.keywords)

    all_notes = []
    seen_ids = set()

    for keyword in keywords:
        print(f"\n{'=' * 50}")
        print(f"  搜索关键词: {keyword}")
        print(f"{'=' * 50}")

        for page in range(1, args.pages + 1):
            print(f"\n--- 第 {page}/{args.pages} 页 ---")

            api_data = search_notes(keyword, cookies, page)

            if not api_data:
                print("  [!] API 返回空，停止采集")
                break

            # 检查是否有错误
            if api_data.get("code") != 0 and api_data.get("success") is not True:
                err_msg = api_data.get("msg", api_data.get("message", "未知错误"))
                print(f"  [!] API 错误: {err_msg}")
                # 保存原始响应用于调试
                debug_file = OUTPUT_DIR / "api_error_debug.json"
                with open(debug_file, "w", encoding="utf-8") as f:
                    json.dump(api_data, f, ensure_ascii=False, indent=2)
                print(f"  原始响应已保存到: {debug_file}")
                break

            notes = extract_notes(api_data)
            print(f"  提取到 {len(notes)} 条笔记")

            has_more = api_data.get("data", {}).get("has_more", False)

            for note in notes:
                if note["note_id"] in seen_ids:
                    continue
                seen_ids.add(note["note_id"])

                print(f"\n  [{len(all_notes) + 1}] {note['title']}")
                print(f"      作者: {note['author']} | 点赞: {note['likes']} | 图片: {len(note['images'])}张")
                print(f"      {note['url']}")

                # 下载图片
                if not args.no_images and note["images"]:
                    images_dir = OUTPUT_DIR / "images"
                    images_dir.mkdir(exist_ok=True)
                    local_imgs = []
                    for idx, img_url in enumerate(note["images"][:5]):
                        filename = f"{note['note_id']}_{idx + 1}.jpg"
                        filepath = images_dir / filename
                        if download_image(img_url, filepath):
                            local_imgs.append(str(filepath))
                            print(f"      [✓] 下载: {filename}")
                        time.sleep(0.3)
                    note["local_images"] = local_imgs

                note["search_keyword"] = keyword
                note["scraped_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
                all_notes.append(note)

            if not has_more:
                print("  没有更多数据了")
                break

            time.sleep(2)  # 翻页间隔

    # 保存结果
    output_file = OUTPUT_DIR / "interview_questions.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_notes, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 50}")
    print(f"  采集完成！共 {len(all_notes)} 篇笔记")
    print(f"  结果保存: {output_file}")
    if not args.no_images:
        print(f"  图片目录: {OUTPUT_DIR / 'images'}")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
