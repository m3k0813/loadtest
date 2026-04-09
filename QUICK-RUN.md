# 🚀 빠른 실행 가이드

## EC2에서 웹 대시보드로 실행하기

### 1️⃣ EC2 준비

```bash
cd ~/loadtest
git pull

# 환경 설정
./scripts/setup.sh
```

### 2️⃣ 웹 대시보드와 함께 테스트 실행

```bash
# 간단한 2분 테스트 (VU 10명)
./scripts/run-with-dashboard.sh scenarios/01-baseline.js 10 2m

# 중간 부하 (VU 50명, 5분)
./scripts/run-with-dashboard.sh scenarios/01-baseline.js 50 5m

# 높은 부하 (VU 100명, 10분)
./scripts/run-with-dashboard.sh scenarios/01-baseline.js 100 10m
```

### 3️⃣ 로컬에서 SSH 터널링 (새 터미널)

```bash
# EC2 퍼블릭 IP 확인
ssh -i your-key.pem ubuntu@<EC2-IP> "curl -s ifconfig.me"

# SSH 터널링
ssh -i /Users/minjeongjun/Downloads/truve.pem -L 5665:localhost:5665 ubuntu@<EC2-IP>
```

### 4️⃣ 브라우저에서 대시보드 열기

```
http://localhost:5665
```

---

## 📊 대시보드에서 볼 수 있는 정보

- 실시간 VU (가상 사용자) 수
- HTTP 요청 성공/실패율
- 응답 시간 (평균, p95, p99)
- RPS (초당 요청 수)
- 데이터 전송량
- Check 성공률

---

## 🎯 시나리오 선택

### Baseline (일반 트래픽)
```bash
./scripts/run-with-dashboard.sh scenarios/01-baseline.js 50 5m
```
- 공연 검색, 상세 조회, 아티스트 조회
- 일반적인 사용자 행동 패턴

### Queue Spike (대기열 급증)
```bash
./scripts/run-with-dashboard.sh scenarios/02-queue-spike.js 200 10m
```
- 티켓 오픈 시 대기열 진입 폭주
- KEDA 스케일링 테스트

### Ticketing (좌석 선점)
```bash
./scripts/run-with-dashboard.sh scenarios/03-ticketing-concurrency.js 100 10m
```
- 동시 좌석 선점 경합
- Redis Lock 성능 테스트

### E2E Flow (전체 플로우)
```bash
./scripts/run-with-dashboard.sh scenarios/04-e2e-flow.js 100 15m
```
- 대기열 → 티켓팅 → 예매 → 결제
- 실제 사용자 여정 완전 시뮬레이션

---

## 📈 결과 확인

테스트 완료 후:

```bash
# 결과 파일 확인
ls -lh results/

# 요약 정보 보기
cat results/*-summary.json | jq .

# 메트릭 보기
cat results/*-metrics.json | jq .
```

---

## ⚠️ 현재 알려진 이슈

1. **Home API (HTTP 500)** - `/api/musical/home` 엔드포인트 에러로 주석 처리
2. **Review API** - 리뷰 조회 API 에러로 주석 처리

백엔드 수정 후 시나리오 파일에서 주석 해제하면 됩니다.

---

## 🔥 지금 바로 시작!

```bash
# EC2에서
cd ~/loadtest
git pull
./scripts/setup.sh
./scripts/run-with-dashboard.sh scenarios/01-baseline.js 10 2m

# 로컬에서 (새 터미널)
ssh -i /path/to/key.pem -L 5665:localhost:5665 ubuntu@<EC2-IP>

# 브라우저
# http://localhost:5665
```
