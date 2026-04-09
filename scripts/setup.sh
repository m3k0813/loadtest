#!/bin/bash

# 로드 테스트 환경 설정 스크립트

echo "========================================="
echo "🔧 Load Test 환경 설정"
echo "========================================="

# 1. 필수 디렉토리 생성
echo "📁 디렉토리 생성 중..."
mkdir -p results
mkdir -p logs

# 2. 실행 권한 부여
echo "🔐 실행 권한 설정 중..."
chmod +x run-local.sh
chmod +x scripts/*.sh

# 3. .env 파일 확인
if [ ! -f .env ]; then
  echo "⚠️  .env 파일이 없습니다. 템플릿 복사 중..."
  cp .env.template .env
  echo "✅ .env 파일이 생성되었습니다. 실제 값으로 수정하세요!"
else
  echo "✅ .env 파일 존재"
fi

# 4. k6 설치 확인
if ! command -v k6 &> /dev/null; then
  echo "⚠️  k6가 설치되지 않았습니다."
  echo "설치하시겠습니까? (y/n)"
  read -r answer
  if [ "$answer" = "y" ]; then
    echo "📦 k6 설치 중..."
    curl -s https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
    sudo apt-get update && sudo apt-get install k6 -y
  fi
else
  echo "✅ k6 설치됨: $(k6 version)"
fi

# 5. API 연결 테스트
echo ""
echo "🌐 API 연결 테스트..."
if [ -f .env ]; then
  BASE_URL=$(grep "^BASE_URL=" .env | cut -d'=' -f2)
  echo "Testing: ${BASE_URL}/api/musical/search?keyword=test"

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/musical/search?keyword=test")

  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ API 연결 성공 (HTTP ${HTTP_CODE})"
  else
    echo "⚠️  API 연결 실패 (HTTP ${HTTP_CODE})"
  fi
fi

echo ""
echo "========================================="
echo "✅ 환경 설정 완료!"
echo "========================================="
echo ""
echo "다음 명령어로 테스트 시작:"
echo "  ./scripts/run-with-dashboard.sh scenarios/01-baseline.js 10 2m"
echo ""
