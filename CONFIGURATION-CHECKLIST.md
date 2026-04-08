# ⚙️ 설정 체크리스트 - 수정 필수 항목

실제 실행 전에 **반드시 수정해야 할 정보**들입니다.

---

## 🔴 필수 수정 항목

### 1. API 엔드포인트 URL

**파일**: `config/config.js`

```javascript
// 현재 (예시 URL)
BASE_URL: __ENV.BASE_URL || 'https://gateway.truve.site',

// 수정 필요
BASE_URL: __ENV.BASE_URL || 'https://your-actual-gateway-url.com',
```

**확인 방법**:
```bash
# 실제 Gateway URL 확인
kubectl get virtualservice -n default
kubectl get ingress -n default

# 또는 브라우저에서 접속 테스트
curl https://gateway.truve.site/api/musical/home
```

---

### 2. 테스트 데이터 ID

**파일**: `config/config.js`

```javascript
// 현재 (더미 데이터)
TEST_SHOW_ID: __ENV.TEST_SHOW_ID || 'show-12345',
TEST_SHOW_SCHEDULE_ID: parseInt(__ENV.TEST_SHOW_SCHEDULE_ID || '123'),

// 수정 필요: 실제 존재하는 공연 ID로 변경
TEST_SHOW_ID: __ENV.TEST_SHOW_ID || 'show-REAL-ID',
TEST_SHOW_SCHEDULE_ID: parseInt(__ENV.TEST_SHOW_SCHEDULE_ID || 'REAL-SCHEDULE-ID'),
```

**실제 데이터 조회 방법**:
```bash
# 데이터베이스에서 확인
kubectl exec -it postgres-pod -- psql -U truve -c "SELECT id, title FROM shows LIMIT 5;"

# 또는 API 호출
curl https://gateway.truve.site/api/musical/shows | jq '.data[0].id'
```

---

### 3. 대기열 토큰 모킹 로직

**파일**: `scenarios/03-ticketing-concurrency.js`, `scenarios/04-e2e-flow.js`

**현재 코드**:
```javascript
// Line 39 (03-ticketing-concurrency.js)
const admissionToken = `MOCK_ADMISSION_${userId}`;
```

**문제점**: 실제로는 대기열을 통과해야 admission token을 받을 수 있음

**옵션 A - 대기열 스킵 (개발 환경)**:
```javascript
// 백엔드에 테스트용 엔드포인트가 있다면
const admissionToken = http.post(
  `${BASE_URL}/api/queue/test/bypass`,
  { userId, showScheduleId }
).json('token');
```

**옵션 B - 실제 대기열 통과 (권장)**:
```javascript
// 이미 04-e2e-flow.js에 구현되어 있음
const queueResult = pollQueueStatus(http, BASE_URL, showId, userId);
const admissionToken = queueResult.token;
```

**수정 권장**:
- `03-ticketing-concurrency.js`에서도 실제 대기열 통과 로직 사용
- 또는 백엔드에 테스트용 바이패스 API 추가

---

### 4. 좌석 ID 범위

**파일**: `utils/helpers.js`

```javascript
// Line 28 - 현재
export function randomSeats(count, min = 1, max = 100) {
  // 1~100번 좌석 중 랜덤 선택
}
```

**확인 필요**:
- 실제 공연장 좌석 ID 범위는?
- 데이터베이스 스키마 확인

```sql
-- 실제 좌석 ID 범위 확인
SELECT MIN(id), MAX(id), COUNT(*)
FROM scheduled_seats
WHERE show_schedule_id = 123;
```

**수정 예시**:
```javascript
export function randomSeats(count, min = 1, max = 500) {
  // 실제 좌석 범위에 맞게 수정
}
```

---

### 5. Kubernetes 네임스페이스

**파일**: `k8s/*.yaml`

**현재**:
```yaml
namespace: load-test  # 모든 k8s 파일
```

**확인 필요**:
- 실제 서비스가 배포된 네임스페이스는? (default? truve?)
- 부하 테스트용 별도 네임스페이스 사용할지?

**수정**:
```yaml
# k8s/k6-distributed-test.yaml
namespace: load-test  # 또는 your-namespace
```

---

### 6. 환경별 URL 설정

**파일**: `run-local.sh`

```bash
# Line 30-40 현재
case "${ENVIRONMENT}" in
  local)
    BASE_URL="http://localhost:8080"
    ;;
  staging)
    BASE_URL="https://staging.gateway.truve.site"  # ← 수정 필요
    ;;
  production)
    BASE_URL="https://gateway.truve.site"  # ← 수정 필요
    ;;
esac
```

**실제 URL로 변경**:
```bash
staging)
  BASE_URL="https://api-staging.yourcompany.com"
  ;;
production)
  BASE_URL="https://api.yourcompany.com"
  ;;
```

---

### 7. 모니터링 연동 (선택사항)

**파일**: `k8s/k6-distributed-test.yaml`

```yaml
# Line 13 - InfluxDB 연동
K6_OUT: "influxdb=http://influxdb.monitoring.svc.cluster.local:8086/k6"
K6_PROMETHEUS_RW_SERVER_URL: "http://prometheus-operated.monitoring.svc.cluster.local:9090/api/v1/write"
```

**확인 필요**:
- InfluxDB 설치되어 있는지?
- Prometheus Remote Write 사용 가능한지?

**수정 옵션**:
```yaml
# InfluxDB 없으면 제거
K6_OUT: "json=/results/test-results.json"

# 또는 실제 주소로 변경
K6_OUT: "influxdb=http://your-influxdb:8086/k6"
```

---

### 8. 결과 저장 경로 (Kubernetes)

**파일**: `k8s/k6-distributed-test.yaml`

```yaml
# Line 60-70 - hostPath 사용 (로컬 개발용)
volumes:
  - name: scripts
    hostPath:
      path: /Users/minjeongjun/projects/truve/load-tests/scenarios  # ← 문제!
      type: Directory
```

**문제점**: EC2/EKS에서는 이 경로가 없음!

**수정 방법**:

**옵션 A - ConfigMap 사용 (권장)**:
```yaml
volumes:
  - name: scripts
    configMap:
      name: k6-test-scripts
```

**옵션 B - PVC 사용**:
```yaml
volumes:
  - name: scripts
    persistentVolumeClaim:
      claimName: k6-scripts-pvc
```

**옵션 C - S3/Git 클론**:
```yaml
initContainers:
  - name: git-clone
    image: alpine/git
    command: ['git', 'clone', 'https://github.com/your-org/truve.git', '/scripts']
    volumeMounts:
      - name: scripts
        mountPath: /scripts
volumes:
  - name: scripts
    emptyDir: {}
```

---

### 9. 인증 헤더 (필요시)

**파일**: 모든 `scenarios/*.js`

**현재**:
```javascript
headers: {
  'X-User-Id': userId,
}
```

**추가 필요할 수 있는 헤더**:
```javascript
headers: {
  'X-User-Id': userId,
  'Authorization': `Bearer ${token}`,  // JWT 토큰
  'X-API-Key': 'your-api-key',        // API Key
  'Content-Type': 'application/json',
}
```

**실제 API가 요구하는 인증 방식 확인 필요!**

---

### 10. Rate Limiting 설정

**파일**: 각 시나리오의 `options`

**현재**: 매우 높은 부하 설정
```javascript
// 02-queue-spike.js
stages: [
  { duration: '30s', target: 2000 },  // 초당 2000명!
]
```

**위험**: 프로덕션 서비스 다운 가능!

**안전한 시작**:
```javascript
stages: [
  { duration: '1m', target: 100 },   // 100명으로 시작
  { duration: '2m', target: 200 },   // 점진적 증가
]
```

**점진적 증가 계획**:
1. 100 VU로 시작
2. 문제 없으면 200 VU
3. 최종 목표까지 단계적 증가

---

## 🟡 선택 수정 항목

### 11. 테스트 지속 시간 조정

**파일**: 각 시나리오

```javascript
// 현재: 긴 시간 설정
stages: [
  { duration: '10m', target: 100 },  // 10분
]

// 빠른 테스트용으로 단축
stages: [
  { duration: '2m', target: 100 },   // 2분
]
```

---

### 12. 결과 파일 경로

**파일**: `run-local.sh`

```bash
# Line 95 - 현재
--out json="${RESULTS_DIR}/${test_name}-$(date +%Y%m%d-%H%M%S).json" \

# S3 업로드 추가
--out json="${RESULTS_DIR}/${test_name}-$(date +%Y%m%d-%H%M%S).json" \
&& aws s3 cp "${RESULTS_DIR}/" s3://your-bucket/load-test-results/ --recursive
```

---

### 13. Chaos Testing 타겟

**파일**: `k8s/chaos-testing.yaml`

```yaml
# Line 10 - 현재
labelSelectors:
  app: queue-service  # ← 실제 라벨 확인 필요
```

**실제 라벨 확인**:
```bash
kubectl get pods --show-labels -n default
```

**수정**:
```yaml
labelSelectors:
  app: your-actual-label
```

---

## ✅ 수정 작업 순서

### Phase 1: 필수 정보 수집
```bash
# 1. Gateway URL 확인
kubectl get ingress -A
kubectl get virtualservice -A

# 2. 실제 공연 데이터 확인
kubectl exec -it postgres-pod -- psql -U truve -c "
  SELECT id, title FROM shows WHERE status='ACTIVE' LIMIT 5;
"

# 3. 네임스페이스 확인
kubectl get namespaces
kubectl get pods -A | grep truve

# 4. 라벨 확인
kubectl get pods --show-labels -n default

# 5. API 인증 방식 확인
curl -I https://gateway.truve.site/api/musical/home
```

### Phase 2: 파일 수정

1. **config/config.js** - URL 및 테스트 데이터 ID
2. **run-local.sh** - 환경별 URL
3. **utils/helpers.js** - 좌석 ID 범위
4. **scenarios/03-ticketing-concurrency.js** - 대기열 토큰 로직
5. **k8s/*.yaml** - 네임스페이스, 라벨, 볼륨 경로

### Phase 3: 검증
```bash
# 1. Staging에서 작은 부하로 테스트
./run-local.sh baseline staging

# 2. 로그 확인
tail -f results/*.log

# 3. 에러 없으면 점진적 증가
```

---

## 🚨 주의사항

### 프로덕션 실행 전 체크리스트

- [ ] **Staging에서 먼저 테스트 완료**
- [ ] **부하 크기를 작게 시작** (100 VU → 점진적 증가)
- [ ] **업무 시간 외 실행** (새벽/주말)
- [ ] **모니터링 대시보드 준비** (Grafana)
- [ ] **롤백 계획 수립**
- [ ] **관련 팀 사전 공지**
- [ ] **Rate Limit 임시 증가 요청** (필요시)

---

## 📝 설정 파일 예시

### .env.production (추천)
```bash
# Production 환경 설정
BASE_URL=https://api.yourcompany.com
TEST_SHOW_ID=show-abc123
TEST_SHOW_SCHEDULE_ID=456
MAX_VUS=500
TEST_DURATION=10m
```

### .env.staging
```bash
# Staging 환경 설정
BASE_URL=https://api-staging.yourcompany.com
TEST_SHOW_ID=show-test-001
TEST_SHOW_SCHEDULE_ID=999
MAX_VUS=100
TEST_DURATION=5m
```

---

## 🔧 빠른 수정 스크립트

```bash
# 한번에 주요 값 수정
cd /Users/minjeongjun/projects/truve/load-tests

# 1. Gateway URL 변경
find . -type f \( -name "*.js" -o -name "*.sh" \) -exec sed -i '' 's|gateway.truve.site|your-actual-gateway.com|g' {} +

# 2. 테스트 데이터 ID 변경
find . -type f -name "*.js" -exec sed -i '' 's|show-12345|show-real-id|g' {} +
find . -type f -name "*.js" -exec sed -i '' 's|123|your-schedule-id|g' {} +

# 3. 네임스페이스 변경
find k8s -type f -name "*.yaml" -exec sed -i '' 's|namespace: load-test|namespace: your-namespace|g' {} +

# 확인
git diff
```

---

**지금 바로 수정하세요!** 수정 완료 후 Staging 환경에서 먼저 테스트하는 것을 잊지 마세요! 🎯
