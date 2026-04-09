import encoding from 'k6/encoding';
import crypto from 'k6/crypto';

/**
 * JWT 토큰 생성 함수
 * @param {string} userId - 사용자 ID (UUID)
 * @param {string} secret - JWT 서명에 사용할 시크릿 키
 * @returns {string} JWT 토큰
 */
export function generateJWT(userId, secret) {
  // Header
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  // Payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId,
    iat: now,
    exp: now + 3600  // 1시간 후 만료
  };

  // Base64 URL 인코딩
  const encodedHeader = encoding.b64encode(JSON.stringify(header), 'rawurl');
  const encodedPayload = encoding.b64encode(JSON.stringify(payload), 'rawurl');

  // 서명할 데이터
  const data = `${encodedHeader}.${encodedPayload}`;

  // HMAC SHA-256 서명
  const signature = encoding.b64encode(
    crypto.hmac('sha256', secret, data, 'binary'),
    'rawurl'
  );

  // 최종 JWT 토큰
  return `${data}.${signature}`;
}
