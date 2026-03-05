# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | ✅ Yes    |
| Previous| ⚠️ Limited |
| Older   | ❌ No     |

## Reporting a Vulnerability

**Please do not open public issues for security vulnerabilities.**

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: `security@ore.supply.farmer` (or create a private GitHub issue)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Your contact information

## Security Best Practices

### Wallet Security

- **Never** commit private keys or seed phrases
- Use environment variables for sensitive data
- Consider using a dedicated wallet for farming with limited funds
- Review transaction signatures before approval

### RPC Security

- Use reputable RPC providers (Helius, QuickNode)
- Consider rate limiting on public endpoints
- Monitor for unusual RPC activity
- Keep RPC endpoints private when possible

### Deployment Security

- Run the bot in an isolated environment
- Use firewall rules to restrict access
- Monitor system resources and network activity
- Keep Node.js and dependencies updated

### Environment Variables

```bash
# Required
WALLET_KEYPAIR=your_env_var_name     # Name of env var containing keypair
RPC_HTTP_ENDPOINT=https://your-rpc   # HTTP RPC endpoint
RPC_WS_ENDPOINT=wss://your-ws        # WebSocket RPC endpoint

# Optional
JUPITER_API_KEY=your_api_key         # Jupiter API key
DISCORD_WEBHOOK_URL=your_webhook     # Discord notifications
```

## Dependencies Security

This project uses:
- TypeScript with strict type checking
- Regular dependency updates via Dependabot
- Code scanning with BiomeJS linter

Run security checks:
```bash
yarn audit
yarn check
```

## Infrastructure

The monitoring stack includes:
- Prometheus for metrics collection
- Grafana for visualization
- Alertmanager for notifications

Ensure these services are properly secured in production:
- Change default passwords
- Enable authentication
- Use TLS/SSL
