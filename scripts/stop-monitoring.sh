#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Stopping ORE Bot Monitoring Stack         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Stop the monitoring stack
echo -e "${YELLOW}Stopping all services...${NC}"
docker-compose down

# Optional: Remove volumes (uncomment if you want to clean up data)
# read -p "Do you want to remove all data volumes? (y/N): " -n 1 -r
# echo
# if [[ $REPLY =~ ^[Yy]$ ]]; then
#     echo -e "${YELLOW}Removing data volumes...${NC}"
#     docker-compose down -v
# fi

echo -e "${GREEN}✓ All services stopped${NC}"
echo ""
echo -e "${YELLOW}Note: Data volumes are preserved.${NC}"
echo -e "To restart: ./scripts/start-monitoring.sh"
