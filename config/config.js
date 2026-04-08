// 부하 테스트 설정
export const config = {
  // 기본 URL
  BASE_URL: __ENV.BASE_URL || 'https://gateway.truve.site',

  // 테스트 데이터
  TEST_SHOW_ID: __ENV.TEST_SHOW_ID || 'show-12345',
  TEST_SHOW_SCHEDULE_ID: parseInt(__ENV.TEST_SHOW_SCHEDULE_ID || '123'),

  // 타임아웃 설정 (밀리초)
  TIMEOUT: {
    DEFAULT: 30000,
    QUEUE_POLLING: 300000,  // 5분
    PAYMENT: 60000,
  },

  // 재시도 설정
  RETRY: {
    MAX_ATTEMPTS: 3,
    BACKOFF_MS: 1000,
  },

  // 대기열 설정
  QUEUE: {
    POLLING_INTERVAL_MS: 5000,  // 5초마다 폴링
    MAX_POLLING_ATTEMPTS: 60,   // 최대 5분
  },

  // 좌석 선택 설정
  SEAT: {
    MIN_SEATS: 1,
    MAX_SEATS: 4,
  },

  // 성능 임계값
  THRESHOLDS: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],  // 95%는 2초, 99%는 5초 이내
    http_req_failed: ['rate<0.02'],  // 에러율 2% 미만
    http_reqs: ['rate>100'],  // 최소 100 req/s
  },
};

// 환경별 설정 오버라이드
export function getEnvironmentConfig(env) {
  const configs = {
    local: {
      BASE_URL: 'http://localhost:8080',
    },
    staging: {
      BASE_URL: 'https://staging.gateway.truve.site',
    },
    production: {
      BASE_URL: 'https://gateway.truve.site',
    },
  };

  return { ...config, ...(configs[env] || {}) };
}
