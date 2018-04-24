const path = require('path');

module.exports = {
  entry: {
    demos: './src/demos/layout.ts',
    lib: './src',
  },
  devtool: 'inline-source-map',
  module: {
    rules: [{
      test: /\.ts$/,
      use: 'ts-loader',
      exclude: /node_modules/,
    }],
  },
  resolve: {
    extensions: ['.ts'],
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),

    libraryTarget: 'var',
    library: 'texLineBreak',
  },
};
