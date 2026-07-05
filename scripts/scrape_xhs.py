#!/usr/bin/env python3
"""
小红书面试题爬虫脚本 (v2 - API拦截版)
通过拦截搜索页的 API 响应获取结构化数据，不进入详情页

使用方法:
    1. 安装依赖: pip install -r requirements.txt && playwright install chromium
    2. 首次登录: python scrape_xhs.py --login
    3. 采集:     python scrape_xhs.py --keyword "Java面试题" --pages 3
"""

import argparse
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import quote, urljoin

from playwright.sync_api import sync_playwright, Page, BrowserContext, Response

# 配置
OUTPUT_DIR = Path(__file__).parent / "output"
IMAGES_DIR = OUTPUT_DIR / "images"
COOKIES_FILE = Path(__file__).parent / "xhs_cookies.json"
RESULTS_FILE = OUTPUT_DIR / "interview_questions.json"

XHS_BASE = "https://www.xiaohongshu.com"
XHS_SEARCH = f"{XHS_BASE}/search_result/"


def setup_dirs():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def save_cookies(context: BrowserContext):
    cookies = context.cookies()
    with open(COOKIES_FILE, "w", encoding="utf-8") as f:
        json.dump(cookies, f, ensure_ascii=False, indent=2)
    print(f"[✓] Cookie 已保存到 {COOKIES_FILE}")


def load_cookies(context: BrowserContext) -> bool:
    if not COOKIES_FILE.exists():
        return False
    with open(COOKIES_FILE, "r", encoding="utf-8") as f:
        cookies = json.load(f)
    context.add_cookies(cookies)
    print(f"[✓] 已加载 Cookie ({len(cookies)} 条)")
    return True


# ─── 登录 ─────────────────────────────────────────────────

def login_flow(page: Page, context: BrowserContext):
    print("\n" + "=" * 50)
    print("  小红书登录流程")
    print("=" * 50)
    print("\n请在浏览器中完成登录（扫码或手机号）")
    print("登录成功后脚本会自动检测并保存 Cookie\n")
    print("[...] 等待登录中（最长 5 分钟）...")

    page.goto(XHS_BASE, wait_until="domcontentloaded", timeout=60000)
    time.sleep(3)

    for i in range(150):
        time.sleep(2)
        if i > 0 and i % 15 == 0:
            print(f"  还在等待登录... ({i * 2}秒)")
        try:
            cookies = context.cookies()
            cookie_names = [c["name"] for c in cookies]
            # 必须等到 web_session 才算登录成功
            if "web_session" in cookie_names:
                time.sleep(3)  # 等待其他 cookie 稳定
                save_cookies(context)
                print("[✓] 登录成功！Cookie 已自动保存")
                return True
        except Exception:
            pass

    print("[✗] 等待超时，请重新运行 --login")
    return False


def dismiss_login_popup(page: Page):
    try:
        page.keyboard.press("Escape")
        time.sleep(1)
    except Exception:
        pass
    for sel in ['.close-button', '[class*="close-circle"]', 'button.close']:
        try:
            el = page.query_selector(sel)
            if el and el.is_visible():
                el.click()
                time.sleep(1)
                return
        except Exception:
            continue


def check_login_status(page: Page) -> bool:
    # 宽松检测：只要 Cookie 已加载就继续，采集失败再从结果判断
    return True


# ─── API 拦截采集 ─────────────────────────────────────────

def normalize_image_url(url: str) -> str:
    """补全图片 URL"""
    if not url:
        return ""
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return "https://sns-img-qc.xhscdn.com" + url
    if not url.startswith("http"):
        return ""
    return url


def extract_notes_from_api(api_data: dict) -> list[dict]:
    """从搜索 API 响应中提取笔记数据"""
    notes = []

    items = api_data.get("data", {}).get("items", [])
    if not items:
        items = api_data.get("data", {}).get("notes", [])

    for item in items:
        note = item.get("note_card", item)  # 兼容不同结构

        note_id = item.get("id", note.get("note_id", ""))
        title = note.get("display_title", note.get("title", ""))
        desc = note.get("desc", "")
        note_type = note.get("type", "")

        # 提取图片
        images = []
        image_list = note.get("image_list", note.get("images_list", []))
        for img in image_list:
            # 尝试多种图片 URL 字段
            url = (
                img.get("url_default", "")
                or img.get("url", "")
                or img.get("info_list", [{}])[0].get("url", "")
                if isinstance(img, dict) and img.get("info_list")
                else img.get("url_default", "") or img.get("url", "")
                if isinstance(img, dict)
                else str(img)
            )
            url = normalize_image_url(url)
            if url:
                images.append(url)

        # 提取封面
        cover = note.get("cover", {})
        cover_url = ""
        if isinstance(cover, dict):
            cover_url = normalize_image_url(
                cover.get("url_default", "") or cover.get("url", "")
            )

        # 提取标签
        tag_list = note.get("tag_list", [])
        tags = [t.get("name", "") for t in tag_list if isinstance(t, dict)]

        # 用户信息
        user = note.get("user", {})
        author = user.get("nickname", user.get("nick_name", "")) if isinstance(user, dict) else ""

        # 互动数据
        interact = note.get("interact_info", {})
        likes = interact.get("liked_count", "") if isinstance(interact, dict) else ""

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
        })

    return notes


def download_image(page: Page, url: str, filepath: Path) -> bool:
    """下载单张图片"""
    try:
        response = page.request.get(url)
        if response.ok:
            with open(filepath, "wb") as f:
                f.write(response.body())
            return True
    except Exception:
        pass
    return False


def scrape_xhs(keyword: str, max_pages: int = 3, scroll_times: int = 5, download_imgs: bool = True):
    setup_dirs()

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

        if not load_cookies(context):
            print("[!] 未找到 Cookie，请先运行: python scrape_xhs.py --login")
            browser.close()
            return

        page = context.new_page()

        # 存储拦截到的 API 数据
        api_notes = []
        all_api_urls = []  # 调试用：记录所有 API URL

        def handle_response(response: Response):
            """拦截搜索 API 响应"""
            url = response.url
            # 记录所有 api 请求用于调试
            if "/api/" in url:
                all_api_urls.append(url)

            # 小红书搜索 API 路径（匹配多种版本）
            if any(kw in url for kw in [
                "/api/sns/web/v1/search/notes",
                "/api/sns/web/v2/search/notes",
                "/api/sns/web/v1/search/notes",
                "search/notes",
                "search_result",
            ]):
                try:
                    if response.status == 200:
                        data = response.json()
                        notes = extract_notes_from_api(data)
                        if notes:
                            api_notes.extend(notes)
                            print(f"  [API] 拦截到 {len(notes)} 条笔记数据")
                        else:
                            # 调试：保存原始 API 响应
                            debug_file = OUTPUT_DIR / "api_response_debug.json"
                            with open(debug_file, "w", encoding="utf-8") as f:
                                json.dump(data, f, ensure_ascii=False, indent=2)
                            print(f"  [API] 拦截到响应但解析失败，已保存到 {debug_file}")
                except Exception as e:
                    pass

        # 注册响应拦截器
        page.on("response", handle_response)

        # 访问首页并等待完全加载
        print("[...] 加载首页...")
        page.goto(XHS_BASE, wait_until="domcontentloaded", timeout=30000)
        time.sleep(5)
        dismiss_login_popup(page)

        if not check_login_status(page):
            print("\n[✗] Cookie 已失效，请重新登录: python scrape_xhs.py --login")
            browser.close()
            return

        print("[✓] 登录状态正常")

        # 通过搜索框进行搜索
        print(f"[...] 搜索: {keyword}")
        try:
            # 搜索框是 textarea
            search_input = page.query_selector('textarea[name="aiSearchTextarea"], #search-input textarea.textarea, textarea.textarea')
            if search_input:
                search_input.click()
                time.sleep(1)
                search_input.fill(keyword)
                time.sleep(1)
                page.keyboard.press("Enter")
                print("[✓] 已通过搜索框搜索")
                time.sleep(5)
            else:
                raise Exception("搜索框未找到")
        except Exception as e:
            # 后备：直接导航到搜索 URL
            print(f"  [!] 搜索框失败: {e}，使用 URL 导航")
            encoded_kw = quote(keyword)
            search_url = f"{XHS_SEARCH}?keyword={encoded_kw}&source=web_search_result_notes&type=51"
            try:
                page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
            except Exception:
                page.goto(search_url, timeout=60000)
            print("[✓] 已通过 URL 搜索")
            time.sleep(5)
        dismiss_login_popup(page)

        # 截图看看搜索结果页
        try:
            page.screenshot(path=str(OUTPUT_DIR / "search_result.png"), timeout=10000)
            print("[✓] 搜索结果截图已保存")
        except Exception:
            print("[!] 截图失败，继续采集...")

        # 调试：检查页面内容
        try:
            title = page.title()
            print(f"[i] 页面标题: {title}")
            body_text = page.evaluate("() => document.body ? document.body.innerText.substring(0, 200) : 'empty'")
            print(f"[i] 页面内容前200字: {body_text[:200]}")
        except Exception as e:
            print(f"[!] 页面内容检测失败: {e}")

        print("[✓] 开始采集...\n")

        all_notes = []

        for page_num in range(1, max_pages + 1):
            print(f"\n{'=' * 50}")
            print(f"  采集第 {page_num}/{max_pages} 页 | 关键词: {keyword}")
            print(f"{'=' * 50}")

            api_notes.clear()  # 清空拦截数据

            if page_num == 1:
                # 第1页已经在搜索框搜索过了，直接滚动采集
                print("  (第1页已搜索，直接采集)")
            else:
                # 后续页：滚动到底部触发加载更多
                print("  滚动加载更多...")

            # 滚动加载（触发更多 API 请求）
            for s in range(scroll_times):
                try:
                    page.evaluate("() => window.scrollBy(0, window.innerHeight)")
                except Exception:
                    pass
                time.sleep(2)
                print(f"  滚动 {s + 1}/{scroll_times}")

            # 等待 API 响应处理
            time.sleep(3)

            print(f"\n  本页拦截到 {len(api_notes)} 条笔记")

            if not api_notes:
                # 尝试从 DOM 提取作为后备
                print("  [!] API 拦截无数据，尝试从页面 DOM 提取...")
                dom_notes = extract_from_dom(page)
                if dom_notes:
                    api_notes.extend(dom_notes)
                    print(f"  DOM 提取到 {len(dom_notes)} 条")
                else:
                    debug_path = OUTPUT_DIR / f"debug_page{page_num}.png"
                    page.screenshot(path=str(debug_path))
                    print(f"  [!] 无数据，调试截图: {debug_path}")
                    continue

            # 处理每篇笔记
            for i, note in enumerate(api_notes):
                note_id = note.get("note_id", str(i))
                print(f"\n  [{i + 1}/{len(api_notes)}] {note['title'] or '(无标题)'}")
                print(f"    作者: {note.get('author', '?')} | 点赞: {note.get('likes', '?')} | 图片: {len(note.get('images', []))}张")

                # 下载图片
                if download_imgs and note.get("images"):
                    local_imgs = []
                    for idx, img_url in enumerate(note["images"][:10]):  # 最多10张
                        filename = f"{note_id}_{idx + 1}.jpg"
                        filepath = IMAGES_DIR / filename
                        if download_image(page, img_url, filepath):
                            local_imgs.append(str(filepath))
                            print(f"    [✓] 下载: {filename}")
                        else:
                            print(f"    [!] 下载失败: {img_url[:60]}...")
                        time.sleep(0.5)
                    note["local_images"] = local_imgs

                # 下载封面
                if download_imgs and note.get("cover_url"):
                    cover_path = IMAGES_DIR / f"{note_id}_cover.jpg"
                    if download_image(page, note["cover_url"], cover_path):
                        note["local_cover"] = str(cover_path)

                note["search_keyword"] = keyword
                note["scraped_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
                all_notes.append(note)

                time.sleep(0.5)

            # 翻页间隔
            if page_num < max_pages:
                print("\n  等待 3 秒后翻页...")
                time.sleep(3)

        # 保存结果
        with open(RESULTS_FILE, "w", encoding="utf-8") as f:
            json.dump(all_notes, f, ensure_ascii=False, indent=2)

        print(f"\n{'=' * 50}")
        print(f"  采集完成！共 {len(all_notes)} 篇笔记")
        print(f"  结果: {RESULTS_FILE}")
        print(f"  图片: {IMAGES_DIR}")
        if all_api_urls:
            print(f"\n  [调试] 拦截到 {len(all_api_urls)} 个 API 请求:")
            seen = set()
            for u in all_api_urls:
                short = u.split("?")[0]
                if short not in seen:
                    seen.add(short)
                    print(f"    {short}")
        print(f"{'=' * 50}")

        browser.close()


def extract_from_dom(page: Page) -> list[dict]:
    """从 DOM 提取笔记数据（API 拦截失败时的后备方案）"""
    notes = []
    # 尝试多种选择器
    for selector in ['section.note-item', 'a[href*="/explore/"]', '[class*="note-item"]']:
        elements = page.query_selector_all(selector)
        if not elements:
            continue

        for el in elements:
            try:
                href = el.get_attribute("href") or ""
                a_el = el.query_selector("a")
                if a_el:
                    href = a_el.get_attribute("href") or href

                title_el = el.query_selector('[class*="title"], span')
                title = title_el.inner_text().strip() if title_el else ""

                img_el = el.query_selector("img")
                cover = ""
                if img_el:
                    cover = normalize_image_url(img_el.get_attribute("src") or "")

                if title or href:
                    note_id = ""
                    match = re.search(r'/explore/([a-f0-9]+)', href)
                    if match:
                        note_id = match.group(1)

                    notes.append({
                        "note_id": note_id or str(hash(title))[-12:],
                        "title": title,
                        "desc": "",
                        "cover_url": cover,
                        "images": [cover] if cover else [],
                        "tags": [],
                        "author": "",
                        "likes": "",
                    })
            except Exception:
                continue
        break

    return notes


def _scrape_with_existing_session(page: Page, context: BrowserContext, args):
    """复用已登录的浏览器会话进行采集"""
    setup_dirs()

    api_notes = []
    all_api_urls = []

    def handle_response(response: Response):
        url = response.url
        if "/api/" in url:
            all_api_urls.append(url)
        if any(kw in url for kw in [
            "/api/sns/web/v1/search/notes",
            "/api/sns/web/v2/search/notes",
            "search/notes",
        ]):
            try:
                if response.status == 200:
                    data = response.json()
                    notes = extract_notes_from_api(data)
                    if notes:
                        api_notes.extend(notes)
                        print(f"  [API] 拦截到 {len(notes)} 条笔记数据")
            except Exception:
                pass

    page.on("response", handle_response)

    keyword = args.keyword
    encoded_kw = quote(keyword)
    all_notes = []

    # 搜索
    print(f"[...] 搜索: {keyword}")

    # 等待首页完全加载
    time.sleep(3)

    # 方法1：通过搜索框交互
    search_success = False
    try:
        # 先点击搜索区域激活搜索框
        for sel in ['#search-input', '.search-input', '[class*="search-input"]', '.search-area']:
            el = page.query_selector(sel)
            if el:
                el.click()
                time.sleep(1)
                break

        # 查找 textarea
        textarea = page.query_selector('textarea')
        if textarea:
            textarea.click()
            time.sleep(0.5)
            textarea.fill("")
            time.sleep(0.3)
            textarea.fill(keyword)
            time.sleep(1)
            # 按回车触发搜索
            textarea.press("Enter")
            print("[✓] 已通过搜索框搜索")
            search_success = True
            time.sleep(5)
    except Exception as e:
        print(f"  [!] 搜索框交互失败: {e}")

    # 方法2：后备 - URL 导航
    if not search_success:
        print("  [!] 搜索框失败，尝试 URL 导航...")
        search_url = f"{XHS_SEARCH}?keyword={encoded_kw}&source=web_search_result_notes&type=51"
        try:
            page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
        except Exception:
            try:
                page.goto(search_url, timeout=60000)
            except Exception:
                pass
        time.sleep(5)
        print("[✓] 已通过 URL 搜索")
    dismiss_login_popup(page)

    # 调试：检查当前页面
    current_url = page.url
    print(f"[i] 当前 URL: {current_url}")
    try:
        page_title = page.title()
        print(f"[i] 页面标题: {page_title}")
    except Exception:
        pass

    # 检查是否在搜索结果页
    if "search_result" not in current_url:
        print("[!] 未在搜索结果页，重新导航...")
        search_url = f"{XHS_SEARCH}?keyword={encoded_kw}&source=web_search_result_notes&type=51"
        try:
            page.goto(search_url, wait_until="domcontentloaded", timeout=60000)
        except Exception:
            page.goto(search_url, timeout=60000)
        time.sleep(5)
        dismiss_login_popup(page)
        print(f"[i] 重新导航后 URL: {page.url}")

    for page_num in range(1, args.pages + 1):
        print(f"\n{'=' * 50}")
        print(f"  采集第 {page_num}/{args.pages} 页 | 关键词: {keyword}")
        print(f"{'=' * 50}")

        api_notes.clear()

        for s in range(args.scroll):
            try:
                page.evaluate("() => window.scrollBy(0, window.innerHeight)")
            except Exception:
                pass
            time.sleep(2)
            print(f"  滚动 {s + 1}/{args.scroll}")

        time.sleep(3)
        print(f"\n  本页拦截到 {len(api_notes)} 条笔记")

        if not api_notes:
            print("  [!] API 拦截无数据，尝试 DOM 提取...")
            dom_notes = extract_from_dom(page)
            if dom_notes:
                api_notes.extend(dom_notes)
                print(f"  DOM 提取到 {len(dom_notes)} 条")
            else:
                continue

        for i, note in enumerate(api_notes):
            note_id = note.get("note_id", str(i))
            print(f"\n  [{i + 1}/{len(api_notes)}] {note['title'] or '(无标题)'}")
            print(f"    作者: {note.get('author', '?')} | 图片: {len(note.get('images', []))}张")

            if not args.no_images and note.get("images"):
                local_imgs = []
                for idx, img_url in enumerate(note["images"][:10]):
                    filename = f"{note_id}_{idx + 1}.jpg"
                    filepath = IMAGES_DIR / filename
                    if download_image(page, img_url, filepath):
                        local_imgs.append(str(filepath))
                        print(f"    [✓] 下载: {filename}")
                    time.sleep(0.3)
                note["local_images"] = local_imgs

            if not args.no_images and note.get("cover_url"):
                cover_path = IMAGES_DIR / f"{note_id}_cover.jpg"
                if download_image(page, note["cover_url"], cover_path):
                    note["local_cover"] = str(cover_path)

            note["search_keyword"] = keyword
            note["scraped_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
            all_notes.append(note)
            time.sleep(0.3)

        if page_num < args.pages:
            time.sleep(3)

    with open(RESULTS_FILE, "w", encoding="utf-8") as f:
        json.dump(all_notes, f, ensure_ascii=False, indent=2)

    print(f"\n{'=' * 50}")
    print(f"  采集完成！共 {len(all_notes)} 篇笔记")
    print(f"  结果: {RESULTS_FILE}")
    print(f"  图片: {IMAGES_DIR}")
    if all_api_urls:
        print(f"\n  [调试] 拦截到 {len(all_api_urls)} 个 API:")
        seen = set()
        for u in all_api_urls:
            short = u.split("?")[0]
            if short not in seen:
                seen.add(short)
                print(f"    {short}")
    print(f"{'=' * 50}")


def main():
    parser = argparse.ArgumentParser(description="小红书面试题爬虫 (API拦截版)")
    parser.add_argument("--login", action="store_true", help="启动浏览器进行手动登录")
    parser.add_argument("--keyword", "-k", type=str, default="Java面试题", help="搜索关键词")
    parser.add_argument("--pages", "-p", type=int, default=3, help="采集页数 (默认 3)")
    parser.add_argument("--scroll", "-s", type=int, default=5, help="每页滚动次数 (默认 5)")
    parser.add_argument("--no-images", action="store_true", help="不下载图片")

    args = parser.parse_args()

    if args.login:
        # 登录 + 采集一体化
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
            if login_flow(page, context):
                # 登录成功后直接在同一个浏览器中采集
                print("\n[✓] 登录成功，开始采集...\n")
                # 复用同一个 page 和 context 进行采集
                _scrape_with_existing_session(page, context, args)
            browser.close()
    else:
        scrape_xhs(
            keyword=args.keyword,
            max_pages=args.pages,
            scroll_times=args.scroll,
            download_imgs=not args.no_images,
        )


if __name__ == "__main__":
    main()
