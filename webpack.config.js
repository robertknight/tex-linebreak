const path = require('path');

const hyphenLangs = [
  'en-us',
];
let hyphenLibs = {};
for (let lang of hyphenLangs) {
  hyphenLibs[`hyphens_${lang}`] = `hyphenation.${lang}`;
}

module.exports = {
  entry: {
    demos: './src/demos/layout.ts',
    lib: './src',
    ...hyphenLibs,
  },
  devtool: 'cheap-source-map',
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

    // Build a UMD bundle that can be used from a `<script>` tag, or imported
    // into a CommonJS / ESM environment.
    libraryTarget: 'umd',
    library: 'texLineBreak_[name]',

    // Make the UMD bundle usable in Node.
    // See https://github.com/webpack/webpack/issues/6522
    globalObject: "typeof self !== 'undefined' ? self : this",
  },
};
