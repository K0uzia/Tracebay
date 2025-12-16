const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: path.resolve(__dirname, 'main.js'),
  target: 'electron-main',
  output: {
    path: path.resolve(__dirname, '.webpack/main'),
    filename: 'index.js'
  },
  resolve: {
    extensions: ['.js', '.json']
  },
  module: {
    rules: []
  },
  node: {
    __dirname: false,
    __filename: false
  }
};
