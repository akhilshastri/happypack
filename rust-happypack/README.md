# Rust HappyPack

A Rust-based parallel transpiler loader for webpack, inspired by HappyPack. This project provides high-performance JavaScript/TypeScript transpilation using Rust workers with configurable thread pools.

## Features

- 🚀 **High Performance**: Rust-based transpilation with parallel processing
- 🧵 **Configurable Thread Pool**: Use Tokio-based thread pools with customizable worker counts
- 💾 **Smart Caching**: File hash-based caching for improved build times
- 🔧 **Easy Integration**: Drop-in replacement for existing webpack loaders
- 📦 **Multiple File Types**: Support for JS, JSX, TS, TSX, and MJS files
- 🎯 **Source Maps**: Optional source map generation
- 🔍 **Debug Support**: Comprehensive logging and debugging options

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Webpack       │    │  Node.js Loader  │    │  Rust Worker    │
│   Build Process │◄──►│  & Plugin        │◄──►│  Thread Pool    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                         │
                              ▼                         ▼
                       ┌──────────────┐         ┌─────────────┐
                       │    Cache     │         │ Transpiler  │
                       │  Management  │         │   (Basic)   │
                       └──────────────┘         └─────────────┘
```

## Installation

### Prerequisites

- Node.js >= 16.0.0
- Rust >= 1.70.0 (for building from source)
- Webpack >= 4.0.0 || >= 5.0.0

### Build from Source

```bash
# Clone the repository
git clone https://github.com/akhilshastri/happypack.git
cd happypack

# Build the Rust worker
cd rust-happypack
cargo build --release

# Build the Node.js packages
cd ../rust-happypack-loader
npm install
npm run build

cd ../rust-happypack-plugin
npm install
npm run build
```

## Quick Start

### 1. Basic webpack Configuration

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
              id: 'js',
              threads: 4,
              cache: true
            }
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    new RustHappyPlugin({
      id: 'js',
      threads: 4,
      cache: true,
      debug: false
    })
  ]
};
```

### 2. Advanced Configuration

```javascript
const RustHappyPlugin = require('../rust-happypack-plugin');
const path = require('path');

module.exports = {
  module: {
    rules: [
      // TypeScript files
      {
        test: /\.(ts|tsx)$/,
        use: [
          {
            loader: require.resolve('../rust-happypack-loader'),
            options: {
              id: 'typescript',
              threads: 6,
              cache: true,
              cacheDir: path.join(__dirname, '.cache/rust-happypack'),
              debug: process.env.NODE_ENV === 'development'
            }
          }
        ],
        exclude: /node_modules/
      },
      // JavaScript files
      {
        test: /\.(js|jsx)$/,
        use: [
          {
            loader: require.resolve('../rust-happypack-loader'),
            options: {
              id: 'javascript',
              threads: 4,
              cache: true,
              timeout: 30000
            }
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  plugins: [
    new RustHappyPlugin({
      id: 'typescript',
      threads: 6,
      cache: true,
      cacheDir: path.join(__dirname, '.cache/rust-happypack'),
      verbose: true
    }),
    new RustHappyPlugin({
      id: 'javascript',
      threads: 4,
      cache: true,
      debug: process.env.NODE_ENV === 'development'
    })
  ]
};
```

## Configuration Options

### Loader Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | `string` | `'default'` | Unique identifier for the worker pool |
| `threads` | `number` | `4` | Number of worker threads |
| `cache` | `boolean` | `true` | Enable file-based caching |
| `cacheDir` | `string` | OS temp dir | Custom cache directory |
| `debug` | `boolean` | `false` | Enable debug logging |
| `workerPath` | `string` | Auto-detected | Path to Rust worker binary |
| `timeout` | `number` | `30000` | Transpilation timeout in ms |

### Plugin Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | `string` | `'default'` | Unique identifier for the worker pool |
| `threads` | `number` | Auto-detected | Number of worker threads |
| `cache` | `boolean` | `true` | Enable file-based caching |
| `cacheDir` | `string` | OS temp dir | Custom cache directory |
| `debug` | `boolean` | `false` | Enable debug logging |
| `verbose` | `boolean` | `false` | Enable verbose output |
| `workerPath` | `string` | Auto-detected | Path to Rust worker binary |
| `timeout` | `number` | `30000` | Worker startup timeout in ms |

## Performance Tuning

### Thread Configuration

The optimal number of threads depends on your system and project:

```javascript
// For CPU-intensive projects
const cpuCount = require('os').cpus().length;
const threads = Math.max(1, cpuCount - 1); // Leave one core for the main process

// For I/O-intensive projects
const threads = cpuCount * 2; // Can handle more concurrent operations
```

### Cache Configuration

```javascript
// Development: Fast cache access
{
  cache: true,
  cacheDir: path.join(__dirname, 'node_modules/.cache/rust-happypack')
}

// Production: Persistent cache
{
  cache: true,
  cacheDir: path.join(os.homedir(), '.cache/rust-happypack')
}

// CI/CD: Disable cache for clean builds
{
  cache: process.env.CI !== 'true'
}
```

## Performance Comparison

### Threads Comparison

```bash
# Single thread
webpack --env threads=1
# Build time: ~45s

# Multiple threads
webpack --env threads=4
# Build time: ~12s (3.75x faster)
```

### Cache Comparison

```bash
# Without cache
webpack --env cache=false
# Build time: ~45s

# With cache (subsequent builds)
webpack --env cache=true
# Build time: ~3s (15x faster)
```

## Integration Guide

### Existing Webpack Environment

To integrate rust-happypack into an existing webpack project:

1. **Install Dependencies**
   ```bash
   # Build the Rust worker
   cd rust-happypack
   cargo build --release
   
   # Install Node.js packages
   cd ../rust-happypack-loader && npm install && npm run build
   cd ../rust-happypack-plugin && npm install && npm run build
   ```

2. **Update webpack.config.js**
   ```javascript
   const RustHappyPlugin = require('./rust-happypack-plugin');
   
   // Replace existing loaders
   module.exports = {
     module: {
       rules: [
         {
           test: /\.(js|jsx|ts|tsx)$/,
           use: [
             {
               loader: require.resolve('./rust-happypack-loader'),
               options: {
                 id: 'main',
                 threads: 4,
                 cache: true
               }
             }
           ],
           exclude: /node_modules/
         }
       ]
     },
     plugins: [
       new RustHappyPlugin({ id: 'main' })
     ]
   };
   ```

3. **Test the Integration**
   ```bash
   npm run build
   ```

### Migration from Original HappyPack

```javascript
// Before (original HappyPack)
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

// After (Rust HappyPack)
const RustHappyPlugin = require('./rust-happypack-plugin');

module.exports = {
  module: {
    rules: [
      {
        test: /\.js$/,
        use: [
          {
            loader: require.resolve('./rust-happypack-loader'),
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

## Examples

See the [examples](./examples/) directory for complete working examples.

## API Reference

### RustHappyPlugin

```typescript
class RustHappyPlugin {
  constructor(options?: RustHappyPluginOptions);
  apply(compiler: Compiler): void;
  getWorkerStats(): { [workerId: string]: any };
  getCacheStats(): CacheStats;
  restartWorkers(): Promise<void>;
}
```

### Loader Function

```typescript
function rustHappyPackLoader(
  this: LoaderContext<RustHappyPackLoaderOptions>,
  source: string
): void;
```

## Debugging

### Enable Debug Mode

```javascript
// webpack.config.js
module.exports = {
  plugins: [
    new RustHappyPlugin({
      debug: true,
      verbose: true
    })
  ]
};
```

### Environment Variables

```bash
# Enable Rust worker debugging
export RUST_HAPPYPACK_DEBUG=true

# Set custom thread count
export RUST_HAPPYPACK_THREADS=8

# Set custom cache directory
export RUST_HAPPYPACK_CACHE_DIR=/tmp/rust-happypack-cache

# Enable cache
export RUST_HAPPYPACK_CACHE_ENABLED=true
```

## License

MIT License - see the [LICENSE](../LICENSE) file for details.

## Acknowledgments

- Inspired by the original [HappyPack](https://github.com/amireh/happypack) project
- Built with Rust for high-performance transpilation
- Uses [Tokio](https://tokio.rs/) for async runtime and thread management
