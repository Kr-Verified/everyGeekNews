# 노드 — 긱뉴스 다이제스트

React + Vite 프론트엔드와, 매일 GeekNews/Hacker News를 수집·요약해 `public/nodes.json`을 갱신하는 Python 파이프라인으로 구성됩니다.

## 로컬 개발

```bash
npm install
npm run dev
```

파이프라인을 로컬에서 직접 돌려보려면:

```bash
pip install -r requirements.txt
OPENAI_API_KEY=sk-... python pipeline.py > public/nodes.json
```

## 배포

### 1. GitHub

이 저장소를 GitHub에 push 합니다. Settings → Secrets and variables → Actions → New repository secret 에서
`OPENAI_API_KEY` 를 등록하세요. 키는 절대 코드나 커밋에 넣지 않습니다.

### 2. GitHub Actions (파이프라인 자동 실행)

`.github/workflows/daily.yml` 이 매일 UTC 21:00(KST 06:00)에 파이프라인을 실행해
`public/nodes.json` 을 갱신하고 커밋·푸시합니다. Actions 탭에서 `workflow_dispatch` 로 수동 실행도 가능합니다.

### 3. Netlify (프론트엔드 정적 배포)

Netlify에서 이 저장소를 연결하면 `netlify.toml` 의 설정(`npm run build` → `dist/`)이 그대로 적용됩니다.
파이프라인이 `public/nodes.json` 을 갱신해 커밋하면, 다음 Netlify 빌드에 자동 반영됩니다.

## 참고

무료 티어 한도(Netlify 빌드 시간, GitHub Actions 분)는 자주 바뀌므로 배포 직전 각 서비스에서 현재 한도를 확인하세요.
