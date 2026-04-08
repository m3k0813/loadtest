#!/bin/bash

# 실제 테스트 데이터 ID 조회 스크립트
# 사용법: ./scripts/get-test-data.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Truve Load Test - Get Test Data${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Postgres Pod 찾기
echo -e "${YELLOW}Finding Postgres pod...${NC}"
POSTGRES_POD=$(kubectl get pods -n default -l app=postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "$POSTGRES_POD" ]; then
  echo -e "${YELLOW}Postgres pod not found in 'default' namespace${NC}"
  echo -e "${YELLOW}Trying other namespaces...${NC}"

  # 다른 네임스페이스에서 찾기
  NAMESPACES=$(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}')
  for ns in $NAMESPACES; do
    POSTGRES_POD=$(kubectl get pods -n $ns -l app=postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -n "$POSTGRES_POD" ]; then
      POSTGRES_NAMESPACE=$ns
      echo -e "${GREEN}Found Postgres pod: $POSTGRES_POD in namespace: $ns${NC}"
      break
    fi
  done
fi

if [ -z "$POSTGRES_POD" ]; then
  echo -e "${YELLOW}⚠️  Postgres pod not found!${NC}"
  echo ""
  echo "Manual check:"
  echo "  kubectl get pods -A | grep postgres"
  echo ""
  exit 1
fi

POSTGRES_NAMESPACE=${POSTGRES_NAMESPACE:-default}
echo -e "${GREEN}✓ Using Postgres pod: $POSTGRES_POD (namespace: $POSTGRES_NAMESPACE)${NC}"
echo ""

# 데이터베이스 정보 (환경에 맞게 수정)
DB_NAME=${DB_NAME:-truve_db}
DB_USER=${DB_USER:-truve}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}1. Active Shows${NC}"
echo -e "${BLUE}========================================${NC}"

kubectl exec -it $POSTGRES_POD -n $POSTGRES_NAMESPACE -- psql -U $DB_USER -d $DB_NAME -c "
SELECT id, title, start_date, end_date, status
FROM shows
WHERE status = 'ACTIVE'
  AND end_date > CURRENT_DATE
ORDER BY created_at DESC
LIMIT 5;
" 2>/dev/null || echo "Error querying shows table"

echo ""
read -p "Enter the SHOW ID to use for testing: " SHOW_ID

if [ -z "$SHOW_ID" ]; then
  echo "No show ID provided. Exiting."
  exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}2. Show Schedules for: $SHOW_ID${NC}"
echo -e "${BLUE}========================================${NC}"

kubectl exec -it $POSTGRES_POD -n $POSTGRES_NAMESPACE -- psql -U $DB_USER -d $DB_NAME -c "
SELECT id, show_date, show_time, available_seats
FROM show_schedules
WHERE show_id = '$SHOW_ID'
  AND show_date > CURRENT_DATE
ORDER BY show_date ASC
LIMIT 10;
" 2>/dev/null || echo "Error querying show_schedules table"

echo ""
read -p "Enter the SCHEDULE ID to use for testing: " SCHEDULE_ID

if [ -z "$SCHEDULE_ID" ]; then
  echo "No schedule ID provided. Exiting."
  exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}3. Seat Information for Schedule: $SCHEDULE_ID${NC}"
echo -e "${BLUE}========================================${NC}"

kubectl exec -it $POSTGRES_POD -n $POSTGRES_NAMESPACE -- psql -U $DB_USER -d $DB_NAME -c "
SELECT
  MIN(id) as min_seat_id,
  MAX(id) as max_seat_id,
  COUNT(*) as total_seats,
  COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END) as available_seats
FROM scheduled_seats
WHERE show_schedule_id = $SCHEDULE_ID;
" 2>/dev/null || echo "Error querying scheduled_seats table"

# .env 파일 업데이트
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Updating .env file${NC}"
echo -e "${BLUE}========================================${NC}"

ENV_FILE=".env"

# .env 파일이 없으면 템플릿 복사
if [ ! -f "$ENV_FILE" ]; then
  cp .env.template .env
  echo -e "${GREEN}✓ Created .env file from template${NC}"
fi

# 값 업데이트
sed -i.bak "s/^TEST_SHOW_ID=.*/TEST_SHOW_ID=$SHOW_ID/" $ENV_FILE
sed -i.bak "s/^TEST_SHOW_SCHEDULE_ID=.*/TEST_SHOW_SCHEDULE_ID=$SCHEDULE_ID/" $ENV_FILE

echo -e "${GREEN}✓ Updated .env file with:${NC}"
echo -e "  TEST_SHOW_ID=$SHOW_ID"
echo -e "  TEST_SHOW_SCHEDULE_ID=$SCHEDULE_ID"

# config.js 업데이트
echo ""
echo -e "${YELLOW}Updating config/config.js...${NC}"

if [ ! -f "config/config.js" ]; then
  cp config/config.truve.js config/config.js
  echo -e "${GREEN}✓ Created config.js from template${NC}"
fi

sed -i.bak "s/TEST_SHOW_ID: .*$/TEST_SHOW_ID: __ENV.TEST_SHOW_ID || '$SHOW_ID',/" config/config.js
sed -i.bak "s/TEST_SHOW_SCHEDULE_ID: .*$/TEST_SHOW_SCHEDULE_ID: parseInt(__ENV.TEST_SHOW_SCHEDULE_ID || '$SCHEDULE_ID'),/" config/config.js

echo -e "${GREEN}✓ Updated config/config.js${NC}"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Configuration Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Verify .env file: cat .env"
echo "2. Run baseline test: ./run-local.sh baseline staging"
echo "3. Check results: cat results/*.json"
echo ""
