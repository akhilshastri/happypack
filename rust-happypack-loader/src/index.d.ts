import { LoaderContext } from 'webpack';

export interface RustHappyPackLoaderOptions {
  id?: string;
  threads?: number;
  cache?: boolean;
  cacheDir?: string;
  debug?: boolean;
  workerPath?: string;
  timeout?: number;
}

export interface TranspileRequest {
  id: string;
  file_path: string;
  source_code: string;
  file_hash: string;
  source_maps?: boolean;
  loader_options?: Record<string, any>;
}

export interface TranspileResponse {
  id: string;
  code: string;
  source_map?: string;
  warnings?: string[];
  processing_time?: number;
}

export interface WorkerPool {
  workers: Map<string, RustWorker>;
  getWorker(id: string): RustWorker;
  shutdown(): Promise<void>;
}

export declare class RustWorker {
  constructor(workerPath: string, options: RustHappyPackLoaderOptions);
  start(): Promise<void>;
  transpile(request: TranspileRequest): Promise<TranspileResponse>;
  shutdown(): Promise<void>;
}

declare function rustHappyPackLoader(
  this: LoaderContext<RustHappyPackLoaderOptions>,
  source: string
): void;

export default rustHappyPackLoader;
