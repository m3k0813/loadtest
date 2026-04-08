// Truve 프로젝트 실제 설정
// 이 파일을 config.js로 복사하여 사용하세요: cp config.truve.js config.js

export const config = {
  // ==================== 실제 API Gateway URL ====================
  // Kubernetes Ingress 또는 VirtualService 확인 후 수정
  BASE_URL: __ENV.BASE_URL || 'https://gateway.truve.site',

  // ==================== 실제 테스트 데이터 ====================
  // TODO: 데이터베이스에서 실제 공연 ID 확인 후 수정
  // SELECT id, title FROM shows WHERE status='ACTIVE' LIMIT 1;
  TEST_SHOW_ID: __ENV.TEST_SHOW_ID || 'show-12345',

  // TODO: 데이터베이스에서 실제 공연 회차 ID 확인 후 수정
  // SELECT id, show_date FROM show_schedules WHERE show_id = 'show-12345' LIMIT 1;
  TEST_SHOW_SCHEDULE_ID: parseInt(__ENV.TEST_SHOW_SCHEDULE_ID || '123'),

  // ==================== API 엔드포인트 (실제 라우팅 기반) ====================
  // API Gateway routes (application.yml 참고)
  ENDPOINTS: {
    // Musical Service
    MUSICAL_HOME: '/api/musical/home',
    MUSICAL_SHOWS: '/api/musical/shows',
    MUSICAL_SEARCH: '/api/musical/search',
    MUSICAL_ARTISTS: '/api/musical/artists',
    MUSICAL_REVIEWS: '/api/musical/reviews',

    // Queue Service (인증 필요)
    QUEUE_ENTER: '/api/queue/{showId}/enter',
    QUEUE_STATUS: '/api/queue/{showId}/status',

    // Ticketing Service (인증 필요)
    TICKETING_ENTER: '/api/ticketing/{showScheduleId}/enter',
    TICKETING_HEARTBEAT: '/api/ticketing/{showScheduleId}/heartbeat',
    TICKETING_SEATS: '/api/ticketing/{showScheduleId}',
    TICKETING_HOLD_SEAT: '/api/ticketing/{showScheduleId}/hold/seat',

    // Booking Service
    BOOKINGS: '/api/bookings',
    BOOKING_ORDER: '/api/bookings/{reservationNumber}/order',
    BOOKING_PAYMENT_READY: '/api/bookings/{reservationNumber}/payment-ready',

    // Payment Service
    PAYMENTS: '/api/payments',
    PAYMENT_WEBHOOK: '/api/webhooks',

    // Auth Service
    AUTH_LOGIN: '/api/auth/login',
    AUTH_ME: '/api/auth/me',
    AUTH_LOGOUT: '/api/auth/logout',
  },

  // ==================== 인증 설정 ====================
  // API Gateway에서 JwtAuthenticationFilter 사용
  AUTH: {
    // Queue, Ticketing은 JWT 필요
    REQUIRED_ENDPOINTS: [
      '/api/queue/**',
      '/api/ticketing/**',
      '/api/auth/me',
      '/api/auth/logout',
    ],
    // TODO: 테스트용 JWT 토큰 생성 방법 확인
    // Option 1: 백엔드에 테스트 계정 생성
    // Option 2: JWT secret으로 직접 토큰 생성
    JWT_SECRET: __ENV.JWT_SECRET || 'kt-cloud-tech-up-final-project-2026020201010101',
    TEST_USER_ID: __ENV.TEST_USER_ID || '00000000-0000-0000-0000-000000000001',
  },

  // ==================== 타임아웃 설정 ====================
  TIMEOUT: {
    DEFAULT: 30000,
    QUEUE_POLLING: 300000,  // 5분 (대기열 폴링)
    PAYMENT: 60000,
  },

  // ==================== 재시도 설정 ====================
  RETRY: {
    MAX_ATTEMPTS: 3,
    BACKOFF_MS: 1000,
  },

  // ==================== 대기열 설정 ====================
  QUEUE: {
    POLLING_INTERVAL_MS: 5000,  // 5초마다 폴링
    MAX_POLLING_ATTEMPTS: 60,   // 최대 5분 대기
  },

  // ==================== 좌석 선택 설정 ====================
  SEAT: {
    MIN_SEATS: 1,
    MAX_SEATS: 4,
    // TODO: 실제 좌석 ID 범위 확인
    // SELECT MIN(id), MAX(id) FROM scheduled_seats WHERE show_schedule_id = 123;
    MIN_SEAT_ID: 1,
    MAX_SEAT_ID: 500,  // 기본값, 실제 값으로 수정 필요
  },

  // ==================== 성능 임계값 ====================
  THRESHOLDS: {
    // 전체 HTTP 요청
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.02'],
    http_reqs: ['rate>100'],

    // Musical Service (공개 API, 빠름)
    'http_req_duration{name:musical_*}': ['p(95)<1000'],

    // Queue Service (Redis, 빠름)
    'http_req_duration{name:queue_*}': ['p(95)<1000'],

    // Ticketing Service (DB Lock, 느림)
    'http_req_duration{name:ticketing_*}': ['p(95)<3000'],

    // Payment Service (외부 API, 가장 느림)
    'http_req_duration{name:payment_*}': ['p(95)<5000'],
  },

  // ==================== 부하 레벨 설정 ====================
  LOAD_LEVELS: {
    // 레벨 1: 안전한 테스트
    SAFE: {
      vus: 100,
      duration: '5m',
      rampUp: '2m',
    },
    // 레벨 2: 중간 부하
    MEDIUM: {
      vus: 500,
      duration: '10m',
      rampUp: '3m',
    },
    // 레벨 3: 고부하 (주의!)
    HIGH: {
      vus: 1000,
      duration: '15m',
      rampUp: '5m',
    },
    // 레벨 4: 극한 부하 (프로덕션 금지!)
    EXTREME: {
      vus: 5000,
      duration: '20m',
      rampUp: '10m',
    },
  },
};

// ==================== 환경별 설정 ====================
export function getEnvironmentConfig(env) {
  const configs = {
    local: {
      BASE_URL: 'http://localhost:8080',
      // 로컬 환경에서는 인증 우회 가능
      AUTH: {
        ...config.AUTH,
        BYPASS: true,
      },
    },
    staging: {
      // TODO: 실제 스테이징 URL로 수정
      BASE_URL: 'https://staging-gateway.truve.site',
      LOAD_LEVELS: config.LOAD_LEVELS.SAFE,  // 스테이징은 안전하게
    },
    production: {
      // TODO: 실제 프로덕션 URL로 수정
      BASE_URL: 'https://gateway.truve.site',
      LOAD_LEVELS: config.LOAD_LEVELS.MEDIUM,  // 프로덕션은 중간 부하부터
    },
  };

  return { ...config, ...(configs[env] || {}) };
}

// ==================== Kubernetes 서비스 URL (내부 테스트용) ====================
export const K8S_SERVICES = {
  GATEWAY: 'http://gateway-service.default.svc.cluster.local:8080',
  AUTH: 'http://auth-service.default.svc.cluster.local:8081',
  PAYMENT: 'http://payment-service.default.svc.cluster.local:8082',
  QUEUE: 'http://queue-service.default.svc.cluster.local:8083',
  TICKETING: 'http://ticketing-service.default.svc.cluster.local:8084',
  MUSICAL: 'http://musical-service.default.svc.cluster.local:8085',
};

// ==================== 실제 데이터 조회 쿼리 ====================
export const DATA_QUERIES = {
  GET_TEST_SHOW: `
    SELECT id, title, start_date, end_date
    FROM shows
    WHERE status = 'ACTIVE'
      AND end_date > CURRENT_DATE
    ORDER BY created_at DESC
    LIMIT 1;
  `,

  GET_TEST_SCHEDULE: `
    SELECT ss.id, ss.show_date, ss.show_time
    FROM show_schedules ss
    WHERE ss.show_id = :showId
      AND ss.show_date > CURRENT_DATE
    ORDER BY ss.show_date ASC
    LIMIT 1;
  `,

  GET_SEAT_RANGE: `
    SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as total
    FROM scheduled_seats
    WHERE show_schedule_id = :scheduleId;
  `,
};
