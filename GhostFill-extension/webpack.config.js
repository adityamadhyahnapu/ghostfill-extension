
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
    const isDev = argv.mode !== 'production';

    const commonConfig = {
        mode: isDev ? 'development' : 'production',
        devtool: isDev ? 'cheap-module-source-map' : false,
        resolve: {
            extensions: ['.ts', '.tsx', '.js', '.jsx'],
            alias: {
                '@': path.resolve(__dirname, 'src'),
                '@components': path.resolve(__dirname, 'src/popup/components'),
                '@services': path.resolve(__dirname, 'src/services'),
                '@utils': path.resolve(__dirname, 'src/utils'),
                '@types': path.resolve(__dirname, 'src/types'),
                '@ai': path.resolve(__dirname, 'src/ai'),
            },
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/,
                },
                {
                    test: /\.css$/,
                    use: [MiniCssExtractPlugin.loader, 'css-loader'],
                },
                {
                    test: /\.(png|jpg|jpeg|gif|svg)$/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'assets/[name][ext]',
                    },
                },
                {
                    test: /\.(woff|woff2|eot|ttf|otf)$/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'fonts/[name][ext]',
                    },
                },
                {
                    test: /\.mp3$/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'sounds/[name][ext]',
                    },
                },
            ],
        },
        optimization: {
            minimize: !isDev,
            splitChunks: false, // Chrome extensions need self-contained scripts
        },
        performance: {
            hints: false,
            maxEntrypointSize: 512000,
            maxAssetSize: 512000,
        },
    };

    // Configuration for Background Script (Service Worker) -> Target: webworker
    const bgConfig = Object.assign({}, commonConfig, {
        name: 'background',
        target: 'webworker', // CRITICAL: Uses importScripts() for chunk loading, no DOM access
        entry: {
            background: './src/background/index.ts',
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js',
            clean: false, // Don't clean, let webConfig handle it or merge
        },
        plugins: [
            new MiniCssExtractPlugin({
                filename: '[name].css',
            }),
        ],
    });

    // Configuration for UI and Content Scripts -> Target: web
    const webConfig = Object.assign({}, commonConfig, {
        name: 'web',
        target: 'web', // Standard DOM environment
        entry: {
            content: './src/content/index.ts',
            popup: './src/popup/index.tsx',
            options: './src/options/index.tsx',
            offscreen: './src/offscreen/offscreen.ts',
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: '[name].js',
            clean: false, // Avoid deleting background.js
        },
        plugins: [
            new MiniCssExtractPlugin({
                filename: '[name].css',
            }),

            new HtmlWebpackPlugin({
                template: './src/popup/index.html',
                filename: 'popup.html',
                chunks: ['popup'],
                cache: false,
            }),

            new HtmlWebpackPlugin({
                template: './src/options/index.html',
                filename: 'options.html',
                chunks: ['options'],
                cache: false,
            }),

            new HtmlWebpackPlugin({
                template: './src/offscreen/offscreen.html',
                filename: 'offscreen.html',
                chunks: ['offscreen'],
                cache: false,
            }),

            // Copy assets only once
            new CopyWebpackPlugin({
                patterns: [
                    { from: 'manifest.json', to: 'manifest.json' },
                    { from: 'src/assets', to: 'assets' },
                    { from: 'public/_locales', to: '_locales' },
                ],
            }),
        ],
    });

    return [bgConfig, webConfig];
};
