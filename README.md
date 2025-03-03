![FontDetector Preview](thumbnail.png)

# FontDetector

FontDetector is a powerful browser extension that helps designers, developers, and users quickly identify fonts and color information on web pages. With a simple mouse hover, you can instantly get font names, sizes, colors, and other style attributes of text elements.

## Key Features

- **Real-time Detection**: Hover over any text element to view font information
- **Mini Tooltip**: A lightweight tooltip follows your cursor, indicating when text selection is available
- **Fixed Tooltips**: Create fixed information tooltips by selecting text for comparing different elements
- **Long Press Support**: Press and hold to trigger text selection mode
- **Color Information**: Display text colors in HEX, LCH, and HCL formats
- **One-click Copy**: Easily copy font information and color values
- **Font Search**: Search for detected fonts directly to learn more
- **Keyboard Shortcuts**: Use ESC key to quickly close floating tooltips while preserving fixed ones

## Installation

### Chrome Web Store Installation
1. Visit the [Chrome Web Store](https://chromewebstore.google.com/detail/fontdetector/jphgedmdokkhlllaibcbndaccmdcckfe)
2. Click "Add to Chrome" button

### Manual Installation (Development Version)
1. Download or clone this repository locally
2. Open Chrome browser and navigate to the extensions management page (`chrome://extensions/`)
3. Enable "Developer Mode" (toggle button in top right)
4. Click "Load unpacked extension" button
5. Select the root directory of this repository

## How to Use

### Basic Usage
1. Click the FontDetector icon in the toolbar to activate the extension (icon turns blue to indicate activation)
2. Hover your mouse over any text element on the webpage to see the mini tooltip
3. Select text to create a fixed tooltip with detailed font information
4. Click the extension icon again or press ESC key to deactivate the extension

### Creating Fixed Tooltips
1. With the extension active, select a piece of text or use long press
2. After selection, a fixed information tooltip will be automatically created
3. Repeat this operation to create multiple fixed tooltips for comparison
4. Click the close button in the top-right corner of a tooltip to close it

### Using Long Press
1. Press and hold your mouse button on any text element
2. After about 300ms, the mini tooltip will hide, indicating long press mode
3. Release the mouse button to create a fixed tooltip
4. For quick clicks (less than 300ms), the mini tooltip remains visible

### Copying Information
- Click the copy icon in the tooltip to copy the corresponding value to clipboard
- A blue checkmark icon indicates successful copying

## Technical Details

FontDetector is written in pure JavaScript with no external dependencies. It can detect and display the following information:

- Font Family
- Font Weight
- Font Size
- Letter Spacing
- Line Height
- Text Alignment
- Text Color (multiple formats)

## Contributing

We welcome all forms of contribution! Please check [CONTRIBUTING.md](CONTRIBUTING.md) to learn how to participate.

## License

This project is licensed under the [MIT License](LICENSE).

## Download

[Download FontDetector](https://chromewebstore.google.com/detail/fontdetector/jphgedmdokkhlllaibcbndaccmdcckfe)
