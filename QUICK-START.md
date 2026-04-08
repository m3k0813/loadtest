# 🚀 빠른 시작 가이드

## 1분 요약

```bash
# 1. EC2 생성 (AWS Console 또는 CLI)
# 타입: c5.2xlarge, OS: Ubuntu 22.04

# 2. EC2 접속
ssh -i your-key.pem ubuntu@<EC2-IP>

# 3. 자동 설정 실행
curl -fsSL https://raw.githubusercontent.com/your-org/truve/main/load-tests/setup-ec2.sh | bash

# 4. 테스트 파일 업로드 (로컬에서)
scp -i your-key.pem -r load-tests ubuntu@<EC2-IP>:~/truve/

# 5. 테스트 실행 (EC2에서)
cd ~/truve/load-tests
./run-local.sh e2e production
```

---

## 실행 순서 요약

### 📍 Phase 1: EC2 준비 (5분)
1. EC2 인스턴스 생성 (`c5.2xlarge`, Ubuntu 22.04)
2. SSH 접속
3. `setup-ec2.sh` 실행 → k6 자동 설치

### 📍 Phase 2: 파일 업로드 (1분)
```bash
# 로컬 머신에서
scp -i key.pem -r load-tests ubuntu@<IP>:~/truve/
```

### 📍 Phase 3: 테스트 실행 (30분~2시간)
```bash
# EC2에서
cd ~/truve/load-tests

# 옵션 A: 개별 실행
./run-local.sh baseline production    # 35분
./run-local.sh queue production       # 18분
./run-local.sh ticketing production   # 18분
./run-local.sh e2e production         # 30분

# 옵션 B: 전체 실행
./run-local.sh all production         # ~2시간
```

### 📍 Phase 4: 결과 확인 (5분)
```bash
# 결과 파일 확인
ls -lh results/

# 주요 메트릭 확인
cat results/04-e2e-flow-metrics.json | jq .

# 로컬로 다운로드
scp -i key.pem -r ubuntu@<IP>:~/truve/load-tests/results ./
```

---

## 실행 명령어 치트시트

### k6 직접 실행
```bash
# Baseline
k6 run --env BASE_URL=https://gateway.truve.site scenarios/01-baseline.js

# Queue Spike
k6 run --env BASE_URL=https://gateway.truve.site scenarios/02-queue-spike.js

# Ticketing
k6 run --env BASE_URL=https://gateway.truve.site scenarios/03-ticketing-concurrency.js

# E2E
k6 run --env BASE_URL=https://gateway.truve.site scenarios/04-e2e-flow.js
```

### 스크립트 실행
```bash
# 환경별 실행
./run-local.sh e2e local       # 로컬
./run-local.sh e2e staging     # 스테이징
./run-local.sh e2e production  # 프로덕션

# 백그라운드 실행
nohup ./run-local.sh e2e production > test.log 2>&1 &

# tmux 사용
tmux new -s test
./run-local.sh e2e production
# Ctrl+B, D (나가기)
tmux attach -s test (다시 접속)
```

---

## 뭘 실행해야 하나?

### 시나리오별 목적

| 시나리오 | 파일 | 목적 | 소요시간 | 권장순서 |
|---------|------|------|---------|---------|
| **Baseline** | `01-baseline.js` | 정상 트래픽 성능 측정 | 35분 | 1번 |
| **Queue Spike** | `02-queue-spike.js` | 대기열 급증 대응 테스트 | 18분 | 2번 |
| **Ticketing** | `03-ticketing-concurrency.js` | 좌석 선점 경쟁 테스트 | 18분 | 3번 |
| **E2E** | `04-e2e-flow.js` | 전체 플로우 통합 테스트 | 30분 | 4번 |

### 추천 실행 전략

#### 🔰 처음 테스트하는 경우
```bash
# 1. Baseline으로 시스템 정상 확인
./run-local.sh baseline staging

# 2. E2E로 전체 플로우 확인
./run-local.sh e2e staging

# 3. 문제 없으면 프로덕션
./run-local.sh e2e production
```

#### 🎯 특정 기능만 테스트
```bash
# 대기열만
./run-local.sh queue production

# 티켓팅만
./run-local.sh ticketing production
```

#### 🚀 전체 성능 검증
```bash
# 모든 시나리오 순차 실행
./run-local.sh all production
```

---

## 자주 묻는 질문

### Q1: 어떤 시나리오를 먼저 실행하나요?
**A:** `baseline` → `e2e` 순서로 실행하세요.

```bash
./run-local.sh baseline production  # 먼저
./run-local.sh e2e production       # 그 다음
```

### Q2: EC2 타입은 뭘 써야 하나요?
**A:**
- **테스트용**: `c5.xlarge` (4 vCPU, 8GB)
- **본격 부하**: `c5.2xlarge` (8 vCPU, 16GB) ✅ 권장
- **대규모**: `c5.4xlarge` (16 vCPU, 32GB)

### Q3: 프로덕션에 바로 실행해도 되나요?
**A:** 아니요! 반드시 `staging` 먼저 테스트하세요.

```bash
# 1단계: Staging
./run-local.sh baseline staging
./run-local.sh e2e staging

# 2단계: 문제 없으면 Production
./run-local.sh e2e production
```

### Q4: 테스트 중간에 끊기면 어떻게 하나요?
**A:** `tmux` 또는 `nohup` 사용하세요.

```bash
# tmux 사용 (권장)
tmux new -s loadtest
./run-local.sh all production
# Ctrl+B, D (세션에서 나가기)

# SSH 재접속 후
tmux attach -s loadtest
```

### Q5: 결과는 어떻게 확인하나요?
**A:** `results/` 디렉토리에 JSON 파일로 저장됩니다.

```bash
# 결과 확인
cat results/04-e2e-flow-metrics.json | jq .

# 주요 지표
cat results/04-e2e-flow-metrics.json | jq '{
  success_rate: .overall_success_rate,
  avg_journey_time: .avg_journey_time_sec,
  p95_journey_time: .p95_journey_time_sec
}'
```

---

## 실전 실행 예시

### 시나리오 1: 첫 부하 테스트
```bash
# 1. EC2 설정
ssh -i key.pem ubuntu@<IP>
curl -fsSL <setup-script-url> | bash

# 2. 파일 업로드 (로컬에서)
scp -i key.pem -r load-tests ubuntu@<IP>:~/truve/

# 3. Baseline 테스트 (EC2에서)
cd ~/truve/load-tests
./run-local.sh baseline staging

# 4. 결과 확인
cat results/01-baseline-summary.json | jq '.metrics.http_req_duration.values."p(95)"'

# 5. 문제 없으면 E2E
./run-local.sh e2e staging
```

### 시나리오 2: 프로덕션 검증
```bash
# tmux로 안전하게 실행
tmux new -s prod-test

# 전체 테스트 실행
cd ~/truve/load-tests
./run-local.sh all production

# 세션에서 나가기 (Ctrl+B, D)
# 테스트는 백그라운드에서 계속 실행

# 결과 대기 (약 2시간 후)
tmux attach -s prod-test

# 결과 다운로드 (로컬에서)
scp -i key.pem -r ubuntu@<IP>:~/truve/load-tests/results ./prod-results
```

### 시나리오 3: 특정 기능만 집중 테스트
```bash
# 티켓팅 동시성만 반복 테스트
for i in {1..5}; do
  echo "Run $i/5"
  ./run-local.sh ticketing production
  sleep 600  # 10분 대기
done

# 결과 분석
ls -lh results/03-ticketing-*
```

---

## 체크리스트

### ✅ 실행 전
- [ ] EC2 인스턴스 생성 완료 (c5.2xlarge 권장)
- [ ] k6 설치 완료 (`k6 version` 확인)
- [ ] 테스트 파일 업로드 완료
- [ ] 환경 변수 설정 완료 (`.env` 파일)
- [ ] Staging 환경에서 사전 테스트 완료
- [ ] Grafana 대시보드 접속 확인

### ✅ 실행 중
- [ ] tmux 또는 nohup으로 세션 유지
- [ ] `htop`으로 EC2 리소스 모니터링
- [ ] Grafana에서 실시간 메트릭 확인
- [ ] 에러 로그 주기적으로 확인

### ✅ 실행 후
- [ ] 결과 파일 로컬로 다운로드
- [ ] 주요 메트릭 분석 (P95, 성공률 등)
- [ ] 임계값 통과 여부 확인
- [ ] EC2 인스턴스 중지 (비용 절감)
- [ ] 보고서 작성

---

## 긴급 문제 해결

### 테스트가 시작되지 않음
```bash
# 1. k6 설치 확인
k6 version

# 2. 파일 존재 확인
ls -la scenarios/

# 3. 권한 확인
chmod +x run-local.sh
chmod +x scenarios/*.js

# 4. 직접 실행
k6 run scenarios/01-baseline.js
```

### 연결 오류
```bash
# DNS 확인
nslookup gateway.truve.site

# 연결 테스트
curl -I https://gateway.truve.site/api/musical/home

# 환경 변수 확인
echo $BASE_URL
```

### 메모리 부족
```bash
# 메모리 확인
free -h

# 스왑 추가
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

**이제 시작하세요! 🚀**

```bash
ssh -i your-key.pem ubuntu@<EC2-IP>
cd ~/truve/load-tests
./run-local.sh baseline production
```
