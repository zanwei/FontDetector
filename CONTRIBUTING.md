# Contributing Guidelines

Thank you for considering contributing to the FontDetector project! This document will guide you on how to participate in the development and improvement of this project.

## Development Environment Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/FontDetector.git
   cd FontDetector
   ```

2. **Load the extension in your browser**
   - Open Chrome browser and navigate to the extensions management page (`chrome://extensions/`)
   - Enable "Developer Mode" (toggle button in top right)
   - Click "Load unpacked extension" button
   - Select the root directory of the project

3. **Test your changes**
   - After modifying the code, click the refresh icon in the extensions management page to reload the extension
   - Test the functionality on different web pages to ensure it works properly

## Commit Guidelines

1. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Commit message format**
   Please use clear commit messages in the following format:
   ```
   type(module): brief description

   detailed description (if necessary)
   ```

   Types can be:
   - `feat`: New feature
   - `fix`: Bug fix
   - `docs`: Documentation update
   - `style`: Code style change (not affecting functionality)
   - `refactor`: Code refactoring
   - `perf`: Performance optimization
   - `test`: Add or modify tests
   - `chore`: Build process or auxiliary tool changes

3. **Pull Request Process**
   - Ensure your code passes all tests
   - Submit a Pull Request to the `main` branch
   - Provide detailed description of your changes and their purpose in the PR description
   - Wait for maintainers to review

## Code Style Guide

1. **JavaScript**
   - Use 2 spaces for indentation
   - Use semicolons to end statements
   - Use single quotes for string delimiters
   - Use camelCase for variable names
   - Use descriptive verb prefixes for function names, such as `getElement`, `createTooltip`, etc.

2. **Comments**
   - Use JSDoc format for function comments
   - Add concise comments for complex logic
   - Keep comments synchronized with code updates

## Feature Requests and Bug Reports

1. **Submitting Bug Reports**
   - Use GitHub Issues to submit bug reports
   - Include environment information such as browser version, operating system, extension version
   - Provide detailed steps to reproduce the issue
   - If possible, attach screenshots or screen recordings

2. **Feature Requests**
   - Clearly describe the feature you want
   - Explain why this feature would be valuable to the project
   - Optionally provide implementation ideas or design sketches

## Release Process

1. **Version Number Convention**
   We use [Semantic Versioning](https://semver.org/):
   - Major version: Incompatible API changes
   - Minor version: Backwards-compatible functionality additions
   - Patch version: Backwards-compatible bug fixes

2. **Pre-release Checklist**
   - All tests pass
   - Update CHANGELOG.md
   - Update version number (in manifest.json)
   - Ensure documentation is consistent with the latest changes

## Code of Conduct

- Respect all contributors regardless of experience level, gender, race, ethnicity, religion, or nationality
- Use friendly and inclusive language
- Accept constructive criticism
- Focus on project goals and community interests

## Contact

If you have any questions, please contact the project maintainers:
- Ask questions in GitHub Issues
- Send emails to: your-email@example.com

Thank you for your contributions to the FontDetector project! 