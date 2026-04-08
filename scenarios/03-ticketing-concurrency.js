/**
 * 시나리오 3: Ticketing Concurrency 테스트
 *
 * 목적: 좌석 선점 동시성 및 경쟁 상황 테스트
 * - 동시에 같은 좌석을 선점하려는 경합 상황
 * - Redis Lock 성능 및 데이터 일관성 검증
 * - Seat Hold/Release 성공률 측정
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { config } from '../config/config.js';
import {
  checkResponse,
  uuidv4,
  randomSeats,
  seatHoldSuccessRate,
  ticketingSuccessRate,
  ticketingEnterCounter,
} from '../utils/helpers.js';
import { Counter } from 'k6/metrics';

// 커스텀 메트릭
const seatConflictCounter = new Counter('seat_conflict_total');
const seatHoldCounter = new Counter('seat_hold_total');
const seatReleaseCounter = new Counter('seat_release_total');
const sessionExpiredCounter = new Counter('session_expired_total');

// 테스트 옵션
export const options = {
  scenarios: {
    // 동시 티켓팅 접속
    concurrent_ticketing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },   // 워밍업
        { duration: '2m', target: 300 },   // 램프업
        { duration: '5m', target: 500 },   // 고부하 유지
        { duration: '5m', target: 700 },   // 최대 부하
        { duration: '2m', target: 500 },   // 감소
        { duration: '3m', target: 0 },     // 종료
      ],
      exec: 'ticketingScenario',
    },
  },
  thresholds: {
    'http_req_duration{name:ticketing_enter}': ['p(95)<2000', 'p(99)<5000'],
    'http_req_duration{name:get_seats}': ['p(95)<1000'],
    'http_req_duration{name:hold_seat}': ['p(95)<3000', 'p(99)<8000'],
    'http_req_duration{name:heartbeat}': ['p(95)<500'],
    'http_req_failed{name:hold_seat}': ['rate<0.1'], // 좌석 선점은 10% 실패 허용 (경합 상황)
    'seat_hold_success_rate': ['rate>0.5'], // 최소 50% 성공률
  },
  tags: {
    test_type: 'ticketing_concurrency',
  },
};

export function ticketingScenario() {
  const userId = uuidv4();
  const showScheduleId = config.TEST_SHOW_SCHEDULE_ID;

  // 실제로는 대기열을 통과한 토큰을 받아야 하지만, 테스트에서는 모의 토큰 사용
  const admissionToken = `MOCK_ADMISSION_${userId}`;

  group('Ticketing Session', function () {
    // 1. 티켓팅 입장
    let sessionToken;
    group('Enter Ticketing', function () {
      const enterRes = http.post(
        `${config.BASE_URL}/api/ticketing/${showScheduleId}/enter`,
        null,
        {
          headers: {
            'X-User-Id': userId,
            'X-Admission-Token': admissionToken,
          },
          tags: { name: 'ticketing_enter' },
        }
      );

      ticketingEnterCounter.add(1);

      const enterSuccess = check(enterRes, {
        'ticketing enter successful': (r) => r.status === 200,
        'received session token': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data && body.data.sessionToken;
          } catch {
            return false;
          }
        },
      });

      ticketingSuccessRate.add(enterSuccess);

      if (!enterSuccess) {
        console.error(`Ticketing entry failed: ${enterRes.status}`);
        return;
      }

      try {
        const body = JSON.parse(enterRes.body);
        sessionToken = body.data.sessionToken;
      } catch (error) {
        console.error(`Failed to parse session token: ${error}`);
        return;
      }

      sleep(1);
    });

    if (!sessionToken) {
      return;
    }

    // 2. 좌석 배치도 조회
    group('Get Seats', function () {
      const seatsRes = http.get(
        `${config.BASE_URL}/api/ticketing/${showScheduleId}`,
        {
          headers: {
            'X-User-Id': userId,
            'X-Session-Ticket': sessionToken,
          },
          tags: { name: 'get_seats' },
        }
      );

      checkResponse(seatsRes, 'Get Seats');
      sleep(Math.random() * 2 + 1); // 1-3초 좌석 선택 시간
    });

    // 3. 좌석 선점 시도
    let heldSeatIds = [];
    group('Hold Seats', function () {
      // 1-4개 랜덤 좌석 선택
      const seatCount = Math.floor(Math.random() * 4) + 1;
      const seatIds = randomSeats(seatCount, 1, 200);

      const holdRes = http.post(
        `${config.BASE_URL}/api/ticketing/${showScheduleId}/hold/seat`,
        JSON.stringify({ scheduledSeatIds: seatIds }),
        {
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
            'X-Session-Ticket': sessionToken,
          },
          tags: { name: 'hold_seat' },
        }
      );

      seatHoldCounter.add(1);

      const holdSuccess = check(holdRes, {
        'seat hold request processed': (r) => r.status === 200 || r.status === 409 || r.status === 400,
        'seat hold successful': (r) => r.status === 200,
        'seat conflict (already held)': (r) => r.status === 409,
        'invalid seat selection': (r) => r.status === 400,
      });

      if (holdRes.status === 200) {
        heldSeatIds = seatIds;
        seatHoldSuccessRate.add(true);
        console.log(`User ${userId} held ${seatIds.length} seats: ${seatIds.join(',')}`);
      } else if (holdRes.status === 409) {
        seatConflictCounter.add(1);
        seatHoldSuccessRate.add(false);
        console.log(`User ${userId} seat conflict`);
      } else {
        seatHoldSuccessRate.add(false);
      }

      sleep(1);
    });

    // 4. Heartbeat으로 세션 유지 (좌석 선점 성공한 경우)
    if (heldSeatIds.length > 0) {
      group('Maintain Session', function () {
        const heartbeatCount = Math.floor(Math.random() * 3) + 2; // 2-4회 heartbeat

        for (let i = 0; i < heartbeatCount; i++) {
          sleep(10); // 10초 간격

          const heartbeatRes = http.post(
            `${config.BASE_URL}/api/ticketing/${showScheduleId}/heartbeat`,
            null,
            {
              headers: {
                'X-User-Id': userId,
                'X-Session-Ticket': sessionToken,
              },
              tags: { name: 'heartbeat' },
            }
          );

          const heartbeatOk = check(heartbeatRes, {
            'heartbeat successful': (r) => r.status === 200,
            'session expired': (r) => r.status === 401 || r.status === 403,
          });

          if (heartbeatRes.status === 401 || heartbeatRes.status === 403) {
            sessionExpiredCounter.add(1);
            console.warn(`User ${userId} session expired`);
            break;
          }
        }
      });

      // 5. 좌석 반납 (50% 확률 - 일부는 구매로 진행, 일부는 취소)
      if (Math.random() > 0.5) {
        group('Release Seats', function () {
          sleep(Math.random() * 3 + 2); // 2-5초 고민

          const releaseRes = http.del(
            `${config.BASE_URL}/api/ticketing/${showScheduleId}/hold/seat`,
            JSON.stringify({ scheduledSeatIds: heldSeatIds }),
            {
              headers: {
                'Content-Type': 'application/json',
                'X-User-Id': userId,
                'X-Session-Ticket': sessionToken,
              },
              tags: { name: 'release_seat' },
            }
          );

          seatReleaseCounter.add(1);

          check(releaseRes, {
            'seat release successful': (r) => r.status === 200,
          });

          console.log(`User ${userId} released ${heldSeatIds.length} seats`);
        });
      } else {
        // 구매로 진행하는 사용자는 세션 유지만 함
        console.log(`User ${userId} proceeding to booking`);
      }
    }
  });

  // 사용자 행동 간 대기
  sleep(Math.random() * 2 + 1);
}

export function handleSummary(data) {
  const ticketingMetrics = {
    test: 'Ticketing Concurrency Test',
    timestamp: new Date().toISOString(),
    ticketing_sessions: data.metrics.ticketing_enter_total?.values.count || 0,
    seat_hold_attempts: data.metrics.seat_hold_total?.values.count || 0,
    seat_conflicts: data.metrics.seat_conflict_total?.values.count || 0,
    seat_releases: data.metrics.seat_release_total?.values.count || 0,
    session_expirations: data.metrics.session_expired_total?.values.count || 0,
    seat_hold_success_rate: data.metrics.seat_hold_success_rate?.values.rate || 0,
    ticketing_success_rate: data.metrics.ticketing_success_rate?.values.rate || 0,
    hold_seat_p95_ms: data.metrics['http_req_duration{name:hold_seat}']?.values['p(95)'] || 0,
    hold_seat_p99_ms: data.metrics['http_req_duration{name:hold_seat}']?.values['p(99)'] || 0,
  };

  console.log('\n========== Ticketing Concurrency Test Results ==========');
  console.log(`Ticketing Sessions: ${ticketingMetrics.ticketing_sessions}`);
  console.log(`Seat Hold Attempts: ${ticketingMetrics.seat_hold_attempts}`);
  console.log(`Seat Conflicts: ${ticketingMetrics.seat_conflicts} (${((ticketingMetrics.seat_conflicts / ticketingMetrics.seat_hold_attempts) * 100).toFixed(2)}%)`);
  console.log(`Seat Hold Success Rate: ${(ticketingMetrics.seat_hold_success_rate * 100).toFixed(2)}%`);
  console.log(`Hold Seat P95: ${ticketingMetrics.hold_seat_p95_ms.toFixed(2)}ms`);
  console.log(`Hold Seat P99: ${ticketingMetrics.hold_seat_p99_ms.toFixed(2)}ms`);
  console.log(`Session Expirations: ${ticketingMetrics.session_expirations}`);
  console.log('=======================================================\n');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '/Users/minjeongjun/projects/truve/load-tests/results/03-ticketing-concurrency-summary.json': JSON.stringify(data, null, 2),
    '/Users/minjeongjun/projects/truve/load-tests/results/03-ticketing-concurrency-metrics.json': JSON.stringify(ticketingMetrics, null, 2),
  };
}
