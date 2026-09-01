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
import os, sys, json, time, hashlib, datetime as dt
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from typing import List

import numpy as np
import requests
import feedparser
from openai import OpenAI

# timeout: 한 호출이 매달리면 60초 뒤 에러로 죽는다(무한 대기 방지)
# max_retries: 일시적 오류는 2번까지만 재시도
client = OpenAI(timeout=60, max_retries=2)  # OPENAI_API_KEY 환경변수 사용

SUMMARY_WORKERS = 4  # 요약 병렬 처리 개수(속도↑). 429가 잦으면 줄이세요.

def log(msg: str) -> None:
    """진행 로그는 stderr로 — '> nodes.json' 출력에 섞이지 않게."""
    print(msg, file=sys.stderr, flush=True)

EMBED_MODEL = "text-embedding-3-small"
CHAT_MODEL  = "gpt-4o-mini"           # 비용/품질 균형. 필요시 gpt-4o / gpt-4.1 로 상향
SIM_THRESHOLD = 0.62                  # 군집 병합 임계값(코사인). 높이면 군집이 잘게 쪼개짐
MAX_SIMILAR = 3                       # 노드당 유사 노드 개수

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
    """GeekNews RSS. (news.hada.io/rss/news)"""
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

def _to_iso(struct_time) -> str:
    if not struct_time:
        return dt.date.today().isoformat()
    return dt.date(*struct_time[:3]).isoformat()

def ingest() -> List[Item]:
    items: List[Item] = []
    for fn in (fetch_geeknews, fetch_hackernews):
        try:
            log(f"[수집] {fn.__name__} …")
            got = fn()
            items += got
            log(f"[수집] {fn.__name__}: {len(got)}건")
        except Exception as ex:  # 한 소스가 죽어도 파이프라인은 계속
            log(f"[warn] {fn.__name__} 실패: {ex}")
    # 제목 기준 대략적 중복 제거
    seen, uniq = set(), []
    for it in items:
        k = it.title.lower().strip()
        if k and k not in seen:
            seen.add(k); uniq.append(it)
    return uniq


# ------------------------------------------------------------------ #
# 2. 임베딩
# ------------------------------------------------------------------ #
def embed(texts: List[str]) -> np.ndarray:
    vecs = []
    for i in range(0, len(texts), 100):  # 배치
        chunk = [t[:8000] for t in texts[i:i + 100]]
        resp = client.embeddings.create(model=EMBED_MODEL, input=chunk)
        vecs += [d.embedding for d in resp.data]
    arr = np.array(vecs, dtype=np.float32)
    arr /= (np.linalg.norm(arr, axis=1, keepdims=True) + 1e-9)  # 정규화 → 내적=코사인
    return arr


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
    resp = client.chat.completions.create(
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


# ------------------------------------------------------------------ #
# 5 + 6. 노드 조립 · 연결 · 출력
# ------------------------------------------------------------------ #
def popularity(items: List[Item]) -> int:
    pts = max((it.points for it in items), default=0)
    score = 55 + min(40, pts // 8) + min(5, len(items) - 1)  # 대략적 정규화
    return int(max(0, min(99, score)))

def node_id(topic: str, date: str, seq: int) -> str:
    mmdd = date[5:7] + date[8:10]
    return f"N-{mmdd}-{seq:02d}"

def build_nodes() -> List[dict]:
    items = ingest()
    log(f"[수집] 총 {len(items)}건 (중복 제거 후)")
    if not items:
        return []

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
        group = [items[i] for i in idxs]
        return ci, summarize_cluster(group)

    with ThreadPoolExecutor(max_workers=SUMMARY_WORKERS) as pool:
        futures = [pool.submit(work, ci, idxs) for ci, idxs in enumerate(clusters)]
        for fut in as_completed(futures):
            done += 1
            try:
                ci, s = fut.result()
                results[ci] = s
                log(f"[요약] {done}/{total} 완료")
            except Exception as ex:
                log(f"[warn] {done}/{total} 요약 실패, 건너뜀: {ex}")

    # 군집 순서대로 노드 조립(결과가 도착 순서라 다시 정렬)
    nodes, node_vecs = [], []
    seq = 1
    for ci, idxs in enumerate(clusters):
        s = results.get(ci)
        if s is None:
            continue
        group = [items[i] for i in idxs]
        date = max((g.published for g in group if g.published), default=today)
        node = {
            "id": node_id(s["topic"], date, seq),
            "topic": s["topic"],
            "title": s["title"],
            "tags": s.get("tags", [])[:4],
            "date": date,
            "popularity": popularity(group),
            "oneLiner": s["oneLiner"],
            "keyPoints": s.get("keyPoints", []),
            "related": s.get("related", []),
            "sources": [{"title": g.title, "source": g.source, "url": g.url} for g in group],
            "similar": [],  # 아래에서 채움
        }
        nodes.append(node)
        node_vecs.append(vecs[idxs].mean(axis=0))
        seq += 1

    # 5. 유사 노드 연결
    if node_vecs:
        M = np.array(node_vecs); M /= (np.linalg.norm(M, axis=1, keepdims=True) + 1e-9)
        sim = M @ M.T
        for i, node in enumerate(nodes):
            order = np.argsort(-sim[i])
            node["similar"] = [nodes[j]["id"] for j in order if j != i][:MAX_SIMILAR]

    nodes.sort(key=lambda n: (n["date"], n["popularity"]), reverse=True)
    return nodes


if __name__ == "__main__":
    result = build_nodes()
    print(json.dumps(result, ensure_ascii=False, indent=2))  # stdout → nodes.json
    log(f"[done] {len(result)}개 노드 생성")