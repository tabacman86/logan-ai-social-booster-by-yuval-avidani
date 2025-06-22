// Facebook Content Script
let settings = {
    autoLike: false,
    autoComment: false,
    commentStyle: 'professional',
    enableFacebook: true
};

let processedPosts = new Set();
let lastActionTime = 0;
let currentlyViewingPost = null;
let viewingTimer = null;
let intersectionObserver = null;

// Initialize the script
init();

async function init() {
    console.log('Facebook Auto Engager initialized');
    
    // Get current settings
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response) {
        settings = response;
    }
    
    if (settings.enableFacebook) {
        startObserving();
        setupPostViewingDetection();
        setupReplyToCommentListeners();
    }
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateSettings') {
        settings = request.settings;
        if (settings.enableFacebook) {
            startObserving();
        }
    } else if (request.action === 'checkForNewPosts') {
        settings = request.settings;
        if (settings.enableFacebook) {
            checkForNewPosts();
        }
    }
});

function startObserving() {
    // Create a MutationObserver to watch for new posts
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        findAndProcessPosts(node);
                    }
                });
            }
        });
    });

    // Start observing
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Process existing posts
    checkForNewPosts();
}

function checkForNewPosts() {
    findAndProcessPosts(document);
}

function findAndProcessPosts(container) {
    // Facebook post selectors (may need updates as Facebook changes their HTML)
    const postSelectors = [
        '[data-pagelet="FeedUnit"]',
        '[role="article"]',
        '.userContentWrapper',
        '[data-testid="fbfeed_story"]',
        '.story_body_container',
        '[data-ft*="top_level_post_id"]'
    ];

    postSelectors.forEach(selector => {
        const posts = container.querySelectorAll ? container.querySelectorAll(selector) : [];
        posts.forEach(post => processPost(post));
    });
}

async function processPost(postElement) {
    try {
        // Create a unique identifier for this post
        const postId = getPostId(postElement);
        if (!postId || processedPosts.has(postId)) {
            return;
        }

        processedPosts.add(postId);
        console.log('Processing Facebook post:', postId);

        // Wait a random time to appear more natural
        await delay(Math.random() * 3000 + 1000);

        // Auto-like if enabled
        if (settings.autoLike) {
            await autoLike(postElement);
        }

        // Auto-comment if enabled
        if (settings.autoComment) {
            await autoComment(postElement);
        }

    } catch (error) {
        console.error('Error processing post:', error);
    }
}

function getPostId(postElement) {
    // Try to get a unique identifier for the post
    const dataFt = postElement.getAttribute('data-ft');
    if (dataFt) {
        try {
            const ftData = JSON.parse(dataFt);
            if (ftData.top_level_post_id) return ftData.top_level_post_id;
        } catch (e) {}
    }
    
    const dataTestId = postElement.getAttribute('data-testid');
    if (dataTestId) return dataTestId;
    
    // Fallback: use post content hash
    const textContent = postElement.textContent?.trim();
    if (textContent) {
        return btoa(textContent.substring(0, 100)).substring(0, 20);
    }
    
    return null;
}

async function autoLike(postElement) {
    try {
        // Facebook like button selectors
        const likeSelectors = [
            '[data-testid="fb-ufi_likelink"]',
            '[aria-label*="Like"]',
            '[aria-label*="לייק"]',
            'a[role="button"][aria-label*="Like"]',
            '.UFIPagerLink[data-testid*="react"]',
            'div[role="button"][aria-label*="Like"]'
        ];

        let likeButton = null;
        for (const selector of likeSelectors) {
            likeButton = postElement.querySelector(selector);
            if (likeButton) break;
        }

        if (likeButton) {
            // Check if already liked by looking for "Unlike" text or active state
            const ariaLabel = likeButton.getAttribute('aria-label') || '';
            const buttonText = likeButton.textContent || '';
            
            if (ariaLabel.includes('Unlike') || buttonText.includes('Unlike') || 
                ariaLabel.includes('בטל לייק') || buttonText.includes('בטל לייק')) {
                return; // Already liked
            }

            likeButton.click();
            console.log('Liked Facebook post');
            
            // Wait after action
            await delay(1000 + Math.random() * 2000);
        }
    } catch (error) {
        console.error('Error auto-liking post:', error);
    }
}

async function autoComment(postElement) {
    try {
        // Get post content for generating comment
        const postContent = extractPostContent(postElement);
        if (!postContent) return;

        // Generate comment using background script
        const response = await chrome.runtime.sendMessage({
            action: 'generateComment',
            postText: postContent,
            commentStyle: settings.commentStyle || 'professional'
        });

        if (!response.success) {
            console.error('Failed to generate comment:', response.error);
            return;
        }

        // Find comment box - Facebook has complex structure
        const commentBoxSelectors = [
            '[data-testid="ufi_comment_composer"] textarea',
            '[data-testid="ufi_comment_composer"] [contenteditable="true"]',
            '.UFIAddCommentInput textarea',
            '.UFIAddCommentInput [contenteditable="true"]',
            'div[role="textbox"][contenteditable="true"]'
        ];

        let commentBox = null;
        for (const selector of commentBoxSelectors) {
            commentBox = postElement.querySelector(selector);
            if (commentBox) break;
        }

        // If no comment box found, try to click "Comment" button first
        if (!commentBox) {
            const commentButtons = postElement.querySelectorAll(
                '[data-testid="UFI2CommentsCount/root"], a[role="button"][aria-label*="Comment"], a[role="button"][aria-label*="תגובה"]'
            );
            
            for (const btn of commentButtons) {
                btn.click();
                await delay(1000);
                
                // Try to find comment box again
                for (const selector of commentBoxSelectors) {
                    commentBox = postElement.querySelector(selector);
                    if (commentBox) break;
                }
                if (commentBox) break;
            }
        }

        if (commentBox) {
            // Focus and add comment
            commentBox.focus();
            await delay(500);
            
            // Type comment - handle both textarea and contenteditable
            if (commentBox.tagName === 'TEXTAREA') {
                commentBox.value = response.comment;
                commentBox.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                commentBox.textContent = response.comment;
                commentBox.innerHTML = response.comment;
                commentBox.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            // Trigger change event
            commentBox.dispatchEvent(new Event('change', { bubbles: true }));
            
            await delay(1000);

            // Find and click submit button
            const submitSelectors = [
                'button[type="submit"]',
                '[data-testid="UFI2CommentsCount/root"] + * button',
                'button[aria-label*="Post"]',
                'button[aria-label*="פרסם"]',
                '.UFICommentActions button'
            ];

            let submitButton = null;
            const commentContainer = commentBox.closest('[data-testid*="comment"], .UFIAddComment, [role="article"]');
            
            for (const selector of submitSelectors) {
                submitButton = (commentContainer || postElement).querySelector(selector);
                if (submitButton && !submitButton.disabled) break;
            }

            if (submitButton) {
                submitButton.click();
                console.log('Posted comment on Facebook:', response.comment);
            }
        }

    } catch (error) {
        console.error('Error auto-commenting:', error);
    }
}

function extractPostContent(postElement) {
    try {
        // Try to find the main post content
        const contentSelectors = [
            '[data-testid="post_message"]',
            '.userContent',
            '[data-ad-preview="message"]',
            '.story_body_container p',
            '[role="article"] p'
        ];

        for (const selector of contentSelectors) {
            const contentElement = postElement.querySelector(selector);
            if (contentElement) {
                return contentElement.textContent?.trim();
            }
        }

        // Try to get text from common Facebook post structures
        const textElements = postElement.querySelectorAll('p, span[dir="auto"]');
        for (const element of textElements) {
            const text = element.textContent?.trim();
            if (text && text.length > 20) {
                return text;
            }
        }

        // Fallback: get all text content
        return postElement.textContent?.trim().substring(0, 500);
    } catch (error) {
        console.error('Error extracting post content:', error);
        return '';
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Setup intersection observer to detect when user is viewing a post
function setupPostViewingDetection() {
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }

    intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.7) {
                handlePostInView(entry.target);
            }
        });
    }, {
        threshold: [0.7],
        rootMargin: '-50px 0px -50px 0px'
    });

    observeCurrentPosts();
}

function observeCurrentPosts() {
    const posts = document.querySelectorAll('[data-pagelet="FeedUnit"], [role="article"], [data-testid="fbfeed_story"]');
    posts.forEach(post => {
        intersectionObserver.observe(post);
    });
}

function handlePostInView(postElement) {
    if (viewingTimer) {
        clearTimeout(viewingTimer);
    }

    viewingTimer = setTimeout(() => {
        if (currentlyViewingPost !== postElement) {
            currentlyViewingPost = postElement;
            console.log('User is focusing on a Facebook post');
            processPostWithFocus(postElement);
        }
    }, 3000);
}

async function processPostWithFocus(postElement) {
    try {
        const postId = getPostId(postElement);
        if (!postId) return;

        console.log('Processing focused Facebook post:', postId);

        const currentTime = Date.now();
        const timeSinceLastAction = currentTime - lastActionTime;
        const minDelay = 15000;
        
        if (timeSinceLastAction < minDelay) {
            const waitTime = minDelay - timeSinceLastAction;
            console.log(`Waiting ${waitTime}ms before next action`);
            await delay(waitTime);
        }

        if (settings.autoLike && !processedPosts.has(postId + '_liked')) {
            await autoLike(postElement);
            processedPosts.add(postId + '_liked');
            lastActionTime = Date.now();
        }

        if (settings.autoComment && !processedPosts.has(postId + '_commented')) {
            await precommentPost(postElement);
            processedPosts.add(postId + '_commented');
        }

    } catch (error) {
        console.error('Error processing focused Facebook post:', error);
    }
}

async function precommentPost(postElement) {
    try {
        const postContent = extractPostContent(postElement);
        if (!postContent) return;

        console.log('Generating comment for Facebook post:', postContent.substring(0, 100));

        const response = await chrome.runtime.sendMessage({
            action: 'generateComment',
            postContent: postContent,
            commentStyle: settings.commentStyle
        });

        if (!response.success) {
            console.error('Failed to generate comment:', response.error);
            return;
        }

        console.log('Generated Facebook comment:', response.comment);

        let commentBox = await findOrOpenCommentBox(postElement);
        
        if (commentBox) {
            fillCommentBox(commentBox, response.comment);
            highlightCommentBox(commentBox);
        }

    } catch (error) {
        console.error('Error pre-commenting Facebook post:', error);
    }
}

async function findOrOpenCommentBox(postElement) {
    const commentBoxSelectors = [
        '[data-testid="ufi_comment_composer"] textarea',
        '[data-testid="ufi_comment_composer"] [contenteditable="true"]',
        '.UFIAddCommentInput textarea',
        '.UFIAddCommentInput [contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]'
    ];

    let commentBox = null;
    for (const selector of commentBoxSelectors) {
        commentBox = postElement.querySelector(selector);
        if (commentBox) break;
    }

    if (!commentBox) {
        const commentButtons = postElement.querySelectorAll(
            '[data-testid="UFI2CommentsCount/root"], a[role="button"][aria-label*="Comment"], a[role="button"][aria-label*="תגובה"]'
        );
        
        for (const btn of commentButtons) {
            btn.click();
            await delay(1000);
            
            for (const selector of commentBoxSelectors) {
                commentBox = postElement.querySelector(selector);
                if (commentBox) break;
            }
            if (commentBox) break;
        }
    }

    return commentBox;
}

function fillCommentBox(commentBox, comment) {
    commentBox.focus();
    
    if (commentBox.tagName === 'TEXTAREA') {
        commentBox.value = comment;
        commentBox.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        commentBox.textContent = comment;
        commentBox.innerHTML = comment;
        commentBox.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    commentBox.dispatchEvent(new Event('change', { bubbles: true }));
    commentBox.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    
    // Force Facebook to recognize content and show send button
    setTimeout(() => {
        commentBox.dispatchEvent(new Event('focus', { bubbles: true }));
        commentBox.dispatchEvent(new Event('blur', { bubbles: true }));
        commentBox.dispatchEvent(new Event('focus', { bubbles: true }));
        
        // Try to find and enable the submit button
        const parentForm = commentBox.closest('[data-testid="ufi_comment_composer"], .UFIAddComment');
        if (parentForm) {
            const submitButtons = parentForm.querySelectorAll('button[type="submit"], button[data-testid*="comment_submit"]');
            submitButtons.forEach(btn => {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
            });
        }
    }, 500);
}

function highlightCommentBox(commentBox) {
    commentBox.style.backgroundColor = '#e8f5e8';
    commentBox.style.border = '2px solid #4CAF50';
    
    const indicator = document.createElement('div');
    indicator.textContent = '🤖 AI Generated Comment - Ready to Send!';
    indicator.style.cssText = `
        position: absolute;
        top: -30px;
        left: 0;
        background: #4CAF50;
        color: white;
        padding: 4px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: bold;
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    
    const container = commentBox.closest('[data-testid*="comment"], .UFIAddComment, [role="article"]') || commentBox.parentElement;
    if (container) {
        container.style.position = 'relative';
        container.appendChild(indicator);
        
        setTimeout(() => {
            if (indicator.parentElement) {
                indicator.remove();
            }
            commentBox.style.backgroundColor = '';
            commentBox.style.border = '';
        }, 8000);
    }
}

// Add event listeners for reply-to-comment functionality
function setupReplyToCommentListeners() {
    // Listen for clicks on existing comments to generate replies
    document.addEventListener('click', async (event) => {
        const target = event.target;
        
        // Check if clicked element is within a comment
        const commentElement = target.closest('[data-testid*="comment"], .UFIComment, [role="article"] [data-sigil="comment"]');
        if (!commentElement) return;
        
        // Check if it's a reply button click
        const isReplyButton = target.matches('button[aria-label*="Reply"], button[aria-label*="תשובה"], [data-testid*="reply"]') ||
                             target.closest('button[aria-label*="Reply"], button[aria-label*="תשובה"], [data-testid*="reply"]');
        
        if (isReplyButton && settings.autoComment) {
            console.log('Reply button clicked on Facebook, generating AI reply...');
            await generateReplyToComment(commentElement);
        }
    });
}

async function generateReplyToComment(commentElement) {
    try {
        // Extract the comment text we're replying to
        const commentText = extractCommentContent(commentElement);
        if (!commentText) return;
        
        // Find the main post content for context
        const mainPost = commentElement.closest('[data-pagelet="FeedUnit"], [role="article"], [data-testid="fbfeed_story"]');
        const postContent = mainPost ? extractPostContent(mainPost) : '';
        
        console.log('Generating reply to Facebook comment:', commentText.substring(0, 100));
        
        // Generate reply using background script
        const response = await chrome.runtime.sendMessage({
            action: 'generateReply',
            commentText: commentText,
            postContent: postContent,
            commentStyle: settings.commentStyle || 'professional'
        });

        if (!response.success) {
            console.error('Failed to generate reply:', response.error);
            return;
        }

        console.log('Generated Facebook reply:', response.comment);
        
        // Wait a moment for Facebook to open the reply box
        await delay(1000);
        
        // Find the reply comment box that appeared
        const replyBox = await findReplyCommentBox(commentElement);
        
        if (replyBox) {
            fillCommentBox(replyBox, response.comment);
            highlightCommentBox(replyBox);
        }

    } catch (error) {
        console.error('Error generating reply to Facebook comment:', error);
    }
}

function extractCommentContent(commentElement) {
    try {
        // Try different selectors for comment text on Facebook
        const textSelectors = [
            '[data-testid*="comment"] span',
            '.UFICommentBody',
            '.UFICommentContent',
            '[data-sigil="comment-body"]',
            '.userContent'
        ];
        
        for (const selector of textSelectors) {
            const textElement = commentElement.querySelector(selector);
            if (textElement && textElement.textContent.trim()) {
                return textElement.textContent.trim();
            }
        }
        
        // Fallback: get all text content but filter out UI elements
        const allText = commentElement.textContent || '';
        return allText.replace(/\b(Like|Reply|Delete|Edit|Share|לייק|תשובה|מחק|ערוך|שתף)\b/gi, '').trim();
        
    } catch (error) {
        console.error('Error extracting Facebook comment content:', error);
        return '';
    }
}

async function findReplyCommentBox(commentElement) {
    // Look for reply comment box that appears after clicking reply on Facebook
    const replyBoxSelectors = [
        '[data-testid="ufi_comment_composer"] textarea',
        '[data-testid="ufi_comment_composer"] [contenteditable="true"]',
        '.UFIAddCommentInput textarea',
        '.UFIAddCommentInput [contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]'
    ];
    
    // First check within the comment element itself
    for (const selector of replyBoxSelectors) {
        const replyBox = commentElement.querySelector(selector);
        if (replyBox) return replyBox;
    }
    
    // Then check in the parent container
    const parentContainer = commentElement.closest('[data-testid*="comment"], .UFIComment, [role="article"]');
    if (parentContainer) {
        for (const selector of replyBoxSelectors) {
            const replyBox = parentContainer.querySelector(selector);
            if (replyBox) return replyBox;
        }
    }
    
    return null;
} 