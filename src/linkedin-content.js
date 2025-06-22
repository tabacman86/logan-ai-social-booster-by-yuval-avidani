// LinkedIn Content Script
let settings = {
    autoLike: false,
    autoComment: false,
    commentStyle: 'professional',
    enableLinkedIn: true
};

let processedPosts = new Set();

// Initialize the script
init();

async function init() {
    console.log('LinkedIn Auto Engager initialized');
    
    // Get current settings
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (response) {
        settings = response;
    }
    
    if (settings.enableLinkedIn) {
        startObserving();
    }
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateSettings') {
        settings = request.settings;
        if (settings.enableLinkedIn) {
            startObserving();
        }
    } else if (request.action === 'checkForNewPosts') {
        settings = request.settings;
        if (settings.enableLinkedIn) {
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
    // LinkedIn post selectors (may need updates as LinkedIn changes their HTML)
    const postSelectors = [
        '[data-id^="urn:li:activity"]',
        '.feed-shared-update-v2',
        '.share-update-card',
        '.feed-shared-update-v2__content'
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
        console.log('Processing LinkedIn post:', postId);

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
    const dataId = postElement.getAttribute('data-id');
    if (dataId) return dataId;
    
    // Fallback: use post content hash
    const textContent = postElement.textContent?.trim();
    if (textContent) {
        return btoa(textContent.substring(0, 100)).substring(0, 20);
    }
    
    return null;
}

async function autoLike(postElement) {
    try {
        // LinkedIn like button selectors
        const likeSelectors = [
            'button[aria-label*="Like"]',
            'button[aria-label*="לייק"]',
            'button[data-control-name="like"]',
            '.react-button__trigger',
            '.social-actions-button[data-control-name="like"]'
        ];

        let likeButton = null;
        for (const selector of likeSelectors) {
            likeButton = postElement.querySelector(selector);
            if (likeButton) break;
        }

        if (likeButton && !likeButton.classList.contains('react-button__trigger--active')) {
            // Check if already liked
            const ariaPressed = likeButton.getAttribute('aria-pressed');
            if (ariaPressed === 'true') return;

            likeButton.click();
            console.log('Liked LinkedIn post');
            
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

        // Find comment box
        const commentBoxSelectors = [
            '.comments-comment-box__form textarea',
            '.comments-comment-texteditor',
            'div[role="textbox"]',
            '.ql-editor'
        ];

        let commentBox = null;
        for (const selector of commentBoxSelectors) {
            commentBox = postElement.querySelector(selector);
            if (commentBox) break;
        }

        // If no comment box found, try to click "Comment" button first
        if (!commentBox) {
            const commentButtons = postElement.querySelectorAll('button[aria-label*="Comment"], button[aria-label*="תגובה"]');
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
            
            // Type comment
            commentBox.textContent = response.comment;
            commentBox.innerHTML = response.comment;
            
            // Trigger input events
            commentBox.dispatchEvent(new Event('input', { bubbles: true }));
            commentBox.dispatchEvent(new Event('change', { bubbles: true }));
            
            await delay(1000);

            // Find and click submit button
            const submitSelectors = [
                'button[data-control-name="comment.post"]',
                'button[type="submit"]',
                '.comments-comment-box__submit-button',
                'button:contains("Post")',
                'button:contains("פרסם")'
            ];

            let submitButton = null;
            for (const selector of submitSelectors) {
                submitButton = postElement.querySelector(selector);
                if (submitButton && !submitButton.disabled) break;
            }

            if (submitButton) {
                submitButton.click();
                console.log('Posted comment on LinkedIn:', response.comment);
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
            '.feed-shared-text',
            '.feed-shared-update-v2__description',
            '.share-update-card__update-text',
            '.feed-shared-text__text-view'
        ];

        for (const selector of contentSelectors) {
            const contentElement = postElement.querySelector(selector);
            if (contentElement) {
                return contentElement.textContent?.trim();
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