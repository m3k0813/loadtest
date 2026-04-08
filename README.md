# Truve 부하 테스트

Truve 뮤지컬 티켓팅 플랫폼의 Kubernetes 환경 부하 테스트 스크립트 모음입니다.

## 📁 디렉토리 구조

```
load-tests/
├── scenarios/           # k6 테스트 시나리오
│   ├── 01-baseline.js              # Baseline 성능 테스트
│   ├── 02-queue-spike.js           # 대기열 급증 테스트
│   ├── 03-ticketing-concurrency.js # 티켓팅 동시성 테스트
│   └── 04-e2e-flow.js              # End-to-End 플로우 테스트
├── utils/               # 유틸리티 함수
│   └── helpers.js
├── config/              # 설정 파일
│   └── config.js
├── k8s/                 # Kubernetes 매니페스트
│   ├── k6-configmap.yaml
│   ├── k6-distributed-test.yaml
│   ├── k6-operator-test.yaml
│   └── chaos-testing.yaml
├── results/             # 테스트 결과 (자동 생성)
├── run-local.sh         # 로컬 실행 스크립트
├── run-k8s.sh           # Kubernetes 실행 스크립트
└── README.md
```

## 🚀 빠른 시작

### 1. 사전 준비

#### 로컬 실행
```bash
# k6 설치 (macOS)
brew install k6

# k6 설치 (Linux)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

#### Kubernetes 실행
```bash
# kubectl이 설치되어 있어야 합니다
kubectl version

# k6 Operator 설치 (선택사항)
kubectl apply -f https://github.com/grafana/k6-operator/releases/latest/download/bundle.yaml
```

### 2. 로컬에서 테스트 실행

```bash
# 실행 권한 부여
chmod +x run-local.sh

# Baseline 테스트
./run-local.sh baseline local

# Queue Spike 테스트
./run-local.sh queue staging

# Ticketing Concurrency 테스트
./run-local.sh ticketing production

# End-to-End 테스트
./run-local.sh e2e production

# 모든 테스트 실행
./run-local.sh all production
```

### 3. Kubernetes에서 테스트 실행

```bash
# 실행 권한 부여
chmod +x run-k8s.sh

# 환경 설정
./run-k8s.sh setup

# 모든 시나리오 배포
./run-k8s.sh deploy all

# 특정 시나리오 시작
./run-k8s.sh start baseline

# 상태 확인
./run-k8s.sh status

# 로그 확인
./run-k8s.sh logs e2e

# 테스트 중지
./run-k8s.sh stop baseline

# 리소스 삭제
./run-k8s.sh delete
```

## 📊 테스트 시나리오

### 1. Baseline (01-baseline.js)
- **목적**: 정상 상태 성능 측정
- **부하**: 50 → 200 VU
- **기간**: 약 35분
- **주요 메트릭**: Musical 서비스 조회 성능, Cache Hit Rate

### 2. Queue Spike (02-queue-spike.js)
- **목적**: 대기열 진입 폭주 테스트
- **부하**: 초당 2000 req/s 스파이크
- **기간**: 약 18분
- **주요 메트릭**: Queue 진입 성능, KEDA 스케일링, Redis 성능

### 3. Ticketing Concurrency (03-ticketing-concurrency.js)
- **목적**: 좌석 선점 동시성 테스트
- **부하**: 700 VU (최대)
- **기간**: 약 18분
- **주요 메트릭**: Seat Hold 성공률, Lock 경합, Conflict 비율

### 4. End-to-End Flow (04-e2e-flow.js)
- **목적**: 전체 사용자 여정 테스트
- **부하**: 500 VU (최대)
- **기간**: 약 30분
- **주요 메트릭**: 전체 여정 완료율, 단계별 성공률, E2E 소요 시간

## 📈 모니터링

### Grafana 대시보드

테스트 실행 중 Grafana에서 다음 메트릭을 모니터링하세요:

```promql
# RPS (Requests Per Second)
sum(rate(http_requests_total{namespace="default"}[1m])) by (service)

# P95 Latency
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))

# Error Rate
sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m]))

# Pod Count (KEDA)
keda_scaledobject_paused{scaledobject="queue-service-scaler"}

# Redis Queue Length
redis_list_length{key=~"queue:.*"}

# Kafka Consumer Lag
kafka_consumergroup_lag{consumergroup="ticketing-consumer"}
```

### 실시간 로그 모니터링

```bash
# Queue Service 로그
kubectl logs -f -l app=queue-service -n default

# Ticketing Service 로그
kubectl logs -f -l app=ticketing-service -n default

# k6 테스트 로그
kubectl logs -f -l app=k6-load-test -n load-test
```

## 🎯 성능 목표

| 메트릭 | 목표 | 측정 위치 |
|--------|------|----------|
| P95 Latency | < 2s | 전체 API |
| P99 Latency | < 5s | 전체 API |
| Error Rate | < 2% | 전체 API |
| Queue 진입 | 1000 req/s | Queue Service |
| Seat Hold 성공률 | > 50% | Ticketing Service |
| Payment 성공률 | > 95% | Payment Service |

## 🔥 Chaos Engineering

부하 테스트 중 장애 주입으로 복원력 검증:

```bash
# Chaos 시나리오 배포
./run-k8s.sh chaos

# 배포된 Chaos 확인
kubectl get podchaos,networkchaos,stresschaos -n chaos-mesh

# 특정 Chaos 중지
kubectl delete podchaos queue-service-pod-kill -n chaos-mesh
```

### 주요 Chaos 시나리오

1. **Pod Kill**: Queue/Ticketing Service Pod 강제 종료
2. **Network Delay**: Redis 네트워크 100ms 지연
3. **CPU Stress**: Queue Service 80% CPU 부하
4. **Memory Stress**: Ticketing Service 메모리 압박
5. **Network Partition**: Database 네트워크 단절

## 📝 결과 분석

### 결과 파일

테스트 결과는 `results/` 디렉토리에 JSON 형식으로 저장됩니다:

```bash
results/
├── 01-baseline-summary.json
├── 02-queue-spike-summary.json
├── 02-queue-spike-metrics.json
├── 03-ticketing-concurrency-summary.json
├── 03-ticketing-concurrency-metrics.json
├── 04-e2e-flow-summary.json
└── 04-e2e-flow-metrics.json
```

### 결과 확인

```bash
# 최신 결과 확인
cat results/04-e2e-flow-metrics.json | jq .

# 성공률 확인
cat results/04-e2e-flow-metrics.json | jq '.overall_success_rate'

# P95 Latency 확인
cat results/01-baseline-summary.json | jq '.metrics.http_req_duration.values."p(95)"'
```

## 🛠 환경 변수

테스트 스크립트에서 사용하는 환경 변수:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `BASE_URL` | `https://gateway.truve.site` | API Gateway URL |
| `TEST_SHOW_ID` | `show-12345` | 테스트용 공연 ID |
| `TEST_SHOW_SCHEDULE_ID` | `123` | 테스트용 공연 회차 ID |

```bash
# 환경 변수 오버라이드
export BASE_URL="https://staging.gateway.truve.site"
export TEST_SHOW_ID="show-99999"
./run-local.sh e2e
```

## 📚 참고 자료

- [k6 Documentation](https://k6.io/docs/)
- [k6 Operator](https://github.com/grafana/k6-operator)
- [Chaos Mesh](https://chaos-mesh.org/)
- [KEDA](https://keda.sh/)

## 🐛 트러블슈팅

### k6 설치 실패
```bash
# macOS에서 brew 업데이트
brew update && brew upgrade

# Linux에서 수동 설치
wget https://github.com/grafana/k6/releases/download/v0.45.0/k6-v0.45.0-linux-amd64.tar.gz
tar -xzf k6-v0.45.0-linux-amd64.tar.gz
sudo mv k6 /usr/local/bin/
```

### Kubernetes Pod이 시작되지 않음
```bash
# Pod 상태 확인
kubectl describe pod -l app=k6-load-test -n load-test

# 이벤트 확인
kubectl get events -n load-test --sort-by='.lastTimestamp'

# 리소스 재생성
./run-k8s.sh delete
./run-k8s.sh setup
./run-k8s.sh deploy all
```

### 테스트 결과가 저장되지 않음
```bash
# 결과 디렉토리 권한 확인
ls -la results/

# 디렉토리 재생성
rm -rf results/
mkdir -p results/
```

## 📧 문의

부하 테스트 관련 문의사항은 개발팀에 연락해주세요.
