const path = require('path')
const webpack = require('webpack')

module.exports = {
  devtool: 'eval',
  entry: [
    'webpack-hot-middleware/client',
    './src/index',
  ],
  output: {
    path: path.join(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/static/',
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin(),
  ],

  resolve: {
    root: path.resolve('./src'),
    modulesDirectories: ['node_modules'],
    extensions: ['', '.js']
  },

  module: {

    loaders: [{
      test: /\.js$/,
      loaders: ['react-hot', 'babel'],
      include: path.join(__dirname, 'src'),
    }, {
      test: /\.scss$/,
      loaders: ['style', 'css', 'sass'],
      include: path.join(__dirname, 'src'),
    }],
  },
}
