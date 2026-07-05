#!/usr/bin/env python3
"""
小红书面试题爬虫 (v4 - 浏览器内拦截版)
利用 Playwright 浏览器登录后的状态，拦截页面发出的搜索 API 请求

使用:
    python scrape_xhs_final.py --login   # 首次登录 + 自动采集
    python scrape_xhs_final.py            # 复用 Cookie 采集
"""

import argparse
import json
import time
from pathlib import Path
from urllib.parse import quote

from playwright.sync_api import sync_playwright, Page, BrowserContext, Response

OUTPUT_DIR = Path(__file__).parent / "output"
IMAGES_DIR = OUTPUT_DIR / "images"
COOKIES_FILE = Path(__file__).parent / "xhs_cookies.json"
RESULTS_FILE = OUTPUT_DIR / "interview_questions.json"

XHS_BASE = "https://www.xiaohongshu.com"


def setup_dirs():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def save_cookies(context: BrowserContext):
    cookies = context.cookies()
    with open(COOKIES_FILE, "w", encoding="utf-8") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=2)
    print(f"[✓] Cookie 已保存 ({len(cookies)} 条)")


def load_cookies(context: BrowserContext) -> bool:
    if not COOKIES_FILE.exists():
        return False
    with open(COOKIES_FILE, "r", encoding="utf-8") as f:
        cookies = json.load(f)
    context.add_cookies(cookies)
    print(f"[✓] 已加载 Cookie ({len(cookies)} 条)")
    names = [c["name"] for c in cookies]
    if "web_session" not in names:
        print("[!] 警告: Cookie 中没有 web_session")
    return True


def login_flow(page: Page, context: BrowserContext):
    print("\n" + "=" * 50)
    print("  小红书登录")
    print("=" * 50)
    print("\n请在浏览器中扫码登录，脚本自动检测...\n")

    page.goto(XHS_BASE, wait_until="domcontentloaded", timeout=60000)
    time.sleep(3)

    for i in range(150):
        time.sleep(2)
        if i > 0 and i % 15 == 0:
            print(f"  等待中... ({i * 2}秒)")
        try:
            cookies = context.cookies()
            if any(c["name"] == "web_session" for c in cookies):
                time.sleep(3)
                save_cookies(context)
                print("[✓] 登录成功！")
                return True
        except Exception:
            pass

    print("[✗] 超时")
    return False


def extract_notes_from_api_response(data: dict) -> list[dict]:
    """从搜索 API 响应提取笔记"""
    notes = []
    items = data.get("data", {}).get("items", [])

    for item in items:
        nc = item.get("note_card", item)
        note_id = item.get("id", "")

        title = nc.get("display_title", "")
        desc = nc.get("desc", "")
        note_type = nc.get("type", "")

        images = []
        for img in nc.get("image_list", []):
            url = img.get("url_default", "") or img.get("url", "")
            if url:
                if url.startswith("//"):
                    url = "https:" + url
                images.append(url)

        cover = nc.get("cover", {})
        cover_url = ""
        if isinstance(cover, dict):
            cover_url = cover.get("url_default", "") or cover.get("url", "")
            if cover_url and cover_url.startswith("//"):
                cover_url = "https:" + cover_url

        user = nc.get("user", {})
        author = user.get("nickname", "") if isinstance(user, dict) else ""

        interact = nc.get("interact_info", {})
        likes = interact.get("liked_count", "0") if isinstance(interact, dict) else "0"

        tags = [t.get("name", "") for t in nc.get("tag_list", [])]

        notes.append({
            "note_id": note_id,
            "title": title,
            "desc": desc,
            "type": note_type,
            "author": author,
            "likes": likes,
            "tags": tags,
            "cover_url": cover_url,
            "images": images,
            "url": f"https://www.xiaohongshu.com/explore/{note_id}",
        })

    return notes


def download_image(page: Page, url: str, filepath: Path) -> bool:
    try:
        resp = page.request.get(url)
        if resp.ok:
            with open(filepath, "wb") as f:
                f.write(resp.body())
            return True
    except Exception:
        pass
    return False


def do_scrape(keyword: str, max_pages: int, scroll_times: int, download_imgs: bool,
              page: Page, context: BrowserContext):
    """核心采集逻辑"""
    setup_dirs()

    # 拦截 API 响应
    captured_notes = []
    api_calls = []  # 记录所有 API 调用

    def on_response(response: Response):
        url = response.url
        # 记录所有 API 调用
        if "api" in url and "collect" not in url and "apm" not in url:
            api_calls.append(url)
            print(f"  [API] {url[:100]}")

        # 拦截搜索相关 API - 包括 search/notes 和 homefeed
        if ("search/notes" in url or "homefeed" in url or "so.xiaohongshu" in url) and response.status == 200:
            try:
                data = response.json()
                if data.get("success") or data.get("code") == 0:
                    notes = extract_notes_from_api_response(data)
                    if notes:
                        captured_notes.extend(notes)
                        print(f"  [拦截] {url[:60]}... 获取到 {len(notes)} 条笔记")
                    else:
                        # 调试：查看数据结构
                        items = data.get("data", {}).get("items", [])
                        print(f"  [调试] {url[:60]} items={len(items)}, keys={list(data.keys())}")
                        if items:
                            print(f"  [调试] 第一条 keys: {list(items[0].keys())[:10]}")
                            nc = items[0].get("note_card", {})
                            print(f"  [调试] note_card keys: {list(nc.keys())[:10]}")
                else:
                    print(f"  [拦截] {url[:60]} 错误: {data.get('msg', '?')}")
            except Exception as e:
                pass

    page.on("response", on_response)

    # 访问首页
    print("[...] 加载首页...")
    page.goto(XHS_BASE, wait_until="domcontentloaded", timeout=60000)
    time.sleep(5)

    # 关闭弹窗
    try:
        page.keyboard.press("Escape")
        time.sleep(1)
    except Exception:
        pass

    # 搜索 - 通过页面内输入触发
    print(f"[...] 搜索: {keyword}")

    # 先尝试直接访问搜索 URL
    encoded_kw = quote(keyword)
    search_url = (f"{XHS_BASE}/search_result/"
                  f"?keyword={encoded_kw}&source=web_search_result_notes&type=51")

    try:
        page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
    except Exception:
        page.goto(search_url, timeout=60000)

    time.sleep(5)

    # 检查是否加载了搜索结果
    current_url = page.url
    page_title = page.title()
    print(f"[i] URL: {current_url}")
    print(f"[i] 标题: {page_title}")

    # 如果 URL 不对或者没拦截到搜索 API，用页面内搜索
    if "search_result" not in current_url:
        print("[!] 搜索页加载失败，尝试页面内搜索...")
        try:
            # 回到首页
            page.goto(XHS_BASE, wait_until="domcontentloaded", timeout=60000)
            time.sleep(3)

            # 点击搜索框
            search_input = page.locator('textarea[name="aiSearchTextarea"]').first
            search_input.click()
            time.sleep(1)

            # 输入关键词
            search_input.fill(keyword)
            time.sleep(1)

            # 按回车
            search_input.press("Enter")
            time.sleep(5)

            current_url = page.url
            print(f"[i] 搜索后 URL: {current_url}")
        except Exception as e:
            print(f"[!] 页面内搜索失败: {e}")
            # 最后尝试手动构建请求
            page.evaluate(f'''() => {{
                window.location.href = "{search_url}";
            }}''')
            time.sleep(5)
            current_url = page.url
            print(f"[i] JS跳转后 URL: {current_url}")

    # 关闭弹窗
    try:
        page.keyboard.press("Escape")
        time.sleep(1)
    except Exception:
        pass

    print("[✓] 搜索页加载成功！\n")

    # 等待搜索 API 响应回来
    print("[...] 等待搜索结果加载...")
    for wait in range(15):
        time.sleep(1)
        if captured_notes:
            print(f"[✓] 已加载 {len(captured_notes)} 条搜索结果")
            break
        # 尝试从 DOM 提取
        if wait == 5:
            try:
                # 调试：查看页面 DOM 结构
                dom_info = page.evaluate("""() => {
                    const info = {};
                    // 搜索页可能的容器
                    const selectors = [
                        'section.note-item',
                        '.feeds-container',
                        '[class*="search"]',
                        '[class*="note-item"]',
                        '.note-item',
                        '.feeds-page',
                        '.search-result',
                        'main',
                    ];
                    for (const sel of selectors) {
                        const els = document.querySelectorAll(sel);
                        if (els.length > 0) {
                            info[sel] = {
                                count: els.length,
                                firstText: els[0].textContent.substring(0, 100),
                                firstClass: els[0].className,
                            };
                        }
                    }
                    // 查看链接
                    const links = document.querySelectorAll('a[href*="/explore/"], a[href*="/discovery/item/"]');
                    info['search_links'] = {
                        count: links.length,
                        first: links.length > 0 ? links[0].href : '',
                        firstText: links.length > 0 ? links[0].textContent.substring(0, 100) : '',
                    };
                    return info;
                }""")
                print(f"  [DOM调试] {json.dumps(dom_info, ensure_ascii=False, indent=2)[:500]}")

                dom_notes = page.evaluate("""() => {
                    const cards = document.querySelectorAll('section.note-item, .feeds-container .note-item, [class*="note-item"]');
                    return cards.length;
                }""")
                if dom_notes > 0:
                    print(f"[✓] DOM 中找到 {dom_notes} 个卡片元素")
                    # 从 DOM 提取数据
                    dom_data = page.evaluate("""() => {
                        const cards = document.querySelectorAll('section.note-item, .feeds-container .note-item, [class*="note-item"]');
                        return Array.from(cards).map(card => {
                            const titleEl = card.querySelector('.title, .note-title, [class*="title"]');
                            const authorEl = card.querySelector('.author, .name, [class*="author"], [class*="name"]');
                            const linkEl = card.querySelector('a');
                            return {
                                title: titleEl ? titleEl.textContent.trim() : '',
                                author: authorEl ? authorEl.textContent.trim() : '',
                                url: linkEl ? linkEl.href : '',
                            };
                        }).filter(n => n.title || n.url);
                    }""")
                    if dom_data:
                        print(f"[✓] 从 DOM 提取到 {len(dom_data)} 条笔记")
                        for d in dom_data:
                            captured_notes.append({
                                "note_id": d.get("url", "").split("/")[-1] if d.get("url") else "",
                                "title": d.get("title", ""),
                                "desc": "",
                                "type": "",
                                "author": d.get("author", ""),
                                "likes": "0",
                                "tags": [],
                                "cover_url": "",
                                "images": [],
                                "url": d.get("url", ""),
                            })
                        break
            except Exception as e:
                print(f"  DOM 提取失败: {e}")
        print(f"  等待中... {wait + 1}s")

    all_notes = list(captured_notes)  # 先把已有的结果保存
    captured_notes.clear()  # 然后清空，准备下一页

    for page_num in range(1, max_pages + 1):
        print(f"\n{'=' * 50}")
        print(f"  第 {page_num}/{max_pages} 页")
        print(f"{'=' * 50}")

        captured_notes.clear()

        # 滚动触发 API
        for s in range(scroll_times):
            try:
                page.evaluate("() => window.scrollBy(0, window.innerHeight)")
            except Exception:
                pass
            time.sleep(2)
            print(f"  滚动 {s + 1}/{scroll_times}")

        time.sleep(3)
        print(f"\n  本页拦截到 {len(captured_notes)} 条笔记")

        for i, note in enumerate(captured_notes):
            print(f"\n  [{len(all_notes) + 1}] {note['title']}")
            print(f"      作者: {note['author']} | 赞: {note['likes']} | 图: {len(note['images'])}")

            if download_imgs and note.get("images"):
                local_imgs = []
                for idx, img_url in enumerate(note["images"][:5]):
                    fn = f"{note['note_id']}_{idx + 1}.jpg"
                    fp = IMAGES_DIR / fn
                    if download_image(page, img_url, fp):
                        local_imgs.append(str(fp))
                        print(f"      [✓] {fn}")
                    time.sleep(0.3)
                note["local_images"] = local_imgs

            note["search_keyword"] = keyword
            note["scraped_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
            all_notes.append(note)

        if page_num < max_pages:
            time.sleep(3)

    # 保存
    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump(all_notes, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 50}")
    print(f"  采集完成！共 {len(all_notes)} 篇笔记")
    print(f"  结果: {RESULTS_FILE}")
    print(f"  图片: {IMAGES_DIR}")
    if api_calls:
        print(f"\n  [调试] 拦截到的 API 调用 ({len(api_calls)} 个):")
        for url in api_calls[:20]:
            print(f"    - {url[:120]}")
    print(f"{'=' * 50}")

    return all_notes


def main():
    parser = argparse.ArgumentParser(description="小红书面试题爬虫 (浏览器拦截版)")
    parser.add_argument("--login", action="store_true", help="登录并采集")
    parser.add_argument("--keyword", "-k", default="滴滴后端面经")
    parser.add_argument("--pages", "-p", type=int, default=3)
    parser.add_argument("--scroll", "-s", type=int, default=5)
    parser.add_argument("--no-images", action="store_true")

    args = parser.parse_args()

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()

        if args.login:
            # 登录模式
            if not login_flow(page, context):
                browser.close()
                return
            print("\n[✓] 登录完成，开始采集...\n")

        else:
            # 复用 Cookie 模式
            if not load_cookies(context):
                print("[!] 没有找到 Cookie，请先运行 --login")
                browser.close()
                return

        # 开始采集
        do_scrape(args.keyword, args.pages, args.scroll, not args.no_images, page, context)

        browser.close()


if __name__ == "__main__":
    main()
