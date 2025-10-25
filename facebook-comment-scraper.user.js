// ==UserScript==
// @name         Facebook Comment Exporter
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Open-source Facebook comment scraper with nested reply support, auto-downloads JSON export, hierarchical structure, and multi-strategy depth detection
// @author       Rick Bouma (Disrex Group)
// @downloadURL  https://github.com/disrex-group/FB-Comments-Exporter-User-script/raw/refs/heads/master/facebook-comment-scraper.user.js
// @updateURL    https://github.com/disrex-group/FB-Comments-Exporter-User-script/raw/refs/heads/master/facebook-comment-scraper.user.js
// @match        https://www.facebook.com/*
// @match        https://m.facebook.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * DEBUG MODE:
 * To enable detailed depth detection logging, run this in the browser console:
 *   window.DEPTH_DEBUG = true;
 *
 * Then run the scraper. You'll see detailed logs showing:
 * - [EXTRACT] Author name extraction attempts
 * - [DEPTH] Author mentions found in comments
 * - [DEPTH] Parent-child relationship matching
 * - [DEPTH] Multi-level nesting detection (depth 2+)
 *
 * To disable debug mode:
 *   window.DEPTH_DEBUG = false;
 */

(function() {
    'use strict';

    let isScrapingInProgress = false;
    let scrapedComments = new Set();
    let articleToCommentMap = new Map(); // Track article elements to comment IDs
    let replyButtonParentMap = new Map(); // Track which article had its reply button clicked
    let stats = {
        mainComments: 0,
        replies: 0,
        buttonsClicked: 0
    };

    // Add floating scrape button with max limit input
    function addUI() {
        if (document.getElementById('fb-scrape-btn')) return;

        const container = document.createElement('div');
        container.id = 'fb-scraper-ui';
        container.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            z-index: 999999;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            padding: 15px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            min-width: 250px;
        `;

        container.innerHTML = `
            <div style="margin-bottom: 10px;">
                <label style="display: block; font-size: 12px; color: #65676b; margin-bottom: 5px;">
                    Max Comments (0 = unlimited):
                </label>
                <input 
                    type="number" 
                    id="fb-max-comments" 
                    value="0" 
                    min="0" 
                    style="
                        width: 100%;
                        padding: 8px;
                        border: 1px solid #ddd;
                        border-radius: 6px;
                        font-size: 14px;
                        box-sizing: border-box;
                    "
                    placeholder="0 = unlimited"
                />
            </div>
            <button id="fb-scrape-btn" style="
                width: 100%;
                padding: 12px 24px;
                background: #1877f2;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: bold;
                font-size: 14px;
                margin-bottom: 10px;
            ">📥 Scrape Modal</button>
            <div id="fb-scrape-stats" style="
                font-size: 12px;
                color: #65676b;
                line-height: 1.6;
                display: none;
            ">
                <div><strong>Status:</strong> <span id="status">Ready</span></div>
                <div><strong>Main Comments:</strong> <span id="main-count">0</span></div>
                <div><strong>Replies:</strong> <span id="reply-count">0</span></div>
                <div><strong>Buttons Clicked:</strong> <span id="button-count">0</span></div>
                <div><strong>Scraped:</strong> <span id="scraped-count">0</span> / <span id="max-limit">∞</span></div>
            </div>
        `;

        document.body.appendChild(container);
        document.getElementById('fb-scrape-btn').onclick = startScraping;
    }

    function updateUI(status, data = {}) {
        const btn = document.getElementById('fb-scrape-btn');
        const statsDiv = document.getElementById('fb-scrape-stats');
        const statusSpan = document.getElementById('status');

        if (btn) btn.innerHTML = status;
        if (statusSpan) statusSpan.textContent = data.statusText || 'Working...';
        if (statsDiv && data.showStats !== undefined) {
            statsDiv.style.display = data.showStats ? 'block' : 'none';
        }

        if (data.mainComments !== undefined) {
            document.getElementById('main-count').textContent = data.mainComments;
        }
        if (data.replies !== undefined) {
            document.getElementById('reply-count').textContent = data.replies;
        }
        if (data.buttonsClicked !== undefined) {
            document.getElementById('button-count').textContent = data.buttonsClicked;
        }
        if (data.scrapedCount !== undefined) {
            document.getElementById('scraped-count').textContent = data.scrapedCount;
        }
        if (data.maxLimit !== undefined) {
            document.getElementById('max-limit').textContent = data.maxLimit === 0 ? '∞' : data.maxLimit;
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Find the comment modal
    function findCommentModal() {
        const dialogs = document.querySelectorAll('[role="dialog"]');

        for (let dialog of dialogs) {
            const hasComments = dialog.querySelectorAll('[role="article"]').length > 0;
            if (hasComments) {
                console.log('✅ Found modal');
                return dialog;
            }
        }

        console.warn('⚠️ No modal found');
        return null;
    }

    // Check if element is within the modal (with generous buffer for nested content)
    function isInModalViewport(element, modal) {
        if (!element || !modal) return false;
        if (!modal.contains(element)) return false;

        const rect = element.getBoundingClientRect();
        const modalRect = modal.getBoundingClientRect();

        // Generous 1000px buffer to catch nested replies
        return rect.top < modalRect.bottom + 1000 && rect.bottom > modalRect.top - 1000;
    }

    // Scroll modal incrementally (just a few scrolls to load new content)
    async function scrollModalIncremental(modal) {
        console.log('📜 Scrolling modal (incremental)...');

        const scrollContainer = modal.querySelector('[style*="overflow"]') ||
            modal.querySelector('.xb57i2i') ||
            modal;

        const scrollAttempts = 3;  // Just 3 quick scrolls
        let newContentLoaded = false;
        const previousHeight = scrollContainer.scrollHeight;

        for (let i = 0; i < scrollAttempts; i++) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;

            updateUI('📜 Loading...', {
                statusText: `Scroll ${i + 1}/${scrollAttempts}`,
                showStats: true
            });

            await sleep(800);  // Faster scroll
        }

        const newHeight = scrollContainer.scrollHeight;
        if (newHeight > previousHeight) {
            newContentLoaded = true;
            console.log(`✅ New content loaded: ${previousHeight} → ${newHeight}`);
        } else {
            console.log(`⏸️ No new content after scrolling`);
        }

        scrollContainer.scrollTop = 0;
        await sleep(300);

        return newContentLoaded;
    }

    // Get current comment count (actual comments with text, not just articles)
    function getCurrentCommentCount(modal) {
        const articles = modal.querySelectorAll('[role="article"]');
        let count = 0;

        articles.forEach(article => {
            const ariaLabel = article.getAttribute('aria-label');
            if (ariaLabel && (ariaLabel.includes('Opmerking') || ariaLabel.includes('Comment') || ariaLabel.includes('comment'))) {
                // Check if it has text content
                const textDivs = article.querySelectorAll('div[dir="auto"]');
                for (let div of textDivs) {
                    const text = div.textContent.trim();
                    if (text.length > 5) {
                        count++;
                        break;
                    }
                }
            }
        });

        return count;
    }

    // Expand child replies only (depth-first, exhaustive)
    // Note: This function expands ALL replies regardless of limit
    // The limit is enforced during the scraping phase, not expansion
    async function expandAllReplies(modal, maxComments) {
        console.log(`🔄 Expanding all replies (depth-first, exhaustive)...`);
        console.log(`ℹ️  Note: Expanding all visible replies first, limit will be applied during scraping`);
        let iteration = 0;
        const maxIterations = 200;
        let totalClickedThisCall = 0;

        while (iteration < maxIterations) {
            let clickedThisRound = 0;
            let foundButNotInViewport = 0;

            // Patterns specifically for reply buttons
            const replyPatterns = [
                /alle\s+\d+\s+antwoorden\s+weergeven/i,
                /\d+\s+antwoord\s+bekijken/i,
                /\d+\s+antwoorden\s+bekijken/i,
                /view\s+\d+\s+repl/i,
                /view\s+more\s+repl/i,
                /view\s+previous\s+repl/i,
                /heeft\s+geantwoord/i,
                /replied/i,
                /\d+\s+antwoorden/i,
                /\d+\s+replies/i,
                /\d+\s+reply/i,
            ];

            const allButtons = modal.querySelectorAll('div[role="button"], span[role="button"], a[href], span');
            console.log(`🔍 Found ${allButtons.length} potential buttons to check`);

            for (let btn of allButtons) {
                // Skip navigation links (prevent opening new tabs)
                if (btn.tagName === 'A') {
                    const href = btn.getAttribute('href');
                    // Skip if it's a profile link, photo link, or external link
                    if (href && (href.startsWith('#') || href.startsWith('http'))) {
                        continue;  // Skip actual navigation links
                    }
                }

                const text = btn.innerText || btn.textContent || '';
                const matchesReply = replyPatterns.some(pattern => pattern.test(text));

                if (matchesReply) {
                    try {
                        // ALWAYS scroll into view first - don't check viewport beforehand
                        // This ensures nested buttons get revealed before clicking
                        console.log(`🎯 Attempting to click: "${text.substring(0, 50)}"`);
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await sleep(600);  // Wait for scroll animation and content load

                        // Double-check the button is actually visible after scrolling
                        if (!isInModalViewport(btn, modal)) {
                            foundButNotInViewport++;
                            console.log(`⏭️ Still not visible after scroll: "${text.substring(0, 40)}"`);
                            continue;
                        }

                        // NEW: Track which article this reply button belongs to
                        const parentArticle = btn.closest('[role="article"]');
                        if (parentArticle) {
                            const articlesBeforeClick = new Set(modal.querySelectorAll('[role="article"]'));
                            replyButtonParentMap.set(parentArticle, {
                                clickedAt: Date.now(),
                                articlesBeforeClick: articlesBeforeClick
                            });
                        }

                        // Prevent default navigation for links
                        if (btn.tagName === 'A') {
                            btn.addEventListener('click', (e) => e.preventDefault(), { once: true });
                        }

                        btn.click();
                        clickedThisRound++;
                        totalClickedThisCall++;
                        stats.buttonsClicked++;
                        console.log(`✓ Reply clicked: "${text.substring(0, 50)}"`);
                        await sleep(1000);  // Longer wait for nested content to fully load
                    } catch (e) {
                        console.log('❌ Click failed:', e);
                    }
                }
            }

            const countAfterRound = getCurrentCommentCount(modal);
            updateUI('🔄 Expanding replies...', {
                statusText: `Replies ${iteration + 1}`,
                buttonsClicked: stats.buttonsClicked,
                scrapedCount: countAfterRound,
                maxLimit: maxComments,
                showStats: true
            });

            console.log(`Reply iteration ${iteration + 1}: Clicked ${clickedThisRound} buttons, ${foundButNotInViewport} not in viewport, ${countAfterRound} total comments`);

            if (clickedThisRound === 0 && foundButNotInViewport === 0) {
                console.log('✅ No more reply buttons found');
                break;
            }

            // If buttons exist but aren't visible, scroll more aggressively
            if (clickedThisRound === 0 && foundButNotInViewport > 0) {
                console.log(`⚠️ Found ${foundButNotInViewport} reply buttons still not visible after scroll attempts`);
                console.log(`📜 Attempting more aggressive modal scroll...`);

                // Scroll the modal to reveal more content
                const scrollContainer = modal.querySelector('[style*="overflow"]') || modal;
                const currentScroll = scrollContainer.scrollTop;

                // More aggressive scroll - 1000px instead of 500px
                scrollContainer.scrollTop += 1000;
                await sleep(800);  // Longer wait for content to load

                // If scroll didn't move, we're at the bottom
                if (scrollContainer.scrollTop === currentScroll) {
                    console.log('⏸️ Reached bottom of modal - cannot scroll further');
                    break;
                }

                console.log(`✓ Scrolled from ${currentScroll}px to ${scrollContainer.scrollTop}px`);
            }

            iteration++;
            await sleep(300);
        }

        const finalCount = getCurrentCommentCount(modal);
        console.log(`✅ Reply expansion complete: ${totalClickedThisCall} buttons clicked, ${finalCount} total comments visible`);
        return totalClickedThisCall;
    }

    // Expand "view more comments" buttons only
    async function expandMoreComments(modal) {
        console.log('🔄 Expanding more comments...');
        let clickedThisRound = 0;

        const viewMoreCommentPatterns = [
            /view\s+more\s+comment/i,
            /view\s+previous\s+comment/i,
            /meer\s+reacties/i,
            /meer\s+opmerkingen/i,
            /vorige\s+reacties/i,
            /bekijk\s+meer\s+reacties/i,
            /weitere\s+kommentare/i,
            /view\s+\d+\s+more\s+comment/i,
        ];

        const allButtons = modal.querySelectorAll('div[role="button"], span[role="button"], a[href], span');

        for (let btn of allButtons) {
            // Skip navigation links (prevent opening new tabs)
            if (btn.tagName === 'A') {
                const href = btn.getAttribute('href');
                if (href && (href.startsWith('#') || href.startsWith('http'))) {
                    continue;  // Skip actual links
                }
            }

            if (!isInModalViewport(btn, modal)) continue;

            const text = btn.innerText || btn.textContent || '';
            const matchesViewMore = viewMoreCommentPatterns.some(pattern => pattern.test(text));

            if (matchesViewMore) {
                try {
                    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await sleep(300);

                    // Prevent default navigation for links
                    if (btn.tagName === 'A') {
                        btn.addEventListener('click', (e) => e.preventDefault(), { once: true });
                    }

                    btn.click();
                    clickedThisRound++;
                    stats.buttonsClicked++;
                    console.log(`✓ View more clicked: "${text.substring(0, 50)}"`);
                    await sleep(800);
                } catch (e) {
                    console.log('Click failed:', e);
                }
            }
        }

        const currentCount = getCurrentCommentCount(modal);
        console.log(`View more comments: Clicked ${clickedThisRound} buttons (${currentCount} comments visible)`);
        return clickedThisRound;
    }

    // Main expansion coordinator: DEPTH-FIRST PRIORITY
    // Strategy: Scroll a bit → Expand ALL children → Repeat
    async function expandAllInModal(modal, maxComments) {
        console.log(`🔄 Starting DEPTH-FIRST expansion...`);
        console.log(`ℹ️  Strategy: Expand ALL replies first, then apply limit (${maxComments === 0 ? 'unlimited' : maxComments}) during scraping`);
        let cycle = 0;
        const maxCycles = 100;
        let consecutiveEmptyCycles = 0;

        while (cycle < maxCycles) {
            console.log(`\n=== Cycle ${cycle + 1} ===`);

            const currentCount = getCurrentCommentCount(modal);
            console.log(`📊 Current: ${currentCount} comments visible`);

            // PHASE 1: ALWAYS expand ALL visible nested children (NO LIMIT CHECK)
            // The limit will be enforced during scraping, not expansion
            console.log('🔄 Phase 1: Expanding ALL visible nested children...');
            updateUI('🔄 Expanding all children...', {
                statusText: `Cycle ${cycle + 1}: Children`,
                buttonsClicked: stats.buttonsClicked,
                scrapedCount: currentCount,
                maxLimit: maxComments,
                showStats: true
            });
            const repliesClicked = await expandAllReplies(modal, maxComments);

            const countAfterReplies = getCurrentCommentCount(modal);
            console.log(`📊 After children: ${countAfterReplies} comments (clicked ${repliesClicked} buttons)`);

            // Only stop scrolling for MORE content if we have enough
            // But still expand replies on what's already visible
            const hasEnoughContent = maxComments > 0 && countAfterReplies >= maxComments * 1.5; // 1.5x buffer

            // PHASE 2: Load more content (but skip if we have enough)
            let moreClicked = 0;
            let scrolledNewContent = false;

            if (hasEnoughContent) {
                console.log(`✅ Have enough content (${countAfterReplies} >= ${maxComments * 1.5}), skipping scroll`);
                console.log(`ℹ️  Will continue to expand any remaining visible replies`);
            } else {
                console.log('📜 Phase 2: Loading more content...');
                updateUI('📜 Loading more...', {
                    statusText: `Cycle ${cycle + 1}: Load`,
                    buttonsClicked: stats.buttonsClicked,
                    scrapedCount: countAfterReplies,
                    maxLimit: maxComments,
                    showStats: true
                });

                // Try "view more comments" buttons first
                moreClicked = await expandMoreComments(modal);

                // Then scroll incrementally
                scrolledNewContent = await scrollModalIncremental(modal);
            }

            // Check for activity
            const activityThisCycle = repliesClicked > 0 || moreClicked > 0 || scrolledNewContent;

            if (!activityThisCycle) {
                consecutiveEmptyCycles++;
                console.log(`⚠️ No activity this cycle (${consecutiveEmptyCycles}/3)`);

                if (consecutiveEmptyCycles >= 3) {
                    console.log('✅ No more content to load (3 empty cycles)');
                    break;
                }
            } else {
                consecutiveEmptyCycles = 0;
            }

            cycle++;

            // Small pause before next cycle
            await sleep(500);
        }

        const finalCount = getCurrentCommentCount(modal);
        console.log(`✅ Expansion complete. ${finalCount} comments visible, ${stats.buttonsClicked} buttons clicked across ${cycle} cycles`);
        return stats.buttonsClicked;
    }

    // Highlight comment
    function highlightComment(element, depth) {
        const colors = ['#ff0000', '#ff6b00', '#ff9500', '#ffbb00', '#00ff00'];
        const color = colors[Math.min(depth, colors.length - 1)];

        element.style.cssText = `
            border: 3px solid ${color} !important;
            box-shadow: 0 0 10px ${color} !important;
            border-radius: 8px !important;
            background: rgba(255, 0, 0, 0.05) !important;
            position: relative !important;
        `;

        const label = document.createElement('div');
        label.style.cssText = `
            position: absolute;
            top: -12px;
            left: 10px;
            background: ${color};
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            z-index: 10;
        `;
        label.textContent = depth === 0 ? 'MAIN' : `REPLY-${depth}`;
        element.style.position = 'relative';
        element.appendChild(label);
    }

    // Extract comment data
    function extractComment(article, commentIndex = 0) {
        try {
            const comment = {
                id: `comment_${commentIndex}_${Date.now()}`,
                parentId: null,
                author: '',
                authorName: '',
                profileUrl: '',
                profileImage: '',
                text: '',
                timestamp: '',
                likes: 0,
                isReply: false,
                depth: 0,
                hasUnloadedReplies: false,
                replyToAuthor: ''
            };

            // Extract profile image
            const imageElements = article.querySelectorAll('image[xlink\\:href], image[href]');
            for (let img of imageElements) {
                const href = img.getAttribute('xlink:href') || img.getAttribute('href');
                if (href && href.includes('fbcdn.net') && !href.includes('static.xx.fbcdn')) {
                    comment.profileImage = href.split('?')[0];
                    break;
                }
            }

            // Extract author name and URL (more robust approach)
            const allLinks = article.querySelectorAll('a[href*="facebook.com"], a[href^="/"]');

            for (let link of allLinks) {
                const href = link.getAttribute('href');
                if (!href) continue;

                // CRITICAL FIX v16.7: Check basePath ONLY, not query params!
                // Facebook profile links have comment_id in query params, not in path
                const basePath = href.split('?')[0];
                if (basePath.includes('/comment/') || basePath.includes('/reply/')) continue;
                if (basePath.includes('/photo/') || basePath.includes('/photos/')) continue;
                if (basePath.includes('/hashtag/')) continue;

                // Get link text - try multiple approaches
                let linkText = '';

                // Try getting text from spans first
                const spans = link.querySelectorAll('span');
                for (let span of spans) {
                    const text = span.textContent.trim();
                    if (text && text.length > 0 && text.length < 100) {
                        linkText = text;
                        break;
                    }
                }

                // Fallback to direct text content
                if (!linkText) {
                    linkText = link.textContent.trim();
                }

                // Validate this looks like a name
                if (linkText &&
                    linkText.length > 0 &&
                    linkText.length < 100 &&
                    !linkText.includes('•') &&
                    !linkText.includes('geleden') &&
                    !linkText.includes('ago') &&
                    !linkText.includes('Like') &&
                    !linkText.includes('Reply') &&
                    !linkText.includes('Share') &&
                    !linkText.includes('Reageren') &&
                    !linkText.includes('Delen') &&
                    !linkText.match(/^\d+\s*(min|hr|h|d|w|m|s|uur|dag)/i) &&
                    !linkText.match(/^\d+$/)) {

                    comment.author = linkText;
                    comment.authorName = linkText;
                    comment.profileUrl = href.startsWith('/') ? `https://www.facebook.com${href.split('?')[0]}` : href.split('?')[0];
                    break;
                }
            }

            // Additional fallback: look for strong/bold text that might be author name
            if (!comment.author) {
                const strongTags = article.querySelectorAll('strong, b, h3, h4');
                for (let tag of strongTags) {
                    const text = tag.textContent.trim();
                    if (text &&
                        text.length > 0 &&
                        text.length < 100 &&
                        !text.includes('geleden') &&
                        !text.includes('ago') &&
                        !text.match(/^\d+/)) {
                        comment.author = text;
                        comment.authorName = text;
                        break;
                    }
                }
            }

            // Extract comment text
            const textDivs = article.querySelectorAll('div[dir="auto"]');
            for (let div of textDivs) {
                const text = div.textContent.trim();

                if (text.length > 5 &&
                    text !== comment.author &&
                    !text.match(/^\d+\s*(min|hr|h|d|w|m|s|uur|dag|geleden|ago)/i) &&
                    !text.includes('heeft geantwoord') &&
                    !text.includes('replied') &&
                    !text.includes('antwoord bekijken') &&
                    !text.includes('antwoorden bekijken')) {
                    comment.text = text;
                    break;
                }
            }

            // Extract timestamp
            const ariaLabel = article.getAttribute('aria-label');
            if (ariaLabel) {
                const timeMatch = ariaLabel.match(/(\d+\s+\w+\s+geleden|\d+\s+\w+\s+ago|yesterday|gisteren|vandaag|today)/i);
                if (timeMatch) {
                    comment.timestamp = timeMatch[0];
                }
            }

            if (!comment.timestamp) {
                const timeLinks = article.querySelectorAll('a[href*="comment_id"], a[href*="reply_comment_id"]');
                for (let link of timeLinks) {
                    const text = link.textContent.trim();
                    if (text.match(/\d+\s*(min|hr|h|d|w|m|s|uur|dag|week|maand|jaar|geleden|ago)/i)) {
                        comment.timestamp = text;
                        break;
                    }
                }
            }

            // Check for unloaded replies
            const fullText = article.textContent;
            if (fullText.includes('heeft geantwoord') ||
                fullText.includes('replied') ||
                fullText.match(/\d+\s+antwoorden/i) ||
                fullText.match(/\d+\s+replies/i) ||
                fullText.match(/\d+\s+antwoord\s+bekijken/i)) {
                comment.hasUnloadedReplies = true;
            }

            // Extract likes
            const reactionButtons = article.querySelectorAll('[role="button"]');
            for (let btn of reactionButtons) {
                const text = btn.textContent.trim();
                if (text.match(/^\d+$/)) {
                    const count = parseInt(text);
                    if (count > 0 && count < 1000000) {
                        comment.likes = count;
                        break;
                    }
                }
            }

            // Determine depth and parent ID
            let parent = article.parentElement;
            let depth = 0;
            let immediateParentArticle = null;
            let currentArticle = article; // Use separate variable for traversal to preserve original article reference
            let depthDebug = []; // Track depth traversal for debugging

            while (parent && depth < 50) {
                const parentArticle = parent.closest('[role="article"]');
                if (parentArticle && parentArticle !== currentArticle) {
                    const parentLabel = parentArticle.getAttribute('aria-label');
                    if (parentLabel && (parentLabel.includes('Opmerking') || parentLabel.includes('Comment'))) {
                        depth++;
                        depthDebug.push(`Found parent at depth ${depth}: ${parentLabel.substring(0, 40)}`);

                        // Store immediate parent (depth 1) for parent ID lookup
                        if (depth === 1) {
                            immediateParentArticle = parentArticle;

                            // Extract parent author name
                            if (!comment.replyToAuthor) {
                                const parentLinks = parentArticle.querySelectorAll('a[href*="facebook.com"]');
                                for (let link of parentLinks) {
                                    const href = link.getAttribute('href');
                                    if (href && !href.includes('comment_id')) {
                                        const spans = link.querySelectorAll('span[dir="auto"]');
                                        for (let span of spans) {
                                            const text = span.textContent.trim();
                                            if (text && text.length > 0 && text.length < 100) {
                                                comment.replyToAuthor = text;
                                                break;
                                            }
                                        }
                                        if (comment.replyToAuthor) break;
                                    }
                                }
                            }
                        }

                        currentArticle = parentArticle; // Update traversal variable, not original article
                        parent = currentArticle.parentElement; // Continue traversing up from the parent
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }

            comment.depth = depth;
            comment.isReply = depth > 0;

            // Set parent ID from the map (will be populated after parent is processed)
            if (immediateParentArticle && articleToCommentMap.has(immediateParentArticle)) {
                comment.parentId = articleToCommentMap.get(immediateParentArticle);
            }

            // Debug logging for depth detection (only first 3 nested comments to avoid spam)
            if (depth > 0 && commentIndex < 3) {
                console.log(`🔍 DEPTH DEBUG for comment ${commentIndex}:`, {
                    depth: depth,
                    traversal: depthDebug,
                    author: comment.author || '[NO AUTHOR]',
                    text: comment.text.substring(0, 40)
                });
            }

            // Debug logging for missing fields
            if (!comment.author) {
                console.warn('⚠️ Missing author for comment:', {
                    text: comment.text.substring(0, 30),
                    ariaLabel: article.getAttribute('aria-label'),
                    firstLink: article.querySelector('a')?.getAttribute('href')
                });
            }

            return comment;
        } catch (e) {
            console.error('❌ Error extracting comment:', e);
            return null;
        }
    }

    // Diagnostic: Analyze article structure before scraping
    function analyzeArticleStructure(modal) {
        const articles = modal.querySelectorAll('[role="article"]');
        console.log(`\n🔬 === ARTICLE STRUCTURE ANALYSIS ===`);
        console.log(`📊 Total articles found: ${articles.length}`);

        let depthCheck = {};
        let flatStructureCount = 0;
        let indentedCount = 0;

        articles.forEach((article, idx) => {
            const ariaLabel = article.getAttribute('aria-label');
            if (ariaLabel && (ariaLabel.includes('Opmerking') || ariaLabel.includes('Comment'))) {
                // Check depth by counting parent articles (OLD METHOD - nested structure)
                let parent = article.parentElement;
                let depth = 0;
                let currentArticle = article;

                while (parent && depth < 50) {
                    const parentArticle = parent.closest('[role="article"]');
                    if (parentArticle && parentArticle !== currentArticle) {
                        const parentLabel = parentArticle.getAttribute('aria-label');
                        if (parentLabel && (parentLabel.includes('Opmerking') || parentLabel.includes('Comment'))) {
                            depth++;
                            currentArticle = parentArticle;
                            parent = currentArticle.parentElement;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }

                depthCheck[depth] = (depthCheck[depth] || 0) + 1;

                // NEW: Check for flat structure indicators
                // Check padding/margin (Facebook uses padding-left for reply indentation)
                const computedStyle = window.getComputedStyle(article);
                const paddingLeft = parseInt(computedStyle.paddingLeft) || 0;
                const marginLeft = parseInt(computedStyle.marginLeft) || 0;

                if (paddingLeft > 20 || marginLeft > 20) {
                    indentedCount++;
                    if (indentedCount <= 5) {
                        console.log(`  🔍 Article ${idx}: paddingLeft=${paddingLeft}px, marginLeft=${marginLeft}px`);
                        console.log(`     aria-label: "${ariaLabel.substring(0, 60)}..."`);
                        console.log(`     Classes: ${article.className.substring(0, 100)}`);
                    }
                }

                // Check if aria-label contains reply indicators
                if (ariaLabel.toLowerCase().includes('reply') || ariaLabel.toLowerCase().includes('antwoord')) {
                    flatStructureCount++;
                }

                // DEEPER: Check parent containers and data attributes (first 3 articles only)
                if (idx < 3) {
                    console.log(`\n  📋 Article ${idx} Deep Analysis:`);
                    console.log(`     aria-label: "${ariaLabel.substring(0, 50)}..."`);

                    // Check parent containers
                    let parent = article.parentElement;
                    let parentChain = [];
                    for (let i = 0; i < 3 && parent; i++) {
                        const tag = parent.tagName.toLowerCase();
                        const classes = parent.className ? parent.className.substring(0, 50) : 'none';
                        const role = parent.getAttribute('role') || 'none';
                        parentChain.push(`${tag}[role=${role}, class=${classes}]`);
                        parent = parent.parentElement;
                    }
                    console.log(`     Parents: ${parentChain.join(' > ')}`);

                    // Check all data-* attributes
                    const dataAttrs = {};
                    for (let attr of article.attributes) {
                        if (attr.name.startsWith('data-')) {
                            dataAttrs[attr.name] = attr.value.substring(0, 50);
                        }
                    }
                    console.log(`     Data attrs:`, Object.keys(dataAttrs).length > 0 ? dataAttrs : 'none');

                    // Check siblings
                    const prevSibling = article.previousElementSibling;
                    const nextSibling = article.nextElementSibling;
                    console.log(`     Prev sibling: ${prevSibling ? prevSibling.tagName + (prevSibling.getAttribute('role') || '') : 'none'}`);
                    console.log(`     Next sibling: ${nextSibling ? nextSibling.tagName + (nextSibling.getAttribute('role') || '') : 'none'}`);
                }

                if (depth > 0 && Object.keys(depthCheck).filter(d => d > 0).length <= 5) {
                    console.log(`  📍 Article ${idx}: Depth ${depth} - "${ariaLabel.substring(0, 50)}..."`);
                }
            }
        });

        console.log(`📊 Depth distribution (nested method):`, depthCheck);
        console.log(`📊 Indented articles (flat structure):`, indentedCount);
        console.log(`📊 Articles with 'reply' in label:`, flatStructureCount);
        console.log(`🔬 === END ANALYSIS ===\n`);

        return depthCheck;
    }

    // NEW: Detect depth in flat DOM structure using multiple strategies
    function detectDepthFlatStructure(article, allArticles, articleIndex, processedComments) {
        let depth = 0;
        let parentArticle = null;
        let detectionMethod = 'none';

        const ariaLabel = article.getAttribute('aria-label') || '';

        // STRATEGY 0 (BEST!): Check for NESTED article elements in DOM
        // User discovered that Facebook NESTS replies INSIDE parent article divs!
        // aria-label patterns:
        //   Main: "Opmerking van {name} {time}"
        //   Reply: "Antwoord van {name} op de opmerking van {parent} {time}"

        // Check if this article is nested inside another article
        let currentElement = article.parentElement;
        let parentArticles = [];

        while (currentElement) {
            // Check if we found a parent article (but not the same article)
            if (currentElement !== article && currentElement.matches && currentElement.matches('[role="article"]')) {
                parentArticles.push(currentElement);
            }
            currentElement = currentElement.parentElement;
        }

        if (parentArticles.length > 0) {
            // We found nested structure! The depth is the number of parent articles
            depth = parentArticles.length;
            parentArticle = parentArticles[0]; // Immediate parent
            detectionMethod = 'nested-dom-structure';

            // DEBUG: Log successful nested detection
            if (window.DEPTH_DEBUG) {
                console.log(`[DEPTH] Article ${articleIndex}: ✓ NESTED! Found ${depth} parent articles via DOM hierarchy`);
                console.log(`[DEPTH] Article ${articleIndex}: aria-label="${ariaLabel.substring(0, 80)}..."`);
            }

            return { depth, parentArticle, detectionMethod };
        }

        // Also check aria-label for "Antwoord" (Reply) pattern
        if (ariaLabel.includes('Antwoord van') || ariaLabel.includes('Reply from')) {
            // This is a reply! Try to extract parent name from aria-label
            // Pattern: "Antwoord van {author} op de opmerking van {parent} {time}"
            const dutchMatch = ariaLabel.match(/Antwoord van (.+?) op de opmerking van (.+?)( \d+| een| a )/);
            const englishMatch = ariaLabel.match(/Reply from (.+?) to comment from (.+?)( \d+| a )/);

            if (dutchMatch || englishMatch) {
                const match = dutchMatch || englishMatch;
                const parentName = match[2];

                // DEBUG: Log aria-label pattern detection
                if (window.DEPTH_DEBUG) {
                    console.log(`[DEPTH] Article ${articleIndex}: Found "Antwoord" pattern, parent="${parentName}"`);
                }

                // Search for parent by name in previous articles
                for (let i = articleIndex - 1; i >= 0; i--) {
                    const candidateAuthor = extractAuthorName(allArticles[i]);
                    if (candidateAuthor && parentName.includes(candidateAuthor)) {
                        parentArticle = allArticles[i];
                        depth = 1; // At least depth 1, could be deeper
                        detectionMethod = 'aria-label-antwoord';

                        // DEBUG: Log successful parent match
                        if (window.DEPTH_DEBUG) {
                            console.log(`[DEPTH] Article ${articleIndex}: ✓ MATCHED parent via aria-label: article ${i} (${candidateAuthor})`);
                        }
                        break;
                    }
                }
            }
        }

        // If we found a reply via aria-label, return now (strategies below are less reliable)
        if (depth > 0) {
            return { depth, parentArticle, detectionMethod };
        }

        // STRATEGY 1: Check for author mention links at start of comment
        // Facebook puts a link to the parent author at the beginning of reply text

        // Get the first link in the comment text (not the author's own link)
        const textLinks = article.querySelectorAll('a[href*="facebook.com"], a[href^="/"]');
        const currentAuthor = extractAuthorName(article);

        // DEBUG: Log author extraction for troubleshooting
        if (window.DEPTH_DEBUG) {
            console.log(`[DEPTH] Article ${articleIndex}: Author="${currentAuthor}", Links found: ${textLinks.length}`);
        }

        // Find a link that mentions a DIFFERENT author (potential parent)
        for (let link of textLinks) {
            // FIXED: Use extractNameFromLink instead of textContent
            const linkText = extractNameFromLink(link);
            if (!linkText || linkText === currentAuthor) continue;

            // Check if this link appears early in the comment (first 100 chars of text)
            const allText = article.textContent || '';
            const linkPosition = allText.indexOf(linkText);
            if (linkPosition < 0 || linkPosition > 100) continue;

            // DEBUG: Log potential parent mention found
            if (window.DEPTH_DEBUG) {
                console.log(`[DEPTH] Article ${articleIndex}: Found potential parent mention "${linkText}" at position ${linkPosition}`);
            }

            // This might be a parent mention - search backwards for this author
            for (let i = articleIndex - 1; i >= 0; i--) {
                const candidateParent = allArticles[i];
                const candidateAuthor = extractAuthorName(candidateParent);

                if (candidateAuthor && linkText.includes(candidateAuthor)) {
                    // DEBUG: Log successful parent match
                    if (window.DEPTH_DEBUG) {
                        console.log(`[DEPTH] Article ${articleIndex}: ✓ MATCHED! Parent is article ${i} (${candidateAuthor})`);
                    }

                    parentArticle = candidateParent;

                    // Calculate depth by checking if parent is also a reply
                    let tempParent = candidateParent;
                    let tempDepth = 1;

                    // Recursively check parent's depth (limit to 5 levels)
                    for (let checkIdx = i - 1; checkIdx >= 0 && tempDepth < 5; checkIdx--) {
                        const tempParentLinks = tempParent.querySelectorAll('a[href*="facebook.com"], a[href^="/"]');
                        const tempParentText = tempParent.textContent || '';
                        const tempParentAuthor = extractAuthorName(tempParent);

                        let foundGrandparent = false;
                        for (let tempLink of tempParentLinks) {
                            // FIXED: Use extractNameFromLink instead of textContent
                            const tempLinkText = extractNameFromLink(tempLink);
                            if (!tempLinkText || tempLinkText === tempParentAuthor) continue;

                            const tempLinkPos = tempParentText.indexOf(tempLinkText);
                            if (tempLinkPos >= 0 && tempLinkPos <= 100) {
                                const grandparent = allArticles[checkIdx];
                                const grandparentAuthor = extractAuthorName(grandparent);

                                if (grandparentAuthor && tempLinkText.includes(grandparentAuthor)) {
                                    // DEBUG: Log multi-level nesting detection
                                    if (window.DEPTH_DEBUG) {
                                        console.log(`[DEPTH] Article ${articleIndex}: Found depth ${tempDepth + 1} - grandparent is article ${checkIdx} (${grandparentAuthor})`);
                                    }

                                    tempDepth++;
                                    tempParent = grandparent;
                                    foundGrandparent = true;
                                    break;
                                }
                            }
                        }
                        if (!foundGrandparent) break;
                    }

                    depth = tempDepth;
                    detectionMethod = 'author-mention-link';
                    break;
                }
            }
            if (depth > 0) break;
        }

        // STRATEGY 2: Check for @mentions in comment text (fallback)
        if (depth === 0) {
            const commentText = article.textContent || '';
            const mentionMatch = commentText.match(/@[\w\s]+/);
            if (mentionMatch) {
                const mentionedName = mentionMatch[0].substring(1).trim();
                // Find previous comment by this author
                for (let i = articleIndex - 1; i >= 0; i--) {
                    const prevArticle = allArticles[i];
                    const prevAuthor = extractAuthorName(prevArticle);
                    if (prevAuthor && prevAuthor.toLowerCase().includes(mentionedName.toLowerCase())) {
                        parentArticle = prevArticle;
                        depth = 1;
                        detectionMethod = 'mention';
                        break;
                    }
                }
            }
        }

        // STRATEGY 3: Check for visual indentation via computed styles
        if (depth === 0) {
            const computedStyle = window.getComputedStyle(article);
            const paddingLeft = parseInt(computedStyle.paddingLeft) || 0;
            const marginLeft = parseInt(computedStyle.marginLeft) || 0;

            // Facebook typically uses 40px increments for reply indentation
            if (paddingLeft > 20 || marginLeft > 20) {
                depth = Math.floor((paddingLeft + marginLeft) / 40);
                detectionMethod = 'visual-indent';

                // Find parent by looking backwards for comment with less indentation
                for (let i = articleIndex - 1; i >= 0; i--) {
                    const prevArticle = allArticles[i];
                    const prevStyle = window.getComputedStyle(prevArticle);
                    const prevPadding = parseInt(prevStyle.paddingLeft) || 0;
                    const prevMargin = parseInt(prevStyle.marginLeft) || 0;
                    if ((prevPadding + prevMargin) < (paddingLeft + marginLeft)) {
                        parentArticle = prevArticle;
                        break;
                    }
                }
            }
        }

        // STRATEGY 4: Check parent containers for grouping
        if (depth === 0) {
            let container = article.parentElement;
            let containerDepth = 0;

            // Look for reply container wrappers (often have specific class patterns)
            while (container && containerDepth < 5) {
                const className = container.className || '';
                if (className.includes('comment_replies') ||
                    className.includes('reply') ||
                    container.getAttribute('role') === 'list') {
                    containerDepth++;
                }
                container = container.parentElement;
            }

            if (containerDepth > 0) {
                depth = containerDepth;
                detectionMethod = 'container-grouping';
            }
        }

        return { depth, parentArticle, detectionMethod };
    }

    // Helper: Extract name from a single link element (used for both author and mention extraction)
    function extractNameFromLink(link) {
        const href = link.getAttribute('href');

        // Skip non-profile links
        if (!href || href.startsWith('#') || href === '/') return null;

        const basePath = href.split('?')[0];
        if (basePath.includes('/comment/') || basePath.includes('/reply/')) return null;

        // Try multiple approaches to get the name

        // Approach 1: Look for span[dir="auto"] (author links)
        const diAutoSpans = link.querySelectorAll('span[dir="auto"]');
        for (let span of diAutoSpans) {
            const text = span.textContent.trim();
            if (text && text.length > 0 && text.length < 100) {
                return text;
            }
        }

        // Approach 2: Look for ANY span (mention links don't have dir="auto")
        const allSpans = link.querySelectorAll('span');
        for (let span of allSpans) {
            const text = span.textContent.trim();
            // Filter out timestamps and noise, but NOT names containing 'u'!
            if (text && text.length > 0 && text.length < 100 &&
                !text.includes('geleden') && !text.includes('ago') &&
                text !== 'u' && !text.match(/^\d+[u]?$/)) {
                return text;
            }
        }

        // Approach 3: Get direct text content of the link
        const linkText = link.textContent.trim();
        if (linkText && linkText.length > 0 && linkText.length < 100 &&
            !linkText.includes('geleden') && !linkText.includes('ago')) {
            return linkText;
        }

        return null;
    }

    // Helper: Extract author name from article (finds first valid name)
    function extractAuthorName(article) {
        const links = article.querySelectorAll('a[href*="facebook.com"], a[href^="/"]');
        for (let link of links) {
            const name = extractNameFromLink(link);
            if (name) {
                if (window.DEPTH_DEBUG) {
                    console.log(`[EXTRACT] Found author: "${name}"`);
                }
                return name;
            }
        }
        if (window.DEPTH_DEBUG) {
            console.log(`[EXTRACT] No author found for article`);
        }
        return null;
    }

    // Scrape modal comments with max limit
    function scrapeModalComments(modal, maxComments) {
        console.log('🔍 Scraping...');

        const comments = [];
        const articles = Array.from(modal.querySelectorAll('[role="article"]'));

        console.log(`Found ${articles.length} articles`);

        stats.mainComments = 0;
        stats.replies = 0;
        let scrapedCount = 0;
        let skippedCount = 0;

        // Use for...of with index tracking for flat structure detection
        for (let articleIndex = 0; articleIndex < articles.length; articleIndex++) {
            const article = articles[articleIndex];

            // Check if we've reached the max limit
            if (maxComments > 0 && scrapedCount >= maxComments) {
                console.log(`✅ Reached max limit (${maxComments}), stopping scraping`);
                break;
            }

            const ariaLabel = article.getAttribute('aria-label');

            // CRITICAL FIX: Include "Antwoord" (Reply) and "Reply" - previously only checked for "Opmerking" (Comment)!
            if (ariaLabel && (ariaLabel.includes('Opmerking') || ariaLabel.includes('Antwoord') ||
                             ariaLabel.includes('Comment') || ariaLabel.includes('Reply') ||
                             ariaLabel.includes('comment') || ariaLabel.includes('reply'))) {

                const articleId = article.outerHTML.substring(0, 300);
                if (scrapedComments.has(articleId)) {
                    skippedCount++;
                    continue;
                }
                scrapedComments.add(articleId);

                const comment = extractComment(article, scrapedCount);

                if (comment && comment.text && comment.text.length > 0) {
                    // NEW: Override depth detection with flat structure analysis
                    const flatDepth = detectDepthFlatStructure(article, articles, articleIndex, comments);
                    comment.depth = flatDepth.depth;
                    comment.isReply = flatDepth.depth > 0;
                    comment.detectionMethod = flatDepth.detectionMethod;

                    // Set parent ID from flat structure detection
                    if (flatDepth.parentArticle && articleToCommentMap.has(flatDepth.parentArticle)) {
                        comment.parentId = articleToCommentMap.get(flatDepth.parentArticle);
                    }

                    // Store article-to-commentId mapping for parent tracking
                    articleToCommentMap.set(article, comment.id);

                    comments.push(comment);
                    scrapedCount++;
                    highlightComment(article, comment.depth);

                    if (comment.depth === 0) {
                        stats.mainComments++;
                    } else {
                        stats.replies++;
                    }

                    updateUI('🔍 Scraping...', {
                        statusText: 'Extracting',
                        mainComments: stats.mainComments,
                        replies: stats.replies,
                        scrapedCount: scrapedCount,
                        maxLimit: maxComments,
                        showStats: true
                    });

                    console.log(`📝 ${scrapedCount}/${maxComments || '∞'} - Depth ${comment.depth} (${flatDepth.detectionMethod}): ${comment.author || '[NO AUTHOR]'} - "${comment.text.substring(0, 50)}..."`);

                    if (comment.hasUnloadedReplies) {
                        console.warn(`⚠️ ${comment.author} has unloaded replies`);
                    }
                } else {
                    console.log(`⚠️ Skipped article (no valid comment data) - aria-label: ${ariaLabel.substring(0, 50)}`);
                }
            }
        }

        // Calculate data quality stats
        const missingAuthor = comments.filter(c => !c.author || c.author === '').length;
        const missingProfileUrl = comments.filter(c => !c.profileUrl || c.profileUrl === '').length;
        const missingTimestamp = comments.filter(c => !c.timestamp || c.timestamp === '').length;
        const depthCounts = {};
        const detectionMethodCounts = {};
        comments.forEach(c => {
            depthCounts[c.depth] = (depthCounts[c.depth] || 0) + 1;
            if (c.detectionMethod) {
                detectionMethodCounts[c.detectionMethod] = (detectionMethodCounts[c.detectionMethod] || 0) + 1;
            }
        });

        console.log(`✅ Scraped ${comments.length} comments (Main: ${stats.mainComments}, Replies: ${stats.replies}, Skipped duplicates: ${skippedCount})`);
        console.log(`📊 Data Quality:`, {
            missingAuthor: `${missingAuthor} (${((missingAuthor/comments.length)*100).toFixed(1)}%)`,
            missingProfileUrl: `${missingProfileUrl} (${((missingProfileUrl/comments.length)*100).toFixed(1)}%)`,
            missingTimestamp: `${missingTimestamp} (${((missingTimestamp/comments.length)*100).toFixed(1)}%)`,
            depthDistribution: depthCounts
        });
        console.log(`🔍 Depth Detection Methods Used:`, detectionMethodCounts);
        console.log(`📌 Tracked ${replyButtonParentMap.size} parent comments with clicked reply buttons`);

        return comments;
    }

    // Convert flat comment list to hierarchical tree structure
    function buildCommentTree(comments) {
        const commentMap = new Map();
        const roots = [];

        // First pass: create a map of all comments by ID
        comments.forEach(comment => {
            commentMap.set(comment.id, { ...comment, replies: [] });
        });

        // Second pass: build the tree structure
        comments.forEach(comment => {
            const node = commentMap.get(comment.id);
            if (comment.parentId && commentMap.has(comment.parentId)) {
                // This is a reply - add it to parent's replies array
                const parent = commentMap.get(comment.parentId);
                parent.replies.push(node);
            } else {
                // This is a root comment (no parent or parent not found)
                roots.push(node);
            }
        });

        return roots;
    }

    function downloadJSON(data, filename, hierarchical = true) {
        let exportData;

        if (hierarchical) {
            // Export as hierarchical tree structure
            exportData = {
                format: 'hierarchical',
                totalComments: data.length,
                mainComments: data.filter(c => c.depth === 0).length,
                replies: data.filter(c => c.depth > 0).length,
                exportedAt: new Date().toISOString(),
                comments: buildCommentTree(data)
            };
        } else {
            // Export as flat array with parent references
            exportData = {
                format: 'flat',
                totalComments: data.length,
                mainComments: data.filter(c => c.depth === 0).length,
                replies: data.filter(c => c.depth > 0).length,
                exportedAt: new Date().toISOString(),
                comments: data
            };
        }

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function downloadCSV(data, filename) {
        const headers = ['ID', 'Parent ID', 'Thread', 'Author', 'Author Name', 'Profile URL', 'Profile Image', 'Text', 'Timestamp', 'Likes', 'Depth', 'Is Reply', 'Reply To', 'Has Unloaded Replies'];
        const rows = [headers.join(',')];

        data.forEach(c => {
            // Create visual indentation for thread column based on depth
            const indent = '  '.repeat(c.depth || 0);
            const threadText = `${indent}${c.depth === 0 ? '┌' : '└'} ${c.author || '[NO AUTHOR]'}`;

            const row = [
                `"${(c.id || '').replace(/"/g, '""')}"`,
                `"${(c.parentId || '').replace(/"/g, '""')}"`,
                `"${threadText.replace(/"/g, '""')}"`,
                `"${(c.author || '').replace(/"/g, '""')}"`,
                `"${(c.authorName || '').replace(/"/g, '""')}"`,
                `"${(c.profileUrl || '').replace(/"/g, '""')}"`,
                `"${(c.profileImage || '').replace(/"/g, '""')}"`,
                `"${(c.text || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
                `"${(c.timestamp || '').replace(/"/g, '""')}"`,
                c.likes || 0,
                c.depth || 0,
                c.isReply ? 'Yes' : 'No',
                `"${(c.replyToAuthor || '').replace(/"/g, '""')}"`,
                c.hasUnloadedReplies ? 'Yes' : 'No'
            ];
            rows.push(row.join(','));
        });

        const csv = rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function startScraping() {
        if (isScrapingInProgress) {
            alert('Scraping in progress!');
            return;
        }

        const modal = findCommentModal();
        if (!modal) {
            alert('❌ No comment modal found!\n\nPlease open a post\'s comments first.');
            return;
        }

        // Get max comments limit from input
        const maxCommentsInput = document.getElementById('fb-max-comments');
        const maxComments = parseInt(maxCommentsInput.value) || 0;

        console.log(`📊 Max comments limit: ${maxComments === 0 ? 'unlimited' : maxComments}`);

        isScrapingInProgress = true;
        scrapedComments.clear();
        articleToCommentMap.clear(); // Clear article-to-comment mapping
        stats = { mainComments: 0, replies: 0, buttonsClicked: 0 };

        updateUI('🔄 Starting...', {
            statusText: 'Init',
            showStats: true,
            mainComments: 0,
            replies: 0,
            buttonsClicked: 0,
            scrapedCount: 0,
            maxLimit: maxComments
        });

        try {
            // Start expansion (uses incremental scrolling internally)
            await expandAllInModal(modal, maxComments);

            updateUI('⏳ Waiting...', { statusText: 'Settling DOM' });
            console.log('⏳ Waiting 5 seconds for Facebook to render all nested content...');
            await sleep(5000);  // Increased from 2000ms to 5000ms

            // Analyze what's actually in the DOM
            analyzeArticleStructure(modal);

            updateUI('🔍 Scraping...', { statusText: 'Extracting' });
            const comments = scrapeModalComments(modal, maxComments);

            if (comments.length === 0) {
                alert('⚠️ No comments found!');
                updateUI('📥 Scrape Modal', { showStats: false });
                isScrapingInProgress = false;
                return;
            }

            const depthCounts = {};
            comments.forEach(c => {
                depthCounts[c.depth] = (depthCounts[c.depth] || 0) + 1;
            });

            const unloadedCount = comments.filter(c => c.hasUnloadedReplies).length;
            const timestamp = new Date().toISOString().split('T')[0];

            // Log stats to console
            console.log(`✅ Scraped ${comments.length} comments${maxComments > 0 ? ` (limit: ${maxComments})` : ''}!`);
            console.log(`📊 Depth Distribution:`, depthCounts);
            console.log(`🔧 Buttons Clicked: ${stats.buttonsClicked}`);

            if (unloadedCount > 0) {
                console.warn(`⚠️ ${unloadedCount} comments may have unloaded replies!`);
            }

            // Automatically download JSON (no confirmation dialog)
            console.log(`💾 Auto-downloading JSON export: fb_modal_${timestamp}.json`);
            downloadJSON(comments, `fb_modal_${timestamp}.json`);

            updateUI('✅ Done!', {
                statusText: 'JSON Downloaded',
                showStats: true
            });

            setTimeout(() => {
                updateUI('📥 Scrape Modal', { showStats: false });
            }, 5000);

        } catch (error) {
            console.error('❌ Error:', error);
            alert('Error! Check console.');
            updateUI('❌ Error', { statusText: 'Failed' });
            setTimeout(() => {
                updateUI('📥 Scrape Modal', { showStats: false });
            }, 3000);
        } finally {
            isScrapingInProgress = false;
        }
    }

    // Initialize
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', addUI);
        } else {
            addUI();
        }

        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(addUI, 2000);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    init();
    console.log('✅ Facebook Comment Modal Scraper with Max Limit loaded!');
})();