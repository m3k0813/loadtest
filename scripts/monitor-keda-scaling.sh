#!/bin/bash

###############################################################################
# KEDA Autoscaling Monitoring Script
#
# 사용법: ./scripts/monitor-keda-scaling.sh <namespace> <service-name>
# 예시: ./scripts/monitor-keda-scaling.sh truve-musical-service musical-service
###############################################################################

set -e

NAMESPACE=${1:-truve-musical-service}
SERVICE=${2:-musical-service}
DEPLOYMENT="${SERVICE}-${SERVICE}"

echo "=========================================="
echo "KEDA Autoscaling Monitor"
echo "Namespace: $NAMESPACE"
echo "Service: $SERVICE"
echo "Deployment: $DEPLOYMENT"
echo "=========================================="
echo ""

# 초기 상태 확인
echo "📊 Initial State:"
echo "----------------"
kubectl get scaledobject -n $NAMESPACE $SERVICE -o jsonpath='{.spec.minReplicaCount}' | xargs -I {} echo "Min Replicas: {}"
kubectl get scaledobject -n $NAMESPACE $SERVICE -o jsonpath='{.spec.maxReplicaCount}' | xargs -I {} echo "Max Replicas: {}"
kubectl get scaledobject -n $NAMESPACE $SERVICE -o jsonpath='{.spec.triggers[0].metadata.threshold}' | xargs -I {} echo "Threshold: {} RPS"
kubectl get deployment -n $NAMESPACE $DEPLOYMENT -o jsonpath='{.status.replicas}' | xargs -I {} echo "Current Replicas: {}"
echo ""

# 모니터링 시작
echo "🔍 Starting real-time monitoring..."
echo "Press Ctrl+C to stop"
echo ""

# tmux 세션 생성 (있으면 재사용)
SESSION="keda-monitor"

# 기존 세션 종료
tmux kill-session -t $SESSION 2>/dev/null || true

# 새 세션 생성
tmux new-session -d -s $SESSION

# 윈도우 1: Pod 모니터링
tmux rename-window -t $SESSION:0 'Pods'
tmux send-keys -t $SESSION:0 "watch -n 2 'kubectl get pods -n $NAMESPACE -l app=$SERVICE -o wide | grep -E \"NAME|$SERVICE\"'" C-m

# 윈도우 2: HPA 모니터링
tmux new-window -t $SESSION:1 -n 'HPA'
tmux send-keys -t $SESSION:1 "watch -n 2 'kubectl get hpa -n $NAMESPACE'" C-m

# 윈도우 3: ScaledObject 상태
tmux new-window -t $SESSION:2 -n 'ScaledObject'
tmux send-keys -t $SESSION:2 "watch -n 5 'kubectl get scaledobject -n $NAMESPACE $SERVICE'" C-m

# 윈도우 4: 메트릭 상세
tmux new-window -t $SESSION:3 -n 'Metrics'
tmux send-keys -t $SESSION:3 "watch -n 5 'kubectl get --raw /apis/external.metrics.k8s.io/v1beta1/namespaces/$NAMESPACE/s0-prometheus | jq .'" C-m

# 윈도우 5: 이벤트 로그
tmux new-window -t $SESSION:4 -n 'Events'
tmux send-keys -t $SESSION:4 "kubectl get events -n $NAMESPACE --watch --field-selector involvedObject.name=$DEPLOYMENT" C-m

# tmux 세션에 연결
echo "✅ Monitoring sessions created!"
echo ""
echo "Windows:"
echo "  0: Pod status"
echo "  1: HPA metrics"
echo "  2: ScaledObject status"
echo "  3: Prometheus metrics"
echo "  4: Events"
echo ""
echo "Attaching to tmux session..."
sleep 2

tmux attach-session -t $SESSION
