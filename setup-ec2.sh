#!/bin/bash

# EC2 자동 설정 스크립트
# EC2 인스턴스 접속 후 이 스크립트를 실행하면 모든 설정이 자동으로 완료됩니다.
#
# 사용법:
# curl -fsSL https://raw.githubusercontent.com/your-org/truve/main/load-tests/setup-ec2.sh | bash
# 또는
# wget -qO- https://raw.githubusercontent.com/your-org/truve/main/load-tests/setup-ec2.sh | bash

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Truve k6 Load Test EC2 Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. 시스템 업데이트
echo -e "${YELLOW}[1/5] Updating system packages...${NC}"
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq wget curl git vim htop jq tmux nethogs

echo -e "${GREEN}✓ System updated${NC}"
echo ""

# 2. k6 설치
echo -e "${YELLOW}[2/5] Installing k6...${NC}"

# GPG 키 추가
sudo gpg -k
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69

# k6 저장소 추가
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | \
  sudo tee /etc/apt/sources.list.d/k6.list

# k6 설치
sudo apt-get update -qq
sudo apt-get install k6 -y -qq

# 버전 확인
K6_VERSION=$(k6 version | head -1)
echo -e "${GREEN}✓ k6 installed: ${K6_VERSION}${NC}"
echo ""

# 3. 작업 디렉토리 설정
echo -e "${YELLOW}[3/5] Setting up workspace...${NC}"

mkdir -p ~/truve/load-tests/{scenarios,config,utils,k8s,results,docs}
cd ~/truve/load-tests

echo -e "${GREEN}✓ Workspace created: ~/truve/load-tests${NC}"
echo ""

# 4. 환경 변수 설정
echo -e "${YELLOW}[4/5] Configuring environment...${NC}"

cat > .env << 'EOF'
# Truve Load Test Environment
BASE_URL=https://gateway.truve.site
TEST_SHOW_ID=show-12345
TEST_SHOW_SCHEDULE_ID=123
EOF

echo -e "${GREEN}✓ Environment file created (.env)${NC}"
echo ""

# 5. 유용한 별칭 추가
echo -e "${YELLOW}[5/5] Adding useful aliases...${NC}"

cat >> ~/.bashrc << 'EOF'

# k6 Load Test Aliases
alias loadtest='cd ~/truve/load-tests'
alias k6-baseline='k6 run scenarios/01-baseline.js'
alias k6-queue='k6 run scenarios/02-queue-spike.js'
alias k6-ticketing='k6 run scenarios/03-ticketing-concurrency.js'
alias k6-e2e='k6 run scenarios/04-e2e-flow.js'
alias k6-results='cd ~/truve/load-tests/results && ls -lh'
EOF

source ~/.bashrc

echo -e "${GREEN}✓ Aliases added${NC}"
echo ""

# 완료 메시지
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "1. Upload test scripts to EC2:"
echo -e "   ${BLUE}scp -i your-key.pem -r load-tests/* ubuntu@<EC2-IP>:~/truve/load-tests/${NC}"
echo ""
echo "2. Or clone from Git:"
echo -e "   ${BLUE}cd ~/truve${NC}"
echo -e "   ${BLUE}git clone https://github.com/your-org/truve.git${NC}"
echo ""
echo "3. Run tests:"
echo -e "   ${BLUE}cd ~/truve/load-tests${NC}"
echo -e "   ${BLUE}./run-local.sh baseline production${NC}"
echo ""
echo "4. Use aliases:"
echo -e "   ${BLUE}loadtest${NC}         # Go to load-tests directory"
echo -e "   ${BLUE}k6-baseline${NC}      # Run baseline test"
echo -e "   ${BLUE}k6-results${NC}       # View results"
echo ""
echo -e "${GREEN}Happy Testing! 🚀${NC}"
