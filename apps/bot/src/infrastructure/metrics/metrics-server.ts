import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { getControlService } from '../control/control-service';
import { createChildLogger } from '../logging/pino-logger';
import { getMetrics } from './prometheus';

// ============================================
// CORS Middleware for Grafana Canvas Buttons
// ============================================
function corsMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (_req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
}

const log = createChildLogger('metrics-server');

interface MetricsServerConfig {
  port: number;
  host?: string;
}

// ============================================
// Error Handler Middleware
// ============================================
function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  log.error(`Metrics server error: ${err.message}`);
  res.status(500).json({
    success: false,
    error: err.message,
    timestamp: Date.now(),
  });
}

// ============================================
// Health Routes
// ============================================
function registerHealthRoutes(app: Express): void {
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
    });
  });
}

// ============================================
// Prometheus Metrics Routes
// ============================================
function registerMetricsRoutes(app: Express): void {
  app.get('/metrics', async (_req: Request, res: Response) => {
    try {
      const metrics = await getMetrics();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.status(200).send(metrics);
    } catch (error) {
      res.status(500).send(`Error generating metrics: ${error}`);
    }
  });
}

// ============================================
// Status Routes
// ============================================
function registerStatusRoutes(app: Express): void {
  app.get('/api/status', (_req: Request, res: Response) => {
    const control = getControlService();
    const status = control.getStatus();
    res.json(status);
  });

  app.get('/api/stats/session', (_req: Request, res: Response) => {
    const control = getControlService();
    const stats = control.getStatus();
    res.json({
      state: stats.state,
      running: stats.running,
      uptimeSeconds: stats.uptimeSeconds,
      roundsPlaced: stats.roundsPlaced,
      wins: stats.wins,
      losses: stats.losses,
      motherlodes: stats.motherlodes,
      totalStakeSol: stats.totalStakeSol,
      totalRewardsSol: stats.totalRewardsSol,
      profitSol: stats.profitSol,
      roiPercent: stats.roiPercent,
      currentRound: stats.currentRound,
    });
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    const control = getControlService();
    const health = control.healthCheck();
    res.json(health);
  });
}

// ============================================
// Control Routes
// ============================================
function registerControlRoutes(app: Express): void {
  // HTML page with button to trigger action (for Grafana links)
  const createActionPage = (action: string, method: string, path: string) => `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${action}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                 max-width: 600px; margin: 100px auto; text-align: center; }
          button { padding: 15px 40px; font-size: 18px; cursor: pointer;
                   border: none; border-radius: 8px; margin: 10px; }
          .stop { background: #d32f2f; color: white; }
          .restart { background: #1976d2; color: white; }
          .status { background: #388e3c; color: white; }
          .loading { opacity: 0.5; pointer-events: none; }
          #result { margin-top: 20px; padding: 15px; border-radius: 8px;
                    background: #f5f5f5; text-align: left; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <h1>ORE Bot - ${action}</h1>
        <button id="actionBtn" class="${action.toLowerCase().includes('stop') ? 'stop' : action.toLowerCase().includes('restart') ? 'restart' : 'status'}" onclick="executeAction()">
          Execute ${action}
        </button>
        <div id="result"></div>
        <script>
          async function executeAction() {
            const btn = document.getElementById('actionBtn');
            btn.classList.add('loading');
            btn.textContent = 'Executing...';
            try {
              const response = await fetch('${path}', { method: '${method}' });
              const result = await response.text();
              document.getElementById('result').textContent = result;
              document.getElementById('result').style.background = response.ok ? '#e8f5e9' : '#ffebee';
            } catch (err) {
              document.getElementById('result').textContent = 'Error: ' + err.message;
              document.getElementById('result').style.background = '#ffebee';
            }
            btn.classList.remove('loading');
            btn.textContent = 'Execute ${action}';
          }
        </script>
      </body>
    </html>
  `;

  app.get('/control/stop', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(createActionPage('STOP', 'POST', '/api/control/stop'));
  });

  app.get('/control/restart', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(createActionPage('RESTART', 'POST', '/api/control/restart'));
  });

  app.get('/control/status', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(createActionPage('STATUS', 'GET', '/api/status'));
  });

  app.post('/api/control/start', async (_req: Request, res: Response) => {
    const control = getControlService();
    const result = await control.start();
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/control/stop', async (_req: Request, res: Response) => {
    const control = getControlService();
    const result = await control.stop();
    res.status(result.success ? 200 : 400).json(result);
  });

  app.post('/api/control/restart', (_req: Request, res: Response) => {
    const control = getControlService();
    const result = control.restart();
    res.status(result.success ? 200 : 400).json(result);
  });
}

// ============================================
// Root Route (Info Page)
// ============================================
function registerRootRoute(app: Express): void {
  app.get('/', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ORE Bot Metrics</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #333; }
            h2 { color: #555; margin-top: 30px; }
            code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
            pre { background: #f4f4f4; padding: 15px; border-radius: 8px; overflow-x: auto; }
            .endpoint { margin: 10px 0; }
            .get { color: green; }
            .post { color: blue; }
          </style>
        </head>
        <body>
          <h1>🤖 ORE Bot Metrics</h1>

          <h2>📊 Prometheus Metrics</h2>
          <div class="endpoint"><code>GET /metrics</code> - Prometheus metrics endpoint</div>
          <div class="endpoint"><code>GET /health</code> - Simple health check</div>

          <h2>📈 Status API</h2>
          <div class="endpoint"><code class="get">GET</code> <code>/api/status</code> - Bot status, profit, ROI, current round</div>
          <div class="endpoint"><code class="get">GET</code> <code>/api/stats/session</code> - Session statistics</div>
          <div class="endpoint"><code class="get">GET</code> <code>/api/health</code> - Health check with running status</div>

          <h2>🔧 Control API</h2>
          <div class="endpoint"><code class="post">POST</code> <code>/api/control/start</code> - Start the bot</div>
          <div class="endpoint"><code class="post">POST</code> <code>/api/control/stop</code> - Stop the bot gracefully</div>
          <div class="endpoint"><code class="post">POST</code> <code>/api/control/restart</code> - Restart the bot</div>

          <h2>📝 Example Usage</h2>
          <pre>
# Check status
curl http://localhost:3001/api/status

# Session stats
curl http://localhost:3001/api/stats/session

# Stop bot
curl -X POST http://localhost:3001/api/control/stop

# Start bot
curl -X POST http://localhost:3001/api/control/start

# Restart bot
curl -X POST http://localhost:3001/api/control/restart</pre>

          <p><em>Note: All control endpoints are for internal use only (Docker network).</em></p>
        </body>
      </html>
    `);
  });
}

// ============================================
// Server Class
// ============================================
export class MetricsServer {
  private app: Express;
  private server: ReturnType<Express['listen']> | null = null;
  private isRunning = false;

  constructor(private config: MetricsServerConfig) {
    this.app = express();

    // CORS middleware for Grafana Canvas buttons
    this.app.use(corsMiddleware);

    // Parse JSON bodies
    this.app.use(express.json());

    // Register all routes
    registerRootRoute(this.app);
    registerHealthRoutes(this.app);
    registerMetricsRoutes(this.app);
    registerStatusRoutes(this.app);
    registerControlRoutes(this.app);

    // Error handler (must be last)
    this.app.use(errorHandler);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Metrics server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, this.config.host ?? '0.0.0.0', () => {
        this.isRunning = true;
        log.info(`Metrics server listening on http://${this.config.host}:${this.config.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server || !this.isRunning) {
      return;
    }

    return new Promise((resolve) => {
      this.server?.close(() => {
        this.isRunning = false;
        this.server = null;
        log.info('Metrics server stopped');
        resolve();
      });
    });
  }

  isHealthy(): boolean {
    return this.isRunning;
  }
}
