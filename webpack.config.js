const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    'background': './src/background.js',
    'linkedin-content': './src/linkedin-content.js',
    'facebook-content': './src/facebook-content.js',
    'popup': './src/popup.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup.html', to: 'popup.html' },
        { from: 'src/popup.css', to: 'popup.css' },
        { from: 'icons', to: 'icons' }
      ]
    })
  ],
  resolve: {
    fallback: {
      "crypto": false,
      "stream": false,
      "buffer": false
    }
  }
}; 