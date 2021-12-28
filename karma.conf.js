const puppeteer = require('puppeteer');

process.env.CHROME_BIN = puppeteer.executablePath();

module.exports = config => {
  config.set({
    browsers: ['ChromeHeadless'],

    frameworks: ['mocha'],

    files: [
      { pattern: 'test/**/*-test.ts', watched: false },
    ],

    mime: {
      // Serve compiled TypeScript bundles with correct mime type.
      //
      // See https://github.com/angular/angular-cli/issues/2125#issuecomment-247395088
      'application/javascript': ['ts', 'tsx'],
    },

    preprocessors: {
      'src/**/*.ts': 'webpack',
      'test/**/*.ts': 'webpack',
    },

    webpack: {
      mode: 'development',
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
    },

    webpackMiddleware: {
      stats: 'errors-only',
    },

    reporters: ['dots'],
  });
};
