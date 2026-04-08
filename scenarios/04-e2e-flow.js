/**
 * 시나리오 4: End-to-End Flow 테스트
 *
 * 목적: 대기열 → 티켓팅 → 예매 → 결제 전체 플로우 검증
 * - 실제 사용자 여정 완전 시뮬레이션
 * - 전체 시스템 통합 성능 측정
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { config } from '../config/config.js';
import {
  uuidv4,
  randomSeats,
  generateUserData,
  pollQueueStatus,
  checkResponse,
  queueEnterCounter,
  ticketingEnterCounter,
  seatHoldSuccessRate,
  paymentSuccessRate,
} from '../utils/helpers.js';
import { Counter, Trend } from 'k6/metrics';

// 커스텀 메트릭
const bookingCreatedCounter = new Counter('booking_created_total');
const paymentCompletedCounter = new Counter('payment_completed_total');
const fullJourneyCompletedCounter = new Counter('full_journey_completed_total');
const e2eJourneyTime = new Trend('e2e_journey_time_ms');

// 테스트 옵션
export const options = {
  scenarios: {
    e2e_user_journey: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },    // 워밍업
        { duration: '5m', target: 200 },   // 램프업
        { duration: '10m', target: 300 },  // 안정화
        { duration: '5m', target: 500 },   // 피크
        { duration: '5m', target: 300 },   // 감소
        { duration: '3m', target: 0 },     // 종료
      ],
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<5000', 'p(99)<10000'],
    'http_req_failed': ['rate<0.03'],
    'e2e_journey_time_ms': ['p(95)<600000'], // E2E 95%는 10분 이내
    'seat_hold_success_rate': ['rate>0.6'],
    'payment_success_rate': ['rate>0.95'],
  },
  tags: {
    test_type: 'e2e_flow',
  },
};

export default function () {
  const journeyStartTime = Date.now();
  const userId = uuidv4();
  const showId = config.TEST_SHOW_ID;
  const showScheduleId = config.TEST_SHOW_SCHEDULE_ID;

  let admissionToken;
  let sessionToken;
  let heldSeatIds = [];
  let reservationNumber;

  // ==================== PHASE 1: 대기열 ====================
  group('Phase 1: Queue', function () {
    // 1-1. 공연 정보 확인
    group('Check Show Info', function () {
      const showRes = http.get(`${config.BASE_URL}/api/musical/shows/${showId}`, {
        headers: { 'X-User-Id': userId },
        tags: { name: 'e2e_show_detail' },
      });

      checkResponse(showRes, 'Show Detail');
      sleep(Math.random() * 2 + 1);
    });

    // 1-2. 대기열 진입
    group('Enter Queue', function () {
      const enterRes = http.post(
        `${config.BASE_URL}/api/queue/${showId}/enter`,
        null,
        {
          headers: { 'X-User-Id': userId },
          tags: { name: 'e2e_queue_enter' },
        }
      );

      queueEnterCounter.add(1);

      const enterSuccess = checkResponse(enterRes, 'Queue Enter');
      if (!enterSuccess) {
        console.error(`[${userId}] Queue entry failed`);
        return;
      }

      console.log(`[${userId}] Entered queue`);
      sleep(2);
    });

    // 1-3. 대기열 폴링
    group('Poll Queue Status', function () {
      const queueResult = pollQueueStatus(
        http,
        config.BASE_URL,
        showId,
        userId,
        config.QUEUE.MAX_POLLING_ATTEMPTS,
        config.QUEUE.POLLING_INTERVAL_MS
      );

      if (queueResult.success) {
        admissionToken = queueResult.token;
        console.log(`[${userId}] Queue cleared in ${(queueResult.waitTime / 1000).toFixed(2)}s`);
      } else {
        console.error(`[${userId}] Queue timeout after ${(queueResult.waitTime / 1000).toFixed(2)}s`);
        return;
      }
    });
  });

  if (!admissionToken) {
    console.error(`[${userId}] No admission token, aborting journey`);
    return;
  }

  // ==================== PHASE 2: 티켓팅 ====================
  group('Phase 2: Ticketing', function () {
    // 2-1. 티켓팅 입장
    group('Enter Ticketing', function () {
      const enterRes = http.post(
        `${config.BASE_URL}/api/ticketing/${showScheduleId}/enter`,
        null,
        {
          headers: {
            'X-User-Id': userId,
            'X-Admission-Token': admissionToken,
          },
          tags: { name: 'e2e_ticketing_enter' },
        }
      );

      ticketingEnterCounter.add(1);

      const enterSuccess = check(enterRes, {
        'ticketing enter successful': (r) => r.status === 200,
      });

      if (!enterSuccess) {
        console.error(`[${userId}] Ticketing entry failed: ${enterRes.status}`);
        return;
      }

      try {
        const body = JSON.parse(enterRes.body);
        sessionToken = body.data.sessionToken;
        console.log(`[${userId}] Entered ticketing session`);
      } catch (error) {
        console.error(`[${userId}] Failed to parse session token`);
        return;
      }

      sleep(1);
    });

    if (!sessionToken) {
      return;
    }

    // 2-2. 좌석 배치도 조회
    group('View Seat Map', function () {
      const seatsRes = http.get(
        `${config.BASE_URL}/api/ticketing/${showScheduleId}`,
        {
          headers: {
            'X-User-Id': userId,
            'X-Session-Ticket': sessionToken,
          },
          tags: { name: 'e2e_get_seats' },
        }
      );

      checkResponse(seatsRes, 'Get Seats');
      sleep(Math.random() * 5 + 3); // 3-8초 좌석 선택 시간
    });

    // 2-3. 좌석 선점 (최대 3회 재시도)
    group('Select and Hold Seats', function () {
      const maxRetries = 3;
      let holdSuccess = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const seatCount = Math.floor(Math.random() * 3) + 1; // 1-3석
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
            tags: { name: 'e2e_hold_seat' },
          }
        );

        if (holdRes.status === 200) {
          heldSeatIds = seatIds;
          holdSuccess = true;
          seatHoldSuccessRate.add(true);
          console.log(`[${userId}] Held ${seatIds.length} seats on attempt ${attempt}`);
          break;
        } else if (holdRes.status === 409) {
          console.log(`[${userId}] Seat conflict on attempt ${attempt}, retrying...`);
          sleep(2); // 잠시 대기 후 재시도
        } else {
          console.error(`[${userId}] Seat hold failed: ${holdRes.status}`);
          break;
        }
      }

      if (!holdSuccess) {
        seatHoldSuccessRate.add(false);
        console.error(`[${userId}] Failed to hold seats after ${maxRetries} attempts`);
        return;
      }

      sleep(2);
    });

    if (heldSeatIds.length === 0) {
      return;
    }

    // 2-4. Heartbeat 유지
    group('Maintain Session', function () {
      for (let i = 0; i < 2; i++) {
        sleep(10);

        http.post(
          `${config.BASE_URL}/api/ticketing/${showScheduleId}/heartbeat`,
          null,
          {
            headers: {
              'X-User-Id': userId,
              'X-Session-Ticket': sessionToken,
            },
            tags: { name: 'e2e_heartbeat' },
          }
        );
      }
    });
  });

  if (heldSeatIds.length === 0) {
    return;
  }

  // ==================== PHASE 3: 예매 ====================
  group('Phase 3: Booking', function () {
    // 3-1. 예매 생성
    group('Create Booking', function () {
      const bookingRes = http.post(
        `${config.BASE_URL}/api/bookings`,
        JSON.stringify({
          showScheduleId: showScheduleId,
          scheduledSeatIds: heldSeatIds,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': userId,
          },
          tags: { name: 'e2e_create_booking' },
        }
      );

      const bookingSuccess = check(bookingRes, {
        'booking created': (r) => r.status === 200,
      });

      if (!bookingSuccess) {
        console.error(`[${userId}] Booking creation failed: ${bookingRes.status}`);
        return;
      }

      try {
        const body = JSON.parse(bookingRes.body);
        reservationNumber = body.data.reservationNumber;
        bookingCreatedCounter.add(1);
        console.log(`[${userId}] Booking created: ${reservationNumber}`);
      } catch (error) {
        console.error(`[${userId}] Failed to parse reservation number`);
        return;
      }

      sleep(1);
    });

    if (!reservationNumber) {
      return;
    }

    // 3-2. 예매 주문 정보 조회
    group('Get Order Info', function () {
      const orderRes = http.get(
        `${config.BASE_URL}/api/bookings/${reservationNumber}/order`,
        {
          tags: { name: 'e2e_get_order' },
        }
      );

      checkResponse(orderRes, 'Get Order');
      sleep(Math.random() * 3 + 2); // 2-5초 정보 확인
    });

    // 3-3. 결제 준비
    group('Prepare Payment', function () {
      const userData = generateUserData();

      const paymentReadyRes = http.post(
        `${config.BASE_URL}/api/bookings/${reservationNumber}/payment-ready`,
        JSON.stringify({
          name: userData.name,
          email: userData.email,
          phone: userData.phone,
        }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
          tags: { name: 'e2e_payment_ready' },
        }
      );

      checkResponse(paymentReadyRes, 'Payment Ready');
      sleep(1);
    });
  });

  if (!reservationNumber) {
    return;
  }

  // ==================== PHASE 4: 결제 ====================
  group('Phase 4: Payment', function () {
    // 실제 결제 시뮬레이션 (70% 성공률)
    const willPaymentSucceed = Math.random() < 0.7;

    sleep(Math.random() * 5 + 3); // 3-8초 결제 진행 시간

    const paymentRes = http.post(
      `${config.BASE_URL}/api/payments`,
      JSON.stringify({
        reservationNumber: reservationNumber,
        paymentMethod: Math.random() < 0.5 ? 'CARD' : 'BANK_TRANSFER',
        amount: heldSeatIds.length * 60000, // 좌석당 60,000원
      }),
      {
        headers: {
          'Content-Type': 'application/json',
        },
        tags: { name: 'e2e_payment' },
      }
    );

    const paymentSuccess = check(paymentRes, {
      'payment processed': (r) => r.status === 200 || r.status === 400,
      'payment successful': (r) => r.status === 200,
    });

    if (paymentRes.status === 200) {
      paymentSuccessRate.add(true);
      paymentCompletedCounter.add(1);
      fullJourneyCompletedCounter.add(1);

      const journeyTime = Date.now() - journeyStartTime;
      e2eJourneyTime.add(journeyTime);

      console.log(`[${userId}] ✅ FULL JOURNEY COMPLETED in ${(journeyTime / 1000).toFixed(2)}s`);
    } else {
      paymentSuccessRate.add(false);
      console.log(`[${userId}] ❌ Payment failed: ${paymentRes.status}`);
    }
  });

  sleep(1);
}

export function handleSummary(data) {
  const e2eMetrics = {
    test: 'End-to-End Flow Test',
    timestamp: new Date().toISOString(),
    queue_entries: data.metrics.queue_enter_total?.values.count || 0,
    ticketing_sessions: data.metrics.ticketing_enter_total?.values.count || 0,
    bookings_created: data.metrics.booking_created_total?.values.count || 0,
    payments_completed: data.metrics.payment_completed_total?.values.count || 0,
    full_journeys_completed: data.metrics.full_journey_completed_total?.values.count || 0,
    avg_journey_time_sec: (data.metrics.e2e_journey_time_ms?.values.avg || 0) / 1000,
    p95_journey_time_sec: (data.metrics.e2e_journey_time_ms?.values['p(95)'] || 0) / 1000,
    seat_hold_success_rate: data.metrics.seat_hold_success_rate?.values.rate || 0,
    payment_success_rate: data.metrics.payment_success_rate?.values.rate || 0,
    overall_success_rate: ((data.metrics.full_journey_completed_total?.values.count || 0) /
      (data.metrics.queue_enter_total?.values.count || 1)) || 0,
  };

  console.log('\n========== End-to-End Flow Test Results ==========');
  console.log(`Queue Entries: ${e2eMetrics.queue_entries}`);
  console.log(`Ticketing Sessions: ${e2eMetrics.ticketing_sessions}`);
  console.log(`Bookings Created: ${e2eMetrics.bookings_created}`);
  console.log(`Payments Completed: ${e2eMetrics.payments_completed}`);
  console.log(`Full Journeys Completed: ${e2eMetrics.full_journeys_completed}`);
  console.log(`\nSuccess Rates:`);
  console.log(`  Seat Hold: ${(e2eMetrics.seat_hold_success_rate * 100).toFixed(2)}%`);
  console.log(`  Payment: ${(e2eMetrics.payment_success_rate * 100).toFixed(2)}%`);
  console.log(`  Overall (Queue → Payment): ${(e2eMetrics.overall_success_rate * 100).toFixed(2)}%`);
  console.log(`\nJourney Time:`);
  console.log(`  Average: ${e2eMetrics.avg_journey_time_sec.toFixed(2)}s`);
  console.log(`  P95: ${e2eMetrics.p95_journey_time_sec.toFixed(2)}s`);
  console.log('==================================================\n');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    '/Users/minjeongjun/projects/truve/load-tests/results/04-e2e-flow-summary.json': JSON.stringify(data, null, 2),
    '/Users/minjeongjun/projects/truve/load-tests/results/04-e2e-flow-metrics.json': JSON.stringify(e2eMetrics, null, 2),
  };
}
