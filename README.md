# Facebook Comment Scraper Userscript

> 🎉 **Open Source • Vibe Coded • Community Driven**
>
> This project is built through iterative debugging, real-world testing, and community feedback. Every fix comes from actual Facebook DOM quirks discovered in the wild!

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

[![Install Facebook Comment Scraper](https://img.shields.io/badge/Install-Facebook%20Comment%20Scraper-brightgreen)](https://gitlab.disrex.nl/internal-tools/facebook-comment-scraper-userscript/-/raw/master/facebook-comment-scraper.user.js)

### Manual Installation

1. Install Tampermonkey or Greasemonkey for your browser
2. Navigate to the [raw userscript file](https://gitlab.disrex.nl/internal-tools/facebook-comment-scraper-userscript/-/raw/master/facebook-comment-scraper.user.js)
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

## Recent Fixes & Improvements

### v16.7 (Latest)
- 🔥 **CRITICAL**: Fixed `extractComment()` function - completed v16.2 fix for profile links with `comment_id` in query params
- ✅ Authors now extracted correctly from all profile link formats

### v16.6
- 🔥 **CRITICAL**: Added "Antwoord" (Reply) and "Reply" to aria-label filter - was skipping ALL replies!
- ✅ Nested replies now properly scraped

### v16.5
- 🎯 Implemented proper nested article detection using DOM hierarchy
- 🎯 Added aria-label "Antwoord" pattern parsing for Dutch Facebook
- ✅ Multi-level nesting now works correctly

### v16.4
- 🐛 Fixed overly aggressive 'u' character filter that rejected names like "Luke", "Robert Weber"
- ✅ Improved name extraction accuracy

### v16.3
- 🐛 Fixed recursive name extraction consistency
- ✅ Multi-level depth detection improvements

### v16.2
- 🐛 Fixed profile link filtering (query parameter handling)
- ✅ Profile URLs now extracted correctly

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

Current version: **16.7**

## License

Open Source - Built with community feedback and iterative debugging! 🚀
