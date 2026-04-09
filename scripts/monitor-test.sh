#!/bin/bash

# k6 테스트 실시간 모니터링 스크립트
# 사용법: ./scripts/monitor-test.sh <scenario-file>

SCENARIO=${1:-scenarios/01-baseline.js}
OUTPUT_DIR="results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTPUT_FILE="${OUTPUT_DIR}/${TIMESTAMP}-test.json"

mkdir -p ${OUTPUT_DIR}

echo "========================================="
echo "🎯 k6 Load Test Monitor"
echo "========================================="
echo "Scenario: ${SCENARIO}"
echo "Output: ${OUTPUT_FILE}"
echo "========================================="
echo ""

# k6 실행 (백그라운드)
k6 run \
  --out json=${OUTPUT_FILE} \
  --summary-export=${OUTPUT_DIR}/${TIMESTAMP}-summary.json \
  ${SCENARIO} &

K6_PID=$!

echo "✅ k6 테스트 시작됨 (PID: ${K6_PID})"
echo ""

# 실시간 모니터링
watch_interval=5
while kill -0 ${K6_PID} 2>/dev/null; do
  clear
  echo "========================================="
  echo "📊 실시간 k6 모니터링 (${watch_interval}초마다 갱신)"
  echo "========================================="
  echo ""

  # JSON 파일에서 최신 메트릭 추출
  if [ -f "${OUTPUT_FILE}" ]; then
    echo "📈 최근 메트릭:"
    tail -100 ${OUTPUT_FILE} | jq -r 'select(.type=="Point") |
      "[\(.metric)] \(.data.time): \(.data.value)"' | tail -20

    echo ""
    echo "📊 현재 VU 및 Iteration:"
    tail -100 ${OUTPUT_FILE} | jq -r 'select(.metric=="vus" or .metric=="iterations") |
      "[\(.metric)] \(.data.value)"' | tail -5
  fi

  echo ""
  echo "⏱️  다음 업데이트: ${watch_interval}초 후... (Ctrl+C로 종료)"
  sleep ${watch_interval}
done

echo ""
echo "✅ 테스트 완료!"
echo "📁 결과 파일: ${OUTPUT_FILE}"
