#!/bin/bash

# Truve 부하 테스트 실행 스크립트 (Kubernetes)
# 사용법: ./run-k8s.sh [action] [scenario]
# 예시: ./run-k8s.sh deploy all
#       ./run-k8s.sh start baseline
#       ./run-k8s.sh stop queue
#       ./run-k8s.sh status
#       ./run-k8s.sh logs e2e

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 기본 설정
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
K8S_DIR="${SCRIPT_DIR}/k8s"
NAMESPACE="load-test"

ACTION="${1:-help}"
SCENARIO="${2:-all}"

# kubectl 설치 확인
if ! command -v kubectl &> /dev/null; then
  echo -e "${RED}kubectl is not installed${NC}"
  exit 1
fi

# 시나리오 매핑
declare -A DEPLOYMENT_NAMES=(
  ["baseline"]="k6-distributed-baseline"
  ["queue"]="k6-distributed-queue-spike"
  ["ticketing"]="k6-distributed-ticketing"
  ["e2e"]="k6-distributed-e2e"
)

# Help 메시지
show_help() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}Truve K8s Load Test Runner${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
  echo "Usage: $0 [action] [scenario]"
  echo ""
  echo "Actions:"
  echo "  setup      - Create namespace and install k6 operator"
  echo "  deploy     - Deploy load test resources"
  echo "  start      - Start specific scenario test"
  echo "  stop       - Stop specific scenario test"
  echo "  delete     - Delete load test resources"
  echo "  status     - Show test status"
  echo "  logs       - Show logs for scenario"
  echo "  chaos      - Deploy chaos testing scenarios"
  echo "  help       - Show this help message"
  echo ""
  echo "Scenarios:"
  echo "  baseline   - Baseline performance test"
  echo "  queue      - Queue spike test"
  echo "  ticketing  - Ticketing concurrency test"
  echo "  e2e        - End-to-end flow test"
  echo "  all        - All scenarios (default)"
  echo ""
  echo "Examples:"
  echo "  $0 setup"
  echo "  $0 deploy all"
  echo "  $0 start baseline"
  echo "  $0 logs e2e"
  echo "  $0 status"
  echo "  $0 chaos"
  echo ""
}

# Namespace 및 기본 리소스 설정
setup() {
  echo -e "${YELLOW}Setting up load test environment...${NC}"

  # Namespace 생성
  kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

  echo -e "${GREEN}✓ Namespace created: ${NAMESPACE}${NC}"

  # k6 Operator 설치 (선택사항)
  echo -e "${YELLOW}Installing k6 Operator...${NC}"
  kubectl apply -f https://github.com/grafana/k6-operator/releases/latest/download/bundle.yaml

  echo -e "${GREEN}✓ k6 Operator installed${NC}"

  # ConfigMap 생성
  kubectl apply -f "${K8S_DIR}/k6-configmap.yaml"

  echo -e "${GREEN}✓ ConfigMap created${NC}"
  echo ""
  echo -e "${GREEN}Setup completed!${NC}"
}

# 부하 테스트 리소스 배포
deploy() {
  echo -e "${YELLOW}Deploying load test resources...${NC}"

  if [ "${SCENARIO}" == "all" ]; then
    kubectl apply -f "${K8S_DIR}/k6-distributed-test.yaml"
    echo -e "${GREEN}✓ All load test scenarios deployed${NC}"
  else
    # 특정 시나리오만 배포
    local deployment_name="${DEPLOYMENT_NAMES[${SCENARIO}]}"
    if [ -z "${deployment_name}" ]; then
      echo -e "${RED}Unknown scenario: ${SCENARIO}${NC}"
      exit 1
    fi

    kubectl apply -f "${K8S_DIR}/k6-distributed-test.yaml"
    echo -e "${GREEN}✓ Deployed: ${deployment_name}${NC}"
  fi

  echo ""
  echo -e "${YELLOW}Waiting for pods to be ready...${NC}"
  kubectl wait --for=condition=ready pod \
    -l app=k6-load-test \
    -n ${NAMESPACE} \
    --timeout=120s || true

  echo ""
  show_status
}

# 테스트 시작 (Scale up)
start() {
  if [ "${SCENARIO}" == "all" ]; then
    echo -e "${YELLOW}Starting all load test scenarios...${NC}"
    for deployment in "${DEPLOYMENT_NAMES[@]}"; do
      kubectl scale deployment ${deployment} --replicas=5 -n ${NAMESPACE} 2>/dev/null || true
    done
  else
    local deployment_name="${DEPLOYMENT_NAMES[${SCENARIO}]}"
    if [ -z "${deployment_name}" ]; then
      echo -e "${RED}Unknown scenario: ${SCENARIO}${NC}"
      exit 1
    fi

    echo -e "${YELLOW}Starting ${SCENARIO} load test...${NC}"
    kubectl scale deployment ${deployment_name} --replicas=5 -n ${NAMESPACE}
  fi

  echo -e "${GREEN}✓ Load test started${NC}"
  show_status
}

# 테스트 중지 (Scale down)
stop() {
  if [ "${SCENARIO}" == "all" ]; then
    echo -e "${YELLOW}Stopping all load test scenarios...${NC}"
    for deployment in "${DEPLOYMENT_NAMES[@]}"; do
      kubectl scale deployment ${deployment} --replicas=0 -n ${NAMESPACE} 2>/dev/null || true
    done
  else
    local deployment_name="${DEPLOYMENT_NAMES[${SCENARIO}]}"
    if [ -z "${deployment_name}" ]; then
      echo -e "${RED}Unknown scenario: ${SCENARIO}${NC}"
      exit 1
    fi

    echo -e "${YELLOW}Stopping ${SCENARIO} load test...${NC}"
    kubectl scale deployment ${deployment_name} --replicas=0 -n ${NAMESPACE}
  fi

  echo -e "${GREEN}✓ Load test stopped${NC}"
  show_status
}

# 리소스 삭제
delete() {
  echo -e "${RED}Deleting load test resources...${NC}"
  read -p "Are you sure? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled"
    exit 0
  fi

  kubectl delete -f "${K8S_DIR}/k8s-distributed-test.yaml" --ignore-not-found=true
  kubectl delete namespace ${NAMESPACE} --ignore-not-found=true

  echo -e "${GREEN}✓ Resources deleted${NC}"
}

# 상태 확인
show_status() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}Load Test Status${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""

  echo -e "${YELLOW}Deployments:${NC}"
  kubectl get deployments -n ${NAMESPACE} 2>/dev/null || echo "No deployments found"
  echo ""

  echo -e "${YELLOW}Pods:${NC}"
  kubectl get pods -n ${NAMESPACE} -l app=k6-load-test 2>/dev/null || echo "No pods found"
  echo ""

  echo -e "${YELLOW}Recent Events:${NC}"
  kubectl get events -n ${NAMESPACE} --sort-by='.lastTimestamp' | tail -10 || true
  echo ""
}

# 로그 확인
show_logs() {
  if [ "${SCENARIO}" == "all" ]; then
    echo -e "${RED}Please specify a scenario for logs${NC}"
    exit 1
  fi

  local deployment_name="${DEPLOYMENT_NAMES[${SCENARIO}]}"
  if [ -z "${deployment_name}" ]; then
    echo -e "${RED}Unknown scenario: ${SCENARIO}${NC}"
    exit 1
  fi

  echo -e "${YELLOW}Showing logs for ${SCENARIO}...${NC}"
  echo ""

  # 가장 최근 Pod의 로그 표시
  local pod=$(kubectl get pods -n ${NAMESPACE} \
    -l app=k6-load-test,scenario=${SCENARIO} \
    --sort-by=.metadata.creationTimestamp \
    -o jsonpath='{.items[-1].metadata.name}' 2>/dev/null)

  if [ -z "${pod}" ]; then
    echo -e "${RED}No pods found for scenario: ${SCENARIO}${NC}"
    exit 1
  fi

  echo -e "${GREEN}Pod: ${pod}${NC}"
  echo ""

  kubectl logs -f ${pod} -n ${NAMESPACE}
}

# Chaos Testing 배포
deploy_chaos() {
  echo -e "${YELLOW}Deploying chaos testing scenarios...${NC}"

  # Chaos Mesh 설치 확인
  if ! kubectl get namespace chaos-mesh &>/dev/null; then
    echo -e "${YELLOW}Installing Chaos Mesh...${NC}"
    helm repo add chaos-mesh https://charts.chaos-mesh.org
    helm repo update
    helm install chaos-mesh chaos-mesh/chaos-mesh \
      -n chaos-mesh \
      --create-namespace \
      --set chaosDaemon.runtime=containerd \
      --set chaosDaemon.socketPath=/run/containerd/containerd.sock

    echo -e "${GREEN}✓ Chaos Mesh installed${NC}"
  fi

  # Chaos 시나리오 배포
  kubectl apply -f "${K8S_DIR}/chaos-testing.yaml"

  echo -e "${GREEN}✓ Chaos scenarios deployed${NC}"
  echo ""
  echo -e "${YELLOW}Active chaos experiments:${NC}"
  kubectl get podchaos,networkchaos,stresschaos -n chaos-mesh
}

# 메인 실행 로직
case "${ACTION}" in
  setup)
    setup
    ;;
  deploy)
    deploy
    ;;
  start)
    start
    ;;
  stop)
    stop
    ;;
  delete)
    delete
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs
    ;;
  chaos)
    deploy_chaos
    ;;
  help|*)
    show_help
    ;;
esac
