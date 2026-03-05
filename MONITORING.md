# ORE Bot Monitoring Stack

Complete monitoring solution with Prometheus and Grafana for the ORE Bot.

## Architecture

```
┌─────────────┐
│   Grafana   │◄─────── Dashboard & Visualization
│  :3100      │
└──────┬──────┘
       │
       │ PromQL
       ▼
┌─────────────┐
│ Prometheus  │◄─────── Metrics Collection & Storage
│  :9090      │
└──────┬──────┘
       │ Scrape
       ▼
┌─────────────┐
│  ORE Bot    │◄─────── Metrics Endpoint
│  :3001      │
└─────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Valid `config/.env` file
- Valid `config/config.json` file

### Start Monitoring Stack

```bash
./scripts/start-monitoring.sh
```

This will:
1. Build Docker images
2. Start all monitoring services
3. Open Grafana dashboard
4. Follow ore-bot logs

### Stop Monitoring Stack

```bash
./scripts/stop-monitoring.sh
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
./scripts/logs.sh ore-bot
./scripts/logs.sh prometheus
./scripts/logs.sh grafana
```

## Services

### Grafana (:3100)
- **URL**: http://localhost:3100
- **Default Credentials**: admin/admin123
- **Purpose**: Visualize metrics, create dashboards
- **Pre-configured**: ORE Bot dashboard with key metrics

### Prometheus (:9090)
- **URL**: http://localhost:9090
- **Purpose**: Metrics collection and storage
- **Retention**: 30 days
- **Scrape Interval**: 10s (ore-bot), 30s (others)

### Node Exporter (:9100)
- **URL**: http://localhost:9100
- **Purpose**: System metrics (CPU, Memory, Disk, Network)
- **Use with**: Prometheus targets monitoring

### ORE Bot Metrics (:3001)
- **Metrics Endpoint**: http://localhost:3001/metrics
- **Health Check**: http://localhost:3001/health

### Control API (internal)
- **Start**: POST http://ore-bot:3001/api/control/start
- **Stop**: POST http://ore-bot:3001/api/control/stop
- **Restart**: POST http://ore-bot:3001/api/control/restart

## Metrics

### Business Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `ore_placements_total` | Counter | Total placement attempts (labeled by status, round, square) |
| `ore_rewards_sol_total` | Counter | Total SOL rewards earned |
| `ore_rewards_ore_total` | Counter | Total ORE rewards earned |
| `ore_ev_score` | Histogram | Expected Value scores for placements |

### Technical Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `ore_checkpoint_total` | Counter | Checkpoint attempts (labeled by status) |
| `ore_checkpoint_duration_seconds` | Histogram | Checkpoint processing time |
| `ore_placement_duration_seconds` | Histogram | Placement processing time |
| `ore_rpc_requests_total` | Counter | RPC requests (labeled by endpoint, method, status) |
| `ore_rpc_request_duration_seconds` | Histogram | RPC request latency |
| `ore_rounds_active` | Gauge | Number of active rounds |
| `ore_bot_status` | Gauge | Bot status (1=running, 0=paused/stopped) |

## Alerts

### Critical Alerts

1. **High Placement Failure Rate**
   - Condition: >50% failure rate over 5 minutes
   - Action: Immediate investigation required

2. **Checkpoint Stuck**
   - Condition: >5 checkpoint failures in 10 minutes
   - Action: Checkpoint mechanism may be broken

3. **Bot Down**
   - Condition: ore-bot service unavailable for >1 minute
   - Action: Immediate restart or investigation

### Warning Alerts

1. **Low Rewards**
   - Condition: <0.01 SOL earned in 24 hours
   - Action: Strategy review needed

2. **High RPC Latency**
   - Condition: 95th percentile >2s for 5 minutes
   - Action: RPC endpoint health check

## Dashboards

### ORE Bot Dashboard

Located at: http://localhost:3100/d/ore-bot-control

**Panels:**
1. **Placement Success Rate** - Real-time success percentage
2. **Rewards (SOL/hour)** - Hourly earnings tracking
3. **Latency (P95)** - Checkpoint and placement latency
4. **Bot Health** - Service uptime indicator
5. **Activity Metrics** - Request rates and activity

## Configuration

### Prometheus

Configuration files:
- `monitoring/prometheus/prometheus.yml` - Main config
- `monitoring/prometheus/alert_rules.yml` - Alert definitions
- `monitoring/prometheus/recording_rules.yml` - Pre-calculated metrics

### Grafana

Provisioning:
- `monitoring/grafana/provisioning/datasources/datasources.yml` - Data sources
- `monitoring/grafana/provisioning/dashboards/dashboards.yml` - Dashboard provisioning

Dashboards:
- `monitoring/grafana/dashboards/bot-control.json` - Main dashboard

## PromQL Queries

### Success Rate

```promql
100 * sum(rate(ore_placements_total{status="success"}[5m])) /
sum(rate(ore_placements_total[5m]))
```

### Hourly Rewards

```promql
increase(ore_rewards_sol_total[1h])
```

### Checkpoint Latency (95th Percentile)

```promql
histogram_quantile(0.95, rate(ore_checkpoint_duration_seconds_bucket[5m]))
```

### RPC Error Rate

```promql
100 * sum(rate(ore_rpc_requests_total{status="error"}[5m])) /
sum(rate(ore_rpc_requests_total[5m]))
```

## Troubleshooting

### Service Won't Start

Check logs:
```bash
docker-compose logs [service-name]
```

### Bot Metrics Not Appearing

1. Verify metrics endpoint: http://localhost:3001/metrics
2. Check Prometheus targets: http://localhost:9090/targets
3. Verify config: `config/config.json` has `prometheus.enabled: true`

### Dashboard Shows No Data

1. Check Grafana data source: Configuration > Data Sources
2. Verify Prometheus is accessible: http://localhost:9090
3. Check time range in dashboard (default: last 1 hour)

### High Memory Usage

Prometheus retention settings can be adjusted in `docker-compose.yml`:
- `--storage.tsdb.retention.time=30d`
- `--storage.tsdb.retention.size=10GB`

## Production Deployment

### Security Hardening

1. Change Grafana credentials
2. Use environment variables for secrets
3. Enable TLS/HTTPS with reverse proxy
4. Restrict network access to monitoring ports

### Scaling

For high-load scenarios:
- Run Prometheus in remote write mode
- Use Grafana HA clustering
- Separate Alertmanager for redundancy

### Backup

Data persistence:
- `prometheus-data` - Metrics data
- `grafana-data` - Dashboards and settings

Backup volumes regularly:
```bash
docker run --rm -v prometheus-data:/data -v $(pwd)/backup:/backup alpine tar czf /backup/prometheus-$(date +%Y%m%d).tar.gz /data
```

## Maintenance

### Update Services

```bash
docker-compose pull
docker-compose up -d
```

### Clean Restart

```bash
./scripts/stop-monitoring.sh
docker-compose down -v  # Remove volumes
./scripts/start-monitoring.sh
```

## Support

For issues or questions:
- Check Grafana dashboard for anomalies
- Review Prometheus alerts
- Analyze ore-bot logs: `./scripts/logs.sh ore-bot`
- Check service status: `docker-compose ps`
