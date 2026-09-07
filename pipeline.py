"""
노드 파이프라인 — 긱뉴스 수집 → 군집화 → GPT 요약 → nodes.json 생성
==================================================================

프론트엔드('노드' 대시보드)가 그대로 소비하는 nodes.json을 매일 만들어내는
백엔드 배치 스크립트입니다. OpenAI 키는 반드시 여기(서버)에만 두세요.
클라이언트(React 아티팩트)에 넣으면 키가 노출됩니다.

파이프라인 단계
  1. 수집(ingest)    : 여러 소스에서 원본 아이템 수집 → 공통 스키마로 정규화
  2. 임베딩(embed)   : text-embedding-3-small 로 각 아이템 벡터화
  3. 군집화(cluster) : 코사인 유사도 임계값 기반 그리디 군집 → 군집 하나 = 노드 후보
  4. 요약(summarize) : 군집별로 GPT 호출(JSON 모드) → 제목/분야/태그/요약/핵심/관련
  5. 연결(link)      : 노드 임베딩으로 최근접 이웃 → similar[]
  6. 출력(emit)      : 프론트 스키마에 맞춘 nodes.json

설치:  pip install openai feedparser requests numpy
실행:  OPENAI_API_KEY=sk-... python pipeline.py > nodes.json

주의: 아래 fetch_* 는 예시입니다. 실제 소스(RSS/HTML)에 맞춰 셀렉터·필드를
      조정하세요. GeekNews(news.hada.io)는 공개 RSS를 제공합니다.
"""

from __future__ import annotations
import os, sys, re, html, argparse, json, hashlib, datetime as dt, math
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import List, Optional

import numpy as np
import requests
import feedparser
import trafilatura
from lxml import html as lxml_html
try:
    from openai import OpenAI
except ImportError:  # --local은 openai 패키지 자체가 없어도 실행 가능
    OpenAI = None

_client = None

def openai_client():
    """API가 필요한 단계에서만 클라이언트를 생성한다."""
    global _client
    if OpenAI is None:
        raise RuntimeError("OpenAI 모드에는 openai 패키지가 필요합니다. --local을 사용하세요.")
    if _client is None:
        _client = OpenAI(timeout=60, max_retries=2)
    return _client

SUMMARY_WORKERS = 4  # 요약 병렬 처리 개수(속도↑). 429가 잦으면 줄이세요.

def log(msg: str) -> None:
    """진행 로그는 stderr로 — '> nodes.json' 출력에 섞이지 않게."""
    print(msg, file=sys.stderr, flush=True)

EMBED_MODEL = "text-embedding-3-small"
CHAT_MODEL  = "gpt-4o-mini"           # 비용/품질 균형. 필요시 gpt-4o / gpt-4.1 로 상향
SIM_THRESHOLD = 0.62                  # 군집 병합 임계값(코사인). 높이면 군집이 잘게 쪼개짐
LOCAL_SIM_THRESHOLD = 0.72            # 규칙 모드에서는 오병합보다 누락을 허용
MAX_SIMILAR = 3                       # 노드당 유사 노드 개수
HN_MIN_POINTS = 50                    # 역사 백필은 신호가 있는 글로 제한
HN_PER_DAY = 15                       # GeekNews 외 일별 HN 최대 보강량

TOPIC_KEYS = ["ai", "web", "sys", "sec", "oss", "biz", "hw", "lang"]
TOPIC_DESC = {
    "ai": "AI·머신러닝", "web": "웹·프론트엔드", "sys": "시스템·인프라", "sec": "보안",
    "oss": "오픈소스", "biz": "스타트업·비즈니스", "hw": "하드웨어", "lang": "언어·툴링",
}


# ------------------------------------------------------------------ #
# 1. 수집
# ------------------------------------------------------------------ #
@dataclass
class Item:
    id: str
    title: str
    url: str
    source: str
    text: str = ""          # 본문/요약(있으면). 없으면 제목만으로도 동작
    points: int = 0         # 인기 신호(HN score 등). 없으면 0
    published: str = ""     # ISO date

def _mk_id(*parts: str) -> str:
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:10]

def fetch_geeknews(limit: int = 40) -> List[Item]:
    """GeekNews RSS. (news.hada.io/rss/news) — 최신 ~50건(약 2일치)만 제공."""
    out = []
    feed = feedparser.parse("https://news.hada.io/rss/news")
    for e in feed.entries[:limit]:
        out.append(Item(
            id=_mk_id("gn", e.get("link", e.get("title", ""))),
            title=e.get("title", "").strip(),
            url=e.get("link", ""),
            source="GeekNews",
            text=e.get("summary", "")[:1200],
            published=_to_iso(e.get("published_parsed")),
        ))
    return out

GEEKNEWS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
}

# news.hada.io 는 RSS로 최신 글만 제공하므로, 과거 날짜 아카이브(/past?day=)를 직접 긁어야
# 1년치 같은 장기 이력을 모을 수 있다. 사이트 구조(topic_row) 변경 시 이 정규식들도 갱신 필요.
# 한 방에 매칭하는 큰 정규식은 항목 하나가 패턴에서 살짝 어긋나면 다음 항목까지
# 통째로 집어삼켜(non-greedy가 다음 행까지 건너뜀) 여러 건이 누락되므로,
# 행(topic_row)을 먼저 분리한 뒤 행 단위로 안전하게 추출한다.
_ROW_ID_RE = re.compile(r"data-topic-state-id='(\d+)'")
_TITLE_RE = re.compile(
    r"<a href='([^']+)' rel='nofollow'[^>]*class='topic-title-link'>"
    r"<h2 class='topic-title-heading'>(.*?)</h2>", re.S,
)
_POINTS_RE = re.compile(r"<span id='tp\d+'>(\d+)</span> points? by")
_TIME_RE = re.compile(r'datetime="([^"]+)"')
_DESC_RE = re.compile(r"<div class='topicdesc'><a[^>]*>(.*?)</a></div>", re.S)

def fetch_geeknews_day(day: str) -> List[Item]:
    """GeekNews 특정 날짜 아카이브 1페이지(news.hada.io/past?day=YYYY-MM-DD) 파싱."""
    out = []
    try:
        resp = requests.get(
            f"https://news.hada.io/past?day={day}",
            headers=GEEKNEWS_HEADERS, timeout=15,
        )
        resp.raise_for_status()
    except requests.RequestException as ex:
        log(f"[warn] geeknews {day} 요청 실패: {ex}")
        return out
    for row in resp.text.split("<div class='topic_row'")[1:]:
        id_m, title_m, points_m, time_m = (
            _ROW_ID_RE.search(row), _TITLE_RE.search(row),
            _POINTS_RE.search(row), _TIME_RE.search(row),
        )
        if not (id_m and title_m and points_m and time_m):
            continue
        url = title_m[1]
        if url.startswith("topic?"):  # Show GN 등 외부 링크가 없는 자체 글
            url = "https://news.hada.io/" + url
        desc_m = _DESC_RE.search(row)
        out.append(Item(
            id=_mk_id("gn", id_m[1]),
            title=html.unescape(title_m[2]).strip(),
            url=url,
            source="GeekNews",
            text=html.unescape(desc_m[1]).strip() if desc_m else "",
            points=int(points_m[1]),
            published=time_m[1][:10],
        ))
    return out

def fetch_geeknews_history(days: int, max_workers: int = 6) -> List[Item]:
    """오늘 포함 최근 `days`일치 GeekNews 아카이브를 날짜별로 병렬 수집."""
    today = dt.date.today()
    day_strs = [(today - dt.timedelta(days=i)).isoformat() for i in range(days)]
    out: List[Item] = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(fetch_geeknews_day, d): d for d in day_strs}
        for i, fut in enumerate(as_completed(futures), 1):
            out += fut.result()
            if i % 20 == 0 or i == len(day_strs):
                log(f"[수집] geeknews 아카이브 {i}/{len(day_strs)}일 완료 (누적 {len(out)}건)")
    return out

def fetch_hackernews(limit: int = 40) -> List[Item]:
    """Hacker News top stories (공식 Firebase API)."""
    out = []
    ids = requests.get("https://hacker-news.firebaseio.com/v0/topstories.json", timeout=10).json()[:limit]
    for i in ids:
        try:
            s = requests.get(f"https://hacker-news.firebaseio.com/v0/item/{i}.json", timeout=10).json()
            if not s or s.get("type") != "story" or not s.get("title"):
                continue
            out.append(Item(
                id=_mk_id("hn", str(i)),
                title=s["title"].strip(),
                url=s.get("url", f"https://news.ycombinator.com/item?id={i}"),
                source="Hacker News",
                points=int(s.get("score", 0)),
                published=dt.datetime.fromtimestamp(s.get("time", 0), dt.UTC).date().isoformat(),
            ))
        except requests.RequestException:
            continue
    return out

def fetch_hackernews_day(day: str, limit: int = HN_PER_DAY) -> List[Item]:
    """Algolia HN Search API로 특정 날짜의 인기 story를 백필한다."""
    start = dt.datetime.fromisoformat(day).replace(tzinfo=dt.UTC)
    end = start + dt.timedelta(days=1)
    params = {
        "tags": "story",
        "hitsPerPage": 100,
        "numericFilters": (
            f"created_at_i>={int(start.timestamp())},"
            f"created_at_i<{int(end.timestamp())},points>={HN_MIN_POINTS}"
        ),
    }
    try:
        # /search는 같은 날짜 범위 안에서 인기 신호가 큰 글을 우선한다.
        resp = requests.get("https://hn.algolia.com/api/v1/search", params=params, timeout=15)
        resp.raise_for_status()
        hits = resp.json().get("hits", [])
    except (requests.RequestException, ValueError) as ex:
        log(f"[warn] hackernews {day} 요청 실패: {ex}")
        return []
    hits.sort(key=lambda h: (int(h.get("points") or 0), int(h.get("num_comments") or 0)), reverse=True)
    out = []
    for story in hits[:limit]:
        object_id = str(story.get("objectID", ""))
        title = (story.get("title") or "").strip()
        if not object_id or not title:
            continue
        out.append(Item(
            id=_mk_id("hn", object_id), title=title,
            url=story.get("url") or f"https://news.ycombinator.com/item?id={object_id}",
            source="Hacker News", text=story.get("story_text") or "",
            points=int(story.get("points") or 0), published=day,
        ))
    return out

def fetch_hackernews_history(days: int, max_workers: int = 8) -> List[Item]:
    """오늘 포함 최근 `days`일치 HN 인기 글을 날짜별로 수집."""
    today = dt.date.today()
    day_strs = [(today - dt.timedelta(days=i)).isoformat() for i in range(days)]
    out: List[Item] = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(fetch_hackernews_day, day): day for day in day_strs}
        for i, fut in enumerate(as_completed(futures), 1):
            out += fut.result()
            if i % 20 == 0 or i == len(day_strs):
                log(f"[수집] hackernews 아카이브 {i}/{len(day_strs)}일 완료 (누적 {len(out)}건)")
    return out

def _to_iso(struct_time) -> str:
    if not struct_time:
        return dt.date.today().isoformat()
    return dt.date(*struct_time[:3]).isoformat()

def ingest(days: int = 2, existing_keys: Optional[set] = None) -> List[Item]:
    """GeekNews 아카이브 `days`일치 + HN top stories 수집.

    existing_keys: 이미 nodes.json에 반영된 (제목 lower, url) 키 집합.
                    누적 실행 시 이미 처리한 글을 다시 요약하지 않도록 걸러낸다.
    """
    items: List[Item] = []
    sources = [(lambda: fetch_geeknews_history(days), "fetch_geeknews_history"),
               (lambda: fetch_hackernews_history(days), "fetch_hackernews_history")]
    for fn, name in sources:
        try:
            log(f"[수집] {name} …")
            got = fn()
            items += got
            log(f"[수집] {name}: {len(got)}건")
        except Exception as ex:  # 한 소스가 죽어도 파이프라인은 계속
            log(f"[warn] {name} 실패: {ex}")
    # 제목/URL 기준 중복 제거 (이번 배치 내부 + 기존 아카이브)
    existing_keys = existing_keys or set()
    seen, uniq = set(existing_keys), []
    for it in items:
        k = it.title.lower().strip()
        u = it.url.strip()
        if not k or k in seen or (u and u in seen):
            continue
        seen.add(k)
        if u:
            seen.add(u)
        uniq.append(it)
    return uniq


# ------------------------------------------------------------------ #
# 2. 임베딩
# ------------------------------------------------------------------ #
def embed(texts: List[str]) -> np.ndarray:
    vecs = []
    for i in range(0, len(texts), 100):  # 배치
        chunk = [t[:8000] for t in texts[i:i + 100]]
        resp = openai_client().embeddings.create(model=EMBED_MODEL, input=chunk)
        vecs += [d.embedding for d in resp.data]
    arr = np.array(vecs, dtype=np.float32)
    arr /= (np.linalg.norm(arr, axis=1, keepdims=True) + 1e-9)  # 정규화 → 내적=코사인
    return arr

_WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9_+.#-]{1,}|[가-힣]{2,}|\d{2,}")
_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "of", "in", "on", "to", "by", "at",
    "is", "it", "be", "as", "we", "you", "our", "not", "was", "were", "has",
    "have", "had", "for", "with", "from", "that", "this", "your", "are", "new",
    "how", "why", "what", "using", "into", "about", "open", "source", "news",
    "이", "그", "및", "에서", "으로", "위한", "대한", "새로운", "공개", "출시",
}

def lexical_tokens(text: str) -> List[str]:
    """영문/한글 모두에 작동하는 가벼운 결정적 tokenization."""
    clean = html.unescape(re.sub(r"<[^>]+>", " ", text)).lower()
    out = []
    for raw in _WORD_RE.findall(clean):
        token = raw.strip("-_.")
        if token.endswith("s") and len(token) > 5 and token.isascii():
            token = token[:-1]  # 단순 복수형으로 인한 제목 중복을 흡수
        if token and token not in _STOPWORDS:
            out.append(token)
    return out

def local_vectors(texts: List[str], dimensions: int = 2048) -> np.ndarray:
    """OpenAI 없이 연결 계산에 쓰는 hashing TF-IDF 벡터."""
    docs = [lexical_tokens(t) for t in texts]
    df = Counter(token for doc in docs for token in set(doc))
    matrix = np.zeros((len(texts), dimensions), dtype=np.float32)
    for row, doc in enumerate(docs):
        counts = Counter(doc)
        for token, count in counts.items():
            digest = hashlib.blake2b(token.encode(), digest_size=8).digest()
            col = int.from_bytes(digest, "big") % dimensions
            # signed hashing은 서로 다른 token의 충돌이 유사도를 일방적으로
            # 높이는 편향을 줄인다. 2048차원은 1년치 아카이브에도 현실적이다.
            sign = 1.0 if digest[0] & 1 else -1.0
            matrix[row, col] += sign * (1 + math.log(count)) * (1 + math.log((len(docs) + 1) / (df[token] + 1)))
    matrix /= np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-9
    return matrix


# ------------------------------------------------------------------ #
# 3. 군집화 (그리디 / 임계값 기반)
# ------------------------------------------------------------------ #
def cluster(items: List[Item], vecs: np.ndarray) -> List[List[int]]:
    n = len(items)
    assigned = [-1] * n
    centroids: List[np.ndarray] = []
    clusters: List[List[int]] = []
    order = sorted(range(n), key=lambda i: -items[i].points)  # 인기 높은 것부터 씨앗
    for i in order:
        best, best_sim = -1, SIM_THRESHOLD
        for c, cen in enumerate(centroids):
            sim = float(vecs[i] @ cen)
            if sim > best_sim:
                best, best_sim = c, sim
        if best == -1:
            centroids.append(vecs[i].copy())
            clusters.append([i])
            assigned[i] = len(clusters) - 1
        else:
            clusters[best].append(i)
            m = len(clusters[best])
            centroids[best] = (centroids[best] * (m - 1) + vecs[i]) / m
            centroids[best] /= (np.linalg.norm(centroids[best]) + 1e-9)
            assigned[i] = best
    return clusters

def cluster_local(items: List[Item]) -> List[List[int]]:
    """Rare shared title tokens가 있는 후보만 비교해 O(N²) 폭발을 피한다.

    정확한 번역/의미 군집은 모델 없이 보장할 수 없으므로, 제목이 매우 비슷한
    중복 보도만 병합한다. 나머지는 1기사=1노드로 보존한다.
    """
    title_sets = [set(lexical_tokens(it.title)) for it in items]
    postings: dict[str, List[int]] = defaultdict(list)
    clusters: List[List[int]] = []
    representative: List[int] = []
    for i in sorted(range(len(items)), key=lambda x: -items[x].points):
        tokens = title_sets[i]
        lowered = items[i].title.lower()
        # Ask HN의 월별 정기글은 제목 구조가 같아도 서로 다른 노드다.
        force_singleton = bool(re.match(r"\s*ask\s+hn\s*:", lowered))
        candidates = Counter()
        if not force_singleton:
            for token in tokens:
                for ci in postings[token]:
                    candidates[ci] += 1
        best, best_score = -1, LOCAL_SIM_THRESHOLD
        for ci, shared in candidates.items():
            rep = representative[ci]
            other = title_sets[rep]
            # 모델/소프트웨어 버전이 명시된 제목은 버전 집합이 다르면
            # 문장이 비슷해도 합치지 않는다.
            version_pattern = r"\b(?:v?\d+(?:\.\d+)+|(?:gpt|claude|gemini|llama)[- ]?\d+(?:\.\d+)*)\b"
            versions = set(re.findall(version_pattern, lowered))
            other_versions = set(re.findall(version_pattern, items[rep].title.lower()))
            if (versions or other_versions) and versions != other_versions:
                continue
            kind = "show" if re.match(r"\s*show\s+hn\s*:", lowered) else "normal"
            other_lower = items[rep].title.lower()
            other_kind = "show" if re.match(r"\s*show\s+hn\s*:", other_lower) else "normal"
            if kind != other_kind:
                continue
            union = len(tokens | other)
            score = shared / union if union else 0.0
            if score > best_score:
                best, best_score = ci, score
        if best < 0:
            best = len(clusters)
            clusters.append([i])
            representative.append(i)
            if not force_singleton:
                for token in tokens:
                    postings[token].append(best)
        else:
            clusters[best].append(i)
    return clusters


# ------------------------------------------------------------------ #
# 4. 요약 (GPT, JSON 모드)
# ------------------------------------------------------------------ #
SUMMARY_SYSTEM = (
    "너는 긱뉴스 큐레이터다. 여러 기사를 하나의 '노드'로 묶어 한국어로 요약한다. "
    "바쁜 개발자가 짧은 시간에 핵심을 파악하도록, 과장 없이 사실 위주로 쓴다. "
    "반드시 지정된 JSON 형식으로만 답한다."
)

def summarize_cluster(items: List[Item]) -> dict:
    joined = "\n\n".join(f"- [{it.source}] {it.title}\n{it.text[:600]}" for it in items)
    topic_list = ", ".join(f"{k}({v})" for k, v in TOPIC_DESC.items())
    prompt = f"""다음은 서로 관련된 긱뉴스 {len(items)}건이다. 이를 하나의 노드로 요약하라.

기사들:
{joined}

아래 JSON 스키마로만 답하라(설명·마크다운 금지):
{{
  "topic": "{topic_list} 중 하나의 키",
  "title": "노드 제목 (한국어, 40자 이내, 핵심을 담되 낚시성 금지)",
  "tags": ["관련 키워드 2~4개"],
  "oneLiner": "한 줄 요약 (한국어, 60~90자)",
  "keyPoints": ["핵심 내용 2~4개 (각 한 문장)"],
  "related": ["연관 맥락/파급효과 1~2개 (각 한 문장)"]
}}"""
    resp = openai_client().chat.completions.create(
        model=CHAT_MODEL,
        temperature=0.3,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SUMMARY_SYSTEM},
            {"role": "user", "content": prompt},
        ],
    )
    data = json.loads(resp.choices[0].message.content)
    if data.get("topic") not in TOPIC_KEYS:
        data["topic"] = "ai"  # 안전 기본값
    return data

_TOPIC_WORDS = {
    "ai": {"ai", "llm", "gpt", "openai", "anthropic", "model", "agent", "machine", "learning", "인공지능", "머신러닝", "모델"},
    "web": {"web", "browser", "react", "vue", "css", "html", "frontend", "브라우저", "프론트엔드"},
    "sys": {"linux", "kernel", "cloud", "docker", "kubernetes", "server", "database", "infra", "서버", "클라우드", "데이터베이스"},
    "sec": {"security", "vulnerability", "cve", "attack", "privacy", "malware", "보안", "취약점", "해킹"},
    "oss": {"github", "opensource", "license", "repository", "오픈소스", "라이선스"},
    "biz": {"startup", "funding", "acquisition", "company", "revenue", "business", "스타트업", "투자", "인수", "비즈니스"},
    "hw": {"gpu", "cpu", "chip", "hardware", "device", "robot", "nvidia", "반도체", "하드웨어", "로봇"},
    "lang": {"python", "javascript", "typescript", "rust", "compiler", "language", "sdk", "api", "programming", "컴파일러", "프로그래밍"},
}

def local_topic(tokens: List[str], url: str = "") -> str:
    counts = {topic: sum(t in words for t in tokens) for topic, words in _TOPIC_WORDS.items()}
    # 보안 신호는 보통 일반 시스템 단어보다 구체적이므로 동점에서 우선한다.
    priority = ["sec", "ai", "hw", "web", "sys", "biz", "oss", "lang"]
    best = max(priority, key=lambda topic: counts[topic])
    if counts[best]:
        return best
    # 스키마에 'misc'가 없다. 증거 없이 특정 기술 분야로 보내는
    # 것보다 GitHub/GitLab 원문만 OSS로, 나머지 일반 기술 소식은 biz로 보낸다.
    return "oss" if re.search(r"(?:github|gitlab)\.com", url.lower()) else "biz"

def _plain_text(value: str) -> str:
    value = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    return re.sub(r"\s+", " ", value).strip()

_BAD_SENTENCE_RE = re.compile(
    r"^(?:hi|hello|hey|welcome|thanks|thank you|contents?|table of contents|"
    r"안녕(?:하세요)?|반갑습니다|목차|소개)\b", re.I,
)
_TAG_BLOCKLIST = _STOPWORDS | {
    "show", "ask", "hn", "gn", "https", "http", "www", "com", "article", "story",
    "글", "소개", "소식", "기사",
}

def _meaningful_sentences(body: str) -> List[str]:
    # HTML 단락 경계는 보존하고 태그는 문장 길이 판정 전에 제거한다.
    body = re.sub(r"</(?:p|li|div|h[1-6])\s*>|<br\s*/?>", "\n", body, flags=re.I)
    body = html.unescape(re.sub(r"<[^>]+>", " ", body))
    candidates = re.split(r"\n+|(?<=[.!?])\s+|(?<=다\.)\s*|\s+[\u2022▪]\s+", body)
    selected = []
    for raw in candidates:
        sentence = re.sub(r"^\s*(?:[-*•▪]+|\(?\d{1,2}[.)]|[ivx]{1,5}[.)])\s*", "", raw).strip()
        alpha_count = len(re.findall(r"[A-Za-z가-힣]", sentence))
        if alpha_count < 20 or _BAD_SENTENCE_RE.search(sentence):
            continue
        selected.append(sentence)
    return selected

def enrich_item(item: Item) -> Item:
    """요약할 본문이 없는 링크 기사는 원문에서 본문을 추출한다."""
    if _meaningful_sentences(_plain_text(item.text)):
        return item
    if not item.url.startswith(("https://", "http://")):
        return item
    try:
        with requests.get(item.url, headers=GEEKNEWS_HEADERS, timeout=(5, 15), stream=True) as response:
            response.raise_for_status()
            if "html" not in response.headers.get("Content-Type", "").lower():
                return item
            chunks, size = [], 0
            for chunk in response.iter_content(65536):
                size += len(chunk)
                if size > 2_000_000:
                    return item
                chunks.append(chunk)
        document = b"".join(chunks)
        body = trafilatura.extract(document, include_comments=False,
                                   include_tables=False, favor_precision=True) or ""
        # JS 전용 소셜 페이지의 앱 실행 안내문은 기사 본문이 아니다.
        if re.search(r"(?:enable|turn on) javascript|javascript (?:is required|disabled)", body, re.I):
            page = lxml_html.fromstring(document)
            descriptions = page.xpath('//meta[@property="og:description"]/@content')
            body = descriptions[0] if descriptions else ""
            if re.search(r"(?:enable|turn on) javascript|javascript (?:is required|disabled)", body, re.I):
                body = ""
        if _meaningful_sentences(body):
            item.text = body[:20000]
    except (requests.RequestException, ValueError) as ex:
        log(f"[warn] 본문 수집 실패 {item.url}: {ex}")
    return item

def needs_summary_repair(node: dict) -> bool:
    points = node.get("keyPoints", [])
    return not points or any(p.startswith(("원문 제목:", "출처:")) for p in points)

def repair_summaries(nodes: List[dict], local: bool = True) -> None:
    """ID·출처·날짜를 유지하며 기존 제목/출처 대체 요약만 복구한다."""
    targets = [node for node in nodes if needs_summary_repair(node)]
    def repair(node):
        items = [enrich_item(Item(_mk_id(s["url"]), s["title"], s["url"], s["source"]))
                 for s in node["sources"]]
        summary = summarize_cluster_local(items) if local else summarize_cluster(items)
        for field in ("oneLiner", "keyPoints"):
            node[field] = summary[field]
        return bool(node["keyPoints"])
    recovered = 0
    with ThreadPoolExecutor(max_workers=SUMMARY_WORKERS) as pool:
        for done, success in enumerate(pool.map(repair, targets), 1):
            recovered += success
            if done % 100 == 0 or done == len(targets):
                log(f"[복구] {done}/{len(targets)}, 본문 확보 {recovered}개")

def summarize_cluster_local(items: List[Item]) -> dict:
    """번역이나 생성을 가장하지 않는 규칙 기반 추출 요약."""
    representative = max(items, key=lambda it: (it.points, len(it.text), it.title))
    combined = " ".join(f"{it.title} {_plain_text(it.text)}" for it in items)
    tokens = lexical_tokens(combined)
    # 태그는 본문의 인사말/내비게이션 단어가 아니라 제목의 실제 단어만 쓴다.
    title_tokens = lexical_tokens(representative.title)
    tags = []
    for token in title_tokens:
        if token in _TAG_BLOCKLIST or token.isdigit() or re.fullmatch(r"\d+(?:\.\d+)*", token):
            continue
        if token not in tags:
            tags.append(token)
        if len(tags) == 4:
            break
    sentences = []
    for item in sorted(items, key=lambda it: -it.points):
        for sentence in _meaningful_sentences(item.text):
            sentence = _plain_text(sentence)
            if sentence and sentence not in sentences and sentence != item.title:
                sentences.append(sentence)
    if sentences:
        one_liner = sentences[0][:180]
        key_points = [s[:220] for s in sentences[:3]]
    else:
        one_liner = "본문을 확보하지 못해 요약을 제공할 수 없습니다. 원문 링크에서 확인해 주세요."
        key_points = []
    related = ([f"같은 주제로 묶인 원문 {len(items)}건을 함께 보여줍니다."]
               if len(items) > 1 else [])
    return {
        "topic": local_topic(tokens, representative.url), "title": representative.title[:120],
        "tags": tags or ["미분류"], "oneLiner": one_liner,
        "keyPoints": key_points, "related": related,
    }


# ------------------------------------------------------------------ #
# 5 + 6. 노드 조립 · 연결 · 출력
# ------------------------------------------------------------------ #
def popularity(items: List[Item]) -> int:
    pts = max((it.points for it in items), default=0)
    score = 55 + min(40, pts // 8) + min(5, len(items) - 1)  # 대략적 정규화
    return int(max(0, min(99, score)))

def node_id(date: str, seq: int) -> str:
    # 연도를 빼면 다음 해의 같은 날짜에 ID가 충돌한다.
    return f"N-{date.replace('-', '')}-{seq:02d}"

def existing_keys_from(nodes: List[dict]) -> set:
    """이미 아카이브에 실린 글의 (제목 lower / url) 키. 재요약 방지용 중복 판정에 사용."""
    keys = set()
    for n in nodes:
        for s in n.get("sources", []):
            if s.get("title"):
                keys.add(s["title"].lower().strip())
            if s.get("url"):
                keys.add(s["url"].strip())
    return keys

REQUIRED_NODE_FIELDS = {
    "id", "topic", "title", "tags", "date", "popularity", "oneLiner",
    "keyPoints", "related", "sources", "similar",
}

def validate_nodes(nodes: List[dict]) -> None:
    """프론트엔드에 깨진 스키마를 배포하지 않도록 출력 전에 검증."""
    ids = set()
    for i, node in enumerate(nodes):
        missing = REQUIRED_NODE_FIELDS - set(node)
        if missing:
            raise ValueError(f"노드 {i}에 필드 누락: {sorted(missing)}")
        if node["id"] in ids:
            raise ValueError(f"중복 노드 ID: {node['id']}")
        ids.add(node["id"])
        if node["topic"] not in TOPIC_KEYS:
            raise ValueError(f"알 수 없는 topic: {node['topic']}")
        for field_name in ("tags", "keyPoints", "related", "sources", "similar"):
            if not isinstance(node[field_name], list):
                raise ValueError(f"{node['id']}.{field_name}는 배열이어야 함")
        for point in node["keyPoints"]:
            if not isinstance(point, str) or not point.strip():
                raise ValueError(f"{node['id']}.keyPoints에 빈 내용 또는 문자열이 아닌 값")
            if point.strip().startswith(("원문 제목:", "출처:")):
                raise ValueError(f"{node['id']}: 제목·출처는 핵심 내용이 아닙니다. --repair-summaries로 복구하세요")
    dangling = [(n["id"], target) for n in nodes for target in n["similar"] if target not in ids]
    if dangling:
        raise ValueError(f"존재하지 않는 similar 참조: {dangling[:3]}")

def relink_similar(nodes: List[dict], local: bool = False) -> None:
    """title+oneLiner+tags 텍스트를 재임베딩해 전체 노드(기존+신규)의 similar[]를 갱신.
    기존 노드는 원본 임베딩을 저장해두지 않으므로, 새로 만든 노드와 같은 기준으로
    다시 임베딩해야 유사도가 일관된다."""
    if not nodes:
        return
    texts = [f"{n['title']}\n{n.get('oneLiner','')}\n{' '.join(n.get('tags', []))}" for n in nodes]
    M = local_vectors(texts) if local else embed(texts)
    # N×N 행렬을 통째로 만들지 않고 블록별로 처리해 장기 아카이브에서도 메모리를 제한한다.
    for start in range(0, len(nodes), 256):
        scores = M[start:start + 256] @ M.T
        for local_i, row in enumerate(scores):
            i = start + local_i
            candidates = np.argpartition(-row, min(MAX_SIMILAR + 1, len(row) - 1))[:MAX_SIMILAR + 1]
            order = candidates[np.argsort(-row[candidates])]
            nodes[i]["similar"] = [nodes[j]["id"] for j in order if j != i][:MAX_SIMILAR]

def build_nodes(days: int = 2, existing_nodes: Optional[List[dict]] = None,
                local: bool = False) -> List[dict]:
    existing_nodes = existing_nodes or []
    legacy = [node for node in existing_nodes
              if node.get("keyPoints") and needs_summary_repair(node)]
    if legacy:
        log(f"[복구] 기존 아카이브의 제목·출처 대체 요약 {len(legacy)}개 발견")
        repair_summaries(legacy, local=local)
    items = ingest(days=days, existing_keys=existing_keys_from(existing_nodes))
    log(f"[수집] 신규 {len(items)}건 (기존 아카이브 {len(existing_nodes)}개 노드와 중복 제외)")
    if not items:
        if existing_nodes:
            return existing_nodes
        raise RuntimeError("수집된 기사가 없어 빈 아카이브 생성을 중단합니다")

    if local:
        log("[로컬 군집화] 유사 제목 검사 중 …")
        clusters = cluster_local(items)
    else:
        log("[임베딩] 벡터 생성 중 …")
        vecs = embed([f"{it.title}\n{it.text}" for it in items])
        clusters = cluster(items, vecs)
    log(f"[군집화] {len(clusters)}개 군집 → 노드 후보 {len(clusters)}개")

    today = dt.date.today().isoformat()

    # 4. 요약 — 군집별로 병렬 호출(순차보다 훨씬 빠름). 진행 상황을 실시간 로그로.
    total = len(clusters)
    done = 0
    results = {}  # 군집 인덱스 -> 요약 dict

    def work(ci, idxs):
        group = [enrich_item(items[i]) for i in idxs]
        return ci, summarize_cluster_local(group) if local else summarize_cluster(group)

    with ThreadPoolExecutor(max_workers=SUMMARY_WORKERS) as pool:
        futures = [pool.submit(work, ci, idxs) for ci, idxs in enumerate(clusters)]
        for fut in as_completed(futures):
            done += 1
            try:
                ci, s = fut.result()
                results[ci] = s
                if done % 100 == 0 or done == total:
                    log(f"[요약] {done}/{total} 완료")
            except Exception as ex:
                log(f"[warn] {done}/{total} 요약 실패, 건너뜀: {ex}")

    # 날짜별 seq는 기존 아카이브에 이미 쓰인 번호 다음부터 이어서 부여 (id 충돌 방지)
    date_seq = {}
    for n in existing_nodes:
        date_seq[n["date"]] = max(date_seq.get(n["date"], 0), int(n["id"].split("-")[-1]))

    # 군집 순서대로 노드 조립(결과가 도착 순서라 다시 정렬)
    new_nodes = []
    for ci, idxs in enumerate(clusters):
        s = results.get(ci)
        if s is None:
            continue
        group = [items[i] for i in idxs]
        date = max((g.published for g in group if g.published), default=today)
        seq = date_seq.get(date, 0) + 1
        date_seq[date] = seq
        node = {
            "id": node_id(date, seq),
            "topic": s["topic"],
            "title": s["title"],
            "tags": s.get("tags", [])[:4],
            "date": date,
            "popularity": popularity(group),
            "oneLiner": s["oneLiner"],
            "keyPoints": s.get("keyPoints", []),
            "related": s.get("related", []),
            "sources": [{"title": g.title, "source": g.source, "url": g.url} for g in group],
            "similar": [],  # relink_similar()에서 채움
        }
        new_nodes.append(node)

    log(f"[요약] 신규 노드 {len(new_nodes)}개 생성")

    all_nodes = existing_nodes + new_nodes
    log("[연결] 전체 아카이브 유사 노드 재계산 중 …")
    relink_similar(all_nodes, local=local)
    all_nodes.sort(key=lambda n: (n["date"], n["popularity"]), reverse=True)
    return all_nodes


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GeekNews/HN 다이제스트 파이프라인")
    parser.add_argument("--days", type=int, default=int(os.environ.get("FETCH_DAYS", 2)),
                         help="GeekNews 아카이브를 며칠치 새로 긁을지 (기본 2일, 1회 백필은 365 등으로 크게)")
    parser.add_argument("--output", default=os.environ.get("NODES_JSON_PATH", "public/nodes.json"),
                         help="기존 아카이브를 읽고 결과를 저장할 nodes.json 경로")
    parser.add_argument("--fresh", action="store_true",
                         help="기존 아카이브를 무시하고 처음부터 새로 생성")
    parser.add_argument("--local", action="store_true",
                         help="OpenAI API 없이 규칙 기반 군집/추출 요약으로 생성")
    parser.add_argument("--repair-summaries", action="store_true",
                         help="신규 수집 없이 기존 노드의 빈 요약을 원문에서 복구")
    args = parser.parse_args()

    existing: List[dict] = []
    if not args.fresh and os.path.exists(args.output):
        try:
            with open(args.output, encoding="utf-8") as f:
                existing = json.load(f)
            log(f"[불러오기] 기존 아카이브 {len(existing)}개 노드 ({args.output})")
        except (OSError, json.JSONDecodeError) as ex:
            raise RuntimeError(f"기존 아카이브 로드 실패(덮어쓰지 않음): {ex}") from ex

    if args.repair_summaries:
        if args.fresh or not existing:
            parser.error("--repair-summaries는 기존 아카이브가 필요하며 --fresh와 함께 사용할 수 없습니다")
        repair_summaries(existing, local=args.local)
        result = existing
        relink_similar(result, local=args.local)
    else:
        result = build_nodes(days=args.days, existing_nodes=existing, local=args.local)
    validate_nodes(result)
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    temp_output = args.output + ".tmp"
    with open(temp_output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    os.replace(temp_output, args.output)
    log(f"[done] 총 {len(result)}개 노드 ({args.output}에 저장)")
