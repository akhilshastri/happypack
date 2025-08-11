const RustHappyPlugin = require('../../rust-happypack-plugin');
const path = require('path');

const configs = {
  singleThread: {
    mode: 'development',
    entry: './src/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist/single-thread'),
      filename: 'bundle.js'
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx|ts|tsx)$/,
          use: [
            {
              loader: require.resolve('../../rust-happypack-loader'),
              options: {
                id: 'single',
                threads: 1,
                cache: false,
                debug: true
              }
            }
          ],
          exclude: /node_modules/
        }
      ]
    },
    plugins: [
      new RustHappyPlugin({
        id: 'single',
        threads: 1,
        cache: false,
        verbose: true
      })
    ],
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx']
    }
  },

  multiThread: {
    mode: 'development',
    entry: './src/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist/multi-thread'),
      filename: 'bundle.js'
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx|ts|tsx)$/,
          use: [
            {
              loader: require.resolve('../../rust-happypack-loader'),
              options: {
                id: 'multi',
                threads: 4,
                cache: false,
                debug: true
              }
            }
          ],
          exclude: /node_modules/
        }
      ]
    },
    plugins: [
      new RustHappyPlugin({
        id: 'multi',
        threads: 4,
        cache: false,
        verbose: true
      })
    ],
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx']
    }
  },

  cached: {
    mode: 'development',
    entry: './src/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist/cached'),
      filename: 'bundle.js'
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx|ts|tsx)$/,
          use: [
            {
              loader: require.resolve('../../rust-happypack-loader'),
              options: {
                id: 'cached',
                threads: 4,
                cache: true,
                cacheDir: path.join(__dirname, '.cache/rust-happypack'),
                debug: true
              }
            }
          ],
          exclude: /node_modules/
        }
      ]
    },
    plugins: [
      new RustHappyPlugin({
        id: 'cached',
        threads: 4,
        cache: true,
        cacheDir: path.join(__dirname, '.cache/rust-happypack'),
        verbose: true
      })
    ],
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.jsx']
    }
  }
};

const configType = process.env.CONFIG_TYPE || 'multiThread';
module.exports = configs[configType];
