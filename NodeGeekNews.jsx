import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search, X, Layers, Link2, Flame, Clock, ExternalLink, Filter,
  ChevronRight, ArrowRight, Bookmark, Check, List, Network,
  CalendarDays, TrendingUp,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * 테마
 * ------------------------------------------------------------------ */
const T = {
  bg: "#F5F6F8", surface: "#FFFFFF", ink: "#1B1E26", sub: "#5B6472",
  faint: "#949BA7", border: "#E6E8EC", borderStrong: "#D4D8DE",
  accent: "#3A47D6", accentSoft: "#EEEFFC",
};

const TOPICS = {
  ai:   { label: "AI·머신러닝",      color: "#5B54E6" },
  web:  { label: "웹·프론트엔드",    color: "#0E93AE" },
  sys:  { label: "시스템·인프라",    color: "#BC6F17" },
  sec:  { label: "보안",             color: "#D14350" },
  oss:  { label: "오픈소스",         color: "#2C9E5B" },
  biz:  { label: "스타트업·비즈니스", color: "#8A55CE" },
  hw:   { label: "하드웨어",         color: "#556983" },
  lang: { label: "언어·툴링",        color: "#0E877C" },
};

/* ------------------------------------------------------------------ *
 * 샘플 노드 (실제 nodes.json과 동일한 형태 — 파이프라인 출력 드롭인용)
 * ------------------------------------------------------------------ */
const NODES = [
  { id:"N-0902-01", topic:"ai", title:"차세대 프론티어 모델 공개 임박, 성능·가격 동시 경쟁", tags:["LLM","OpenAI","추론"], date:"2026-09-02", popularity:97,
    oneLiner:"주요 랩들이 며칠 간격으로 신규 모델을 예고하며 벤치마크보다 실사용 비용이 승부처로 부상.",
    keyPoints:["장문 추론 성능은 상향 평준화, 이제 토큰당 단가와 지연시간이 차별점.","온디바이스·엣지 추론을 겨냥한 소형 고성능 모델 라인업이 동시에 확대.","평가 지표가 정형 벤치마크에서 에이전트 태스크 성공률로 이동하는 흐름."],
    related:["추론 비용 하락이 로컬 실행 노드(N-0831-02)와 직접 연결됨.","코딩 에이전트 경쟁(N-0901-03)의 기반 모델로 곧바로 흡수될 전망."],
    sources:[{title:"새 모델 라인업 티저 정리",source:"TechCrunch",url:"https://techcrunch.com"},{title:"가격 경쟁 분석",source:"The Information",url:"https://theinformation.com"},{title:"커뮤니티 초기 벤치 결과",source:"Hacker News",url:"https://news.ycombinator.com"}],
    similar:["N-0831-02","N-0901-03","N-0830-05"] },
  { id:"N-0902-02", topic:"lang", title:"TypeScript 컴파일러 네이티브 포팅으로 대규모 속도 개선", tags:["TypeScript","컴파일러","Go"], date:"2026-09-02", popularity:91,
    oneLiner:"타입 체크·빌드 속도를 겨냥한 네이티브 재작성 성과가 실측으로 공유되며 대형 코드베이스 반응 뜨거움.",
    keyPoints:["대규모 모노레포에서 타입 체크 시간이 수 배 단축됐다는 실측 보고 다수.","에디터 응답성(IntelliSense) 개선이 체감 생산성에 가장 큰 영향.","기존 tsc 대비 호환성 이슈 최소화가 채택 관건으로 지목."],
    related:["빌드 툴링 전반의 네이티브화 흐름(Rust/Go 기반)과 맥을 같이함.","프론트엔드 빌드 파이프라인 노드(N-0830-04)와 함께 보면 좋음."],
    sources:[{title:"네이티브 포팅 벤치마크",source:"GitHub Blog",url:"https://github.blog"},{title:"대형 코드베이스 적용기",source:"Hacker News",url:"https://news.ycombinator.com"}],
    similar:["N-0830-04","N-0831-04"] },
  { id:"N-0902-03", topic:"sec", title:"널리 쓰이는 라이브러리 연쇄 취약점 공개, 긴급 패치 권고", tags:["CVE","공급망","패치"], date:"2026-09-02", popularity:88,
    oneLiner:"핵심 오픈소스 의존성에서 원격 코드 실행 가능 취약점이 보고돼 광범위한 즉시 업데이트 필요.",
    keyPoints:["간접 의존성으로 노출되는 프로젝트가 많아 실제 영향 범위가 넓음.","PoC가 공개되며 익스플로잇 시도 증가, 패치 적용 시급성 상승.","SBOM으로 영향 자산을 빠르게 식별하는 조직이 대응에 유리."],
    related:["오픈소스 공급망 신뢰 이슈(N-0831-05)와 직접 이어짐.","의존성 자동 업데이트 정책 재점검 필요성 부각."],
    sources:[{title:"취약점 상세와 영향 범위",source:"Ars Technica",url:"https://arstechnica.com"},{title:"패치 가이드",source:"The Hacker News",url:"https://thehackernews.com"}],
    similar:["N-0831-05","N-0830-03"] },
  { id:"N-0901-03", topic:"ai", title:"AI 코딩 에이전트 경쟁 격화, 실무 워크플로우 침투", tags:["에이전트","코딩","IDE"], date:"2026-09-01", popularity:94,
    oneLiner:"터미널·에디터에 붙는 자율 코딩 에이전트가 늘며 리뷰·테스트까지 위임하는 사용 패턴 확산.",
    keyPoints:["단발 코드 생성보다 멀티스텝 작업 성공률이 핵심 경쟁축.","리포지토리 컨텍스트 이해와 도구 사용 능력이 체감 품질을 좌우.","권한·안전장치 설계가 실무 도입 신뢰의 전제 조건으로 부상."],
    related:["기반 프론티어 모델 경쟁(N-0902-01)의 직접적 수요처.","개발 생산성 툴링 노드(N-0830-04)와 겹치는 논의 다수."],
    sources:[{title:"에이전트 도구 비교",source:"TechCrunch",url:"https://techcrunch.com"},{title:"실무 도입 사례",source:"Hacker News",url:"https://news.ycombinator.com"}],
    similar:["N-0902-01","N-0830-04","N-0831-04"] },
  { id:"N-0901-04", topic:"web", title:"React 서버 컴포넌트 정착, 프레임워크 지형 재편", tags:["React","RSC","SSR"], date:"2026-09-01", popularity:82,
    oneLiner:"서버 컴포넌트가 여러 프레임워크에서 기본값에 가까워지며 데이터 패칭·번들 전략이 바뀌는 중.",
    keyPoints:["클라이언트 번들 축소와 서버 데이터 접근 단순화가 주된 이점으로 정리.","캐싱·스트리밍 모델 이해가 새로운 러닝커브로 지적됨.","메타프레임워크 선택이 아키텍처 결정을 크게 좌우."],
    related:["웹 빌드 툴링 노드(N-0830-04)와 함께 보면 전체 그림이 잡힘.","브라우저 표준 흐름(N-0829-02)과 간접 연결."],
    sources:[{title:"RSC 채택 현황",source:"Smashing Magazine",url:"https://smashingmagazine.com"},{title:"마이그레이션 회고",source:"Dev.to",url:"https://dev.to"}],
    similar:["N-0830-04","N-0829-02"] },
  { id:"N-0831-02", topic:"ai", title:"LLM 추론 비용 급락, 로컬·온프레미스 실행 현실화", tags:["추론","로컬LLM","양자화"], date:"2026-08-31", popularity:89,
    oneLiner:"양자화·커널 최적화로 소형 모델의 로컬 실행 품질이 올라오며 비용·프라이버시 이점이 부각.",
    keyPoints:["소비자 GPU·통합 메모리에서 실사용 가능한 품질의 모델이 늘어남.","온프레미스 실행이 데이터 통제·규제 대응 측면에서 매력.","추론 스택 최적화가 총소유비용을 크게 좌우."],
    related:["프론티어 모델 가격 경쟁(N-0902-01)과 반대편에서 시장을 넓힘.","온디바이스 AI 하드웨어(N-0830-05)와 직접 맞물림."],
    sources:[{title:"로컬 실행 벤치마크",source:"Hacker News",url:"https://news.ycombinator.com"},{title:"양자화 기법 정리",source:"arXiv 요약",url:"https://arxiv.org"}],
    similar:["N-0902-01","N-0830-05"] },
  { id:"N-0831-04", topic:"lang", title:"Rust, 커널·시스템 영역 채택 확대", tags:["Rust","커널","메모리안전"], date:"2026-08-31", popularity:85,
    oneLiner:"메모리 안전성을 앞세운 Rust가 커널 드라이버·시스템 소프트웨어로 영역을 넓히며 논쟁도 함께 확대.",
    keyPoints:["안전성 이점 대비 학습·통합 비용을 둘러싼 현장 논쟁이 지속.","기존 C 코드베이스와의 상호운용(FFI) 경험이 실무 관건.","툴링·빌드 생태계 성숙이 채택 속도를 좌우."],
    related:["TypeScript 네이티브 포팅(N-0902-02)과 함께 '시스템 언어 재무장' 흐름으로 읽힘.","오픈소스 거버넌스 논의(N-0831-05)와 간접 연결."],
    sources:[{title:"커널 채택 근황",source:"LWN",url:"https://lwn.net"},{title:"현장 도입 논쟁",source:"Hacker News",url:"https://news.ycombinator.com"}],
    similar:["N-0902-02","N-0901-03"] },
  { id:"N-0831-05", topic:"oss", title:"오픈소스 라이선스·지속가능성 논쟁 재점화", tags:["라이선스","거버넌스","펀딩"], date:"2026-08-31", popularity:76,
    oneLiner:"핵심 프로젝트의 라이선스 변경과 유지보수 인력 문제로 오픈소스 지속가능성 논의가 다시 달아오름.",
    keyPoints:["상용화 압박과 커뮤니티 신뢰 사이의 균형이 반복되는 쟁점.","소수 유지보수자에 의존하는 구조가 공급망 리스크로 직결.","지속가능한 펀딩 모델 실험이 여러 방향으로 진행 중."],
    related:["라이브러리 연쇄 취약점(N-0902-03)의 근본 배경과 맞닿음.","Rust 생태계 거버넌스(N-0831-04)와 함께 보면 유용."],
    sources:[{title:"라이선스 변경 파장",source:"The Register",url:"https://theregister.com"},{title:"유지보수 지속성 논의",source:"Hacker News",url:"https://news.ycombinator.com"}],
    similar:["N-0902-03","N-0831-04"] },
  { id:"N-0830-03", topic:"sys", title:"Postgres, 성능 개선과 벡터 검색 확장으로 존재감 강화", tags:["Postgres","벡터DB","인덱싱"], date:"2026-08-30", popularity:80,
    oneLiner:"관계형 강자가 벡터 검색·병렬 처리 개선을 흡수하며 '하나의 DB로 충분하다'는 흐름을 밀어붙임.",
    keyPoints:["벡터 확장 성숙으로 별도 벡터DB 없이도 RAG 워크로드 처리 가능성 확대.","쿼리 병렬화·인덱싱 개선이 대용량 처리 체감에 기여.","운영 단순화가 채택의 핵심 동인."],
    related:["AI 애플리케이션 스택 단순화 흐름과 직접 연결.","인프라 단순화 노드(N-0829-03)와 함께 보면 좋음."],
    sources:[{title:"신규 릴리스 하이라이트",source:"Postgres Weekly",url:"https://postgresweekly.com"},{title:"벡터 검색 벤치",source:"Hacker News",url:"https://news.ycombinator.com"}],
    similar:["N-0829-03","N-0902-01"] },
  { id:"N-0830-04", topic:"web", title:"웹 빌드 툴링, 네이티브 번들러로 세대교체 가속", tags:["번들러","Vite","성능"], date:"2026-08-30", popularity:78,
    oneLiner:"Rust·Go 기반 네이티브 번들러가 표준 자리를 놓고 경쟁하며 대형 프로젝트 빌드 시간이 크게 단축.",
    keyPoints:["콜드 스타트·HMR 속도가 개발 경험의 핵심 지표로 자리 잡음.","플러그인 생태계 호환성이 실제 이주 결정의 최대 변수.","테스트·번들·트랜스파일을 통합한 툴체인이 부상."],
    related:["TypeScript 네이티브 포팅(N-0902-02)과 같은 '툴링 네이티브화' 축.","React 서버 컴포넌트(N-0901-04)와 함께 프론트엔드 지형을 형성."],
    sources:[{title:"번들러 성능 비교",source:"Dev.to",url:"https://dev.to"},{title:"이주 사례 모음",source:"Hacker News",url:"https://news.ycombinator.com"}],
    similar:["N-0902-02","N-0901-04","N-0901-03"] },
  { id:"N-0830-05", topic:"hw", title:"차세대 실리콘, 온디바이스 AI 가속에 초점", tags:["칩","NPU","온디바이스"], date:"2026-08-30", popularity:83,
    oneLiner:"새 세대 프로세서가 NPU·메모리 대역폭을 강화하며 로컬 AI 실행을 하드웨어 차원에서 밀어붙임.",
    keyPoints:["통합 메모리·대역폭 향상이 로컬 대형 모델 실행의 병목을 완화.","전력 대비 성능이 노트북·엣지 기기 활용도를 결정.","소프트웨어 스택 최적화가 실측 성능을 좌우하는 변수로 지목."],
    related:["LLM 로컬 실행 노드(N-0831-02)와 직접 맞물림.","프론티어 모델 경쟁(N-0902-01)의 반대편 수요를 형성."],
    sources:[{title:"신규 칩 발표 정리",source:"AnandTech",url:"https://anandtech.com"},{title:"온디바이스 AI 벤치",source:"Hacker News",url:"https://news.ycombinator.com"}],
    similar:["N-0831-02","N-0902-01"] },
  { id:"N-0829-02", topic:"web", title:"브라우저 엔진 경쟁과 웹표준 진척", tags:["브라우저","표준","WASM"], date:"2026-08-29", popularity:71,
    oneLiner:"엔진 간 기능 격차가 좁혀지며 신규 표준 API와 WebAssembly 확장이 실사용 단계로 진입.",
    keyPoints:["상호운용성 개선으로 크로스브라우저 대응 부담이 점차 감소.","WASM의 서버·엣지 활용 확대가 새로운 배포 형태를 예고.","새 API의 프라이버시·보안 설계가 채택 논의의 중심."],
    related:["React 서버 컴포넌트(N-0901-04)와 함께 웹 실행 모델 변화를 형성.","빌드 툴링 네이티브화(N-0830-04)와 간접 연결."],
    sources:[{title:"웹표준 진행 상황",source:"web.dev",url:"https://web.dev"},{title:"WASM 서버사이드 확장",source:"Hacker News",url:"https://news.ycombinator.com"}],
    similar:["N-0901-04","N-0830-04"] },
  { id:"N-0829-03", topic:"sys", title:"Kubernetes 생태계, 복잡도 낮추는 방향으로 정리", tags:["Kubernetes","플랫폼","DevOps"], date:"2026-08-29", popularity:69,
    oneLiner:"과도한 운영 복잡도에 대한 피로가 쌓이며 '적정 규모' 플랫폼과 관리형 서비스로 무게중심 이동.",
    keyPoints:["모든 조직에 K8s가 정답은 아니라는 실용주의 논의가 확산.","내부 개발자 플랫폼(IDP)으로 복잡도를 추상화하는 접근 증가.","관리형 서비스 채택으로 운영 부담을 외주화하는 흐름."],
    related:["DB 스택 단순화(N-0830-03)와 같은 '단순화' 정서의 연장선.","인프라 비용 최적화 논의와 맞닿음."],
    sources:[{title:"운영 복잡도 회고",source:"InfoQ",url:"https://infoq.com"},{title:"플랫폼 엔지니어링 동향",source:"Hacker News",url:"https://news.ycombinator.com"}],
    similar:["N-0830-03"] },
  { id:"N-0829-04", topic:"biz", title:"스타트업 투자, AI 인프라·응용으로 집중", tags:["투자","AI스타트업","인프라"], date:"2026-08-29", popularity:74,
    oneLiner:"자금이 기반 모델보다 실사용 응용·인프라 계층으로 이동하며 수익화 경로가 심사 핵심으로 부상.",
    keyPoints:["'AI 래퍼'를 넘어선 워크플로우 통합·데이터 해자가 평가 기준.","추론 비용 구조가 사업 모델 지속성을 좌우하는 변수.","엔터프라이즈 도입 실적이 후속 투자 신뢰의 전제."],
    related:["추론 비용 하락(N-0831-02)이 응용 계층 수익성에 직접 영향.","코딩 에이전트 상용화(N-0901-03)가 대표 응용 사례로 거론."],
    sources:[{title:"펀딩 동향 리포트",source:"The Information",url:"https://theinformation.com"},{title:"투자 심사 관점",source:"TechCrunch",url:"https://techcrunch.com"}],
    similar:["N-0831-02","N-0901-03"] },
];

const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));
const LATEST = NODES.reduce((m, n) => (n.date > m ? n.date : m), "0000-00-00");

/* ------------------------------------------------------------------ *
 * 개인화 저장소 (window.storage → 없으면 인메모리로 안전 폴백)
 * ------------------------------------------------------------------ */
const store = {
  async get(k) {
    try { if (!window.storage) return null; const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; }
    catch { return null; }
  },
  async set(k, v) {
    try { if (!window.storage) return; await window.storage.set(k, JSON.stringify(v), false); } catch {}
  },
};

/* ------------------------------------------------------------------ *
 * 유틸
 * ------------------------------------------------------------------ */
function daysAgoLabel(dateStr) {
  const diff = Math.round((new Date(LATEST) - new Date(dateStr)) / 86400000);
  if (diff <= 0) return "오늘";
  if (diff === 1) return "어제";
  return `${diff}일 전`;
}
function withinPeriod(dateStr, period) {
  if (period === "all") return true;
  const diff = Math.round((new Date(LATEST) - new Date(dateStr)) / 86400000);
  return period === "today" ? diff <= 0 : diff <= 6;
}

/* ------------------------------------------------------------------ *
 * 작은 컴포넌트
 * ------------------------------------------------------------------ */
const TopicDot = ({ topic, size = 8 }) => (
  <span className="inline-block rounded-full shrink-0" style={{ width: size, height: size, background: TOPICS[topic].color }} />
);
const Tag = ({ children }) => (
  <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ background: "#F0F1F4", color: T.sub }}>{children}</span>
);
function PopBar({ value }) {
  const hot = value >= 90;
  return (
    <div className="flex items-center gap-1.5" title={`인기 지수 ${value}`}>
      <Flame size={13} style={{ color: hot ? "#E0663C" : T.faint }} />
      <div className="h-1 w-10 rounded-full overflow-hidden" style={{ background: "#EBEDF0" }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: hot ? "#E0663C" : T.accent }} />
      </div>
      <span className="text-xs tabular-nums" style={{ color: T.faint }}>{value}</span>
    </div>
  );
}
function StarBtn({ on, onClick }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="rounded-md p-1.5 transition-colors shrink-0"
      style={{ color: on ? T.accent : T.faint }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F0F1F4")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      aria-label={on ? "북마크 해제" : "북마크"}
    >
      <Bookmark size={16} fill={on ? T.accent : "none"} />
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * 노드 카드
 * ------------------------------------------------------------------ */
function NodeCard({ node, onOpen, read, bookmarked, onToggleBookmark }) {
  const open = () => onOpen(node.id);
  return (
    <div
      role="button" tabIndex={0} onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      className="group w-full text-left rounded-lg overflow-hidden cursor-pointer transition-shadow"
      style={{ background: T.surface, border: `1px solid ${T.border}`, opacity: read ? 0.64 : 1 }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(20,24,40,.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      <div className="flex">
        <div style={{ width: 4, background: TOPICS[node.topic].color }} />
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <TopicDot topic={node.topic} />
                <span className="text-xs font-medium" style={{ color: TOPICS[node.topic].color }}>{TOPICS[node.topic].label}</span>
                {read && (
                  <span className="flex items-center gap-0.5 text-xs" style={{ color: T.faint }}>
                    <Check size={11} /> 읽음
                  </span>
                )}
                <span className="text-xs" style={{ color: T.faint }}>· {node.id}</span>
              </div>
              <h3 className="text-[15px] font-semibold leading-snug" style={{ color: T.ink }}>{node.title}</h3>
            </div>
            <StarBtn on={bookmarked} onClick={() => onToggleBookmark(node.id)} />
          </div>

          <p className="mt-2 text-sm leading-relaxed" style={{ color: T.sub }}>{node.oneLiner}</p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {node.tags.map((t) => <Tag key={t}>{t}</Tag>)}
          </div>

          <div className="mt-3 pt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs" style={{ borderTop: `1px solid ${T.border}`, color: T.faint }}>
            <span className="flex items-center gap-1"><Layers size={13} /> 긱뉴스 {node.sources.length}개</span>
            <span className="flex items-center gap-1"><Link2 size={13} /> 유사 {node.similar.length}</span>
            <span className="flex items-center gap-1"><Clock size={13} /> {daysAgoLabel(node.date)}</span>
            <span className="ml-auto"><PopBar value={node.popularity} /></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 상세 드로어
 * ------------------------------------------------------------------ */
const Section = ({ title, children }) => (
  <div className="mb-6">
    <h4 className="text-xs font-semibold mb-2.5" style={{ color: T.faint }}>{title}</h4>
    {children}
  </div>
);

function NodeDrawer({ nodeId, onClose, onNavigate, bookmarked, onToggleBookmark }) {
  const node = nodeId ? NODE_BY_ID[nodeId] : null;
  useEffect(() => {
    if (!node) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [node, onClose]);
  if (!node) return null;

  const similarNodes = node.similar.map((id) => NODE_BY_ID[id]).filter(Boolean);
  const firstSimilar = similarNodes[0];
  const isBm = bookmarked.has(node.id);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0" style={{ background: "rgba(20,24,40,.32)" }} onClick={onClose} />
      <div className="relative h-full w-full max-w-xl overflow-y-auto" style={{ background: T.surface, boxShadow: "-8px 0 40px rgba(20,24,40,.18)" }}>
        <div style={{ height: 4, background: TOPICS[node.topic].color }} />
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3" style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}>
          <div className="flex items-center gap-2 min-w-0">
            <TopicDot topic={node.topic} />
            <span className="text-sm font-medium" style={{ color: TOPICS[node.topic].color }}>{TOPICS[node.topic].label}</span>
            <span className="text-xs truncate" style={{ color: T.faint }}>{node.id} · {daysAgoLabel(node.date)}</span>
          </div>
          <div className="flex items-center gap-1">
            <StarBtn on={isBm} onClick={() => onToggleBookmark(node.id)} />
            <button onClick={onClose} className="rounded-md p-1.5" style={{ color: T.sub }} aria-label="닫기"><X size={18} /></button>
          </div>
        </div>

        <div className="px-6 py-5">
          <h2 className="text-xl font-bold leading-snug" style={{ color: T.ink }}>{node.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {node.tags.map((t) => <Tag key={t}>{t}</Tag>)}
            <span className="ml-auto"><PopBar value={node.popularity} /></span>
          </div>

          <div className="mt-5 mb-6 rounded-lg p-4 text-[15px] leading-relaxed" style={{ background: T.accentSoft, color: T.ink }}>{node.oneLiner}</div>

          <Section title="핵심 내용">
            <ul className="space-y-2.5">
              {node.keyPoints.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed" style={{ color: T.ink }}>
                  <span className="mt-2 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: TOPICS[node.topic].color }} />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="관련 내용">
            <ul className="space-y-2 text-sm leading-relaxed" style={{ color: T.sub }}>
              {node.related.map((p, i) => (
                <li key={i} className="flex gap-2.5"><span style={{ color: T.faint }}>—</span><span>{p}</span></li>
              ))}
            </ul>
          </Section>

          <Section title={`원본 출처 · 긱뉴스 ${node.sources.length}개`}>
            <div className="space-y-2">
              {node.sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                   className="flex items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 transition-colors" style={{ border: `1px solid ${T.border}` }}
                   onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFB")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: T.ink }}>{s.title}</div>
                    <div className="text-xs" style={{ color: T.faint }}>{s.source}</div>
                  </div>
                  <ExternalLink size={15} className="shrink-0" style={{ color: T.faint }} />
                </a>
              ))}
            </div>
          </Section>

          {similarNodes.length > 0 && (
            <Section title={`유사 노드 ${similarNodes.length}개`}>
              <div className="relative pl-4">
                <div className="absolute left-[5px] top-1 bottom-3 w-px" style={{ background: T.borderStrong }} />
                <div className="space-y-1.5">
                  {similarNodes.map((sn) => (
                    <button key={sn.id} onClick={() => onNavigate(sn.id)}
                      className="group relative w-full text-left rounded-lg px-3 py-2.5 transition-colors"
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFB")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <span className="absolute rounded-full" style={{ left: -14, top: 15, width: 8, height: 8, background: TOPICS[sn.topic].color, border: `2px solid ${T.surface}` }} />
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium" style={{ color: TOPICS[sn.topic].color }}>{TOPICS[sn.topic].label}</span>
                        <span className="text-xs" style={{ color: T.faint }}>{daysAgoLabel(sn.date)}</span>
                      </div>
                      <div className="text-sm font-medium leading-snug" style={{ color: T.ink }}>{sn.title}</div>
                    </button>
                  ))}
                </div>
              </div>
              {firstSimilar && (
                <button onClick={() => onNavigate(firstSimilar.id)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-opacity"
                  style={{ background: T.ink, color: "#fff" }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                  이어서 보기 <ArrowRight size={15} />
                </button>
              )}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 그래프 뷰 — 정적 포스 레이아웃(결정론적) + 호버 하이라이트
 * ------------------------------------------------------------------ */
const GW = 760, GH = 460;
function jitter(i) { return (((i * 2654435761) % 1000) / 1000 - 0.5); }

function computeLayout(nodes, edges) {
  const pos = {};
  const topicKeys = [...new Set(nodes.map((n) => n.topic))];
  nodes.forEach((n, i) => {
    const ti = topicKeys.indexOf(n.topic);
    const a = (ti / Math.max(1, topicKeys.length)) * Math.PI * 2;
    const r = 130 + (i % 3) * 26;
    pos[n.id] = { x: GW / 2 + Math.cos(a) * r + jitter(i + 1) * 60, y: GH / 2 + Math.sin(a) * r + jitter(i + 7) * 60, vx: 0, vy: 0 };
  });
  for (let it = 0; it < 320; it++) {
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const A = pos[nodes[i].id], B = pos[nodes[j].id];
        let dx = A.x - B.x, dy = A.y - B.y, d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2);
        const f = 5200 / d2, fx = (dx / d) * f, fy = (dy / d) * f;
        A.vx += fx; A.vy += fy; B.vx -= fx; B.vy -= fy;
      }
    edges.forEach((e) => {
      const A = pos[e.a], B = pos[e.b];
      let dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f = (d - 92) * 0.02, fx = (dx / d) * f, fy = (dy / d) * f;
      A.vx += fx; A.vy += fy; B.vx -= fx; B.vy -= fy;
    });
    nodes.forEach((n) => {
      const P = pos[n.id];
      P.vx += (GW / 2 - P.x) * 0.002; P.vy += (GH / 2 - P.y) * 0.002;
      P.x += P.vx * 0.85; P.y += P.vy * 0.85; P.vx *= 0.85; P.vy *= 0.85;
      P.x = Math.max(46, Math.min(GW - 46, P.x)); P.y = Math.max(34, Math.min(GH - 34, P.y));
    });
  }
  return pos;
}

function GraphView({ nodes, onOpen, read, bookmarked }) {
  const [hover, setHover] = useState(null);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = useMemo(() => {
    const seen = new Set(), out = [];
    nodes.forEach((n) => n.similar.forEach((s) => {
      if (!ids.has(s)) return;
      const key = n.id < s ? `${n.id}|${s}` : `${s}|${n.id}`;
      if (seen.has(key)) return; seen.add(key);
      const [a, b] = key.split("|"); out.push({ a, b });
    }));
    return out;
  }, [nodes]);
  const pos = useMemo(() => computeLayout(nodes, edges), [nodes.map((n) => n.id).join(","), edges.length]);

  const neighbors = useMemo(() => {
    if (!hover) return null;
    const s = new Set([hover]);
    edges.forEach((e) => { if (e.a === hover) s.add(e.b); if (e.b === hover) s.add(e.a); });
    return s;
  }, [hover, edges]);

  if (nodes.length === 0) return null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
      <svg viewBox={`0 0 ${GW} ${GH}`} className="w-full" style={{ display: "block", touchAction: "manipulation" }}>
        {edges.map((e, i) => {
          const A = pos[e.a], B = pos[e.b];
          const active = neighbors && (neighbors.has(e.a) && neighbors.has(e.b) && (e.a === hover || e.b === hover));
          return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y}
            stroke={active ? T.accent : T.borderStrong}
            strokeWidth={active ? 1.6 : 1} strokeOpacity={neighbors ? (active ? 0.9 : 0.25) : 0.55} />;
        })}
        {nodes.map((n) => {
          const P = pos[n.id];
          const r = 7 + n.popularity / 14;
          const dim = neighbors && !neighbors.has(n.id);
          const isHover = hover === n.id;
          return (
            <g key={n.id} style={{ cursor: "pointer" }}
               onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
               onClick={() => onOpen(n.id)}>
              {bookmarked.has(n.id) && <circle cx={P.x} cy={P.y} r={r + 3.5} fill="none" stroke={T.accent} strokeWidth={1.5} opacity={dim ? 0.3 : 0.9} />}
              <circle cx={P.x} cy={P.y} r={r}
                fill={TOPICS[n.topic].color}
                opacity={dim ? 0.28 : read.has(n.id) ? 0.5 : 1}
                stroke="#fff" strokeWidth={isHover ? 2.5 : 1.5} />
              {(isHover || (neighbors && neighbors.has(n.id))) && (
                <text x={P.x} y={P.y - r - 6} textAnchor="middle"
                  style={{ fontSize: 11, fontWeight: 600, fill: T.ink, paintOrder: "stroke", stroke: "#fff", strokeWidth: 3, strokeLinejoin: "round" }}>
                  {n.title.length > 22 ? n.title.slice(0, 21) + "…" : n.title}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-4 py-3" style={{ borderTop: `1px solid ${T.border}` }}>
        {[...new Set(nodes.map((n) => n.topic))].map((t) => (
          <span key={t} className="flex items-center gap-1.5 text-xs" style={{ color: T.sub }}>
            <TopicDot topic={t} /> {TOPICS[t].label}
          </span>
        ))}
        <span className="ml-auto text-xs" style={{ color: T.faint }}>노드에 마우스를 올리면 연결이 보여요 · 클릭하면 열립니다</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 브리핑 — 오늘/이번주 소식 (홈 최상단)
 * ------------------------------------------------------------------ */
function BriefMini({ node, onOpen, read }) {
  return (
    <button onClick={() => onOpen(node.id)} className="text-left rounded-lg p-3 transition-colors"
      style={{ border: `1px solid ${T.border}`, opacity: read ? 0.64 : 1 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFB")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <div className="flex items-center gap-1.5 mb-1">
        <TopicDot topic={node.topic} />
        <span className="text-xs font-medium" style={{ color: TOPICS[node.topic].color }}>{TOPICS[node.topic].label}</span>
        <span className="ml-auto flex items-center gap-1 text-xs tabular-nums" style={{ color: T.faint }}>
          <Flame size={11} style={{ color: node.popularity >= 90 ? "#E0663C" : T.faint }} />{node.popularity}
        </span>
      </div>
      <div className="text-sm font-medium leading-snug" style={{ color: T.ink }}>{node.title}</div>
    </button>
  );
}

function Briefing({ dateLabel, todayNodes, weekNodes, onOpen, read }) {
  const featured = todayNodes[0];
  const restToday = todayNodes.slice(1);
  return (
    <section className="mb-5 rounded-xl overflow-hidden" style={{ background: T.surface, border: `1px solid ${T.border}` }}>
      {/* 오늘의 소식 */}
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays size={16} style={{ color: T.accent }} />
          <h2 className="text-sm font-bold" style={{ color: T.ink }}>오늘의 소식</h2>
          <span className="text-xs" style={{ color: T.faint }}>{dateLabel}</span>
          <span className="ml-auto text-xs rounded-full px-2 py-0.5" style={{ background: T.accentSoft, color: T.accent, fontWeight: 600 }}>{todayNodes.length}개</span>
        </div>

        {featured ? (
          <>
            <button onClick={() => onOpen(featured.id)} className="w-full text-left rounded-lg overflow-hidden transition-shadow"
              style={{ border: `1px solid ${T.border}`, opacity: read.has(featured.id) ? 0.64 : 1 }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(20,24,40,.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}>
              <div className="flex">
                <div style={{ width: 4, background: TOPICS[featured.topic].color }} />
                <div className="flex-1 p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TopicDot topic={featured.topic} />
                    <span className="text-xs font-medium" style={{ color: TOPICS[featured.topic].color }}>{TOPICS[featured.topic].label}</span>
                    <span className="text-xs" style={{ color: T.faint }}>· 오늘의 톱</span>
                    <span className="ml-auto"><PopBar value={featured.popularity} /></span>
                  </div>
                  <h3 className="text-base font-bold leading-snug" style={{ color: T.ink }}>{featured.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: T.sub }}>{featured.oneLiner}</p>
                  <div className="mt-2.5 flex items-center gap-4 text-xs" style={{ color: T.faint }}>
                    <span className="flex items-center gap-1"><Layers size={12} /> 긱뉴스 {featured.sources.length}개</span>
                    <span className="flex items-center gap-1"><Link2 size={12} /> 유사 {featured.similar.length}</span>
                  </div>
                </div>
              </div>
            </button>
            {restToday.length > 0 && (
              <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                {restToday.map((n) => <BriefMini key={n.id} node={n} onOpen={onOpen} read={read.has(n.id)} />)}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg px-4 py-6 text-center text-sm" style={{ background: "#FAFAFB", color: T.faint }}>
            오늘 올라온 노드가 아직 없어요. 아래에서 지난 소식을 확인하세요.
          </div>
        )}
      </div>

      {/* 이번주 소식 */}
      {weekNodes.length > 0 && (
        <div className="p-4 sm:p-5" style={{ borderTop: `1px solid ${T.border}`, background: "#FAFBFC" }}>
          <div className="flex items-center gap-2 mb-2.5">
            <TrendingUp size={16} style={{ color: T.sub }} />
            <h2 className="text-sm font-bold" style={{ color: T.ink }}>이번주 소식</h2>
            <span className="ml-auto text-xs" style={{ color: T.faint }}>인기순</span>
          </div>
          <div className="space-y-0.5">
            {weekNodes.map((n, i) => (
              <button key={n.id} onClick={() => onOpen(n.id)} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 transition-colors"
                style={{ opacity: read.has(n.id) ? 0.6 : 1 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F3F5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                <span className="w-4 text-center text-xs font-bold tabular-nums" style={{ color: T.faint }}>{i + 1}</span>
                <TopicDot topic={n.topic} />
                <span className="flex-1 min-w-0 text-sm font-medium truncate" style={{ color: T.ink }}>{n.title}</span>
                <span className="hidden sm:block"><PopBar value={n.popularity} /></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * 메인
 * ------------------------------------------------------------------ */
const SORTS = [{ key: "time", label: "시간순" }, { key: "pop", label: "인기순" }, { key: "topic", label: "주제순" }];
const PERIODS = [{ key: "all", label: "전체" }, { key: "today", label: "오늘" }, { key: "week", label: "이번 주" }];

export default function App() {
  const [sort, setSort] = useState("time");
  const [view, setView] = useState("list"); // list | graph
  const [query, setQuery] = useState("");
  const [activeTopics, setActiveTopics] = useState(() => new Set());
  const [period, setPeriod] = useState("all");
  const [onlyBookmarks, setOnlyBookmarks] = useState(false);
  const [hideRead, setHideRead] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [readSet, setReadSet] = useState(() => new Set());
  const [bookmarkSet, setBookmarkSet] = useState(() => new Set());
  const loaded = useRef(false);

  // 개인화 상태 로드
  useEffect(() => {
    (async () => {
      const r = await store.get("node:read");
      const b = await store.get("node:bookmarks");
      if (Array.isArray(r)) setReadSet(new Set(r));
      if (Array.isArray(b)) setBookmarkSet(new Set(b));
      loaded.current = true;
    })();
  }, []);
  useEffect(() => { if (loaded.current) store.set("node:read", [...readSet]); }, [readSet]);
  useEffect(() => { if (loaded.current) store.set("node:bookmarks", [...bookmarkSet]); }, [bookmarkSet]);

  const openNode = (id) => { setOpenId(id); setReadSet((p) => { if (p.has(id)) return p; const n = new Set(p); n.add(id); return n; }); };
  const toggleBookmark = (id) => setBookmarkSet((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleTopic = (t) => setActiveTopics((p) => { const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const clearFilters = () => { setActiveTopics(new Set()); setPeriod("all"); setQuery(""); setOnlyBookmarks(false); setHideRead(false); };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NODES.filter((n) => {
      if (!withinPeriod(n.date, period)) return false;
      if (activeTopics.size && !activeTopics.has(n.topic)) return false;
      if (onlyBookmarks && !bookmarkSet.has(n.id)) return false;
      if (hideRead && readSet.has(n.id)) return false;
      if (q) {
        const hay = (n.title + " " + n.oneLiner + " " + n.tags.join(" ") + " " + n.keyPoints.join(" ")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [query, activeTopics, period, onlyBookmarks, hideRead, bookmarkSet, readSet]);

  const sorted = useMemo(() => {
    const a = [...filtered];
    if (sort === "time") a.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    if (sort === "pop") a.sort((x, y) => y.popularity - x.popularity);
    return a;
  }, [filtered, sort]);

  const grouped = useMemo(() => {
    if (sort !== "topic" || view !== "list") return null;
    const map = {};
    filtered.forEach((n) => (map[n.topic] ||= []).push(n));
    return Object.keys(TOPICS).filter((t) => map[t]).map((t) => ({ topic: t, nodes: map[t].sort((a, b) => b.popularity - a.popularity) }));
  }, [filtered, sort, view]);

  const dateLabel = useMemo(() => {
    const d = new Date(LATEST + "T00:00:00");
    const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${wd}요일`;
  }, []);
  const todayNodes = useMemo(() => NODES.filter((n) => n.date === LATEST).sort((a, b) => b.popularity - a.popularity), []);
  const weekNodes = useMemo(() => NODES.filter((n) => n.date !== LATEST && withinPeriod(n.date, "week")).sort((a, b) => b.popularity - a.popularity).slice(0, 5), []);
  const showBriefing = view === "list" && !query.trim() && activeTopics.size === 0 && period === "all" && !onlyBookmarks && !hideRead;

  const totalSources = NODES.reduce((s, n) => s + n.sources.length, 0);
  const activeFilterCount = activeTopics.size + (period !== "all" ? 1 : 0) + (onlyBookmarks ? 1 : 0) + (hideRead ? 1 : 0);
  const unread = NODES.length - readSet.size;

  const ToggleRow = ({ on, onClick, label, count }) => (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors"
      style={{ background: on ? T.accentSoft : "transparent", color: on ? T.ink : T.sub, fontWeight: on ? 600 : 400 }}
      onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "#F5F6F8"; }}
      onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
      <span className="flex h-4 w-4 items-center justify-center rounded shrink-0" style={{ border: `1.5px solid ${on ? T.accent : T.borderStrong}`, background: on ? T.accent : "transparent" }}>
        {on && <Check size={11} color="#fff" />}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {count != null && <span className="text-xs tabular-nums" style={{ color: T.faint }}>{count}</span>}
    </button>
  );

  const FilterBody = (
    <>
      <div className="mb-5">
        <div className="text-xs font-semibold mb-2" style={{ color: T.faint }}>보기</div>
        <div className="space-y-0.5">
          <ToggleRow on={onlyBookmarks} onClick={() => setOnlyBookmarks((v) => !v)} label="북마크만" count={bookmarkSet.size} />
          <ToggleRow on={hideRead} onClick={() => setHideRead((v) => !v)} label="읽음 숨기기" count={readSet.size} />
        </div>
      </div>

      <div className="mb-5">
        <div className="text-xs font-semibold mb-2.5" style={{ color: T.faint }}>기간</div>
        <div className="flex gap-1.5">
          {PERIODS.map((p) => {
            const on = period === p.key;
            return <button key={p.key} onClick={() => setPeriod(p.key)} className="flex-1 rounded-md py-1.5 text-xs font-medium transition-colors"
              style={{ background: on ? T.ink : "#F0F1F4", color: on ? "#fff" : T.sub }}>{p.label}</button>;
          })}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold mb-2.5" style={{ color: T.faint }}>분야</div>
        <div className="space-y-1">
          {Object.entries(TOPICS).map(([key, meta]) => {
            const on = activeTopics.has(key);
            const count = NODES.filter((n) => n.topic === key).length;
            return (
              <button key={key} onClick={() => toggleTopic(key)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors"
                style={{ background: on ? meta.color + "18" : "transparent", color: on ? T.ink : T.sub, fontWeight: on ? 600 : 400 }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "#F5F6F8"; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: meta.color }} />
                <span className="flex-1 text-left">{meta.label}</span>
                <span className="text-xs tabular-nums" style={{ color: T.faint }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <button onClick={clearFilters} className="mt-5 w-full rounded-md py-2 text-xs font-medium" style={{ border: `1px solid ${T.border}`, color: T.sub }}>필터 초기화</button>
      )}
    </>
  );

  return (
    <div className="min-h-screen" style={{ background: T.bg, color: T.ink }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        button:focus-visible, a:focus-visible, input:focus-visible, [role="button"]:focus-visible {
          outline: 2px solid ${T.accent}; outline-offset: 2px; border-radius: 6px;
        }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      {/* 헤더 */}
      <header className="sticky top-0 z-40" style={{ background: "rgba(245,246,248,.85)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${T.border}` }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center gap-3 py-3">
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: T.ink }}><Link2 size={16} color="#fff" /></div>
              <div className="leading-none">
                <div className="text-[15px] font-bold" style={{ color: T.ink }}>노드</div>
                <div className="text-[10px]" style={{ color: T.faint }}>긱뉴스 다이제스트</div>
              </div>
            </div>

            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.faint }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="노드 검색 — 제목·태그·핵심 내용"
                className="w-full rounded-lg py-2 pl-9 pr-8 text-sm outline-none" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.ink }} />
              {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1" style={{ color: T.faint }} aria-label="지우기"><X size={14} /></button>}
            </div>

            <button onClick={() => setFiltersOpen(true)} className="lg:hidden flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium shrink-0" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.sub }}>
              <Filter size={15} />
              {activeFilterCount > 0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold" style={{ background: T.accent, color: "#fff" }}>{activeFilterCount}</span>}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <div className="flex gap-6">
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-20">
              <div className="rounded-xl p-4" style={{ background: T.surface, border: `1px solid ${T.border}` }}>{FilterBody}</div>
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            {showBriefing && (
              <Briefing dateLabel={dateLabel} todayNodes={todayNodes} weekNodes={weekNodes} onOpen={openNode} read={readSet} />
            )}

            {/* 정렬 / 뷰 전환 / 요약 */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {view === "list" && (
                <div className="flex rounded-lg p-0.5" style={{ background: "#ECEEF1" }}>
                  {SORTS.map((s) => {
                    const on = sort === s.key;
                    return <button key={s.key} onClick={() => setSort(s.key)} className="rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors"
                      style={{ background: on ? T.surface : "transparent", color: on ? T.ink : T.sub, boxShadow: on ? "0 1px 2px rgba(20,24,40,.08)" : "none" }}>{s.label}</button>;
                  })}
                </div>
              )}

              {/* 리스트 / 그래프 */}
              <div className="flex rounded-lg p-0.5" style={{ background: "#ECEEF1" }}>
                {[{ k: "list", I: List, l: "리스트" }, { k: "graph", I: Network, l: "그래프" }].map(({ k, I, l }) => {
                  const on = view === k;
                  return <button key={k} onClick={() => setView(k)} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                    style={{ background: on ? T.surface : "transparent", color: on ? T.ink : T.sub, boxShadow: on ? "0 1px 2px rgba(20,24,40,.08)" : "none" }}><I size={14} /> {l}</button>;
                })}
              </div>

              <div className="ml-auto text-sm" style={{ color: T.faint }}>
                노드 <span style={{ color: T.ink, fontWeight: 600 }}>{filtered.length}</span>개 · 안 읽음 <span style={{ color: T.ink, fontWeight: 600 }}>{unread}</span> · 긱뉴스 {totalSources}개
              </div>
            </div>

            {/* 본문 */}
            {filtered.length === 0 ? (
              <div className="rounded-xl px-6 py-16 text-center" style={{ background: T.surface, border: `1px dashed ${T.borderStrong}` }}>
                <div className="text-sm font-medium" style={{ color: T.ink }}>조건에 맞는 노드가 없어요</div>
                <div className="mt-1 text-sm" style={{ color: T.faint }}>검색어를 바꾸거나 필터를 넓혀보세요.</div>
                {activeFilterCount > 0 && <button onClick={clearFilters} className="mt-4 rounded-md px-4 py-2 text-sm font-medium" style={{ background: T.ink, color: "#fff" }}>필터 초기화</button>}
              </div>
            ) : view === "graph" ? (
              <GraphView nodes={filtered} onOpen={openNode} read={readSet} bookmarked={bookmarkSet} />
            ) : sort === "topic" ? (
              <div className="space-y-7">
                {grouped.map((g) => (
                  <div key={g.topic}>
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="h-3.5 w-1 rounded-full" style={{ background: TOPICS[g.topic].color }} />
                      <h2 className="text-sm font-bold" style={{ color: T.ink }}>{TOPICS[g.topic].label}</h2>
                      <span className="text-xs" style={{ color: T.faint }}>{g.nodes.length}개</span>
                    </div>
                    <div className="space-y-3">
                      {g.nodes.map((n) => <NodeCard key={n.id} node={n} onOpen={openNode} read={readSet.has(n.id)} bookmarked={bookmarkSet.has(n.id)} onToggleBookmark={toggleBookmark} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {sorted.map((n) => <NodeCard key={n.id} node={n} onOpen={openNode} read={readSet.has(n.id)} bookmarked={bookmarkSet.has(n.id)} onToggleBookmark={toggleBookmark} />)}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* 모바일 필터 시트 */}
      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex items-end">
          <div className="absolute inset-0" style={{ background: "rgba(20,24,40,.32)" }} onClick={() => setFiltersOpen(false)} />
          <div className="relative w-full rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto" style={{ background: T.surface }}>
            <div className="flex items-center justify-between mb-4">
              <div className="text-base font-bold" style={{ color: T.ink }}>필터</div>
              <button onClick={() => setFiltersOpen(false)} style={{ color: T.sub }} aria-label="닫기"><X size={20} /></button>
            </div>
            {FilterBody}
            <button onClick={() => setFiltersOpen(false)} className="mt-5 w-full rounded-lg py-2.5 text-sm font-semibold" style={{ background: T.ink, color: "#fff" }}>{filtered.length}개 노드 보기</button>
          </div>
        </div>
      )}

      <NodeDrawer nodeId={openId} onClose={() => setOpenId(null)} onNavigate={openNode} bookmarked={bookmarkSet} onToggleBookmark={toggleBookmark} />
    </div>
  );
}
