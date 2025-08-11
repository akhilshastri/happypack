import { LoaderContext } from 'webpack';
import { spawn, ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import * as path from 'path';

export interface RustHappyPackLoaderOptions {
  id?: string;
  threads?: number;
  cache?: boolean;
  cacheDir?: string;
  debug?: boolean;
  workerPath?: string;
  timeout?: number;
}

interface TranspileRequest {
  id: string;
  file_path: string;
  source_code: string;
  file_hash: string;
  source_maps?: boolean;
  loader_options?: Record<string, any>;
}

interface TranspileResponse {
  id: string;
  code: string;
  source_map?: string;
  warnings?: string[];
  processing_time?: number;
}

interface WorkerPool {
  workers: Map<string, RustWorker>;
  getWorker(id: string): RustWorker;
  shutdown(): Promise<void>;
}

class RustWorker {
  private process: ChildProcess | null = null;
  private requestQueue: Map<string, {
    resolve: (response: TranspileResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  
  constructor(
    private workerPath: string,
    private options: RustHappyPackLoaderOptions
  ) {}

  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    const args = ['--mode', 'message'];
    
    if (this.options.threads) {
      process.env.RUST_HAPPYPACK_THREADS = this.options.threads.toString();
    }
    
    if (this.options.cache !== undefined) {
      process.env.RUST_HAPPYPACK_CACHE_ENABLED = this.options.cache.toString();
    }
    
    if (this.options.cacheDir) {
      process.env.RUST_HAPPYPACK_CACHE_DIR = this.options.cacheDir;
    }

    this.process = spawn(this.workerPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    if (!this.process.stdout || !this.process.stderr || !this.process.stdin) {
      throw new Error('Failed to create worker process pipes');
    }

    this.process.stdout.on('data', (data) => {
      this.handleResponse(data.toString());
    });

    this.process.stderr.on('data', (data) => {
      if (this.options.debug) {
        console.error('Rust worker stderr:', data.toString());
      }
    });

    this.process.on('error', (error) => {
      console.error('Rust worker process error:', error);
      this.rejectAllPending(error);
    });

    this.process.on('exit', (code, signal) => {
      if (this.options.debug) {
        console.log(`Rust worker exited with code ${code}, signal ${signal}`);
      }
      this.rejectAllPending(new Error(`Worker process exited with code ${code}`));
      this.process = null;
    });
  }

  async transpile(request: TranspileRequest): Promise<TranspileResponse> {
    if (!this.process || !this.process.stdin) {
      await this.start();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestQueue.delete(request.id);
        reject(new Error(`Transpilation timeout for ${request.file_path}`));
      }, this.options.timeout || 30000);

      this.requestQueue.set(request.id, { resolve, reject, timeout });

      const message = JSON.stringify({
        TranspileRequest: request
      }) + '\n';

      if (this.process && this.process.stdin) {
        this.process.stdin.write(message);
      } else {
        clearTimeout(timeout);
        this.requestQueue.delete(request.id);
        reject(new Error('Worker process not available'));
      }
    });
  }

  private handleResponse(data: string): void {
    const lines = data.trim().split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const message = JSON.parse(line);
        
        if (message.TranspileResponse) {
          const response: TranspileResponse = message.TranspileResponse;
          const pending = this.requestQueue.get(response.id);
          
          if (pending) {
            clearTimeout(pending.timeout);
            this.requestQueue.delete(response.id);
            pending.resolve(response);
          }
        }
      } catch (error) {
        if (this.options.debug) {
          console.error('Failed to parse worker response:', error, 'Data:', line);
        }
      }
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.requestQueue) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.requestQueue.clear();
  }

  async shutdown(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      
      await new Promise<void>((resolve) => {
        const forceKillTimeout = setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        if (this.process) {
          this.process.on('exit', () => {
            clearTimeout(forceKillTimeout);
            resolve();
          });
        } else {
          clearTimeout(forceKillTimeout);
          resolve();
        }
      });
      
      this.process = null;
    }
  }
}

const workerPool: WorkerPool = {
  workers: new Map(),
  
  getWorker(id: string): RustWorker {
    if (!this.workers.has(id)) {
      const options = getGlobalOptions();
      const workerPath = options.workerPath || findWorkerBinary();
      this.workers.set(id, new RustWorker(workerPath, options));
    }
    return this.workers.get(id)!;
  },
  
  async shutdown(): Promise<void> {
    const shutdownPromises = Array.from(this.workers.values()).map(worker => worker.shutdown());
    await Promise.all(shutdownPromises);
    this.workers.clear();
  }
};

let globalOptions: RustHappyPackLoaderOptions = {};

function setGlobalOptions(options: RustHappyPackLoaderOptions): void {
  globalOptions = { ...globalOptions, ...options };
}

function getGlobalOptions(): RustHappyPackLoaderOptions {
  return globalOptions;
}

function findWorkerBinary(): string {
  const possiblePaths = [
    path.join(__dirname, '../../rust-happypack/target/release/rust-happypack-worker'),
    path.join(__dirname, '../../rust-happypack/target/debug/rust-happypack-worker'),
    path.join(process.cwd(), 'rust-happypack/target/release/rust-happypack-worker'),
    path.join(process.cwd(), 'rust-happypack/target/debug/rust-happypack-worker'),
    'rust-happypack-worker' // Assume it's in PATH
  ];

  return possiblePaths[0];
}

function generateFileHash(content: string, options: string): string {
  return createHash('sha256')
    .update(content)
    .update(options)
    .digest('hex');
}

function generateRequestId(): string {
  return createHash('md5')
    .update(Date.now().toString())
    .update(Math.random().toString())
    .digest('hex');
}

export default function rustHappyPackLoader(
  this: LoaderContext<RustHappyPackLoaderOptions>,
  source: string
): void {
  const callback = this.async();
  if (!callback) {
    throw new Error('rust-happypack-loader requires async mode');
  }

  const options: RustHappyPackLoaderOptions = {
    id: 'default',
    threads: 4,
    cache: true,
    debug: false,
    timeout: 30000,
    ...this.getOptions()
  };

  setGlobalOptions(options);

  const resourcePath = this.resourcePath;
  const workerId = options.id || 'default';
  
  const supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];
  const ext = path.extname(resourcePath);
  
  if (!supportedExtensions.includes(ext)) {
    callback(null, source);
    return;
  }

  const worker = workerPool.getWorker(workerId);
  
  const request: TranspileRequest = {
    id: generateRequestId(),
    file_path: resourcePath,
    source_code: source,
    file_hash: generateFileHash(source, JSON.stringify(options)),
    source_maps: this.sourceMap,
    loader_options: options
  };

  worker.transpile(request)
    .then((response) => {
      if (options.debug) {
        console.log(`Transpiled ${resourcePath} in ${response.processing_time}ms`);
      }
      
      if (response.warnings && response.warnings.length > 0) {
        response.warnings.forEach(warning => {
          this.emitWarning(new Error(warning));
        });
      }

      if (response.source_map && this.sourceMap) {
        callback(null, response.code, JSON.parse(response.source_map));
      } else {
        callback(null, response.code);
      }
    })
    .catch((error) => {
      if (options.debug) {
        console.error(`Failed to transpile ${resourcePath}:`, error);
      }
      callback(error);
    });
}

process.on('exit', () => {
  workerPool.shutdown().catch(console.error);
});

process.on('SIGINT', () => {
  workerPool.shutdown().then(() => process.exit(0)).catch(() => process.exit(1));
});

process.on('SIGTERM', () => {
  workerPool.shutdown().then(() => process.exit(0)).catch(() => process.exit(1));
});

export { TranspileRequest, TranspileResponse, RustWorker, WorkerPool };
