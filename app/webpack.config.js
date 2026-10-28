import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';

const directory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(directory, '..');

export default (_env, argv = {}) => {
  const mode = argv.mode || process.env.NODE_ENV || 'production';
  const isProd = mode === 'production';

  return {
    context: directory,
    entry: './src/index.tsx',
    mode,
    devtool: isProd ? false : 'eval-source-map',
    output: {
      path: path.resolve(rootDirectory, 'public'),
      publicPath: 'auto',
      filename: '[name].[contenthash:8].js',
      chunkFilename: '[name].[contenthash:8].js',
      assetModuleFilename: 'assets/[name].[hash:8][ext]',
      asyncChunks: true,
      pathinfo: false,
      clean: true,
    },
    resolve: {
      alias: {
        app: path.resolve(directory, 'src'),
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      extensionAlias: { '.js': ['.ts', '.tsx', '.js'], '.jsx': ['.tsx', '.jsx'] },
    },
    performance: { hints: false },
    watchOptions: { ignored: /node_modules/ },
    stats: { children: true, errorDetails: true },
    plugins: [
      new MiniCssExtractPlugin({
        filename: '[name].[contenthash:8].css',
        chunkFilename: '[id].[hash:8].css',
      }),
      new HtmlWebpackPlugin({
        template: 'public/index.html',
        favicon: 'public/favicon.png',
      }),
    ],
    optimization: {
      runtimeChunk: 'single',
      splitChunks: { chunks: 'all' },
      minimize: isProd,
      minimizer: isProd ? [
        new TerserPlugin(),
        new CssMinimizerPlugin({
          parallel: true,
          // Bootstrap contains escaped inline SVG; keep those data URLs intact.
          minimizerOptions: { preset: ['default', { svgo: false }] },
        }),
      ] : [],
    },
    module: {
      rules: [
        { test: /\.[cm]?[jt]sx?$/i, parser: { amd: false } },
        {
          test: /\.[jt]sx?$/i,
          exclude: /node_modules/,
          use: { loader: 'esbuild-loader', options: { target: 'es2023', implementation: esbuild } },
        },
        { test: /\.(png|jpe?g|gif|ico|webp|avif|svg)$/i, type: 'asset/resource' },
        {
          test: /\.(woff2?|ttf|eot|otf)$/i,
          type: 'asset/resource',
          generator: { filename: 'fonts/[name].[hash:8][ext]' },
        },
        {
          test: /\.s[ac]ss$/i,
          use: [
            MiniCssExtractPlugin.loader,
            { loader: 'css-loader', options: { sourceMap: true } },
            {
              loader: 'sass-loader',
              options: {
                sourceMap: true,
                sassOptions: { silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'] },
              },
            },
          ],
        },
      ],
    },
  };
};
