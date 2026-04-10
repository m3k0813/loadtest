/**
 * 시나리오 5: 간단한 티켓팅 테스트
 *
 * 목적: 티켓 예매 API만 테스트
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { config } from '../config/config.js';
import { uuidv4, generateUserData } from '../utils/helpers.js';
import { generateJWT } from '../utils/jwt.js';

export const options = {
  vus: 100,
  duration: '5m',
  thresholds: {
    'http_req_duration': ['p(95)<2000', 'p(99)<5000'],
    'http_req_failed': ['rate<0.05'],  // 5% 미만 실패
  },
};

export default function () {
  const userId = uuidv4();
  const showId = config.TEST_SHOW_ID;
  const scheduleId = config.TEST_SHOW_SCHEDULE_ID;

  // JWT 토큰 생성
  const jwtSecret = __ENV.JWT_SECRET || 'kt-cloud-tech-up-final-project-2026020201010101';
  const token = generateJWT(userId, jwtSecret);

  const headers = {
    'X-User-Id': userId,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  group('Ticketing Flow', function () {
    // 1. 공연 정보 조회
    const showRes = http.get(`${config.BASE_URL}/api/musical/shows/${showId}`, {
      headers: headers,
      tags: { name: 'get_show' },
    });

    check(showRes, {
      'show detail loaded': (r) => r.status === 200,
    });

    sleep(1);

    // 2. 좌석 선택 (랜덤 좌석 ID)
    const seatId = Math.floor(Math.random() * (3085 - 2009 + 1)) + 2009;

    const reservePayload = JSON.stringify({
      scheduleId: scheduleId,
      seatIds: [seatId],
    });

    const reserveRes = http.post(
      `${config.BASE_URL}/api/ticketing/reserve`,
      reservePayload,
      {
        headers: headers,
        tags: { name: 'reserve_ticket' },
      }
    );

    const reserveSuccess = check(reserveRes, {
      'reservation successful': (r) => r.status === 200 || r.status === 201,
      'reservation response time ok': (r) => r.timings.duration < 3000,
    });

    if (!reserveSuccess) {
      console.error(`Reservation failed for user ${userId}: ${reserveRes.status} - ${reserveRes.body}`);
      return;
    }

    sleep(2);

    // 3. 결제 (예약이 성공한 경우에만)
    if (reserveSuccess && reserveRes.status === 200) {
      try {
        const reserveData = JSON.parse(reserveRes.body);
        const reservationId = reserveData.data?.reservationId || reserveData.reservationId;

        if (reservationId) {
          const userData = generateUserData();
          const paymentPayload = JSON.stringify({
            reservationId: reservationId,
            paymentMethod: 'CARD',
            customerName: userData.name,
            customerEmail: userData.email,
            customerPhone: userData.phone,
          });

          const paymentRes = http.post(
            `${config.BASE_URL}/api/ticketing/payment`,
            paymentPayload,
            {
              headers: headers,
              tags: { name: 'payment' },
            }
          );

          check(paymentRes, {
            'payment successful': (r) => r.status === 200 || r.status === 201,
            'payment response time ok': (r) => r.timings.duration < 3000,
          });

          if (paymentRes.status !== 200 && paymentRes.status !== 201) {
            console.error(`Payment failed: ${paymentRes.status} - ${paymentRes.body}`);
          }
        }
      } catch (e) {
        console.error(`Failed to parse reservation response: ${e}`);
      }
    }

    sleep(1);
  });
}

export function handleSummary(data) {
  console.log('\n========== Ticketing Test Results ==========');
  console.log(`Total Requests: ${data.metrics.http_reqs?.values.count || 0}`);
  console.log(`Request Rate: ${(data.metrics.http_reqs?.values.rate || 0).toFixed(2)} req/s`);
  console.log(`Avg Response Time: ${(data.metrics.http_req_duration?.values.avg || 0).toFixed(2)}ms`);
  console.log(`P95 Response Time: ${(data.metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2)}ms`);
  console.log(`Error Rate: ${((data.metrics.http_req_failed?.values.rate || 0) * 100).toFixed(2)}%`);
  console.log('============================================\n');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'results/05-ticketing-simple-summary.json': JSON.stringify(data, null, 2),
  };
}
