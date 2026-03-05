#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ $# -eq 0 ]; then
    echo -e "${GREEN}Available services:${NC}"
    echo "  ore-bot"
    echo "  prometheus"
    echo "  grafana"
    echo "  alertmanager"
    echo "  node-exporter"
    echo ""
    echo "Usage: $0 <service-name>"
    echo "Example: $0 ore-bot"
    exit 1
fi

SERVICE=$1

echo -e "${YELLOW}Following logs for $SERVICE (Ctrl+C to exit)${NC}"
echo ""

docker-compose logs -f $SERVICE
