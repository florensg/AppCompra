const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: "./src/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.[contenthash].js",
    clean: true
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"]
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"]
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "public/index.html"
    }),
    new CopyPlugin({
      patterns: [
        { from: "public/manifest.webmanifest", to: "manifest.webmanifest" },
        { from: "public/sw.js", to: "sw.js" },
        { from: "public/icons", to: "icons" }
      ]
    })
  ],
  devServer: {
    host: "127.0.0.1",
    port: 5173,
    historyApiFallback: true,
    hot: true,
    proxy: {
      "/api": {
        target: "https://script.google.com",
        changeOrigin: true,
        secure: true,
        pathRewrite: {
          "^/api": "/macros/s/AKfycbycsubOvZ6Y_SgMrMxHzx02uhG6rXPwZIOlS6kjTU2m7jcUPtuBg2R6WOmAYXNx4JkE/exec"
        }
      }
    }
  }
};
