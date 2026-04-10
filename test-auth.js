/**
 * JWT 토큰 테스트 및 티켓팅 API 직접 테스트
 */

import http from 'k6/http';
import { check } from 'k6';
import { generateJWT } from './utils/jwt.js';
import { uuidv4 } from './utils/helpers.js';
import { config } from './config/config.js';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const userId = uuidv4();
  const jwtSecret = __ENV.JWT_SECRET || 'kt-cloud-tech-up-final-project-2026020201010101';
  const token = generateJWT(userId, jwtSecret);

  console.log('==================================');
  console.log('User ID:', userId);
  console.log('JWT Token:', token);
  console.log('==================================');

  const headers = {
    'X-User-Id': userId,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 1. 공연 정보 조회 테스트
  console.log('\n[1] Testing Show Detail API...');
  const showRes = http.get(`${config.BASE_URL}/api/musical/shows/${config.TEST_SHOW_ID}`, {
    headers: headers,
  });

  console.log(`Response Status: ${showRes.status}`);
  console.log(`Response Body: ${showRes.body.substring(0, 200)}...`);

  check(showRes, {
    'show API works': (r) => r.status === 200,
  });

  // 2. 티켓 예약 테스트
  console.log('\n[2] Testing Ticket Reserve API...');
  const seatId = Math.floor(Math.random() * (3085 - 2009 + 1)) + 2009;

  const reservePayload = JSON.stringify({
    scheduleId: config.TEST_SHOW_SCHEDULE_ID,
    seatIds: [seatId],
  });

  const reserveRes = http.post(
    `${config.BASE_URL}/api/ticketing/reserve`,
    reservePayload,
    { headers: headers }
  );

  console.log(`Response Status: ${reserveRes.status}`);
  console.log(`Response Body: ${reserveRes.body}`);

  check(reserveRes, {
    'reserve API works': (r) => r.status === 200 || r.status === 201,
  });

  // 3. 대기열 API 테스트 (참고용)
  console.log('\n[3] Testing Queue API (for reference)...');
  const queueRes = http.post(
    `${config.BASE_URL}/api/queue/${config.TEST_SHOW_ID}/enter`,
    null,
    { headers: headers }
  );

  console.log(`Response Status: ${queueRes.status}`);
  console.log(`Response Body: ${queueRes.body}`);
}
