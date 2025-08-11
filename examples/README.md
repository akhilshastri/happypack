# Rust HappyPack Examples

This directory contains various examples demonstrating how to use Rust HappyPack with different project configurations.

## Examples Overview

### 1. Basic Example (`basic/`)
A simple JavaScript project demonstrating basic usage of Rust HappyPack.

**Features:**
- Basic JavaScript transpilation
- ES6+ features (arrow functions, async/await, modules)
- Simple webpack configuration

**Run:**
```bash
cd basic
npm install
npx webpack
```

### 2. TypeScript Example (`typescript/`)
A TypeScript project showcasing advanced type features and transpilation.

**Features:**
- TypeScript interfaces and classes
- Generic functions
- Async/await with proper typing
- Source map generation

**Run:**
```bash
cd typescript
npm install
npx webpack
```

### 3. React Example (`react/`)
A React application with JSX transpilation.

**Features:**
- React functional and class components
- JSX syntax
- React hooks
- Higher-order components

**Run:**
```bash
cd react
npm install
npx webpack
```

### 4. Performance Example (`performance/`)
Demonstrates performance comparisons between different configurations.

**Features:**
- Single thread vs multi-thread comparison
- Cache enabled vs disabled
- Complex TypeScript processing
- Performance benchmarking scripts

**Run:**
```bash
cd performance
npm install

# Run individual configurations
npm run build:single    # 1 thread, no cache
npm run build:multi     # 4 threads, no cache  
npm run build:cached    # 4 threads, with cache

# Run all benchmarks
npm run benchmark
```

## Performance Comparison

### Thread Configuration Comparison

```bash
# Single thread (baseline)
cd performance
time npm run build:single
# Expected: ~15-20 seconds for complex TypeScript

# Multi-thread (4 threads)
time npm run build:multi  
# Expected: ~4-6 seconds (3-4x faster)
```

### Cache Performance

```bash
# First build (cache miss)
cd performance
npm run clean
time npm run build:cached
# Expected: ~4-6 seconds

# Second build (cache hit)
time npm run build:cached
# Expected: ~1-2 seconds (3-5x faster)
```

## Configuration Examples

### Basic Configuration
```javascript
const RustHappyPlugin = require('../rust-happypack-plugin');

module.exports = {
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        use: [
          {
            loader: require.resolve('../rust-happypack-loader'),
            options: {
              id: 'default',
              threads: 4,
              cache: true
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new RustHappyPlugin({ id: 'default' })
  ]
};
```

### Advanced Multi-Instance Configuration
```javascript
const RustHappyPlugin = require('../rust-happypack-plugin');

module.exports = {
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: [
          {
            loader: require.resolve('../rust-happypack-loader'),
            options: {
              id: 'typescript',
              threads: 6,
              cache: true,
              cacheDir: './cache/typescript'
            }
          }
        ]
      },
      {
        test: /\.(js|jsx)$/,
        use: [
          {
            loader: require.resolve('../rust-happypack-loader'),
            options: {
              id: 'javascript',
              threads: 4,
              cache: true,
              cacheDir: './cache/javascript'
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new RustHappyPlugin({
      id: 'typescript',
      threads: 6,
      verbose: true
    }),
    new RustHappyPlugin({
      id: 'javascript', 
      threads: 4,
      verbose: true
    })
  ]
};
```

## Integration Guide

### Migrating from Original HappyPack

**Before (Original HappyPack):**
```javascript
const HappyPack = require('happypack');

module.exports = {
  module: {
    rules: [
      {
        test: /\.js$/,
        use: 'happypack/loader?id=js'
      }
    ]
  },
  plugins: [
    new HappyPack({
      id: 'js',
      threads: 4,
      loaders: ['babel-loader']
    })
  ]
};
```

**After (Rust HappyPack):**
```javascript
const RustHappyPlugin = require('../rust-happypack-plugin');

module.exports = {
  module: {
    rules: [
      {
        test: /\.js$/,
        use: [
          {
            loader: require.resolve('../rust-happypack-loader'),
            options: {
              id: 'js',
              threads: 4,
              cache: true
            }
          }
        ]
      }
    ]
  },
  plugins: [
    new RustHappyPlugin({ id: 'js' })
  ]
};
```

### Adding to Existing Project

1. **Install Dependencies:**
   ```bash
   # Build Rust worker
   cd rust-happypack && cargo build --release
   
   # Build Node.js packages  
   cd ../rust-happypack-loader && npm install && npm run build
   cd ../rust-happypack-plugin && npm install && npm run build
   ```

2. **Update webpack.config.js:**
   ```javascript
   // Add to your existing webpack config
   const RustHappyPlugin = require('./path/to/rust-happypack-plugin');
   
   // Replace existing loaders with rust-happypack-loader
   // Add RustHappyPlugin to plugins array
   ```

3. **Test Integration:**
   ```bash
   npm run build
   ```

## Performance Tuning Tips

### Thread Count Optimization
```javascript
const os = require('os');
const cpuCount = os.cpus().length;

// Conservative: Leave cores for other processes
const threads = Math.max(1, cpuCount - 2);

// Aggressive: Use most available cores
const threads = Math.max(1, Math.floor(cpuCount * 0.8));
```

### Cache Configuration
```javascript
// Development: Fast local cache
{
  cache: true,
  cacheDir: './node_modules/.cache/rust-happypack'
}

// Production: Persistent cache
{
  cache: true,
  cacheDir: path.join(os.homedir(), '.cache/rust-happypack')
}

// CI: Disable cache for clean builds
{
  cache: process.env.CI !== 'true'
}
```

### Debug Configuration
```javascript
// Enable debugging in development
{
  debug: process.env.NODE_ENV === 'development',
  verbose: process.env.NODE_ENV === 'development'
}
```

## Troubleshooting

### Common Issues

1. **Worker Binary Not Found**
   ```
   Error: Worker binary not found
   ```
   Solution: Build the Rust worker with `cargo build --release`

2. **Permission Denied**
   ```
   Error: spawn EACCES
   ```
   Solution: `chmod +x rust-happypack/target/release/rust-happypack-worker`

3. **Timeout Errors**
   ```
   Error: Transpilation timeout
   ```
   Solution: Increase timeout or reduce thread count

### Debug Mode

Enable debug output to troubleshoot issues:

```javascript
new RustHappyPlugin({
  debug: true,
  verbose: true
})
```

Set environment variables:
```bash
export RUST_HAPPYPACK_DEBUG=true
export RUST_HAPPYPACK_THREADS=4
```

## Contributing

To add new examples:

1. Create a new directory under `examples/`
2. Add `webpack.config.js` and source files
3. Include a `package.json` with build scripts
4. Update this README with the new example
5. Test the example works correctly

## License

MIT License - see the main project LICENSE file.
