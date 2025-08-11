const RustHappyPlugin = require('../../rust-happypack-plugin');
const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/index.jsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        use: [
          {
            loader: require.resolve('../../rust-happypack-loader'),
            options: {
              id: 'react',
              threads: 4,
              cache: true,
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
      id: 'react',
      threads: 4,
      cache: true,
      verbose: true
    })
  ],
  resolve: {
    extensions: ['.jsx', '.js']
  }
};
