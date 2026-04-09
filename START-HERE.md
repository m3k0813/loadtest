# 🚀 EC2에서 바로 시작하기

EC2에 파일을 업로드했다면, 이제 아래 순서대로만 하면 됩니다!

---

## 📍 현재 상황
✅ EC2 인스턴스 준비 완료
✅ load-tests 폴더 업로드 완료
❓ 이제 뭐하지? → **여기부터 시작!**

---

## ⚡ 빠른 시작 (5분)

### 1️⃣ EC2 접속
```bash
ssh -i your-key.pem ubuntu@<EC2-IP>
```

### 2️⃣ 위치 확인
```bash
cd ~/truve/load-tests
ls -la

# 다음 파일들이 보여야 함:
# - scenarios/
# - config/
# - utils/
# - run-local.sh
```

### 3️⃣ k6 설치 (한 번만)
```bash
# k6 설치 스크립트 실행
curl -s https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6 -y

# 설치 확인
k6 version
```

### 4️⃣ 실행 권한 부여
```bash
chmod +x run-local.sh
chmod +x scripts/*.sh
```

### 5️⃣ 환경 설정
```bash
# .env 파일 생성
cp .env.template .env

# 편집
vim .env

# 최소한 이것만 수정:
# BASE_URL=https://gateway.truve.site  (실제 URL로)
# TEST_SHOW_ID=show-12345  (실제 공연 ID로)
# TEST_SHOW_SCHEDULE_ID=123  (실제 회차 ID로)
```

### 6️⃣ 첫 테스트 실행! 🎉
```bash
# 작은 부하로 시작 (1분 테스트)
k6 run --vus 10 --duration 1m scenarios/01-baseline.js

# 문제 없으면 정식 테스트
./run-local.sh baseline staging
```

---

## 🎯 상황별 실행 명령어

### 상황 1: "빨리 테스트만 하고 싶어요"
```bash
cd ~/truve/load-tests

# 가장 간단한 테스트 (1분)
k6 run --vus 10 --duration 1m \
  --env BASE_URL=https://gateway.truve.site \
  scenarios/01-baseline.js
```

### 상황 2: "실제 데이터로 제대로 하고 싶어요"
```bash
cd ~/truve/load-tests

# 1. 실제 데이터 자동 조회
./scripts/get-test-data.sh

# 2. 테스트 실행
./run-local.sh baseline staging
```

### 상황 3: "전체 테스트 돌려야 해요"
```bash
cd ~/truve/load-tests

# tmux로 백그라운드 실행
tmux new -s loadtest

# 전체 테스트 (약 2시간)
./run-local.sh all production

# 세션에서 나가기 (테스트는 계속)
# Ctrl+B, D

# 나중에 다시 붙기
tmux attach -s loadtest
```

---

## 📊 테스트 종류별 실행

### Baseline (일반 트래픽, 35분)
```bash
./run-local.sh baseline production
```

### Queue Spike (대기열 급증, 18분)
```bash
./run-local.sh queue production
```

### Ticketing (좌석 선점, 18분)
```bash
./run-local.sh ticketing production
```

### E2E (전체 플로우, 30분) ⭐ 권장
```bash
./run-local.sh e2e production
```

### All (전체, 약 2시간)
```bash
./run-local.sh all production
```

---

## 🔍 실시간 모니터링

### 터미널 1: 테스트 실행
```bash
tmux new -s loadtest
cd ~/truve/load-tests
./run-local.sh e2e production
```

### 터미널 2: 리소스 모니터링
```bash
# EC2에서 새 SSH 세션
ssh -i key.pem ubuntu@<EC2-IP>

# CPU/메모리 실시간 확인
htop

# htop 없으면 설치
sudo apt-get install htop -y
```

### 터미널 3: 결과 확인
```bash
# EC2에서 새 SSH 세션
ssh -i key.pem ubuntu@<EC2-IP>

cd ~/truve/load-tests/results

# 실시간 로그
tail -f *.log

# 완료된 결과
ls -lh
cat *-metrics.json | jq .
```

---

## 🎨 단계별 상세 가이드

### STEP 1: k6 설치 확인
```bash
# 설치되어 있는지 확인
k6 version

# 없으면 설치
sudo gpg -k
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69

echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6.list

sudo apt-get update
sudo apt-get install k6 -y

# 확인
k6 version
# 출력: k6 v0.48.0 (고 버전)
```

### STEP 2: 환경 설정
```bash
cd ~/truve/load-tests

# .env 파일이 있는지 확인
ls -la .env

# 없으면 템플릿에서 복사
cp .env.template .env

# 편집
vim .env

# i 키 눌러서 입력 모드
# 아래 값들 수정:
BASE_URL=https://gateway.truve.site  # 실제 Gateway URL
TEST_SHOW_ID=show-12345              # 실제 공연 ID
TEST_SHOW_SCHEDULE_ID=123            # 실제 회차 ID

# ESC 누르고 :wq 입력해서 저장
```

### STEP 3: 연결 테스트
```bash
# API 연결 확인
curl -I https://gateway.truve.site/api/musical/home

# 정상 응답:
# HTTP/2 200 OK

# 오류 응답:
# curl: (6) Could not resolve host  → DNS 문제
# HTTP/2 404                         → URL 오류
# HTTP/2 403                         → 접근 권한 문제
```

### STEP 4: 작은 부하로 검증
```bash
# 10명 동시 접속, 1분간 테스트
k6 run \
  --vus 10 \
  --duration 1m \
  --env BASE_URL=https://gateway.truve.site \
  scenarios/01-baseline.js

# 결과 확인
# http_req_duration..............: avg=XXXms  ← 응답시간
# http_req_failed................: XX.XX%     ← 에러율
# http_reqs......................: XXX        ← 총 요청수
```

### STEP 5: 본격 테스트
```bash
# 백그라운드 실행 (tmux 권장)
tmux new -s loadtest

# 테스트 실행
./run-local.sh e2e production

# 세션에서 나가기
# Ctrl+B 누르고, D 키

# SSH 연결 끊어져도 테스트는 계속 진행됨!
```

### STEP 6: 진행 상황 확인
```bash
# tmux 세션 다시 붙기
tmux attach -s loadtest

# 또는 로그 파일로 확인
tail -f ~/truve/load-tests/*.log
```

### STEP 7: 결과 다운로드
```bash
# 로컬 머신에서 실행
scp -i your-key.pem -r ubuntu@<EC2-IP>:~/truve/load-tests/results ./

# 결과 분석
cat results/04-e2e-flow-metrics.json | jq .
```

---

## ⚠️ 자주 발생하는 문제

### 문제 1: "k6: command not found"
```bash
# 해결: k6 설치
curl -s https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6 -y
```

### 문제 2: "permission denied: ./run-local.sh"
```bash
# 해결: 실행 권한 부여
chmod +x run-local.sh
chmod +x scripts/*.sh
```

### 문제 3: "Could not resolve host"
```bash
# 해결: .env 파일 확인
cat .env | grep BASE_URL

# URL 테스트
ping gateway.truve.site
nslookup gateway.truve.site
```

### 문제 4: "HTTP 401 Unauthorized"
```bash
# Queue/Ticketing API는 JWT 필요
# 해결 방법:
# 1. Musical API만 먼저 테스트 (JWT 불필요)
# 2. 백엔드 팀에 테스트 계정 요청
```

### 문제 5: "테스트가 너무 느려요"
```bash
# 해결: VU(가상 사용자) 수를 줄이기
k6 run --vus 10 --duration 2m scenarios/01-baseline.js

# 또는 시나리오 파일 수정
vim scenarios/01-baseline.js
# stages의 target 값을 낮춤
```

---

## 💡 유용한 팁

### Tip 1: 빠른 테스트
```bash
# 30초만 빠르게
k6 run --vus 5 --duration 30s scenarios/01-baseline.js
```

### Tip 2: 결과를 파일로 저장
```bash
k6 run scenarios/01-baseline.js --out json=result.json
```

### Tip 3: 여러 시나리오 순차 실행
```bash
# 스크립트 작성
cat > run-all.sh << 'EOF'
#!/bin/bash
./run-local.sh baseline production
sleep 300  # 5분 대기
./run-local.sh queue production
sleep 300
./run-local.sh ticketing production
sleep 300
./run-local.sh e2e production
EOF

chmod +x run-all.sh

# tmux에서 실행
tmux new -s loadtest
./run-all.sh
```

### Tip 4: 로그를 파일로 저장
```bash
nohup ./run-local.sh e2e production > test.log 2>&1 &

# 로그 확인
tail -f test.log
```

### Tip 5: EC2 종료 전 결과 백업
```bash
# 결과를 tar로 압축
cd ~/truve/load-tests
tar -czf results-$(date +%Y%m%d-%H%M).tar.gz results/

# 로컬로 다운로드
scp -i key.pem ubuntu@<EC2-IP>:~/truve/load-tests/results-*.tar.gz ./
```

---

## 🎯 지금 당장 할 명령어 (복사해서 붙여넣기)

```bash
# EC2 접속
ssh -i your-key.pem ubuntu@<EC2-IP>

# 위치 이동
cd ~/truve/load-tests

# k6 설치 (한 번만)
curl -s https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg && \
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list && \
sudo apt-get update && sudo apt-get install k6 tmux htop -y

# 실행 권한
chmod +x run-local.sh scripts/*.sh

# 빠른 테스트 (1분)
k6 run --vus 10 --duration 1m --env BASE_URL=https://gateway.truve.site scenarios/01-baseline.js

# 문제 없으면 본격 테스트
tmux new -s loadtest
./run-local.sh e2e production

# Ctrl+B, D 로 나가기
# tmux attach -s loadtest 로 다시 붙기
```

---

## ✅ 완료 체크리스트

- [ ] EC2 접속 완료
- [ ] `cd ~/truve/load-tests` 이동
- [ ] k6 설치 완료 (`k6 version` 확인)
- [ ] 실행 권한 부여 (`chmod +x run-local.sh`)
- [ ] 연결 테스트 성공 (`curl` 명령)
- [ ] 1분 테스트 성공 (10 VU)
- [ ] tmux 세션 시작
- [ ] 본격 테스트 실행
- [ ] 결과 다운로드

---

**지금 바로 시작하세요!** 🚀

```bash
cd ~/truve/load-tests
k6 run --vus 10 --duration 1m --env BASE_URL=https://gateway.truve.site scenarios/01-baseline.js
```
