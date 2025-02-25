# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.9] - 2024-05-25

### Added
- Improved error handling and stability
- Better performance on dynamic websites
- Added keyboard shortcut (Shift+Alt+X) for toggling detector
- Enhanced color detection accuracy

### Fixed
- Fixed memory leaks in long-running sessions
- Fixed tooltip positioning on scrolling
- Improved detector accuracy for nested elements

## [1.0.0] - 2024-05-08

### Added
- Basic font detection functionality
  - Support font information detection via mouse hover
  - Automatic parsing and display of font name, size, weight and other properties
- Color detection functionality
  - Support for multiple color formats: HEX, LCH, HCL
  - Color preview and copy functionality
- Fixed tooltip functionality
  - Create fixed tooltips after selecting text
  - Support creating multiple tooltips for comparison
- Copy functionality
  - One-click copy of font information and color values
  - Visual feedback after successful copying
- Font search functionality
  - Click font name to search directly
- Dynamic extension icon update
  - Dedicated icon for active state

### Fixed
- Optimized text selection area recognition algorithm
- Fixed special character handling issues
- Resolved font detection inaccuracies in multi-level nested elements

### Changed
- Improved UI design using blur background effect
- Optimized floating tooltip positioning logic
- Adjusted font information display order and format

## [0.2.0] - 2024-04-15

### Added
- ESC key support: Press ESC key to quickly hide floating tooltips while preserving fixed tooltips
- Added visual feedback for copy functionality
- Added support for multiple color formats

### Fixed
- Resolved issues with incorrect font detection on certain websites
- Fixed inaccurate font weight display
- Optimized resource cleanup mechanism to reduce memory usage

## [0.1.0] - 2024-03-20

### Added
- First test version released
- Basic font information detection functionality
- Simple floating tooltip UI 