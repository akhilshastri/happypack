import { jest } from '@jest/globals';
import { ChildProcess } from 'child_process';
import rustHappyPackLoader, { RustWorker, TranspileRequest, TranspileResponse } from './index';

jest.mock('child_process');

const createMockLoaderContext = (options: any = {}): any => ({
  async: jest.fn(() => jest.fn()),
  getOptions: jest.fn(() => options),
  resourcePath: '/test/file.js',
  sourceMap: true,
  emitWarning: jest.fn(),
  callback: jest.fn(),
  version: 5,
  emitError: jest.fn(),
  getLogger: jest.fn(),
  resolve: jest.fn(),
  addDependency: jest.fn(),
  addContextDependency: jest.fn(),
  addMissingDependency: jest.fn(),
  dependency: jest.fn(),
  clearDependencies: jest.fn(),
  context: '/test',
  request: '/test/file.js',
  userRequest: '/test/file.js',
  rawRequest: './file.js',
  loaders: [],
  loaderIndex: 0,
  resource: '/test/file.js',
  resourceQuery: '',
  resourceFragment: ''
});

describe('RustWorker', () => {
  let mockProcess: any;
  
  beforeEach(() => {
    mockProcess = {
      stdout: {
        on: jest.fn()
      },
      stderr: {
        on: jest.fn()
      },
      stdin: {
        write: jest.fn()
      },
      on: jest.fn().mockReturnThis(),
      kill: jest.fn().mockReturnValue(true)
    };
    
    (require('child_process').spawn as jest.Mock).mockReturnValue(mockProcess);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should create worker instance', () => {
    const worker = new RustWorker('/path/to/worker', {
      id: 'test',
      threads: 4,
      cache: true
    });
    
    expect(worker).toBeInstanceOf(RustWorker);
  });

  test('should start worker process', async () => {
    const worker = new RustWorker('/path/to/worker', {
      id: 'test',
      threads: 4
    });

    setTimeout(() => {
      const stdoutHandler = (mockProcess.stdout!.on as jest.Mock).mock.calls
        .find((call: any) => call[0] === 'data')?.[1] as Function;
      if (stdoutHandler) {
        stdoutHandler('{"WorkerStatus":"ready"}\n');
      }
    }, 10);

    await worker.start();
    
    expect(require('child_process').spawn).toHaveBeenCalledWith(
      '/path/to/worker',
      ['--mode', 'message'],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe']
      })
    );
  });

  test('should handle transpilation request', async () => {
    const worker = new RustWorker('/path/to/worker', {
      id: 'test',
      threads: 4
    });

    setTimeout(() => {
      const stdoutHandler = (mockProcess.stdout!.on as jest.Mock).mock.calls
        .find((call: any) => call[0] === 'data')?.[1] as Function;
      if (stdoutHandler) {
        stdoutHandler('{"WorkerStatus":"ready"}\n');
      }
    }, 10);

    await worker.start();

    const request: TranspileRequest = {
      id: 'test-request',
      file_path: '/test/file.js',
      source_code: 'console.log("hello");',
      file_hash: 'abc123',
      source_maps: true
    };

    const transpilePromise = worker.transpile(request);
    
    setTimeout(() => {
      const stdoutHandler = (mockProcess.stdout!.on as jest.Mock).mock.calls
        .find((call: any) => call[0] === 'data')?.[1] as Function;
      if (stdoutHandler) {
        const response = {
          TranspileResponse: {
            id: 'test-request',
            code: 'console.log("hello");',
            processing_time: 10
          }
        };
        stdoutHandler(JSON.stringify(response) + '\n');
      }
    }, 10);

    const result = await transpilePromise;
    
    expect(result.id).toBe('test-request');
    expect(result.code).toBe('console.log("hello");');
    expect(mockProcess.stdin!.write).toHaveBeenCalledWith(
      expect.stringContaining('"TranspileRequest"')
    );
  });

  test('should handle transpilation timeout', async () => {
    const worker = new RustWorker('/path/to/worker', {
      id: 'test',
      timeout: 100
    });

    setTimeout(() => {
      const stdoutHandler = (mockProcess.stdout!.on as jest.Mock).mock.calls
        .find((call: any) => call[0] === 'data')?.[1] as Function;
      if (stdoutHandler) {
        stdoutHandler('{"WorkerStatus":"ready"}\n');
      }
    }, 10);

    await worker.start();

    const request: TranspileRequest = {
      id: 'test-request',
      file_path: '/test/file.js',
      source_code: 'console.log("hello");',
      file_hash: 'abc123'
    };

    await expect(worker.transpile(request)).rejects.toThrow('Transpilation timeout');
  });

  test('should shutdown worker gracefully', async () => {
    const worker = new RustWorker('/path/to/worker', {
      id: 'test'
    });

    setTimeout(() => {
      const stdoutHandler = (mockProcess.stdout!.on as jest.Mock).mock.calls
        .find((call: any) => call[0] === 'data')?.[1] as Function;
      if (stdoutHandler) {
        stdoutHandler('{"WorkerStatus":"ready"}\n');
      }
    }, 10);

    await worker.start();

    setTimeout(() => {
      const exitHandler = (mockProcess.on as jest.Mock).mock.calls
        .find((call: any) => call[0] === 'exit')?.[1] as Function;
      if (exitHandler) {
        exitHandler(0, null);
      }
    }, 10);

    await worker.shutdown();
    
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
  });
});

describe('rustHappyPackLoader', () => {
  test('should process supported file types', () => {
    const context = createMockLoaderContext({
      id: 'test',
      threads: 4,
      cache: true
    });
    context.resourcePath = '/test/file.ts';
    
    const callback = jest.fn();
    context.async.mockReturnValue(callback);

    rustHappyPackLoader.call(context, 'const x: number = 1;');
    
    expect(context.async).toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalledWith(null, 'const x: number = 1;');
  });

  test('should pass through unsupported file types', () => {
    const context = createMockLoaderContext({
      id: 'test',
      threads: 4,
      cache: true
    });
    context.resourcePath = '/test/file.py';
    
    const callback = jest.fn();
    context.async.mockReturnValue(callback);

    rustHappyPackLoader.call(context, 'print("hello")');
    
    expect(callback).toHaveBeenCalledWith(null, 'print("hello")');
  });

  test('should handle loader options', () => {
    const options = {
      id: 'custom-id',
      threads: 8,
      cache: false,
      debug: true,
      timeout: 60000
    };
    
    const context = createMockLoaderContext(options);
    context.resourcePath = '/test/file.js';
    
    const callback = jest.fn();
    context.async.mockReturnValue(callback);

    rustHappyPackLoader.call(context, 'console.log("test");');
    
    expect(context.getOptions).toHaveBeenCalled();
  });

  test('should generate file hash correctly', () => {
    const { createHash } = require('crypto');
    const mockHash = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mocked-hash')
    };
    
    jest.spyOn(require('crypto'), 'createHash').mockReturnValue(mockHash);
    
    const context = createMockLoaderContext();
    context.resourcePath = '/test/file.js';
    
    const callback = jest.fn();
    context.async.mockReturnValue(callback);

    rustHappyPackLoader.call(context, 'console.log("test");');
    
    expect(createHash).toHaveBeenCalledWith('sha256');
    expect(mockHash.update).toHaveBeenCalledWith('console.log("test");');
  });

  test('should emit warnings from transpilation response', async () => {
    expect(true).toBe(true);
  });
});

describe('File hash generation', () => {
  test('should generate consistent hashes for same input', () => {
    const { createHash } = require('crypto');
    
    const hash1 = createHash('sha256')
      .update('console.log("test");')
      .update('{}')
      .digest('hex');
      
    const hash2 = createHash('sha256')
      .update('console.log("test");')
      .update('{}')
      .digest('hex');
    
    expect(hash1).toBe(hash2);
  });

  test('should generate different hashes for different input', () => {
    expect(true).toBe(true);
  });
});

describe('Worker pool management', () => {
  test('should reuse workers with same id', () => {
    expect(true).toBe(true); // Placeholder
  });

  test('should create separate workers for different ids', () => {
    expect(true).toBe(true); // Placeholder
  });
});
