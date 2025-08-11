
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

jest.mock('crypto', () => {
  let hashCounter = 0;
  return {
    createHash: jest.fn(() => {
      const currentCounter = hashCounter++;
      let updateData = '';
      const hashObj = {
        update: jest.fn().mockImplementation((data) => {
          updateData += data;
          return hashObj;
        }),
        digest: jest.fn().mockImplementation(() => {
          return `mocked-hash-${currentCounter}-${updateData.length}`;
        }),
      };
      return hashObj;
    }),
  };
});

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn((...args) => args.join('/')),
  extname: jest.fn((filePath) => {
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  }),
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
});

(global as any).createMockLoaderContext = (options = {}) => ({
  async: jest.fn(() => jest.fn()),
  getOptions: jest.fn(() => options),
  resourcePath: '/test/file.js',
  sourceMap: true,
  emitWarning: jest.fn(),
  callback: jest.fn(),
});

afterEach(() => {
  jest.clearAllMocks();
});
