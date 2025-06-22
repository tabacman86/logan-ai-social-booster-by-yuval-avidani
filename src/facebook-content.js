// Facebook Content Script
let settings = {
    autoLike: false,
    autoComment: false,
    commentStyle: 'professional',
    enableFacebook: true
};

let processedPosts = new Set();

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
            postContent: postContent,
            commentStyle: settings.commentStyle
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