const RustHappyPlugin = require('../../rust-happypack-plugin');
const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: [
          {
            loader: require.resolve('../../rust-happypack-loader'),
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
    })
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  },
  devtool: 'source-map'
};
