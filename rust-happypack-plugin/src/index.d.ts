import { Compiler, WebpackPluginInstance } from 'webpack';

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

export interface WorkerInstance {
  id: string;
  process: any;
  options: RustHappyPluginOptions;
  startTime: number;
  isReady: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

export declare class RustHappyPlugin implements WebpackPluginInstance {
  constructor(options?: RustHappyPluginOptions);
  apply(compiler: Compiler): void;
  getWorkerStats(): { [workerId: string]: any };
  getCacheStats(): CacheStats;
  restartWorkers(): Promise<void>;
}

export default RustHappyPlugin;
