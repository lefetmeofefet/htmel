const TerserPlugin = require('terser-webpack-plugin');
const WebpackShellPlugin = require('webpack-shell-plugin');


module.exports = {
    entry: './src/htmel.js',
    output: {
        filename: "htmel.min.js",
        library: "htmel"
    },
    plugins: [
        // Because webpack doesn't support importing the bundle with 'import htmel from "..."', we do this
        new WebpackShellPlugin({onBuildEnd: ['echo export default htmel.default>>dist/htmel.min.js']})
    ],
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: true,
                    },
                    mangle: {
                        reserved: ["htmel", "exports"]
                    },
                }
            })
        ]
    },
    target: "web"
};