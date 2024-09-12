const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  context: __dirname,
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, '../public'),
    filename: 'bundle.js',
    clean: true,
  },
  resolve: {
    alias: {
      app: path.resolve(__dirname, 'src'),
    },
    extensions: ['.js', '.jsx'],
  },
  module: {
    rules: [
      {
        parser: { amd: false },
      },
      {
        test: /\.(js|jsx)$/i,
        loader: 'babel-loader',
        exclude: /(node_modules|bower_components)/,
      },
      {
        test: /\.(eot|svg|ttf|woff|woff2|png|jpg|gif)$/i,
        type: 'file-loader',
      },
      {
        test: /\.s[ac]ss$/i,
        use: [
          'style-loader',
          'css-loader',
          'sass-loader',
        ],
      },
    ],
  },
  plugins: [new HtmlWebpackPlugin({
    template: 'public/index.html',
    favicon: 'public/favicon.png',
    alwaysWriteToDisk: true,
  })],
};

module.exports = () => {
  config.mode = isProduction ? 'production' : 'development';
  return config;
};
