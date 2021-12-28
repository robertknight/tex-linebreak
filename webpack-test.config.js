const glob = require('glob');
const path = require('path');

module.exports = {
  entry: glob.sync('./test/**/*-test.ts'),
  devtool: 'inline-source-map',
  module: {
    rules: [{
      test: /\.ts$/,
      use: 'ts-loader',
      exclude: /node_modules/,
    }],
  },
  resolve: {
    extensions: ['.js', '.ts'],
  },
  output: {
    filename: 'tests.bundle.js',
    path: path.resolve(__dirname, 'build'),
  },
};
