#!/bin/bash

# k6 웹 대시보드와 함께 테스트 실행
# 사용법: ./scripts/run-with-dashboard.sh <scenario> <vus> <duration>

SCENARIO=${1:-scenarios/01-baseline.js}
VUS=${2:-10}
DURATION=${3:-2m}

echo "========================================="
echo "🚀 k6 Load Test with Web Dashboard"
echo "========================================="
echo "📝 Scenario: ${SCENARIO}"
echo "👥 VUs: ${VUS}"
echo "⏱️  Duration: ${DURATION}"
echo "========================================="
echo ""
echo "🌐 웹 대시보드 접속:"
echo "   1. SSH 터널링 (로컬 터미널):"
echo "      ssh -i your-key.pem -L 5665:localhost:5665 ubuntu@<EC2-IP>"
echo ""
echo "   2. 브라우저 열기:"
echo "      http://localhost:5665"
echo ""
echo "========================================="
echo ""

# k6 웹 대시보드와 함께 실행
k6 run \
  --out web-dashboard \
  --vus ${VUS} \
  --duration ${DURATION} \
  ${SCENARIO}
