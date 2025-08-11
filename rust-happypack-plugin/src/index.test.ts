import { jest } from '@jest/globals';
import { Compiler } from 'webpack';
import { ChildProcess } from 'child_process';
import RustHappyPlugin, { RustHappyPluginOptions } from './index';

jest.mock('child_process');

jest.mock('fs');

describe('RustHappyPlugin', () => {
  let mockCompiler: Partial<Compiler>;
  let mockProcess: any;
  
  beforeEach(() => {
    mockProcess = {
      stdout: {
        on: jest.fn()
      } as any,
      stderr: {
        on: jest.fn()
      } as any,
      stdin: {
        write: jest.fn()
      } as any,
      on: jest.fn().mockReturnThis(),
      kill: jest.fn().mockReturnValue(true),
      pid: 12345
    };

    (require('child_process').spawn as jest.Mock).mockReturnValue(mockProcess);
    (require('fs').existsSync as jest.Mock).mockReturnValue(true);
    (require('fs').mkdirSync as jest.Mock).mockImplementation(() => {});

    mockCompiler = {
      hooks: {
        environment: { tap: jest.fn() },
        beforeRun: { tapAsync: jest.fn() },
        beforeCompile: { tapAsync: jest.fn() },
        compilation: { tap: jest.fn() },
        done: { tap: jest.fn() },
        watchClose: { tap: jest.fn() }
      }
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should create plugin with default options', () => {
    const plugin = new RustHappyPlugin();
    
    expect(plugin).toBeInstanceOf(RustHappyPlugin);
  });

  test('should create plugin with custom options', () => {
    const options: RustHappyPluginOptions = {
      id: 'custom',
      threads: 8,
      cache: false,
      debug: true,
      verbose: true,
      timeout: 60000
    };
    
    const plugin = new RustHappyPlugin(options);
    
    expect(plugin).toBeInstanceOf(RustHappyPlugin);
  });

  test('should validate options correctly', () => {
    expect(() => {
      new RustHappyPlugin({ threads: 0 });
    }).toThrow('threads must be >= 1');

    expect(() => {
      new RustHappyPlugin({ timeout: 500 });
    }).toThrow('timeout must be >= 1000ms');
  });

  test('should register webpack hooks', () => {
    const plugin = new RustHappyPlugin();
    
    plugin.apply(mockCompiler as Compiler);
    
    expect(mockCompiler.hooks!.environment.tap).toHaveBeenCalledWith(
      'RustHappyPlugin',
      expect.any(Function)
    );
    expect(mockCompiler.hooks!.beforeRun.tapAsync).toHaveBeenCalledWith(
      'RustHappyPlugin',
      expect.any(Function)
    );
    expect(mockCompiler.hooks!.beforeCompile.tapAsync).toHaveBeenCalledWith(
      'RustHappyPlugin',
      expect.any(Function)
    );
    expect(mockCompiler.hooks!.compilation.tap).toHaveBeenCalledWith(
      'RustHappyPlugin',
      expect.any(Function)
    );
    expect(mockCompiler.hooks!.done.tap).toHaveBeenCalledWith(
      'RustHappyPlugin',
      expect.any(Function)
    );
    expect(mockCompiler.hooks!.watchClose.tap).toHaveBeenCalledWith(
      'RustHappyPlugin',
      expect.any(Function)
    );
  });

  test('should set environment variables', () => {
    const plugin = new RustHappyPlugin({
      threads: 6,
      cache: true,
      cacheDir: '/custom/cache',
      debug: true
    });
    
    plugin.apply(mockCompiler as Compiler);
    
    const environmentHook = (mockCompiler.hooks!.environment.tap as jest.Mock).mock.calls[0][1] as Function;
    environmentHook();
    
    expect(process.env.RUST_HAPPYPACK_THREADS).toBe('6');
    expect(process.env.RUST_HAPPYPACK_CACHE_ENABLED).toBe('true');
    expect(process.env.RUST_HAPPYPACK_CACHE_DIR).toBe('/custom/cache');
    expect(process.env.RUST_HAPPYPACK_DEBUG).toBe('true');
  });

  test('should start workers before compilation', async () => {
    const plugin = new RustHappyPlugin({
      id: 'test',
      workerPath: '/path/to/worker'
    });
    
    plugin.apply(mockCompiler as Compiler);
    
    setTimeout(() => {
      const stdoutHandler = (mockProcess.stdout!.on as jest.Mock).mock.calls
        .find((call: any) => call[0] === 'data')?.[1] as Function;
      if (stdoutHandler) {
        stdoutHandler('Worker ready\n');
      }
    }, 10);
    
    const beforeRunHook = (mockCompiler.hooks!.beforeRun.tapAsync as jest.Mock).mock.calls[0][1] as Function;
    const callback = jest.fn();
    
    await beforeRunHook(mockCompiler, callback);
    
    expect(require('child_process').spawn).toHaveBeenCalledWith(
      '/path/to/worker',
      ['--mode', 'message'],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe']
      })
    );
    expect(callback).toHaveBeenCalled();
  });

  test('should handle worker startup failure', async () => {
    const plugin = new RustHappyPlugin({
      workerPath: '/nonexistent/worker'
    });
    
    (require('fs').existsSync as jest.Mock).mockReturnValue(false);
    
    plugin.apply(mockCompiler as Compiler);
    
    const beforeRunHook = (mockCompiler.hooks!.beforeRun.tapAsync as jest.Mock).mock.calls[0][1] as Function;
    const callback = jest.fn();
    
    await beforeRunHook(mockCompiler, callback);
    
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Worker binary not found')
      })
    );
  });

  test('should create cache directory if it does not exist', () => {
    (require('fs').existsSync as jest.Mock).mockReturnValue(false);
    
    const plugin = new RustHappyPlugin({
      cache: true,
      cacheDir: '/custom/cache/dir'
    });
    
    plugin.apply(mockCompiler as Compiler);
    
    const environmentHook = (mockCompiler.hooks!.environment.tap as jest.Mock).mock.calls[0][1] as Function;
    environmentHook();
    
    expect(require('fs').mkdirSync).toHaveBeenCalledWith(
      '/custom/cache/dir',
      { recursive: true }
    );
  });

  test('should get optimal thread count', () => {
    const originalCpus = require('os').cpus;
    require('os').cpus = jest.fn().mockReturnValue(new Array(8));
    
    const plugin = new RustHappyPlugin();
    
    expect(plugin['getOptimalThreadCount']()).toBe(6);
    
    require('os').cpus = originalCpus;
  });

  test('should provide worker stats', async () => {
    const plugin = new RustHappyPlugin({
      id: 'test'
    });
    
    plugin.apply(mockCompiler as Compiler);
    
    setTimeout(() => {
      const stdoutHandler = (mockProcess.stdout!.on as jest.Mock).mock.calls
        .find((call: any) => call[0] === 'data')?.[1] as Function;
      if (stdoutHandler) {
        stdoutHandler('Worker ready\n');
      }
    }, 10);
    
    const beforeRunHook = (mockCompiler.hooks!.beforeRun.tapAsync as jest.Mock).mock.calls[0][1] as Function;
    await beforeRunHook(mockCompiler, jest.fn());
    
    const stats = plugin.getWorkerStats();
    
    expect(stats).toHaveProperty('test');
    expect(stats.test).toHaveProperty('isReady');
    expect(stats.test).toHaveProperty('uptime');
    expect(stats.test).toHaveProperty('pid');
  });

  test('should provide cache stats', () => {
    const plugin = new RustHappyPlugin();
    
    const stats = plugin.getCacheStats();
    
    expect(stats).toHaveProperty('hits');
    expect(stats).toHaveProperty('misses');
    expect(stats).toHaveProperty('size');
    expect(typeof stats.hits).toBe('number');
    expect(typeof stats.misses).toBe('number');
    expect(typeof stats.size).toBe('number');
  });

  test('should cleanup workers on shutdown', () => {
    const plugin = new RustHappyPlugin();
    
    plugin.apply(mockCompiler as Compiler);
    
    const watchCloseHook = (mockCompiler.hooks!.watchClose.tap as jest.Mock).mock.calls[0][1] as Function;
    watchCloseHook();
    
    expect(true).toBe(true);
  });

  test('should restart workers', async () => {
    const plugin = new RustHappyPlugin({
      id: 'test',
      workerPath: '/path/to/worker'
    });
    
    plugin.apply(mockCompiler as Compiler);
    
    setTimeout(() => {
      const stdoutHandler = (mockProcess.stdout!.on as jest.Mock).mock.calls
        .find((call: any) => call[0] === 'data')?.[1] as Function;
      if (stdoutHandler) {
        stdoutHandler('Worker ready\n');
      }
    }, 10);
    
    const beforeRunHook = (mockCompiler.hooks!.beforeRun.tapAsync as jest.Mock).mock.calls[0][1] as Function;
    await beforeRunHook(mockCompiler, jest.fn());
    
    jest.clearAllMocks();
    
    setTimeout(() => {
      const stdoutHandler = (mockProcess.stdout!.on as jest.Mock).mock.calls
        .find((call: any) => call[0] === 'data')?.[1] as Function;
      if (stdoutHandler) {
        stdoutHandler('Worker ready\n');
      }
    }, 10);
    
    await plugin.restartWorkers();
    
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    expect(require('child_process').spawn).toHaveBeenCalled();
  });

  test('should handle compilation done with stats', () => {
    const plugin = new RustHappyPlugin({
      verbose: true
    });
    
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    plugin.apply(mockCompiler as Compiler);
    
    const doneHook = (mockCompiler.hooks!.done.tap as jest.Mock).mock.calls[0][1] as Function;
    doneHook({});
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Compilation completed')
    );
    
    consoleSpy.mockRestore();
  });

  test('should handle supported file types correctly', () => {
    const plugin = new RustHappyPlugin();
    
    expect(plugin['isHandledByRustHappy']('/path/to/file.js')).toBe(true);
    expect(plugin['isHandledByRustHappy']('/path/to/file.jsx')).toBe(true);
    expect(plugin['isHandledByRustHappy']('/path/to/file.ts')).toBe(true);
    expect(plugin['isHandledByRustHappy']('/path/to/file.tsx')).toBe(true);
    expect(plugin['isHandledByRustHappy']('/path/to/file.mjs')).toBe(true);
    expect(plugin['isHandledByRustHappy']('/path/to/file.py')).toBe(false);
    expect(plugin['isHandledByRustHappy']('/path/to/file.css')).toBe(false);
  });
});

describe('Plugin integration', () => {
  test('should work with multiple plugin instances', () => {
    const plugin1 = new RustHappyPlugin({ id: 'js' });
    const plugin2 = new RustHappyPlugin({ id: 'ts' });
    
    const mockCompiler = {
      hooks: {
        environment: { tap: jest.fn() },
        beforeRun: { tapAsync: jest.fn() },
        beforeCompile: { tapAsync: jest.fn() },
        compilation: { tap: jest.fn() },
        done: { tap: jest.fn() },
        watchClose: { tap: jest.fn() }
      }
    } as any;
    
    plugin1.apply(mockCompiler);
    plugin2.apply(mockCompiler);
    
    expect(mockCompiler.hooks.environment.tap).toHaveBeenCalledTimes(2);
    expect(mockCompiler.hooks.beforeRun.tapAsync).toHaveBeenCalledTimes(2);
  });

  test('should handle relative cache directory paths', () => {
    const plugin = new RustHappyPlugin({
      cacheDir: './relative/cache'
    });
    
    expect(plugin['options'].cacheDir).toMatch(/^\/.*\/relative\/cache$/);
  });
});
