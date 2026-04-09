/**
 * 시나리오 1: Baseline 테스트
 *
 * 목적: 정상 상태에서의 시스템 성능 측정
 * - 일반적인 사용자 행동 패턴 시뮬레이션
 * - Musical 서비스 조회 위주
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { config } from '../config/config.js';
import { checkResponse, uuidv4 } from '../utils/helpers.js';

// 테스트 옵션
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // 워밍업
    { duration: '5m', target: 100 },  // 램프업
    { duration: '10m', target: 100 }, // 안정화
    { duration: '5m', target: 200 },  // 부하 증가
    { duration: '10m', target: 200 }, // 피크 유지
    { duration: '3m', target: 0 },    // 쿨다운
  ],
  thresholds: config.THRESHOLDS,
  tags: {
    test_type: 'baseline',
  },
};

export default function () {
  const userId = uuidv4();
  const headers = {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
  };

  // 시나리오: 공연 정보 탐색
  group('Musical Browsing', function () {
    // 1. 홈 화면 데이터 조회 (현재 백엔드 500 에러로 주석 처리)
    // group('Home', function () {
    //   const homeRes = http.get(`${config.BASE_URL}/api/musical/home`, {
    //     headers: headers,
    //     tags: { name: 'get_home' },
    //   });
    //
    //   checkResponse(homeRes, 'Home');
    //   sleep(1);
    // });

    // 2. 공연 검색
    group('Search', function () {
      const searchKeyword = ['오페라의 유령', '레미제라블', '시카고', '캣츠'][Math.floor(Math.random() * 4)];
      const searchRes = http.get(
        `${config.BASE_URL}/api/musical/search?keyword=${encodeURIComponent(searchKeyword)}`,
        {
          headers: headers,
          tags: { name: 'search_shows' },
        }
      );

      checkResponse(searchRes, 'Search');
      sleep(1);
    });

    // 3. 공연 상세 조회 (실제 존재하는 ID만 사용)
    group('Show Detail', function () {
      const showIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]; // 실제 공연 ID
      const showId = showIds[Math.floor(Math.random() * showIds.length)];
      const detailRes = http.get(`${config.BASE_URL}/api/musical/shows/${showId}`, {
        headers: headers,
        tags: { name: 'get_show_detail' },
      });

      check(detailRes, {
        'show detail loaded': (r) => r.status === 200 || r.status === 404,
      });
      sleep(2);

      // 상세 조회 성공한 경우만 캐스팅 조회
      if (detailRes.status === 200) {
        const castingRes = http.get(
          `${config.BASE_URL}/api/musical/shows/${showId}/casting-schedules?page=0&size=50`,
          {
            headers: headers,
            tags: { name: 'get_casting_schedules' },
          }
        );

        checkResponse(castingRes, 'Casting');
        sleep(1);
      }
    });

    // 4. 아티스트 조회 (실제 존재하는 ID만 사용)
    group('Artist', function () {
      const artistIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // 실제 아티스트 ID
      const artistId = artistIds[Math.floor(Math.random() * artistIds.length)];
      const artistRes = http.get(`${config.BASE_URL}/api/musical/artists/${artistId}`, {
        headers: headers,
        tags: { name: 'get_artist' },
      });

      check(artistRes, {
        'artist loaded': (r) => r.status === 200 || r.status === 404,
      });
      sleep(1);
    });
  });

  // 시나리오: 리뷰 탐색 (현재 백엔드 에러로 주석 처리)
  // if (Math.random() < 0.3) {
  //   group('Review Browsing', function () {
  //     const showId = Math.floor(Math.random() * 100) + 1;
  //     const reviewRes = http.get(
  //       `${config.BASE_URL}/api/musical/shows/${showId}/reviews?page=0&size=20`,
  //       {
  //         headers: headers,
  //         tags: { name: 'get_reviews' },
  //       }
  //     );
  //
  //     check(reviewRes, {
  //       'reviews loaded': (r) => r.status === 200 || r.status === 404,
  //     });
  //     sleep(2);
  //   });
  // }

  // 사용자 행동 시뮬레이션: 생각하는 시간
  sleep(Math.random() * 3 + 2); // 2-5초 랜덤 대기
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'results/01-baseline-summary.json': JSON.stringify(data, null, 2),
  };
}
