
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

jest.mock('os', () => ({
  cpus: jest.fn(() => new Array(8)), // Mock 8 CPU cores
  homedir: jest.fn(() => '/home/user'),
  tmpdir: jest.fn(() => '/tmp'),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => '/' + args.join('/')),
  extname: jest.fn((filePath) => {
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  }),
  isAbsolute: jest.fn((p) => p.startsWith('/')),
}));

(global as any).createMockChildProcess = () => ({
  stdout: {
    on: jest.fn(),
  },
  stderr: {
    on: jest.fn(),
  },
  stdin: {
    write: jest.fn(),
  },
  on: jest.fn(),
  kill: jest.fn(),
  pid: 12345,
  killed: false,
});

(global as any).createMockCompiler = () => ({
  hooks: {
    environment: { tap: jest.fn() },
    beforeRun: { tapAsync: jest.fn() },
    beforeCompile: { tapAsync: jest.fn() },
    compilation: { tap: jest.fn() },
    done: { tap: jest.fn() },
    watchClose: { tap: jest.fn() },
  },
});

(global as any).createMockCompilation = () => ({
  hooks: {
    buildModule: { tap: jest.fn() },
  },
});

afterEach(() => {
  jest.clearAllMocks();
  delete process.env.RUST_HAPPYPACK_THREADS;
  delete process.env.RUST_HAPPYPACK_CACHE_ENABLED;
  delete process.env.RUST_HAPPYPACK_CACHE_DIR;
  delete process.env.RUST_HAPPYPACK_DEBUG;
});
