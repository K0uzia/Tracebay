const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: path.resolve(__dirname, 'public/app.js'),
  target: 'electron-renderer',
  output: {
    path: path.resolve(__dirname, '.webpack/renderer'),
    filename: 'renderer.js'
  },
  resolve: {
    extensions: ['.js', '.json'],
    alias: {
      '/assets': path.resolve(__dirname, 'public/assets'),
      '/components': path.resolve(__dirname, 'public/components'),
      '/pages': path.resolve(__dirname, 'public/pages')
    },
    preferRelative: true
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { 
          from: path.resolve(__dirname, 'public/components'),
          to: path.resolve(__dirname, '.webpack/renderer/components')
        },
        { 
          from: path.resolve(__dirname, 'public/pages'),
          to: path.resolve(__dirname, '.webpack/renderer/pages')
        }
      ]
    })
  ]
};
