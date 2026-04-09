/**
 * 시나리오 2: Queue Spike 테스트
 *
 * 목적: 티켓 오픈 시 대기열 진입 폭주 테스트
 * - 짧은 시간에 대량의 사용자가 대기열 진입
 * - KEDA 스케일링 및 Redis 성능 검증
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { config } from '../config/config.js';
import {
  checkResponse,
  uuidv4,
  pollQueueStatus,
  queueEnterCounter,
  queueWaitTime,
} from '../utils/helpers.js';

// 테스트 옵션 - 급격한 트래픽 증가 시뮬레이션
export const options = {
  scenarios: {
    // 티켓 오픈 직전 대기
    pre_open: {
      executor: 'constant-vus',
      vus: 100,
      duration: '1m',
      startTime: '0s',
      exec: 'preOpenScenario',
      tags: { phase: 'pre_open' },
    },
    // 티켓 오픈 시점 급증
    ticket_open_spike: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 2000,
      maxVUs: 5000,
      startTime: '1m',
      stages: [
        { duration: '30s', target: 2000 }, // 초당 2000명 진입
        { duration: '2m', target: 1000 },  // 초당 1000명 유지
        { duration: '3m', target: 500 },   // 초당 500명 감소
        { duration: '2m', target: 100 },   // 초당 100명 안정화
      ],
      exec: 'queueSpikeScenario',
      tags: { phase: 'spike' },
    },
    // 지속적인 진입
    continuous_entry: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 200,
      startTime: '8m',
      exec: 'queueSpikeScenario',
      tags: { phase: 'continuous' },
    },
  },
  thresholds: {
    'http_req_duration{name:queue_enter}': ['p(95)<1000', 'p(99)<3000'],
    'http_req_duration{name:queue_status_polling}': ['p(95)<500'],
    'http_req_failed{name:queue_enter}': ['rate<0.01'],
    'queue_wait_time': ['p(95)<300000'], // 95%는 5분 이내 대기열 통과
  },
  tags: {
    test_type: 'queue_spike',
  },
};

// 티켓 오픈 전 대기 시나리오
export function preOpenScenario() {
  const userId = uuidv4();
  const showId = config.TEST_SHOW_ID;

  group('Pre-Open Waiting', function () {
    // 공연 정보 조회
    const showRes = http.get(`${config.BASE_URL}/api/musical/shows/${showId}`, {
      headers: { 'X-User-Id': userId },
      tags: { name: 'get_show_before_open' },
    });

    checkResponse(showRes, 'Show Detail');
    sleep(Math.random() * 5 + 3); // 3-8초 대기
  });
}

// 대기열 급증 시나리오
export function queueSpikeScenario() {
  const userId = uuidv4();
  const showId = config.TEST_SHOW_ID;

  group('Queue Entry Spike', function () {
    // 1. 대기열 진입
    const enterRes = http.post(
      `${config.BASE_URL}/api/queue/${showId}/enter`,
      null,
      {
        headers: { 'X-User-Id': userId },
        tags: { name: 'queue_enter' },
        timeout: '10s',
      }
    );

    queueEnterCounter.add(1);

    const enterSuccess = check(enterRes, {
      'queue enter successful': (r) => r.status === 200,
      'queue enter response time ok': (r) => r.timings.duration < 5000,
    });

    if (!enterSuccess) {
      console.error(`Queue entry failed for user ${userId}: ${enterRes.status}`);
      return;
    }

    sleep(1);

    // 2. 대기열 상태 폴링 (간헐적으로만 수행 - 부하 감소)
    // 20% 확률로만 대기열 폴링 수행
    if (Math.random() < 0.2) {
      const queueResult = pollQueueStatus(
        http,
        config.BASE_URL,
        showId,
        userId,
        10, // 최대 10회만 시도 (spike 테스트이므로 짧게)
        5000
      );

      if (queueResult.success) {
        console.log(`User ${userId} got admission token: ${queueResult.token}`);
      } else {
        console.warn(`User ${userId} queue timeout`);
      }
    } else {
      // 대부분의 사용자는 1-2회만 상태 체크
      const checkCount = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < checkCount; i++) {
        const statusRes = http.get(`${config.BASE_URL}/api/queue/${showId}/status`, {
          headers: { 'X-User-Id': userId },
          tags: { name: 'queue_status_polling' },
        });

        check(statusRes, {
          'queue status retrieved': (r) => r.status === 200,
        });

        sleep(5);
      }
    }
  });
}

export function handleSummary(data) {
  const queueMetrics = {
    test: 'Queue Spike Test',
    timestamp: new Date().toISOString(),
    total_queue_entries: data.metrics.queue_enter_total?.values.count || 0,
    avg_wait_time_ms: data.metrics.queue_wait_time?.values.avg || 0,
    p95_wait_time_ms: data.metrics.queue_wait_time?.values['p(95)'] || 0,
    p99_wait_time_ms: data.metrics.queue_wait_time?.values['p(99)'] || 0,
    queue_enter_p95_ms: data.metrics['http_req_duration{name:queue_enter}']?.values['p(95)'] || 0,
    error_rate: data.metrics['http_req_failed{name:queue_enter}']?.values.rate || 0,
  };

  console.log('\n========== Queue Spike Test Results ==========');
  console.log(`Total Queue Entries: ${queueMetrics.total_queue_entries}`);
  console.log(`Avg Wait Time: ${(queueMetrics.avg_wait_time_ms / 1000).toFixed(2)}s`);
  console.log(`P95 Wait Time: ${(queueMetrics.p95_wait_time_ms / 1000).toFixed(2)}s`);
  console.log(`Queue Enter P95: ${queueMetrics.queue_enter_p95_ms.toFixed(2)}ms`);
  console.log(`Error Rate: ${(queueMetrics.error_rate * 100).toFixed(2)}%`);
  console.log('=============================================\n');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '/Users/minjeongjun/projects/truve/load-tests/results/02-queue-spike-summary.json': JSON.stringify(data, null, 2),
    '/Users/minjeongjun/projects/truve/load-tests/results/02-queue-spike-metrics.json': JSON.stringify(queueMetrics, null, 2),
  };
}
