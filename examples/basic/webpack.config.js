const RustHappyPlugin = require('../../rust-happypack-plugin');
const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
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
              id: 'js',
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
      id: 'js',
      threads: 4,
      cache: true,
      debug: process.env.NODE_ENV === 'development',
      verbose: true
    })
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx']
  }
};
