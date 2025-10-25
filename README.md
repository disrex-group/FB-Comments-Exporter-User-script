# Facebook Comment Scraper Userscript

> 🎉 **Open Source • Vibe Coded • Community Driven**
>
> This project is built through iterative debugging, real-world testing, and community feedback. Every fix comes from actual Facebook DOM quirks discovered in the wild!

## 🚀 Quickstart

1. **Install Extension**: [Tampermonkey](https://tampermonkey.net/) (Chrome/Edge) or [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/) (Firefox)
2. **Install Script**: [Click here to install the userscript](https://github.com/disrex-group/FB-Comments-Exporter-User-script/raw/refs/heads/master/facebook-comment-scraper.user.js)
3. **Open any Facebook post** with comments
4. **Click "Start Scraping"** in the floating panel (top-right corner)
5. **Watch it work** - automatically expands replies, detects nesting depth, highlights comments
6. **Export** - Choose CSV (flat) or JSON (hierarchical with nested replies)

**That's it!** 🎯 The scraper handles nested replies, multi-level threads, and preserves parent-child relationships automatically.

---

## Overview

The Facebook Comment Scraper is a powerful userscript that enables you to scrape and export comments from Facebook posts, including full support for nested replies and hierarchical comment threads. It adds a floating interface to Facebook pages with automatic comment collection, depth detection, and export to both CSV and JSON formats.

## Features

### Core Functionality
- **Automatic Comment Scraping**: Automatically scrolls through and collects comments from Facebook posts
- **Nested Reply Support**: Full support for multi-level comment threads (replies to replies to replies...)
- **Depth Detection**: Multiple strategies to detect comment nesting depth
- **Configurable Limit**: Set a maximum number of comments to scrape (0 for unlimited)
- **Real-time Statistics**: Shows progress including main comments, replies, and depth distribution

### Export Capabilities
- **CSV Export**: Flat structure export with all comment data
- **JSON Export**: Hierarchical export preserving parent-child relationships
- **Rich Data**: Includes author name, profile URL, profile image, timestamp, likes, comment text, depth level

### Visual Features
- **Color-Coded Highlighting**: Comments are highlighted by depth (red=main, orange=level 1, yellow=level 2, green=level 3+)
- **Real-time Progress**: Live updates showing extraction progress and data quality stats
- **User-friendly Interface**: Clean floating UI with easy-to-use controls

### Advanced Detection
- **Multiple Detection Strategies**:
  1. DOM Hierarchy (nested article elements)
  2. Aria-label Pattern Matching ("Antwoord van..." / "Reply from...")
  3. Author Mention Links
  4. Visual Indentation
  5. Container Grouping
- **Robust Author Extraction**: Multiple fallback approaches to extract author names from various Facebook DOM structures
- **Debug Mode**: Built-in diagnostic logging for troubleshooting

## Installation

### Prerequisites

- A browser with userscript support:
  - Chrome/Edge: Install [Tampermonkey](https://tampermonkey.net/)
  - Firefox: Install [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/) or [Tampermonkey](https://tampermonkey.net/)

### One-Click Install

Click the button below to install the Facebook Comment Scraper:

[![Install Facebook Comment Scraper](https://img.shields.io/badge/Install-Facebook%20Comment%20Scraper-brightgreen)](https://github.com/disrex-group/FB-Comments-Exporter-User-script/raw/refs/heads/master/facebook-comment-scraper.user.js)

### Manual Installation

1. Install Tampermonkey or Greasemonkey for your browser
2. Navigate to the [raw userscript file](https://github.com/disrex-group/FB-Comments-Exporter-User-script/raw/refs/heads/master/facebook-comment-scraper.user.js)
3. Your userscript manager will prompt you to install it
4. Click "Install" to add the script

## Usage

1. Navigate to any Facebook post (works on both www.facebook.com and m.facebook.com)
2. You'll see a floating panel in the top-right corner of the page
3. Set the maximum number of comments to scrape (or 0 for unlimited)
4. Click "Start Scraping" to begin collecting comments
5. The script will automatically:
   - Expand comment sections
   - Load more comments
   - Expand replies (including nested replies)
   - Detect comment depth and hierarchy
   - Collect comprehensive comment data
6. Watch the real-time statistics showing main comments, replies, and depth distribution
7. Once complete, choose your export format:
   - **Export to CSV**: Flat file with all data
   - **Export to JSON**: Hierarchical structure preserving reply relationships

## Scraped Data

The exported files include:

### All Formats
- **Author Name**: Commenter's display name
- **Profile URL**: Link to commenter's Facebook profile
- **Profile Image**: URL to profile picture
- **Comment Text**: Full comment content
- **Timestamp**: When the comment was posted
- **Likes**: Number of reactions
- **Depth**: Nesting level (0=main comment, 1=direct reply, 2=reply to reply, etc.)
- **Detection Method**: How the depth was determined

### JSON Export (Additional)
- **Hierarchical Structure**: Nested replies under parent comments
- **Parent ID**: Reference to parent comment
- **Reply To Author**: Name of the author being replied to

## Version History

### v1.0 (Initial Release)
- 🎉 **Initial public release** on GitHub!
- ✅ Multi-level nested reply detection (DOM hierarchy + aria-label patterns)
- ✅ Dual export formats: CSV (flat) and JSON (hierarchical)
- ✅ Color-coded depth visualization
- ✅ Robust author extraction with multiple fallback strategies
- ✅ Profile link handling (supports query parameters)
- ✅ Smart name filtering (handles Dutch/English, timestamps, special characters)
- ✅ Support for both "Opmerking" (Comment) and "Antwoord" (Reply) aria-labels
- ✅ Real-time scraping statistics and progress tracking
- ✅ Debug mode for troubleshooting
- ✅ Automatic depth detection using 5 different strategies

## Known Limitations

- Requires comments to be loaded in the Facebook modal/dialog
- Facebook's dynamic DOM structure may require periodic updates
- Very large comment threads (1000+ comments) may take time to process
- Facebook rate limiting may affect scraping speed

## Debugging

Enable debug mode by setting `window.DEPTH_DEBUG = true` in the browser console before scraping. This will output detailed logs about:
- Depth detection strategies used
- Author extraction attempts
- DOM structure analysis
- Parent-child relationship matching

## Updates

The userscript includes automatic update checks. Your userscript manager will notify you when a new version is available.

## Contributing

Found a bug? Facebook changed their DOM structure again?

This is an **opensource, vibe-coded project** - every fix comes from real-world testing! Feel free to:
- Report issues with specific Facebook posts
- Share console output for debugging
- Submit fixes for edge cases
- Suggest improvements

## Author

Rick - r.bouma@disrex.nl

## Version

Current version: **1.0**

## License

Open Source - Built with community feedback and iterative debugging! 🚀
