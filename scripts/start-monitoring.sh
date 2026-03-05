#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ORE Bot with Monitoring Stack           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# Check if .env exists
if [ ! -f "config/.env" ]; then
    echo -e "${RED}✗ Error: config/.env not found${NC}"
    echo "Please create config/.env with your configuration"
    exit 1
fi

# Check if config.json exists
if [ ! -f "config/config.json" ]; then
    echo -e "${RED}✗ Error: config/config.json not found${NC}"
    echo "Please create config/config.json with your configuration"
    exit 1
fi

# Create data directory if it doesn't exist
mkdir -p data

# Build the Docker images
echo -e "${YELLOW}Building Docker images...${NC}"
docker-compose build

# Start the monitoring stack
echo -e "${YELLOW}Starting monitoring stack...${NC}"
docker-compose up -d

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Check if all containers are running
echo -e "${YELLOW}Checking service status...${NC}"
docker-compose ps

echo ""
echo -e "${GREEN}✓ Monitoring stack started successfully!${NC}"
echo ""
echo -e "${GREEN}Access Points:${NC}"
echo -e "  • Grafana Dashboard: ${YELLOW}http://localhost:3100${NC} (admin/admin123)"
echo -e "  • Prometheus:       ${YELLOW}http://localhost:9090${NC}"
echo -e "  • Alertmanager:     ${YELLOW}http://localhost:9093${NC}"
echo -e "  • Node Exporter:    ${YELLOW}http://localhost:9100${NC}"
echo ""
echo -e "${GREEN}Bot Metrics:${NC}"
echo -e "  • Metrics Endpoint: ${YELLOW}http://localhost:3001/metrics${NC}"
echo -e "  • Health Check:     ${YELLOW}http://localhost:3001/health${NC}"
echo ""
echo -e "${YELLOW}To view logs:${NC} docker-compose logs -f [service-name]"
echo -e "${YELLOW}To stop:${NC}       ./scripts/stop-monitoring.sh"
echo ""

# Show logs for the ore-bot service
echo -e "${YELLOW}Following ore-bot logs (Ctrl+C to exit):${NC}"
docker-compose logs -f ore-bot
