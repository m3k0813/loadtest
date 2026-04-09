import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// 커스텀 메트릭
export const queueWaitTime = new Trend('queue_wait_time');
export const seatHoldSuccessRate = new Rate('seat_hold_success_rate');
export const ticketingSuccessRate = new Rate('ticketing_success_rate');
export const paymentSuccessRate = new Rate('payment_success_rate');
export const queueEnterCounter = new Counter('queue_enter_total');
export const ticketingEnterCounter = new Counter('ticketing_enter_total');

// UUID v4 생성
export function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 랜덤 좌석 ID 생성
export function randomSeats(count, min = 1, max = 100) {
  const seats = new Set();
  while (seats.size < count) {
    seats.add(randomIntBetween(min, max));
  }
  return Array.from(seats);
}

// HTTP 요청 체크 헬퍼
export function checkResponse(response, name, expectedStatus = 200) {
  const checks = {
    [`${name}: status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${name}: response time < 5s`]: (r) => r.timings.duration < 5000,
  };

  return check(response, checks);
}

// 에러 처리를 포함한 HTTP 요청 래퍼
export function safeRequest(http, method, url, body, params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = http[method](url, body, params);

      // 5xx 에러면 재시도
      if (response.status >= 500 && i < retries - 1) {
        console.warn(`Server error ${response.status}, retrying... (${i + 1}/${retries})`);
        sleep(Math.pow(2, i)); // 지수 백오프
        continue;
      }

      return response;
    } catch (error) {
      if (i === retries - 1) {
        console.error(`Request failed after ${retries} attempts: ${error}`);
        throw error;
      }
      sleep(Math.pow(2, i));
    }
  }
}

// 대기열 폴링 헬퍼
export function pollQueueStatus(http, baseUrl, showId, userId, maxAttempts = 60, intervalMs = 5000, jwtToken = null) {
  const startTime = Date.now();

  for (let i = 0; i < maxAttempts; i++) {
    const headers = { 'X-User-Id': userId };
    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    }

    const response = http.get(`${baseUrl}/api/queue/${showId}/status`, {
      headers: headers,
      tags: { name: 'queue_status_polling' },
    });

    if (!response || response.status !== 200) {
      console.error(`Queue status check failed: ${response ? response.status : 'no response'}`);
      sleep(intervalMs / 1000);
      continue;
    }

    try {
      const data = JSON.parse(response.body);
      const status = data.data?.status;
      const position = data.data?.position;

      if (status === 'READY') {
        const waitTime = Date.now() - startTime;
        queueWaitTime.add(waitTime);
        console.log(`Queue cleared in ${waitTime}ms`);
        return {
          success: true,
          token: data.data?.token,
          waitTime: waitTime,
        };
      }

      if (status === 'WAITING' && position) {
        console.log(`Queue position: ${position}`);
      }
    } catch (error) {
      console.error(`Failed to parse queue status response: ${error}`);
    }

    sleep(intervalMs / 1000);
  }

  console.error(`Queue timeout after ${maxAttempts} attempts`);
  return { success: false, waitTime: Date.now() - startTime };
}

// 랜덤 사용자 데이터 생성
export function generateUserData() {
  const firstNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임'];
  const lastNames = ['민준', '서연', '예준', '지우', '도윤', '서현', '하준', '수아'];

  return {
    name: randomItem(firstNames) + randomItem(lastNames),
    email: `user${randomIntBetween(1000, 9999)}@test.com`,
    phone: `010${randomIntBetween(10000000, 99999999)}`,
  };
}

// 결과 요약 출력
export function handleSummary(data) {
  console.log('========================================');
  console.log('부하 테스트 결과 요약');
  console.log('========================================');

  const metrics = data.metrics;

  if (metrics.http_req_duration) {
    console.log(`\n[응답 시간]`);
    console.log(`  평균: ${metrics.http_req_duration.values.avg.toFixed(2)}ms`);
    console.log(`  P95: ${metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`);
    console.log(`  P99: ${metrics.http_req_duration.values['p(99)'].toFixed(2)}ms`);
  }

  if (metrics.http_reqs) {
    console.log(`\n[처리량]`);
    console.log(`  총 요청: ${metrics.http_reqs.values.count}`);
    console.log(`  초당 요청: ${metrics.http_reqs.values.rate.toFixed(2)} req/s`);
  }

  if (metrics.http_req_failed) {
    console.log(`\n[에러율]`);
    console.log(`  실패율: ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%`);
  }

  if (metrics.queue_wait_time) {
    console.log(`\n[대기열]`);
    console.log(`  평균 대기: ${metrics.queue_wait_time.values.avg.toFixed(2)}ms`);
    console.log(`  최대 대기: ${metrics.queue_wait_time.values.max.toFixed(2)}ms`);
  }

  console.log('========================================\n');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data),
  };
}

// 임계값 검증
export function validateThresholds(data) {
  const failed = [];

  // P95 레이턴시 체크
  if (data.metrics.http_req_duration?.values['p(95)'] > 2000) {
    failed.push('P95 latency exceeded 2s');
  }

  // 에러율 체크
  if (data.metrics.http_req_failed?.values.rate > 0.02) {
    failed.push('Error rate exceeded 2%');
  }

  if (failed.length > 0) {
    console.error('❌ Thresholds failed:', failed.join(', '));
    return false;
  }

  console.log('✅ All thresholds passed');
  return true;
}
