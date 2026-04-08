# EC2에서 k6 부하 테스트 실행 가이드

## 📋 목차
1. [EC2 인스턴스 준비](#1-ec2-인스턴스-준비)
2. [k6 설치](#2-k6-설치)
3. [테스트 파일 업로드](#3-테스트-파일-업로드)
4. [테스트 실행](#4-테스트-실행)
5. [결과 확인](#5-결과-확인)

---

## 1. EC2 인스턴스 준비

### 1-1. EC2 인스턴스 생성

**권장 스펙:**
- **인스턴스 타입**: `c5.2xlarge` (vCPU 8개, 16GB RAM)
  - 대규모 테스트: `c5.4xlarge` 이상
  - 소규모 테스트: `c5.xlarge`
- **OS**: Ubuntu 22.04 LTS
- **스토리지**: 30GB gp3
- **보안 그룹**: 아웃바운드 HTTPS(443) 허용

```bash
# AWS CLI로 인스턴스 생성 (선택사항)
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type c5.2xlarge \
  --key-name your-key-name \
  --security-group-ids sg-xxxxx \
  --subnet-id subnet-xxxxx \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":30,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=k6-load-tester}]'
```

### 1-2. EC2 접속

```bash
# SSH 키 권한 설정
chmod 400 your-key.pem

# EC2 접속
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>
```

---

## 2. k6 설치

### 2-1. 시스템 업데이트

```bash
# 패키지 업데이트
sudo apt-get update
sudo apt-get upgrade -y

# 필수 도구 설치
sudo apt-get install -y wget curl git vim
```

### 2-2. k6 설치

```bash
# k6 GPG 키 추가
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69

# k6 저장소 추가
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list

# k6 설치
sudo apt-get update
sudo apt-get install k6 -y

# 설치 확인
k6 version
```

**예상 출력:**
```
k6 v0.48.0 (go1.21.5, linux/amd64)
```

---

## 3. 테스트 파일 업로드

### 3-1. Git으로 프로젝트 클론 (권장)

```bash
# 작업 디렉토리 생성
mkdir -p ~/truve
cd ~/truve

# Git 설치 (이미 설치됨)
# 프로젝트 클론
git clone https://github.com/your-org/truve.git
cd truve/load-tests

# 또는 특정 브랜치
git clone -b load-test https://github.com/your-org/truve.git
```

### 3-2. SCP로 파일 업로드 (로컬에서 실행)

```bash
# 로컬 머신에서 실행
cd /Users/minjeongjun/projects/truve

# load-tests 전체 업로드
scp -i your-key.pem -r load-tests ubuntu@<EC2-PUBLIC-IP>:~/
```

### 3-3. 파일 구조 확인

```bash
# EC2에서 확인
cd ~/load-tests
tree -L 2

# 실행 권한 부여
chmod +x run-local.sh run-k8s.sh
```

---

## 4. 테스트 실행

### 4-1. 환경 변수 설정

```bash
# 환경 변수 파일 생성
cat > .env << 'EOF'
BASE_URL=https://gateway.truve.site
TEST_SHOW_ID=show-12345
TEST_SHOW_SCHEDULE_ID=123
EOF

# 환경 변수 로드
export $(cat .env | xargs)

# 확인
echo $BASE_URL
```

### 4-2. 단일 시나리오 실행

#### 옵션 1: 직접 k6 실행

```bash
# Baseline 테스트
k6 run \
  --env BASE_URL=$BASE_URL \
  --env TEST_SHOW_ID=$TEST_SHOW_ID \
  --env TEST_SHOW_SCHEDULE_ID=$TEST_SHOW_SCHEDULE_ID \
  --out json=results/baseline-$(date +%Y%m%d-%H%M%S).json \
  scenarios/01-baseline.js
```

#### 옵션 2: 실행 스크립트 사용 (권장)

```bash
# Baseline 테스트
./run-local.sh baseline production

# Queue Spike 테스트
./run-local.sh queue production

# Ticketing Concurrency 테스트
./run-local.sh ticketing production

# End-to-End 테스트
./run-local.sh e2e production
```

### 4-3. 모든 시나리오 순차 실행

```bash
# 모든 테스트 실행 (약 2시간 소요)
./run-local.sh all production
```

### 4-4. 백그라운드 실행 (장시간 테스트)

```bash
# nohup으로 백그라운드 실행
nohup ./run-local.sh e2e production > e2e-test.log 2>&1 &

# 프로세스 ID 확인
echo $!

# 로그 실시간 확인
tail -f e2e-test.log

# 프로세스 확인
ps aux | grep k6

# 프로세스 종료 (필요시)
kill <PID>
```

### 4-5. tmux 사용 (세션 유지)

```bash
# tmux 설치
sudo apt-get install tmux -y

# tmux 세션 시작
tmux new -s loadtest

# 테스트 실행
./run-local.sh e2e production

# 세션에서 나가기 (테스트는 계속 실행)
# Ctrl+B, D 키 입력

# SSH 재접속 후 세션 복구
tmux attach -t loadtest

# 세션 목록 확인
tmux ls
```

---

## 5. 결과 확인

### 5-1. 테스트 진행 상황 모니터링

```bash
# 실시간 로그 확인
tail -f e2e-test.log

# 결과 파일 확인
ls -lh results/

# 최신 결과 파일 내용 확인
cat results/*.json | jq '.metrics.http_req_duration.values'
```

### 5-2. 결과 다운로드 (로컬에서 실행)

```bash
# 로컬 머신에서 실행
scp -i your-key.pem -r ubuntu@<EC2-PUBLIC-IP>:~/load-tests/results ./local-results
```

### 5-3. 주요 메트릭 확인

```bash
# P95 Latency 확인
cat results/04-e2e-flow-metrics.json | jq '.p95_journey_time_sec'

# 전체 성공률 확인
cat results/04-e2e-flow-metrics.json | jq '.overall_success_rate'

# 에러율 확인
cat results/01-baseline-summary.json | jq '.metrics.http_req_failed.values.rate'
```

---

## 🚀 빠른 시작 (전체 명령어)

EC2 생성부터 테스트 실행까지 한번에:

```bash
# 1. EC2 접속
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>

# 2. k6 설치 스크립트 실행
curl -s https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6 -y

# 3. 테스트 파일 업로드 (로컬에서)
# scp -i your-key.pem -r load-tests ubuntu@<EC2-PUBLIC-IP>:~/

# 4. 테스트 실행
cd ~/load-tests
./run-local.sh e2e production

# 5. tmux로 세션 유지하며 실행
tmux new -s loadtest
./run-local.sh all production
# Ctrl+B, D로 나가기
```

---

## 📊 권장 실행 순서

### Phase 1: 준비 및 검증 (10분)
```bash
# 1. Baseline 테스트로 시스템 정상 확인
./run-local.sh baseline production

# 2. 결과 확인
cat results/01-baseline-summary.json | jq '.metrics.http_req_duration.values."p(95)"'
```

### Phase 2: 개별 시나리오 (1시간)
```bash
# 1. Queue Spike 테스트
./run-local.sh queue production
sleep 300  # 5분 대기

# 2. Ticketing Concurrency 테스트
./run-local.sh ticketing production
sleep 300

# 3. 결과 수집
ls -lh results/
```

### Phase 3: 통합 테스트 (30분)
```bash
# End-to-End 테스트
./run-local.sh e2e production

# 최종 결과 분석
cat results/04-e2e-flow-metrics.json | jq '.'
```

---

## 🔍 모니터링

### EC2 리소스 모니터링

```bash
# CPU/메모리 실시간 모니터링
htop

# htop 설치
sudo apt-get install htop -y

# 네트워크 사용량
sudo apt-get install nethogs -y
sudo nethogs

# 디스크 사용량
df -h

# k6 프로세스 리소스 사용량
top -p $(pgrep k6)
```

### Grafana 대시보드 (선택사항)

EC2에서 테스트 실행 중 브라우저에서 Grafana 모니터링:

```
https://grafana.truve.site/
```

주요 메트릭:
- RPS (Requests Per Second)
- P95/P99 Latency
- Error Rate
- Pod Auto Scaling 상태

---

## ⚠️ 주의사항

### 1. 비용 관리
```bash
# 테스트 완료 후 EC2 중지
# AWS Console에서 인스턴스 중지

# 또는 AWS CLI
aws ec2 stop-instances --instance-ids i-xxxxx
```

### 2. 네트워크 대역폭
- EC2에서 대량 트래픽 발생 시 AWS 요금 주의
- 테스트 전 예상 데이터 전송량 계산

### 3. 프로덕션 보호
```bash
# Staging 환경에서 먼저 테스트
export BASE_URL=https://staging.gateway.truve.site
./run-local.sh e2e staging

# 프로덕션은 업무 시간 외에 실행 권장
```

### 4. Rate Limiting 확인
- API Gateway Rate Limit 확인
- 필요시 임시 증가 요청

---

## 🐛 트러블슈팅

### k6 실행 오류
```bash
# 권한 문제
chmod +x scenarios/*.js

# 파일 경로 확인
pwd
ls -la scenarios/

# 절대 경로로 실행
k6 run /home/ubuntu/load-tests/scenarios/01-baseline.js
```

### 메모리 부족
```bash
# 스왑 메모리 추가
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 확인
free -h
```

### 연결 타임아웃
```bash
# DNS 확인
nslookup gateway.truve.site

# 연결 테스트
curl -I https://gateway.truve.site/api/musical/home

# 방화벽 확인
sudo ufw status
```

---

## 📝 테스트 체크리스트

### 실행 전
- [ ] EC2 인스턴스 타입 적절한지 확인 (최소 c5.xlarge)
- [ ] k6 설치 완료
- [ ] 테스트 파일 업로드 완료
- [ ] 환경 변수 설정 완료
- [ ] Staging 환경에서 사전 테스트
- [ ] Grafana 대시보드 접속 확인

### 실행 중
- [ ] tmux/nohup으로 세션 유지
- [ ] htop으로 리소스 모니터링
- [ ] Grafana에서 실시간 메트릭 확인
- [ ] 에러 로그 모니터링

### 실행 후
- [ ] 결과 파일 로컬로 다운로드
- [ ] 주요 메트릭 분석
- [ ] 임계값 통과 여부 확인
- [ ] EC2 인스턴스 중지
- [ ] 보고서 작성

---

## 📞 지원

문제 발생 시:
1. 로그 파일 확인: `tail -f e2e-test.log`
2. GitHub Issues 등록
3. 개발팀 Slack 채널 문의
