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
 * 개인화 저장소 (Codex artifact storage → 일반 브라우저 localStorage 폴백)
 * ------------------------------------------------------------------ */
const store = {
  async get(k) {
    try {
      if (window.storage) { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; }
      const value = window.localStorage.getItem(k);
      return value ? JSON.parse(value) : null;
    }
    catch { return null; }
  },
  async set(k, v) {
    try {
      const value = JSON.stringify(v);
      if (window.storage) await window.storage.set(k, value, false);
      else window.localStorage.setItem(k, value);
    } catch {}
  },
};

/* ------------------------------------------------------------------ *
 * 유틸 — latest(가장 최근 노드 날짜)를 인자로 받아 계산한다.
 * (모듈 상수였던 LATEST가 이제는 fetch된 nodes에서 파생되는 런타임 값이라
 *  컴포넌트 트리에 prop으로 흘려보낸다.)
 * ------------------------------------------------------------------ */
function daysAgoLabel(dateStr, latest) {
  const diff = Math.round((new Date(latest) - new Date(dateStr)) / 86400000);
  if (diff <= 0) return "오늘";
  if (diff === 1) return "어제";
  return `${diff}일 전`;
}
function withinPeriod(dateStr, period, latest) {
  if (period === "all") return true;
  const diff = Math.round((new Date(latest) - new Date(dateStr)) / 86400000);
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
function NodeCard({ node, onOpen, read, bookmarked, onToggleBookmark, latest }) {
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
            <span className="flex items-center gap-1"><Layers size={13} /> 원문 {node.sources.length}개</span>
            <span className="flex items-center gap-1"><Link2 size={13} /> 유사 {node.similar.length}</span>
            <span className="flex items-center gap-1"><Clock size={13} /> {daysAgoLabel(node.date, latest)}</span>
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

function NodeDrawer({ nodeId, onClose, onNavigate, bookmarked, onToggleBookmark, nodeById, latest }) {
  const node = nodeId ? nodeById[nodeId] : null;
  useEffect(() => {
    if (!node) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [node, onClose]);
  if (!node) return null;

  const similarNodes = node.similar.map((id) => nodeById[id]).filter(Boolean);
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
            <span className="text-xs truncate" style={{ color: T.faint }}>{node.id} · {daysAgoLabel(node.date, latest)}</span>
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

          <Section title={`원본 출처 · ${node.sources.length}개`}>
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
                        <span className="text-xs" style={{ color: T.faint }}>{daysAgoLabel(sn.date, latest)}</span>
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
const MAX_GRAPH_NODES = 200;
function jitter(i) { return (((i * 2654435761) % 1000) / 1000 - 0.5); }

// Fruchterman-Reingold 방식: 이상적 간격 k를 노드 수에 맞춰 산정하고,
// 온도(temp)를 점점 낮춰가며 이동 폭을 줄이는 담금질(annealing)로 수렴시킨다.
// (이전 버전은 노드 수와 무관한 고정 반발력을 썼는데, 노드가 늘어나면
//  반발력이 중심 인력을 압도해 다수가 캔버스 경계에 뭉개지듯 겹쳐버렸다.)
function computeLayout(nodes, edges) {
  const pos = {};
  const n = nodes.length;
  const k = Math.sqrt((GW * GH) / Math.max(1, n)) * 0.9; // 노드당 적정 간격
  const topicKeys = [...new Set(nodes.map((n) => n.topic))];
  nodes.forEach((node, i) => {
    const ti = topicKeys.indexOf(node.topic);
    const a = (ti / Math.max(1, topicKeys.length)) * Math.PI * 2 + jitter(i) * 0.6;
    const r = Math.min(GW, GH) * 0.32;
    pos[node.id] = { x: GW / 2 + Math.cos(a) * r + jitter(i + 1) * 40, y: GH / 2 + Math.sin(a) * r + jitter(i + 7) * 40, vx: 0, vy: 0 };
  });

  let temp = Math.max(GW, GH) * 0.05;
  for (let it = 0; it < 280; it++) {
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const A = pos[nodes[i].id], B = pos[nodes[j].id];
        const dx = A.x - B.x, dy = A.y - B.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (k * k) / d, fx = (dx / d) * f, fy = (dy / d) * f;
        A.vx += fx; A.vy += fy; B.vx -= fx; B.vy -= fy;
      }
    edges.forEach((e) => {
      const A = pos[e.a], B = pos[e.b];
      const dx = A.x - B.x, dy = A.y - B.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d * d) / k, fx = (dx / d) * f, fy = (dy / d) * f;
      A.vx -= fx; A.vy -= fy; B.vx += fx; B.vy += fy;
    });
    nodes.forEach((node) => {
      const P = pos[node.id];
      P.vx += (GW / 2 - P.x) * 0.012; P.vy += (GH / 2 - P.y) * 0.012;
      const disp = Math.sqrt(P.vx * P.vx + P.vy * P.vy) || 0.01;
      const capped = Math.min(disp, temp); // 온도로 최대 이동 거리를 제한 → 튕겨나가지 않음
      P.x += (P.vx / disp) * capped; P.y += (P.vy / disp) * capped;
      P.vx = 0; P.vy = 0;
      P.x = Math.max(46, Math.min(GW - 46, P.x)); P.y = Math.max(34, Math.min(GH - 34, P.y));
    });
    temp *= 0.985;
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
                    <span className="flex items-center gap-1"><Layers size={12} /> 원문 {featured.sources.length}개</span>
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
const LIST_PAGE_SIZE = 200;

export default function App() {
  // 실데이터 — 빌드된 사이트에서는 public/nodes.json (GitHub Actions가 매일 갱신)을 가져온다.
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetch("/nodes.json")
      .then((r) => { if (!r.ok) throw new Error(`요청 실패: ${r.status}`); return r.json(); })
      .then((data) => setNodes(Array.isArray(data) ? data : []))
      .catch(() => { setNodes([]); setLoadError(true); })
      .finally(() => setLoading(false));
  }, []);

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const latest = useMemo(() => nodes.reduce((m, n) => (n.date > m ? n.date : m), "0000-00-00"), [nodes]);

  const [sort, setSort] = useState("time");
  const [view, setView] = useState("list"); // list | graph
  const [query, setQuery] = useState("");
  const [activeTopics, setActiveTopics] = useState(() => new Set());
  const [period, setPeriod] = useState("all");
  const [onlyBookmarks, setOnlyBookmarks] = useState(false);
  const [hideRead, setHideRead] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  const [visibleCriteria, setVisibleCriteria] = useState("");

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
    return nodes.filter((n) => {
      if (!withinPeriod(n.date, period, latest)) return false;
      if (activeTopics.size && !activeTopics.has(n.topic)) return false;
      if (onlyBookmarks && !bookmarkSet.has(n.id)) return false;
      if (hideRead && readSet.has(n.id)) return false;
      if (q) {
        const hay = (n.title + " " + n.oneLiner + " " + n.tags.join(" ") + " " + n.keyPoints.join(" ")).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [nodes, query, activeTopics, period, onlyBookmarks, hideRead, bookmarkSet, readSet, latest]);

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

  // 대량 아카이브는 카드를 한번에 전부 렌더링하지 않고 점진적으로 보여준다.
  // 검색·필터·정렬·뷰가 바뀌면 새 결과의 처음부터 다시 보이게 한다.
  const listCriteria = `${query}\u0000${[...activeTopics].sort().join(",")}\u0000${period}\u0000${onlyBookmarks}\u0000${hideRead}\u0000${sort}\u0000${view}`;
  const effectiveVisibleCount = visibleCriteria === listCriteria ? visibleCount : LIST_PAGE_SIZE;
  useEffect(() => {
    setVisibleCount(LIST_PAGE_SIZE);
    setVisibleCriteria(listCriteria);
  }, [listCriteria]);

  const visibleSorted = useMemo(() => sorted.slice(0, effectiveVisibleCount), [sorted, effectiveVisibleCount]);
  const visibleGrouped = useMemo(() => {
    if (!grouped) return [];
    let remaining = effectiveVisibleCount;
    return grouped.flatMap((g) => {
      if (remaining <= 0) return [];
      const shown = g.nodes.slice(0, remaining);
      remaining -= shown.length;
      return shown.length ? [{ ...g, total: g.nodes.length, nodes: shown }] : [];
    });
  }, [grouped, effectiveVisibleCount]);
  const hasMoreListNodes = view === "list" && effectiveVisibleCount < filtered.length;
  const showMore = () => {
    setVisibleCriteria(listCriteria);
    setVisibleCount(effectiveVisibleCount + LIST_PAGE_SIZE);
  };

  const dateLabel = useMemo(() => {
    if (!latest || latest === "0000-00-00") return "";
    const d = new Date(latest + "T00:00:00");
    const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${wd}요일`;
  }, [latest]);
  const todayNodes = useMemo(() => nodes.filter((n) => n.date === latest).sort((a, b) => b.popularity - a.popularity), [nodes, latest]);
  const weekNodes = useMemo(() => nodes.filter((n) => n.date !== latest && withinPeriod(n.date, "week", latest)).sort((a, b) => b.popularity - a.popularity).slice(0, 5), [nodes, latest]);
  const showBriefing = view === "list" && !query.trim() && activeTopics.size === 0 && period === "all" && !onlyBookmarks && !hideRead;

  const totalSources = nodes.reduce((s, n) => s + n.sources.length, 0);
  const activeFilterCount = activeTopics.size + (period !== "all" ? 1 : 0) + (onlyBookmarks ? 1 : 0) + (hideRead ? 1 : 0);
  const unread = nodes.filter((n) => !readSet.has(n.id)).length;

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
            const count = nodes.filter((n) => n.topic === key).length;
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: T.bg, color: T.faint }}>
        <div className="text-sm">노드를 불러오는 중…</div>
      </div>
    );
  }

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
        {loadError && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: "#FDEEEE", color: "#B23A3A", border: "1px solid #F3C9C9" }}>
            nodes.json을 불러오지 못했어요. public/nodes.json이 배포됐는지 확인해 주세요.
          </div>
        )}
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
                노드 <span style={{ color: T.ink, fontWeight: 600 }}>{filtered.length}</span>개 · 안 읽음 <span style={{ color: T.ink, fontWeight: 600 }}>{unread}</span> · 원문 {totalSources}개
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
              <div>
                {filtered.length > MAX_GRAPH_NODES && (
                  <div className="mb-3 rounded-lg px-3.5 py-2.5 text-xs" style={{ background: T.accentSoft, color: T.sub }}>
                    그래프 성능을 위해 조건에 맞는 {filtered.length}개 중 인기 노드 {MAX_GRAPH_NODES}개를 표시합니다.
                  </div>
                )}
                <GraphView
                  nodes={[...filtered].sort((a, b) => b.popularity - a.popularity).slice(0, MAX_GRAPH_NODES)}
                  onOpen={openNode} read={readSet} bookmarked={bookmarkSet}
                />
              </div>
            ) : sort === "topic" ? (
              <div>
                <div className="space-y-7">
                  {visibleGrouped.map((g) => (
                    <div key={g.topic}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="h-3.5 w-1 rounded-full" style={{ background: TOPICS[g.topic].color }} />
                        <h2 className="text-sm font-bold" style={{ color: T.ink }}>{TOPICS[g.topic].label}</h2>
                        <span className="text-xs" style={{ color: T.faint }}>{g.total}개</span>
                      </div>
                      <div className="space-y-3">
                        {g.nodes.map((n) => <NodeCard key={n.id} node={n} onOpen={openNode} read={readSet.has(n.id)} bookmarked={bookmarkSet.has(n.id)} onToggleBookmark={toggleBookmark} latest={latest} />)}
                      </div>
                    </div>
                  ))}
                </div>
                {hasMoreListNodes && (
                  <button onClick={showMore} className="mt-6 w-full rounded-lg py-3 text-sm font-semibold transition-colors"
                    style={{ background: T.surface, border: `1px solid ${T.borderStrong}`, color: T.ink }}>
                    {Math.min(LIST_PAGE_SIZE, filtered.length - effectiveVisibleCount)}개 더 보기
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div className="space-y-3">
                  {visibleSorted.map((n) => <NodeCard key={n.id} node={n} onOpen={openNode} read={readSet.has(n.id)} bookmarked={bookmarkSet.has(n.id)} onToggleBookmark={toggleBookmark} latest={latest} />)}
                </div>
                {hasMoreListNodes && (
                  <button onClick={showMore} className="mt-6 w-full rounded-lg py-3 text-sm font-semibold transition-colors"
                    style={{ background: T.surface, border: `1px solid ${T.borderStrong}`, color: T.ink }}>
                    {Math.min(LIST_PAGE_SIZE, filtered.length - effectiveVisibleCount)}개 더 보기
                  </button>
                )}
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

      <NodeDrawer nodeId={openId} onClose={() => setOpenId(null)} onNavigate={openNode} bookmarked={bookmarkSet} onToggleBookmark={toggleBookmark} nodeById={nodeById} latest={latest} />
    </div>
  );
}
