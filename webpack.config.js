const path = require('path');
const WebpackShellPluginNext = require('webpack-shell-plugin-next');

module.exports = {
  entry: './ts/index.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'src'),
  },
  plugins: [
    new WebpackShellPluginNext({
      onDoneWatch: {
        scripts: [
          // () => {
          //   console.log('run tTimeout 1');
          //   setTimeout(() => console.log('end Timeout 1'), 5000);
          // },
          'tweego src/ -o Coherence.html -t'
        ],
        blocking: true,
        parallel: false,
      },
    }),
  ],
};