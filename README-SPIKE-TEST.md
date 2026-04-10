# 15,000 요청 스파이크 테스트 가이드

## 📋 테스트 개요

**시나리오 7번**은 짧은 시간(2분 30초) 내에 총 21,000개의 요청을 발생시키며, 그 중 15,000개의 요청을 1분간 집중적으로 발생시키는 스파이크 테스트입니다.

### 테스트 목적
- 🚀 갑작스러운 트래픽 급증에 대한 시스템 대응 능력 검증
- ⚡ KEDA 오토스케일링의 빠른 반응성 테스트
- 🔥 시스템의 burst 처리 능력 확인
- 📊 대량 요청 처리 시 응답 시간 및 에러율 측정

## 🎯 테스트 시나리오

```
Phase 1: Warmup (0-30초)
├─ RPS: 100
├─ 예상 요청: ~3,000개
└─ 목적: 시스템 준비 및 초기 스케일링

Phase 2: SPIKE (30초-1분30초) ⚡
├─ RPS: 250
├─ 예상 요청: ~15,000개
└─ 목적: 핵심 스파이크 테스트

Phase 3: Recovery (1분30초-2분30초)
├─ RPS: 50
├─ 예상 요청: ~3,000개
└─ 목적: 시스템 안정화 관찰

총 예상 요청: ~21,000개
총 소요 시간: 2분 30초
```

## 🚀 테스트 실행 방법

### 1️⃣ EC2에서 부하 테스트 실행

```bash
# EC2 접속
ssh ubuntu@<your-ec2-ip>

# 최신 코드 받기
cd ~/loadtest
git pull origin main

# 스파이크 테스트 실행
k6 run scenarios/07-spike-15k-requests.js

# 또는 대시보드와 함께 실행 (선택사항)
./scripts/run-with-dashboard.sh scenarios/07-spike-15k-requests.js
```

### 2️⃣ 로컬에서 실시간 모니터링 (동시 실행 권장)

#### 옵션 A: 자동 모니터링 스크립트 (tmux)
```bash
./scripts/monitor-keda-scaling.sh truve-musical-service musical-service
```

#### 옵션 B: 수동 모니터링
```bash
# 터미널 1: Pod 수 모니터링
watch -n 1 'kubectl get pods -n truve-musical-service | grep musical'

# 터미널 2: HPA 메트릭
watch -n 2 'kubectl get hpa -n truve-musical-service'

# 터미널 3: 이벤트 로그
kubectl get events -n truve-musical-service --watch

# 터미널 4: Pod 리소스 사용량
watch -n 2 'kubectl top pods -n truve-musical-service'
```

## 📊 예상 결과

### 성공 기준
| 메트릭 | 목표 | 설명 |
|--------|------|------|
| **총 요청 수** | ≥ 15,000 | 스파이크 페이즈에서 15,000개 이상 처리 |
| **에러율** | < 5% | 전체 요청 중 실패율 5% 미만 |
| **P95 응답 시간** | < 5초 | 95%의 요청이 5초 내 응답 |
| **P99 응답 시간** | < 10초 | 99%의 요청이 10초 내 응답 |

### KEDA 스케일링 예상 동작

```
시간     RPS    Pod 수     설명
────────────────────────────────────────────
0-30s    100    1-2       초기 상태, 천천히 증가
30s      250    2-3       스파이크 시작, 급속 스케일 아웃
45s      250    3-5       계속 스케일 아웃
60s      250    5-7       최대 부하, 최대 Pod 수
90s      250    7-8       스파이크 종료 시점
90-150s  50     8→3       쿨다운 후 스케일 인
```

## 🔍 결과 분석 방법

### 1. 테스트 완료 후 요약 확인
테스트가 끝나면 자동으로 출력되는 요약 정보:
- 총 요청 수
- 평균/P95/P99 응답 시간
- 에러율 및 성공률
- 성능 평가 (EXCELLENT/ACCEPTABLE/POOR)

### 2. Pod 스케일링 확인
```bash
# 최종 Pod 수 확인
kubectl get pods -n truve-musical-service

# 스케일링 이벤트 확인
kubectl get events -n truve-musical-service \
  --sort-by=.lastTimestamp | grep -i scale
```

### 3. 상세 메트릭 확인
```bash
# HPA 상태
kubectl get hpa -n truve-musical-service

# ScaledObject 상태
kubectl describe scaledobject -n truve-musical-service musical-service
```

### 4. 그라파나 대시보드
Grafana에서 다음 메트릭 확인:
- HTTP 요청률 (RPS)
- 응답 시간 (P50, P95, P99)
- Pod 수 변화
- CPU/메모리 사용률

## 🎓 기대 학습 포인트

1. **스케일링 속도**: KEDA가 부하 급증을 감지하고 Pod를 늘리는 데 걸리는 시간
2. **한계점 파악**: 현재 설정에서 처리 가능한 최대 RPS
3. **병목 구간**: CPU, 메모리, 네트워크 중 어디가 먼저 병목이 되는지
4. **복구 시간**: 부하가 줄어든 후 시스템이 정상화되는 시간

## ⚠️ 주의사항

1. **운영 환경 주의**: 스파이크 테스트는 시스템에 큰 부하를 주므로 운영 시간대는 피하세요
2. **리소스 확인**: 노드에 충분한 여유 리소스가 있는지 사전 확인
3. **쿨다운 시간**: 반복 테스트 시 최소 5분 간격을 두고 실행
4. **모니터링 준비**: 테스트 전에 모니터링 도구를 먼저 실행해두세요

## 🐛 트러블슈팅

### Q: 요청이 15,000개보다 적게 나옴
- EC2 인스턴스 스펙이 부족할 수 있음 (더 큰 인스턴스 타입 사용)
- 네트워크 대역폭 제한 확인

### Q: 에러율이 너무 높음 (>10%)
- KEDA threshold를 낮춰서 더 빨리 스케일 아웃되도록 조정
- maxReplicaCount를 증가시켜 더 많은 Pod 허용
- 데이터베이스 커넥션 풀 크기 확인

### Q: 응답 시간이 너무 느림 (P95 > 10초)
- Pod의 리소스 request/limit 증가
- 데이터베이스 성능 확인
- 캐시 활용 여부 검토

### Q: Pod가 스케일 아웃되지 않음
```bash
# Prometheus 메트릭 확인
kubectl get --raw /apis/external.metrics.k8s.io/v1beta1/namespaces/truve-musical-service/s0-prometheus

# ScaledObject 로그 확인
kubectl logs -n keda deployment/keda-operator
```

## 📚 추가 자료

- [K6 공식 문서 - Spike Testing](https://k6.io/docs/test-types/spike-testing/)
- [KEDA 공식 문서](https://keda.sh/docs/)
- [Kubernetes HPA 가이드](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
