# ORE Supply Farmer Bot

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)

**Ultra optimized farmer bot for https://ore.supply/**

Production-grade ORE Protocol farming bot built with Domain-Driven Design and Hexagonal Architecture.

</div>

---

## About

The ORE Supply Farmer Bot monitors ORE rounds on Solana in real-time and executes EV-optimized placements. It features:

- ⚡ **EV-Based Strategy**: Deterministic placement strategy with risk management
- 🏗️ **Hexagonal Architecture**: Clean separation of domain and infrastructure
- 📊 **Full Observability**: Prometheus metrics, Grafana dashboards, Discord notifications
- 🧪 **Backtesting**: CLI tool to test and optimize configurations
- 🚀 **Production-Ready**: Docker Compose deployment with monitoring stack

## Requirements

- Node.js 22+
- Yarn 4.x
- Solana RPC endpoint (Helius recommended for low latency)
- Wallet with SOL for transaction fees

## Quick Start

### 1. Install Dependencies

```bash
git clone https://github.com/otreby/ore-supply-farmer-bot.git
cd ore-supply-farmer-bot
yarn install
```

### 2. Configure Environment

```bash
# Copy environment template
cp config/.env.example config/.env

# Edit with your settings
nano config/.env
```

Required environment variables:
```bash
WALLET_KEYPAIR=YOUR_ENV_VAR_NAME    # Name of env var containing keypair
RPC_HTTP_ENDPOINT=https://your-rpc  # HTTP RPC endpoint
RPC_WS_ENDPOINT=wss://your-ws       # WebSocket RPC endpoint
```

### 3. Configure Strategy

Edit `config/config.json` to customize:
- EV thresholds and stake sizing
- Exposure limits per round/wallet
- Latency tuning and slot budgeting
- Priority fees and compute limits

### 4. Run the Bot

```bash
# Development mode (watch)
yarn dev

# Production
yarn start

# Build first
yarn build && yarn start
```

## Project Structure

```
ore-supply-farmer-bot/
├── apps/
│   ├── bot/              # Main farming bot runtime
│   └── backtester/       # Backtesting CLI tool
├── packages/
│   ├── domain/           # Pure business logic (DDD)
│   └── config/           # Configuration schemas
├── monitoring/
│   ├── grafana/          # Dashboards
│   ├── prometheus/       # Metrics config
│   └── alertmanager/     # Alert routing
├── docs/                 # Documentation
├── scripts/              # Utility scripts
├── config/               # Configuration files
└── docker-compose.yml    # Full stack deployment
```

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Start bot in watch mode |
| `yarn start` | Run bot in production |
| `yarn build` | Build all workspaces |
| `yarn test` | Run test suite |
| `yarn check` | TypeScript + lint check |
| `yarn backtest test` | Test configuration |
| `yarn backtest optimize` | Find optimal config |
| `yarn monitoring` | Start monitoring stack |

## Monitoring

Launch the full monitoring stack:

```bash
docker-compose up -d
```

Access points:
- **Grafana**: http://localhost:3100 (admin/admin123)
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

### Metrics

Key metrics exposed:
- Placement success/failure rates
- Rewards (SOL and ORE)
- EV scores distribution
- Latency (checkpoint, placement)
- Round outcomes (wins, losses, motherlodes)

## Backtesting

Test your configuration on historical data:

```bash
# Test a specific configuration
yarn backtest test --config config.json

# Find optimal parameters
yarn backtest optimize --objective roi --iterations 100
```

Results include:
- Win rate and ROI
- Optimal EV threshold
- Recommended stake sizing

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Configuration Guide](docs/CONFIGURATION.md)
- [Protocol Analysis](docs/ore_protocol_analysis.md)
- [API Reference](docs/API.md)
- [Monitoring Guide](MONITORING.md)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for:

- Development setup
- Coding standards
- Commit guidelines
- Pull request process

## Security

See [SECURITY.md](SECURITY.md) for responsible vulnerability reporting and best practices.

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

## Support

- 📧 Issues: GitHub Issues
- 💬 Discord: Via bot notifications
- 📖 Wiki: Project documentation

---

<div align="center">

Built with Hexagonal Architecture + DDD on Solana

</div>
