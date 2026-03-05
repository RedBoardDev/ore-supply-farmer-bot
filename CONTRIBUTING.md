# Contributing to ORE Supply Farmer Bot

Thank you for your interest in contributing! This document outlines the process for contributing to this project.

## Getting Started

### Prerequisites

- Node.js 22+
- TypeScript 5.x
- Solana RPC endpoint (Helius recommended)
- pnpm or yarn

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ore-supply-farmer-bot.git
   cd ore-supply-farmer-bot
   ```

3. Install dependencies:
   ```bash
   yarn install
   ```

4. Set up environment:
   ```bash
   cp config/.env.example config/.env
   # Edit config/.env with your RPC and wallet details
   ```

5. Run development mode:
   ```bash
   yarn dev
   ```

## Development Workflow

### Coding Standards

- **Linting**: BiomeJS is configured. Run `yarn lint:fix` before committing
- **Type Checking**: Run `yarn check` to verify TypeScript types
- **Testing**: Run `yarn test` to execute the test suite

### Project Structure

```
ore-supply-farmer-bot/
├── apps/
│   ├── bot/           # Main farming bot
│   └── backtester/    # Backtesting tool
├── packages/
│   ├── domain/        # Pure business logic (DDD)
│   └── config/        # Configuration & schemas
├── docs/              # Documentation
├── monitoring/        # Grafana/Prometheus configs
└── scripts/           # Utility scripts
```

### Commit Guidelines

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add new EV calculation method
fix(adapter): resolve RPC timeout issue
docs(readme): update installation instructions
refactor(bot): improve checkpoint handling
test(domain): add unit tests for Round aggregate
```

### Branch Strategy

- `main`: Production-ready code
- `develop`: Integration branch for next release
- Feature branches: `feature/your-feature-name`

## Submitting Changes

1. Create a feature branch from `develop`
2. Make your changes
3. Ensure all checks pass:
   ```bash
   yarn check
   yarn lint:fix
   yarn test
   ```
4. Submit a Pull Request with a clear description

## Reporting Issues

When reporting issues, include:

- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Logs (if applicable)
- Environment (OS, Node version, RPC provider)

## Code of Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Questions?

Open an issue for discussion or reach out via Discord notifications in the bot.
