# 🔧 설정 가이드 - 실행 전 필수 작업

이 파일은 **실제 실행 전 반드시 수정해야 할 항목**을 단계별로 안내합니다.

---

## ✅ 1단계: 자동 설정 (5분)

### 실제 테스트 데이터 ID 자동 조회

```bash
cd /Users/minjeongjun/projects/truve/load-tests

# Kubernetes에 접속 가능한 상태에서 실행
./scripts/get-test-data.sh
```

**이 스크립트가 자동으로 해줍니다:**
1. ✅ Postgres Pod 자동 탐색
2. ✅ 활성화된 공연(Show) 목록 조회
3. ✅ 공연 회차(Schedule) 목록 조회
4. ✅ 좌석 ID 범위 확인
5. ✅ `.env` 파일 자동 생성
6. ✅ `config/config.js` 자동 업데이트

**완료 후 확인:**
```bash
# .env 파일 확인
cat .env | grep TEST_SHOW

# 출력 예시:
# TEST_SHOW_ID=show-abc123
# TEST_SHOW_SCHEDULE_ID=456
```

---

## ✅ 2단계: URL 설정 (3분)

### Gateway URL 확인

```bash
# Kubernetes Ingress 확인
kubectl get ingress -A

# VirtualService 확인 (Istio 사용 시)
kubectl get virtualservice -A

# 출력 예시:
# NAME              HOSTS
# gateway-ingress   gateway.truve.site
```

### URL 업데이트

**방법 1: 환경 변수로 (권장)**
```bash
# .env 파일 수정
vim .env

# 실제 URL로 변경
BASE_URL=https://gateway.truve.site  # ← 실제 URL
```

**방법 2: 설정 파일 수정**
```bash
# config/config.js 직접 수정
vim config/config.js

# Line 6 수정
BASE_URL: __ENV.BASE_URL || 'https://your-actual-gateway.com',
```

### URL 연결 테스트

```bash
# API 연결 확인
curl -I https://gateway.truve.site/api/musical/home

# 응답 확인
# HTTP/2 200 ← 정상
# HTTP/2 404 ← URL 오류
```

---

## ✅ 3단계: 인증 설정 (10분)

### 현재 상황 확인

Gateway의 API 라우팅을 보면:
- ❌ `/api/queue/**` → JWT 필요 (JwtAuthenticationFilter)
- ❌ `/api/ticketing/**` → JWT 필요
- ✅ `/api/musical/**` → JWT 불필요 (공개 API)

### 해결 방법

**옵션 A: 백엔드에 테스트 계정 생성 (권장)**

```bash
# 백엔드 팀에 요청:
# 1. 테스트용 계정 생성
# 2. JWT 토큰 발급
# 3. 토큰 만료 시간 연장 (또는 무제한)

# 받은 토큰을 .env에 추가
echo "TEST_JWT_TOKEN=eyJhbGciOiJIUzI1..." >> .env
```

**scenarios/*.js 파일에 토큰 추가:**
```javascript
// scenarios/02-queue-spike.js 등
headers: {
  'X-User-Id': userId,
  'Authorization': `Bearer ${__ENV.TEST_JWT_TOKEN}`,  // ← 추가
}
```

**옵션 B: JWT 토큰 직접 생성**

```javascript
// utils/jwt-generator.js (새 파일 생성)
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';

export function generateJWT(userId, secret) {
  const header = encoding.b64encode(JSON.stringify({
    alg: 'HS256',
    typ: 'JWT'
  }), 'rawurl');

  const now = Math.floor(Date.now() / 1000);
  const payload = encoding.b64encode(JSON.stringify({
    sub: userId,
    iat: now,
    exp: now + 86400  // 24시간
  }), 'rawurl');

  const signature = crypto.hmac('sha256', `${header}.${payload}`, secret, 'base64rawurl');
  return `${header}.${payload}.${signature}`;
}
```

**옵션 C: 백엔드에 테스트 바이패스 추가 (개발 환경)**

```java
// Queue/Ticketing Controller에 추가
@PostMapping("/test/bypass")
public ApiResult<String> testBypass(@RequestHeader("X-Test-Mode") String testMode) {
    if (!"load-test".equals(testMode)) {
        throw new ForbiddenException();
    }
    // 인증 우회 로직
    String token = generateTestToken();
    return ApiResult.ok(token);
}
```

---

## ✅ 4단계: 네임스페이스 확인 (2분)

```bash
# 실제 서비스가 배포된 네임스페이스 확인
kubectl get pods -A | grep -E "queue|ticketing|musical"

# 출력 예시:
# default       queue-service-xxx       1/1     Running
# default       ticketing-service-xxx   1/1     Running
```

**k8s/*.yaml 파일 수정 (필요시):**
```yaml
# k8s/k6-distributed-test.yaml
namespace: default  # ← 실제 네임스페이스로 변경
```

---

## ✅ 5단계: 부하 레벨 조정 (중요!)

### 초기 테스트는 작게 시작!

**config/config.js 수정:**
```javascript
// 현재 (위험!)
stages: [
  { duration: '30s', target: 2000 },  // 초당 2000명!
]

// 안전하게 시작 (권장)
stages: [
  { duration: '2m', target: 50 },    // 50명으로 시작
  { duration: '3m', target: 100 },   // 점진적 증가
]
```

**또는 환경 변수로 제어:**
```bash
# .env 파일
MAX_VUS=50          # 동시 사용자 수 제한
TEST_DURATION=5m    # 짧게 시작
```

---

## ✅ 6단계: Kubernetes 볼륨 수정 (K8s 실행 시)

### 문제: hostPath 사용 불가

**현재 (k8s/k6-distributed-test.yaml):**
```yaml
volumes:
  - name: scripts
    hostPath:
      path: /Users/minjeongjun/projects/truve/load-tests/scenarios  # ← EC2/EKS에 없음!
```

### 해결: ConfigMap 사용

**1. ConfigMap 생성:**
```bash
cd /Users/minjeongjun/projects/truve/load-tests

# 모든 시나리오를 ConfigMap으로
kubectl create configmap k6-scenarios \
  --from-file=scenarios/ \
  -n load-test \
  --dry-run=client -o yaml > k8s/k6-scenarios-configmap.yaml

kubectl apply -f k8s/k6-scenarios-configmap.yaml
```

**2. Deployment 수정:**
```yaml
# k8s/k6-distributed-test.yaml
volumes:
  - name: scripts
    configMap:
      name: k6-scenarios  # ← ConfigMap 사용
```

---

## ✅ 7단계: 검증 (5분)

### Staging 환경에서 테스트

```bash
cd /Users/minjeongjun/projects/truve/load-tests

# 1. 설정 확인
cat .env

# 2. URL 연결 테스트
curl https://gateway.truve.site/api/musical/home

# 3. 작은 부하로 테스트 (1분)
k6 run \
  --vus 10 \
  --duration 1m \
  --env BASE_URL=$BASE_URL \
  scenarios/01-baseline.js

# 4. 에러 없으면 정식 실행
./run-local.sh baseline staging
```

---

## 📋 체크리스트

실행 전 모든 항목 확인:

- [ ] `./scripts/get-test-data.sh` 실행 완료
- [ ] `.env` 파일에 실제 SHOW_ID, SCHEDULE_ID 설정
- [ ] `BASE_URL`을 실제 Gateway URL로 수정
- [ ] API 연결 테스트 성공 (`curl` 명령)
- [ ] JWT 토큰 준비 (또는 인증 우회 방법 확인)
- [ ] 네임스페이스 확인 및 수정
- [ ] 부하 레벨을 안전한 값으로 조정 (50 VU 이하)
- [ ] Kubernetes ConfigMap 생성 (K8s 실행 시)
- [ ] Staging 환경에서 사전 테스트 완료
- [ ] 모니터링 대시보드 접속 확인

---

## 🚀 빠른 설정 (한 번에)

```bash
#!/bin/bash
# 이 스크립트를 실행하면 대부분 자동 설정됩니다

cd /Users/minjeongjun/projects/truve/load-tests

# 1. 테스트 데이터 자동 조회
./scripts/get-test-data.sh

# 2. .env 템플릿 복사 (이미 생성됨)
# cp .env.template .env  (자동 완료)

# 3. Gateway URL 확인 및 업데이트
GATEWAY_URL=$(kubectl get ingress -A -o jsonpath='{.items[0].spec.rules[0].host}' 2>/dev/null)
if [ -n "$GATEWAY_URL" ]; then
  echo "Found Gateway URL: https://$GATEWAY_URL"
  sed -i.bak "s|BASE_URL=.*|BASE_URL=https://$GATEWAY_URL|" .env
fi

# 4. 설정 확인
echo "=== Configuration ==="
cat .env

# 5. 연결 테스트
echo ""
echo "=== Connection Test ==="
curl -I https://$(grep BASE_URL .env | cut -d= -f2 | tr -d 'https://')/api/musical/home

echo ""
echo "✅ Setup complete! Run: ./run-local.sh baseline staging"
```

---

## ❓ 자주 묻는 질문

### Q: JWT 토큰이 없으면 테스트 불가능한가요?
**A:** Queue/Ticketing은 JWT 필요합니다. 해결 방법:
1. 백엔드 팀에 테스트 계정 요청 (권장)
2. 백엔드에 테스트 바이패스 추가
3. Musical 서비스만 먼저 테스트 (JWT 불필요)

### Q: 실제 데이터가 없으면?
**A:** 데이터베이스에 테스트 데이터 추가:
```sql
-- 테스트용 공연 생성
INSERT INTO shows (id, title, status, start_date, end_date)
VALUES ('show-test-001', 'Load Test Show', 'ACTIVE', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days');

-- 테스트용 회차 생성
INSERT INTO show_schedules (id, show_id, show_date, show_time)
VALUES (999, 'show-test-001', CURRENT_DATE + INTERVAL '7 days', '19:00:00');
```

### Q: Production에서 바로 실행해도 되나요?
**A:** 절대 안됩니다! 순서:
1. **Local** → 2. **Staging** → 3. **Production (작은 부하)** → 4. **Production (목표 부하)**

---

이제 설정이 완료되었습니다! Staging에서 테스트를 시작하세요! 🎉
