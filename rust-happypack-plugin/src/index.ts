import { Compiler, WebpackPluginInstance } from 'webpack';
import { spawn, ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

export interface RustHappyPluginOptions {
  id?: string;
  threads?: number;
  cache?: boolean;
  cacheDir?: string;
  debug?: boolean;
  workerPath?: string;
  timeout?: number;
  loaders?: string[];
  verbose?: boolean;
}

interface WorkerInstance {
  id: string;
  process: ChildProcess | null;
  options: RustHappyPluginOptions;
  startTime: number;
  isReady: boolean;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

class RustHappyPlugin implements WebpackPluginInstance {
  private workers: Map<string, WorkerInstance> = new Map();
  private options: RustHappyPluginOptions;
  private cacheStats: CacheStats = { hits: 0, misses: 0, size: 0 };
  private startTime: number = 0;

  constructor(options: RustHappyPluginOptions = {}) {
    this.options = {
      id: 'default',
      threads: this.getOptimalThreadCount(),
      cache: true,
      debug: false,
      timeout: 30000,
      verbose: false,
      loaders: ['rust-happypack-loader'],
      ...options
    };

    this.validateOptions();
  }

  apply(compiler: Compiler): void {
    const pluginName = 'RustHappyPlugin';

    compiler.hooks.environment.tap(pluginName, () => {
      this.setupEnvironment();
    });

    compiler.hooks.beforeRun.tapAsync(pluginName, (compiler, callback) => {
      this.beforeRun(compiler)
        .then(() => callback())
        .catch(callback);
    });

    compiler.hooks.beforeCompile.tapAsync(pluginName, (compilationParams, callback) => {
      this.beforeCompile(compilationParams)
        .then(() => callback())
        .catch(callback);
    });

    compiler.hooks.compilation.tap(pluginName, (compilation) => {
      this.setupCompilation(compilation);
    });

    compiler.hooks.done.tap(pluginName, (stats) => {
      this.onCompilationDone(stats);
    });

    compiler.hooks.watchClose.tap(pluginName, () => {
      this.cleanup();
    });

    process.on('exit', () => {
      this.cleanup();
    });

    process.on('SIGINT', () => {
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.cleanup();
      process.exit(0);
    });
  }

  private validateOptions(): void {
    if (this.options.threads && this.options.threads < 1) {
      throw new Error('RustHappyPlugin: threads must be >= 1');
    }

    if (this.options.timeout && this.options.timeout < 1000) {
      throw new Error('RustHappyPlugin: timeout must be >= 1000ms');
    }

    if (this.options.cacheDir && !path.isAbsolute(this.options.cacheDir)) {
      this.options.cacheDir = path.resolve(process.cwd(), this.options.cacheDir);
    }
  }

  private setupEnvironment(): void {
    this.startTime = Date.now();
    
    if (this.options.debug) {
      console.log('RustHappyPlugin: Setting up environment');
    }

    if (this.options.threads) {
      process.env.RUST_HAPPYPACK_THREADS = this.options.threads.toString();
    }

    if (this.options.cache !== undefined) {
      process.env.RUST_HAPPYPACK_CACHE_ENABLED = this.options.cache.toString();
    }

    if (this.options.cacheDir) {
      process.env.RUST_HAPPYPACK_CACHE_DIR = this.options.cacheDir;
      this.ensureCacheDir();
    }

    if (this.options.debug) {
      process.env.RUST_HAPPYPACK_DEBUG = 'true';
    }
  }

  private async beforeRun(compiler: Compiler): Promise<void> {
    if (this.options.debug) {
      console.log('RustHappyPlugin: Starting workers before compilation');
    }

    await this.startWorkers();
  }

  private async beforeCompile(compilationParams: any): Promise<void> {
    await this.ensureWorkersReady();
  }

  private setupCompilation(compilation: any): void {
    if (this.options.verbose) {
      compilation.hooks.buildModule.tap('RustHappyPlugin', (module: any) => {
        if (this.isHandledByRustHappy(module.resource)) {
          console.log(`RustHappyPlugin: Processing ${module.resource}`);
        }
      });
    }
  }

  private onCompilationDone(stats: any): void {
    const duration = Date.now() - this.startTime;
    
    if (this.options.verbose || this.options.debug) {
      console.log(`RustHappyPlugin: Compilation completed in ${duration}ms`);
      
      if (this.options.cache) {
        console.log(`Cache stats - Hits: ${this.cacheStats.hits}, Misses: ${this.cacheStats.misses}, Size: ${this.cacheStats.size}`);
      }
    }
  }

  private async startWorkers(): Promise<void> {
    const workerId = this.options.id || 'default';
    
    if (this.workers.has(workerId)) {
      return; // Worker already started
    }

    const workerPath = this.options.workerPath || this.findWorkerBinary();
    
    if (!fs.existsSync(workerPath)) {
      throw new Error(`RustHappyPlugin: Worker binary not found at ${workerPath}`);
    }

    const worker: WorkerInstance = {
      id: workerId,
      process: null,
      options: this.options,
      startTime: Date.now(),
      isReady: false
    };

    try {
      await this.spawnWorker(worker, workerPath);
      this.workers.set(workerId, worker);
      
      if (this.options.debug) {
        console.log(`RustHappyPlugin: Started worker ${workerId} with ${this.options.threads} threads`);
      }
    } catch (error) {
      throw new Error(`RustHappyPlugin: Failed to start worker ${workerId}: ${error}`);
    }
  }

  private async spawnWorker(worker: WorkerInstance, workerPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['--mode', 'message'];
      
      worker.process = spawn(workerPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      if (!worker.process.stdout || !worker.process.stderr || !worker.process.stdin) {
        reject(new Error('Failed to create worker process pipes'));
        return;
      }

      let startupTimeout: NodeJS.Timeout | null = setTimeout(() => {
        reject(new Error('Worker startup timeout'));
      }, 10000);

      worker.process.stdout.on('data', (data) => {
        const output = data.toString();
        
        if (output.includes('Worker ready') || output.includes('{"WorkerStatus"')) {
          worker.isReady = true;
          if (startupTimeout) {
            clearTimeout(startupTimeout);
            startupTimeout = null;
            resolve();
          }
        }

        if (this.options.debug) {
          console.log(`Worker ${worker.id} stdout:`, output);
        }
      });

      worker.process.stderr.on('data', (data) => {
        if (this.options.debug) {
          console.error(`Worker ${worker.id} stderr:`, data.toString());
        }
      });

      worker.process.on('error', (error) => {
        if (startupTimeout) {
          clearTimeout(startupTimeout);
          startupTimeout = null;
          reject(error);
        } else {
          console.error(`Worker ${worker.id} error:`, error);
        }
      });

      worker.process.on('exit', (code, signal) => {
        worker.isReady = false;
        if (this.options.debug) {
          console.log(`Worker ${worker.id} exited with code ${code}, signal ${signal}`);
        }
        
        if (startupTimeout) {
          clearTimeout(startupTimeout);
          startupTimeout = null;
          reject(new Error(`Worker exited during startup with code ${code}`));
        }
      });

      setTimeout(() => {
        if (worker.process && worker.process.stdin) {
          worker.process.stdin.write('{"Ping":{}}\n');
        }
      }, 1000);
    });
  }

  private async ensureWorkersReady(): Promise<void> {
    const readyPromises = Array.from(this.workers.values()).map(worker => {
      if (worker.isReady) {
        return Promise.resolve();
      }
      
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Worker ${worker.id} not ready within timeout`));
        }, 5000);

        const checkReady = () => {
          if (worker.isReady) {
            clearTimeout(timeout);
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        
        checkReady();
      });
    });

    await Promise.all(readyPromises);
  }

  private isHandledByRustHappy(resourcePath: string): boolean {
    if (!resourcePath) return false;
    
    const supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs'];
    const ext = path.extname(resourcePath);
    return supportedExtensions.includes(ext);
  }

  private findWorkerBinary(): string {
    const possiblePaths = [
      path.join(__dirname, '../../rust-happypack/target/release/rust-happypack-worker'),
      path.join(__dirname, '../../rust-happypack/target/debug/rust-happypack-worker'),
      path.join(process.cwd(), 'rust-happypack/target/release/rust-happypack-worker'),
      path.join(process.cwd(), 'rust-happypack/target/debug/rust-happypack-worker'),
      'rust-happypack-worker' // Assume it's in PATH
    ];

    for (const workerPath of possiblePaths) {
      if (fs.existsSync(workerPath)) {
        return workerPath;
      }
    }

    return possiblePaths[0];
  }

  private ensureCacheDir(): void {
    if (this.options.cacheDir && !fs.existsSync(this.options.cacheDir)) {
      try {
        fs.mkdirSync(this.options.cacheDir, { recursive: true });
      } catch (error) {
        console.warn(`RustHappyPlugin: Failed to create cache directory: ${error}`);
      }
    }
  }

  private getOptimalThreadCount(): number {
    const cpuCount = require('os').cpus().length;
    return Math.max(1, Math.min(8, Math.floor(cpuCount * 0.75)));
  }

  private cleanup(): void {
    if (this.options.debug) {
      console.log('RustHappyPlugin: Cleaning up workers');
    }

    for (const worker of this.workers.values()) {
      if (worker.process) {
        try {
          worker.process.kill('SIGTERM');
          
          setTimeout(() => {
            if (worker.process && !worker.process.killed) {
              worker.process.kill('SIGKILL');
            }
          }, 5000);
        } catch (error) {
          if (this.options.debug) {
            console.error(`Error killing worker ${worker.id}:`, error);
          }
        }
      }
    }

    this.workers.clear();
  }

  public getWorkerStats(): { [workerId: string]: any } {
    const stats: { [workerId: string]: any } = {};
    
    for (const [id, worker] of this.workers) {
      stats[id] = {
        isReady: worker.isReady,
        uptime: Date.now() - worker.startTime,
        pid: worker.process?.pid || null
      };
    }
    
    return stats;
  }

  public getCacheStats(): CacheStats {
    return { ...this.cacheStats };
  }

  public async restartWorkers(): Promise<void> {
    this.cleanup();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for cleanup
    await this.startWorkers();
  }
}

export default RustHappyPlugin;
export { RustHappyPlugin, WorkerInstance, CacheStats };
