/**
 * 시나리오 6: KEDA 오토스케일링 테스트 - Musical Service
 *
 * 목적: Musical Service의 KEDA 스케일링 동작 검증
 * - KEDA Threshold: 40 RPS
 * - Min Replicas: 1
 * - Max Replicas: 10
 * - Polling Interval: 15초
 * - Cooldown: 180초
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { config } from '../config/config.js';
import { uuidv4 } from '../utils/helpers.js';
import { generateJWT } from '../utils/jwt.js';

/**
 * 테스트 시나리오:
 * 1. Baseline (0-1분): 10 RPS - 스케일링 안됨
 * 2. Ramp Up (1-2분): 10 → 100 RPS - 스케일 아웃 시작
 * 3. Peak (2-5분): 100 RPS 유지 - 최대 스케일 아웃
 * 4. Ramp Down (5-6분): 100 → 10 RPS - 스케일 인 대기
 * 5. Cooldown (6-9분): 10 RPS 유지 - 스케일 인 발생
 */
export const options = {
  scenarios: {
    keda_autoscaling_test: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '1m', target: 10 },   // Baseline: 10 RPS
        { duration: '1m', target: 100 },  // Ramp Up: 10→100 RPS
        { duration: '3m', target: 100 },  // Peak: 100 RPS (threshold 40 초과)
        { duration: '1m', target: 10 },   // Ramp Down: 100→10 RPS
        { duration: '3m', target: 10 },   // Cooldown: 10 RPS (스케일 인 대기)
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'],
    'http_req_failed': ['rate<0.01'],
  },
};

export default function () {
  const userId = uuidv4();
  const showId = config.TEST_SHOW_ID;

  // JWT 토큰 생성
  const jwtSecret = __ENV.JWT_SECRET || 'kt-cloud-tech-up-final-project-2026020201010101';
  const token = generateJWT(userId, jwtSecret);

  const headers = {
    'X-User-Id': userId,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Musical Service API 호출
  const showRes = http.get(`${config.BASE_URL}/api/musical/shows/${showId}`, {
    headers: headers,
    tags: { name: 'musical_show_detail' },
  });

  check(showRes, {
    'musical API success': (r) => r.status === 200,
    'response time ok': (r) => r.timings.duration < 3000,
  });

  // 짧은 sleep으로 자연스러운 부하 패턴 생성
  sleep(Math.random() * 0.5 + 0.1); // 0.1~0.6초
}

export function handleSummary(data) {
  const metrics = data.metrics;

  console.log('\n========== KEDA Autoscaling Test Results ==========');
  console.log(`Test Duration: ${data.state.testRunDurationMs / 1000}s`);
  console.log(`Total Requests: ${metrics.http_reqs?.values.count || 0}`);
  console.log(`Request Rate: ${(metrics.http_reqs?.values.rate || 0).toFixed(2)} req/s`);
  console.log(`Avg Response Time: ${(metrics.http_req_duration?.values.avg || 0).toFixed(2)}ms`);
  console.log(`P95 Response Time: ${(metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2)}ms`);
  console.log(`P99 Response Time: ${(metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2)}ms`);
  console.log(`Error Rate: ${((metrics.http_req_failed?.values.rate || 0) * 100).toFixed(2)}%`);
  console.log('===================================================\n');

  console.log('📊 KEDA Scaling Checkpoints:');
  console.log('  - 0-1min: Baseline (10 RPS) - Should stay at 1 pod');
  console.log('  - 1-2min: Ramp up (10→100 RPS) - Should start scaling out');
  console.log('  - 2-5min: Peak (100 RPS) - Should reach max pods');
  console.log('  - 5-6min: Ramp down (100→10 RPS) - Should maintain pods (cooldown)');
  console.log('  - 6-9min: Cooldown (10 RPS) - Should scale in after 180s cooldown\n');

  console.log('🔍 Check pod scaling with:');
  console.log('  kubectl get pods -n truve-musical-service -w');
  console.log('  kubectl get hpa -n truve-musical-service -w');
  console.log('  kubectl get scaledobject -n truve-musical-service musical-service\n');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'results/06-keda-musical-autoscaling-summary.json': JSON.stringify(data, null, 2),
  };
}
