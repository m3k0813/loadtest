/**
 * 시나리오 7: 15,000 요청 스파이크 테스트
 *
 * 목적: 짧은 시간 내 대량 요청 처리 능력 테스트
 * - 총 15,000개의 요청을 2분 내에 집중 발생
 * - KEDA 오토스케일링이 얼마나 빠르게 대응하는지 확인
 * - 시스템의 burst 처리 능력 검증
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { config } from '../config/config.js';
import { uuidv4 } from '../utils/helpers.js';
import { generateJWT } from '../utils/jwt.js';

/**
 * 스파이크 테스트 전략:
 * 1. Warmup (0-30초): 100 RPS - 시스템 준비
 * 2. Spike (30초-1분30초): 250 RPS - 15,000 요청 집중 발생
 * 3. Recovery (1분30초-2분30초): 50 RPS - 시스템 안정화 관찰
 *
 * 총 예상 요청: ~100*30 + 250*60 + 50*60 = 3,000 + 15,000 + 3,000 = 21,000 요청
 */
export const options = {
  scenarios: {
    spike_15k_requests: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 1000,
      stages: [
        { duration: '30s', target: 100 },  // Warmup: 100 RPS (3,000 요청)
        { duration: '1m', target: 250 },   // Spike: 250 RPS (15,000 요청)
        { duration: '1m', target: 50 },    // Recovery: 50 RPS (3,000 요청)
      ],
    },
  },
  thresholds: {
    // 스파이크 상황이므로 threshold를 더 느슨하게
    'http_req_duration': ['p(95)<5000', 'p(99)<10000'],
    'http_req_failed': ['rate<0.05'], // 5% 미만 실패 허용
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

  // Musical Service API 호출 (가장 안정적인 API)
  const showRes = http.get(`${config.BASE_URL}/api/musical/shows/${showId}`, {
    headers: headers,
    tags: { name: 'musical_show_spike' },
  });

  const success = check(showRes, {
    'request successful': (r) => r.status === 200,
    'response time acceptable': (r) => r.timings.duration < 10000, // 10초 이내
  });

  if (!success) {
    console.error(`Request failed: ${showRes.status} - ${showRes.body.substring(0, 100)}`);
  }

  // 매우 짧은 sleep으로 최대한 많은 요청 발생
  sleep(Math.random() * 0.2); // 0~0.2초
}

export function handleSummary(data) {
  const metrics = data.metrics;
  const totalRequests = metrics.http_reqs?.values.count || 0;
  const duration = data.state.testRunDurationMs / 1000;
  const avgRPS = metrics.http_reqs?.values.rate || 0;
  const errorRate = (metrics.http_req_failed?.values.rate || 0) * 100;

  console.log('\n========== 15K Spike Test Results ==========');
  console.log(`⏱️  Test Duration: ${duration.toFixed(1)}s`);
  console.log(`📊 Total Requests: ${totalRequests.toLocaleString()}`);
  console.log(`🚀 Average RPS: ${avgRPS.toFixed(2)}`);
  console.log(`⚡ Peak RPS: ~250 (during spike phase)`);
  console.log('');
  console.log(`⏲️  Avg Response Time: ${(metrics.http_req_duration?.values.avg || 0).toFixed(2)}ms`);
  console.log(`📈 P50 Response Time: ${(metrics.http_req_duration?.values.med || 0).toFixed(2)}ms`);
  console.log(`📈 P95 Response Time: ${(metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2)}ms`);
  console.log(`📈 P99 Response Time: ${(metrics.http_req_duration?.values['p(99)'] || 0).toFixed(2)}ms`);
  console.log(`🔴 Max Response Time: ${(metrics.http_req_duration?.values.max || 0).toFixed(2)}ms`);
  console.log('');
  console.log(`❌ Error Rate: ${errorRate.toFixed(2)}%`);
  console.log(`✅ Success Rate: ${(100 - errorRate).toFixed(2)}%`);
  console.log('============================================\n');

  // 스파이크 페이즈별 분석
  console.log('📊 Phase Analysis:');
  console.log('  Phase 1 (0-30s):   Warmup at 100 RPS');
  console.log('  Phase 2 (30-90s):  SPIKE at 250 RPS ⚡');
  console.log('  Phase 3 (90-150s): Recovery at 50 RPS');
  console.log('');

  // KEDA 스케일링 분석 가이드
  console.log('🔍 KEDA Scaling Analysis:');
  console.log('  1. Check if pods scaled during spike:');
  console.log('     kubectl get pods -n truve-musical-service');
  console.log('');
  console.log('  2. Check HPA metrics:');
  console.log('     kubectl get hpa -n truve-musical-service');
  console.log('');
  console.log('  3. Check scaling events:');
  console.log('     kubectl get events -n truve-musical-service --sort-by=.lastTimestamp');
  console.log('');

  // 성능 평가
  const p95 = metrics.http_req_duration?.values['p(95)'] || 0;
  const p99 = metrics.http_req_duration?.values['p(99)'] || 0;

  console.log('📋 Performance Evaluation:');
  if (errorRate < 1) {
    console.log('  ✅ EXCELLENT: Error rate < 1%');
  } else if (errorRate < 5) {
    console.log('  ⚠️  ACCEPTABLE: Error rate < 5%');
  } else {
    console.log('  ❌ POOR: Error rate >= 5%');
  }

  if (p95 < 2000) {
    console.log('  ✅ EXCELLENT: P95 latency < 2s');
  } else if (p95 < 5000) {
    console.log('  ⚠️  ACCEPTABLE: P95 latency < 5s');
  } else {
    console.log('  ❌ POOR: P95 latency >= 5s');
  }

  if (totalRequests >= 15000) {
    console.log(`  ✅ TARGET MET: Processed ${totalRequests.toLocaleString()} requests (>= 15,000)`);
  } else {
    console.log(`  ⚠️  BELOW TARGET: Processed ${totalRequests.toLocaleString()} requests (< 15,000)`);
  }

  console.log('\n');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'results/07-spike-15k-summary.json': JSON.stringify(data, null, 2),
  };
}
