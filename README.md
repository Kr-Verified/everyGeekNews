# 노드 — 긱뉴스 다이제스트

React + Vite 프론트엔드와, 매일 GeekNews/Hacker News를 수집·요약해 `public/nodes.json`을 갱신하는 Python 파이프라인으로 구성됩니다. Hacker News 이력은 Algolia HN Search API를 사용합니다.

## 로컬 개발

```bash
npm install
npm run dev
```

기본 검증:

```bash
python -m unittest discover
npm run build
```

파이프라인을 로컬에서 직접 돌려보려면:

```bash
pip install -r requirements.txt
OPENAI_API_KEY=sk-... python pipeline.py --output public/nodes.json
```

API 키 없이 규칙 기반 로컬 모드로도 실행할 수 있습니다:

```bash
python pipeline.py --local --output public/nodes.json
```

로컬 모드는 유사한 제목만 병합하고, 원문 제목과 본문의 첫 문장을 추출해 노드를
만듭니다. 수집 본문이 없는 링크는 원문 HTML에서 본문을 추가로 추출합니다.
키워드로 분야와 태그를 고르므로 API 모드의 의미 기반 군집·한국어 생성 요약과는
품질 차이가 있습니다. 영문 본문은 영문으로 추출되며, 접근 불가·본문 없음인 글은
요약 불가 안내와 빈 `keyPoints`를 저장합니다. 제목·출처를 핵심 내용으로 대체하지 않습니다.

기존 아카이브에서 제목·출처만 있거나 핵심 내용이 빈 요약을 복구하려면:

```bash
python pipeline.py --local --repair-summaries --output public/nodes.json
```

원문을 다시 읽어 요약만 갱신하며 노드 ID·날짜·출처는 유지합니다. 신규 기사를 수집하지
않습니다. 실패한 글은 빈 핵심 내용으로 남아 다음 복구 실행에서 재시도합니다.

파이프라인은 `--output` 경로의 기존 nodes.json을 읽어 **새 글만** 수집·요약해 누적 병합합니다
(하루 실행마다 `public/nodes.json`이 계속 자라나는 구조). 옵션:

- `--days N` : GeekNews/Hacker News 아카이브를 최근 며칠치 다시 긁을지. 기본 2일(매일 자동 실행용, 하루 경계 누락 방지를 위한 여유분).
  처음 한 번 과거 이력을 채우고 싶다면 1월 1일부터 오늘까지의 일수를 계산해 크게 주면 됩니다. API 모드는 요약 호출이 그만큼 늘어 시간·비용이 듭니다.
- `--fresh` : 기존 아카이브를 무시하고 처음부터 새로 생성.
- `--local` : OpenAI 호출 없이 결정적 규칙 기반 군집·추출 요약·유사도 계산을 사용.

예) 올해 데이터로 1회 백필:

```bash
OPENAI_API_KEY=sk-... python pipeline.py --output public/nodes.json --days 246 --fresh
```

API 키 없이 올해 데이터를 백필하는 예:

```bash
python pipeline.py --local --output public/nodes.json --days 246 --fresh
```

## 배포

### 1. GitHub

이 저장소를 GitHub에 push 합니다. 기본 자동화는 `--local` 모드라 API 키가
필요 없습니다. 향후 OpenAI 모드로 전환할 때만 Actions secret에
`OPENAI_API_KEY`를 등록하고, 키는 코드나 커밋에 넣지 않습니다.

### 2. GitHub Actions (파이프라인 자동 실행)

`.github/workflows/daily.yml` 이 매일 UTC 21:00(KST 06:00)에 파이프라인을 실행해
`public/nodes.json` 을 갱신하고 커밋·푸시합니다. Actions 탭에서 `workflow_dispatch` 로 수동 실행도 가능합니다.

### 3. Netlify (프론트엔드 정적 배포)

Netlify에서 이 저장소를 연결하면 `netlify.toml` 의 설정(`npm run build` → `dist/`)이 그대로 적용됩니다.
파이프라인이 `public/nodes.json` 을 갱신해 커밋하면, 다음 Netlify 빌드에 자동 반영됩니다.

## 참고

무료 티어 한도(Netlify 빌드 시간, GitHub Actions 분)는 자주 바뀌므로 배포 직전 각 서비스에서 현재 한도를 확인하세요.
