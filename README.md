# Logan AI Social Booster by Yuval Avidani

An intelligent Chrome extension that automates social media engagement on LinkedIn and Facebook using advanced AI technology. The extension automatically likes posts and generates personalized comments based on customizable AI personas.

## 🚀 Features

- **🤖 AI-Powered Comments**: Generate contextual, personalized comments using Cohere AI
- **❤️ Smart Auto-Like**: Automatically like posts with intelligent duplicate detection
- **🎭 Multiple Personas**: Create and manage different AI personalities for varied comment styles
- **🎯 Platform Support**: Works seamlessly on LinkedIn and Facebook
- **⚙️ Flexible Settings**: Customizable settings for each platform
- **🔒 Secure Storage**: API keys stored locally in your browser
- **🎨 Modern UI**: Beautiful, user-friendly interface with Hebrew and English support
- **👀 View-Based Processing**: Only processes posts you actually view (3+ seconds)
- **🔄 Manual Control**: Comments are prepared but never auto-submitted (user control)

## 📋 Prerequisites

- **Chrome Browser** (or Chromium-based browser)
- **Cohere AI API Key** (free tier available)
- **Node.js and npm** (for building from source)

## 🔧 Installation

### Method 1: From Source (Recommended for Developers)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/logan-ai-social-booster-by-yuval-avidani.git
   cd logan-ai-social-booster-by-yuval-avidani
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the extension**:
   ```bash
   npm run build
   ```

4. **Load in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top-right toggle)
   - Click "Load unpacked" and select the `dist` folder

### Method 2: Development Mode

For active development:
```bash
npm run dev
```
This will watch for changes and rebuild automatically.

## 🔑 Getting Your Cohere AI API Key

1. Visit [Cohere AI](https://cohere.ai/)
2. Sign up for a free account
3. Navigate to your dashboard
4. Generate a new API key
5. Copy the API key for use in the extension

**Free Tier Includes**: 1000 API calls per month (sufficient for moderate usage)

## ⚙️ Configuration

### Initial Setup

1. **Open the extension popup** by clicking the Logan AI icon in your browser toolbar
2. **Enter your Cohere API key** in the API Key field
3. **Click "Save API Key"** - the extension will test the connection
4. **Configure your preferences**:
   - Enable/disable auto-like functionality
   - Enable/disable auto-comment functionality
   - Choose platforms (LinkedIn/Facebook)
   - Select default comment style

### Persona Management

Create custom AI personas for different commenting styles:

1. **Click "Manage Personas"** in the extension popup
2. **Click "Add New Persona"** to create a persona
3. **Fill in persona details**:
   - **Name**: A descriptive name (e.g., "Professional Marketer")
   - **Description**: What this persona represents
   - **Style Instructions**: Detailed instructions for the AI
   - **Examples**: Sample comments this persona would write
4. **Save the persona** and select it as active

### Example Personas

**Professional Business Persona**:
- Style: "Write professional, business-focused comments that add value to the conversation. Keep tone formal but friendly."
- Examples: "Great insights on market trends!", "This aligns perfectly with current industry best practices."

**Casual Friend Persona**:
- Style: "Write casual, friendly comments as if talking to a close friend. Use emojis and informal language."
- Examples: "Love this! 😍", "So true! Thanks for sharing 👍"

## 🎯 How to Use

### LinkedIn Usage

1. **Navigate to LinkedIn** and log in
2. **Open the extension popup** and ensure settings are configured
3. **Scroll through your LinkedIn feed**
4. **View posts for 3+ seconds** - the extension will:
   - Automatically like the post (if enabled)
   - Generate a personalized comment (if enabled)
   - Display a "Logan AI Submit" button next to the comment
5. **Click the Logan AI button** to post the comment when you're ready

### Facebook Usage

1. **Navigate to Facebook** and log in
2. **Enable Facebook in extension settings**
3. **Browse your feed** - similar auto-engagement as LinkedIn
4. **Manual submission** - comments are prepared but you control posting

### Advanced Features

**View-Based Processing**:
- Only posts you actually view for 3+ seconds are processed
- Scroll detection ensures new posts are captured
- Intersection observer tracks when posts come into view

**Smart Duplicate Prevention**:
- Already liked posts are automatically skipped
- Previously processed posts won't be processed again
- Intelligent post identification system

## 🛠️ Development

### Project Structure

```
├── src/
│   ├── background.js          # Service Worker (background tasks)
│   ├── linkedin-content.js    # LinkedIn content script
│   ├── facebook-content.js    # Facebook content script
│   ├── popup.js              # Extension popup logic
│   ├── popup.html            # Extension popup interface
│   └── popup.css             # Extension popup styling
├── icons/                    # Extension icons
├── manifest.json            # Chrome extension manifest
├── package.json             # Node.js dependencies
├── webpack.config.js        # Webpack build configuration
└── README.md               # This file
```

### Build Commands

```bash
npm run build    # Production build
npm run dev      # Development build with watch mode
npm test         # Run tests (placeholder)
```

### Code Architecture

**Background Script** (`background.js`):
- Handles API calls to Cohere AI
- Manages extension settings and storage
- Coordinates between content scripts and popup

**Content Scripts**:
- `linkedin-content.js`: LinkedIn-specific engagement logic
- `facebook-content.js`: Facebook-specific engagement logic

**Popup Interface**:
- Settings management
- Persona creation and editing
- API key configuration
- Real-time status updates

## 🔧 Troubleshooting

### Extension Not Working

1. **Check if extension is enabled** in `chrome://extensions/`
2. **Reload the extension** after making changes
3. **Check browser console** (F12) for error messages
4. **Verify API key** is correctly entered and valid

### Comments Not Generating

1. **Verify Cohere API key** is valid and has remaining credits
2. **Check internet connection**
3. **Look at browser console** for API error messages
4. **Ensure you have an active persona selected**

### Posts Not Being Detected

1. **Refresh the page** and try again
2. **Check that platform is enabled** in settings
3. **Ensure you're viewing posts for 3+ seconds**
4. **Check browser console** for intersection observer logs

### API Rate Limits

- **Free tier**: 1000 calls/month
- **Monitor usage** in your Cohere dashboard
- **Upgrade plan** if needed for higher usage

## 🚨 Important Disclaimers

⚠️ **Use Responsibly**: This extension performs automated actions on social media platforms. Ensure your usage complies with platform terms of service.

⚠️ **Rate Limiting**: The extension includes natural delays and rate limiting to appear human-like, but monitor your activity.

⚠️ **Privacy**: Your API key is stored locally in your browser and only sent to Cohere AI for comment generation.

⚠️ **Manual Control**: Comments are generated but NOT automatically submitted - you have full control over what gets posted.

## 📊 Usage Analytics

The extension provides console logging for debugging:
- 🔍 New post detection
- 👁️ Post viewing tracking
- 💬 Comment generation status
- ✅ Successful likes and comments
- ❌ Error reporting

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines

- Follow existing code style and formatting
- Add comments for complex logic
- Test on both LinkedIn and Facebook
- Ensure builds complete without errors
- Update documentation for new features

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 👤 Author

**Yuval Avidani**
- Creator of Logan AI Social Booster
- Expertise in AI automation and browser extensions

## 🆘 Support

If you encounter issues or have questions:

1. **Check the troubleshooting section** above
2. **Review browser console logs** for error messages
3. **Open an issue** on GitHub with detailed information
4. **Include**: Browser version, extension version, error messages, and steps to reproduce

## 🔄 Version History

- **v2.1** - Updated branding to Logan AI Social Booster by Yuval Avidani
- **v2.0** - Added persona management and improved UI
- **v1.0** - Initial release with basic auto-engagement features

---

**Note**: This extension is designed for educational and productivity purposes. Always respect platform guidelines and community standards when using automated tools. 