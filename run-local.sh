#!/bin/bash

# Truve 부하 테스트 실행 스크립트 (로컬)
# 사용법: ./run-local.sh [scenario] [environment]
# 예시: ./run-local.sh baseline local
#       ./run-local.sh e2e staging

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 기본 설정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIOS_DIR="${SCRIPT_DIR}/scenarios"
RESULTS_DIR="${SCRIPT_DIR}/results"
CONFIG_DIR="${SCRIPT_DIR}/config"

# 환경 설정
SCENARIO="${1:-baseline}"
ENVIRONMENT="${2:-local}"

# 환경별 URL 설정
case "${ENVIRONMENT}" in
  local)
    BASE_URL="http://localhost:8080"
    ;;
  staging)
    BASE_URL="https://staging.gateway.truve.site"
    ;;
  production)
    BASE_URL="https://gateway.truve.site"
    ;;
  *)
    echo -e "${RED}Unknown environment: ${ENVIRONMENT}${NC}"
    echo "Valid options: local, staging, production"
    exit 1
    ;;
esac

# 시나리오 매핑
declare -A SCENARIO_FILES=(
  ["baseline"]="01-baseline.js"
  ["queue"]="02-queue-spike.js"
  ["ticketing"]="03-ticketing-concurrency.js"
  ["e2e"]="04-e2e-flow.js"
  ["all"]="all"
)

SCENARIO_FILE="${SCENARIO_FILES[${SCENARIO}]}"

if [ -z "${SCENARIO_FILE}" ]; then
  echo -e "${RED}Unknown scenario: ${SCENARIO}${NC}"
  echo "Valid scenarios: baseline, queue, ticketing, e2e, all"
  exit 1
fi

# k6 설치 확인
if ! command -v k6 &> /dev/null; then
  echo -e "${RED}k6 is not installed${NC}"
  echo "Install k6: https://k6.io/docs/getting-started/installation/"
  echo ""
  echo "macOS: brew install k6"
  echo "Linux: sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69"
  echo "       echo \"deb https://dl.k6.io/deb stable main\" | sudo tee /etc/apt/sources.list.d/k6.list"
  echo "       sudo apt-get update && sudo apt-get install k6"
  exit 1
fi

# 결과 디렉토리 생성
mkdir -p "${RESULTS_DIR}"

# 테스트 정보 출력
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Truve Load Test Runner${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Scenario:    ${GREEN}${SCENARIO}${NC}"
echo -e "Environment: ${GREEN}${ENVIRONMENT}${NC}"
echo -e "Base URL:    ${GREEN}${BASE_URL}${NC}"
echo -e "Results:     ${GREEN}${RESULTS_DIR}${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 테스트 실행 함수
run_test() {
  local test_file="$1"
  local test_name="$(basename ${test_file} .js)"

  echo -e "${YELLOW}Running test: ${test_name}${NC}"

  k6 run \
    --env BASE_URL="${BASE_URL}" \
    --env TEST_SHOW_ID="show-12345" \
    --env TEST_SHOW_SCHEDULE_ID="123" \
    --out json="${RESULTS_DIR}/${test_name}-$(date +%Y%m%d-%H%M%S).json" \
    "${test_file}"

  local exit_code=$?

  if [ ${exit_code} -eq 0 ]; then
    echo -e "${GREEN}✓ Test completed: ${test_name}${NC}"
  else
    echo -e "${RED}✗ Test failed: ${test_name}${NC}"
    return ${exit_code}
  fi

  echo ""
}

# 테스트 실행
if [ "${SCENARIO}" == "all" ]; then
  echo -e "${YELLOW}Running all test scenarios...${NC}"
  echo ""

  for scenario_file in "${SCENARIOS_DIR}"/*.js; do
    run_test "${scenario_file}" || true
    echo -e "${YELLOW}Waiting 30 seconds before next test...${NC}"
    sleep 30
  done
else
  run_test "${SCENARIOS_DIR}/${SCENARIO_FILE}"
fi

# 결과 요약
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Results${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Results saved to: ${GREEN}${RESULTS_DIR}${NC}"
echo ""

# 최신 결과 파일 표시
latest_results=$(ls -t "${RESULTS_DIR}"/*.json 2>/dev/null | head -5)
if [ -n "${latest_results}" ]; then
  echo -e "${YELLOW}Latest result files:${NC}"
  echo "${latest_results}" | while read -r file; do
    echo "  - $(basename ${file})"
  done
  echo ""
fi

echo -e "${GREEN}Done!${NC}"
