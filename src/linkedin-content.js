// LinkedIn Content Script
let settings = {
    autoLike: false,
    autoComment: false,
    commentStyle: 'professional',
    enableLinkedIn: true
};

let processedPosts = new Set();
let lastActionTime = 0;
let currentlyViewingPost = null;
let viewingTimer = null;
let intersectionObserver = null;

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
        setupPostViewingDetection();
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
                        // Add new posts to intersection observer
                        const newPosts = node.querySelectorAll ? 
                            node.querySelectorAll('[data-id^="urn:li:activity"], .feed-shared-update-v2') : [];
                        newPosts.forEach(post => {
                            if (intersectionObserver) {
                                intersectionObserver.observe(post);
                            }
                        });
                        
                        // Also check if the node itself is a post
                        if (node.matches && node.matches('[data-id^="urn:li:activity"], .feed-shared-update-v2')) {
                            if (intersectionObserver) {
                                intersectionObserver.observe(node);
                            }
                        }
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
            postText: postContent,
            commentStyle: settings.commentStyle || 'professional'
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

// Setup intersection observer to detect when user is viewing a post
function setupPostViewingDetection() {
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }

    intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.7) {
                // User is viewing this post
                handlePostInView(entry.target);
            }
        });
    }, {
        threshold: [0.7], // Trigger when 70% of post is visible
        rootMargin: '-50px 0px -50px 0px' // Margin to ensure post is well in view
    });

    // Observe existing posts
    observeCurrentPosts();
}

function observeCurrentPosts() {
    const posts = document.querySelectorAll('[data-id^="urn:li:activity"], .feed-shared-update-v2');
    posts.forEach(post => {
        intersectionObserver.observe(post);
    });
}

function handlePostInView(postElement) {
    // Clear any existing timer
    if (viewingTimer) {
        clearTimeout(viewingTimer);
    }

    // Set a timer - if user stays on post for 3 seconds, consider it "focused"
    viewingTimer = setTimeout(() => {
        if (currentlyViewingPost !== postElement) {
            currentlyViewingPost = postElement;
            console.log('User is focusing on a post');
            
            // Process this post with higher priority
            processPostWithFocus(postElement);
        }
    }, 3000); // 3 seconds viewing time
}

async function processPostWithFocus(postElement) {
    try {
        const postId = getPostId(postElement);
        if (!postId) return;

        console.log('Processing focused post:', postId);

        // Check if enough time has passed since last action (human-like delay)
        const currentTime = Date.now();
        const timeSinceLastAction = currentTime - lastActionTime;
        const minDelay = 15000; // Minimum 15 seconds between actions
        
        if (timeSinceLastAction < minDelay) {
            const waitTime = minDelay - timeSinceLastAction;
            console.log(`Waiting ${waitTime}ms before next action`);
            await delay(waitTime);
        }

        // Auto-like if enabled
        if (settings.autoLike && !processedPosts.has(postId + '_liked')) {
            await autoLike(postElement);
            processedPosts.add(postId + '_liked');
            lastActionTime = Date.now();
        }

        // Pre-fill comment if enabled
        if (settings.autoComment && !processedPosts.has(postId + '_commented')) {
            await precommentPost(postElement);
            processedPosts.add(postId + '_commented');
        }

    } catch (error) {
        console.error('Error processing focused post:', error);
    }
}

async function precommentPost(postElement) {
    try {
        // Get post content for generating comment
        const postContent = extractPostContent(postElement);
        if (!postContent) return;

        console.log('Generating comment for post:', postContent.substring(0, 100));

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

        console.log('Generated comment:', response.comment);

        // Find or open comment box
        let commentBox = await findOrOpenCommentBox(postElement);
        
        if (commentBox) {
            // Pre-fill the comment box (don't submit)
            fillCommentBox(commentBox, response.comment);
            
            // Add visual indication that comment is ready
            highlightCommentBox(commentBox);
        }

    } catch (error) {
        console.error('Error pre-commenting:', error);
    }
}

async function findOrOpenCommentBox(postElement) {
    // Try to find existing comment box
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

    // If no comment box found, try to click "Comment" button
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

    return commentBox;
}

function fillCommentBox(commentBox, comment) {
    // Focus the comment box
    commentBox.focus();
    
    // Clear existing content
    commentBox.textContent = '';
    commentBox.innerHTML = '';
    
    // Add the generated comment
    if (commentBox.tagName === 'TEXTAREA') {
        commentBox.value = comment;
    } else {
        commentBox.textContent = comment;
        commentBox.innerHTML = comment;
    }
    
    // Trigger input events
    commentBox.dispatchEvent(new Event('input', { bubbles: true }));
    commentBox.dispatchEvent(new Event('change', { bubbles: true }));
}

function highlightCommentBox(commentBox) {
    // Add visual indication that comment is AI-generated
    commentBox.style.backgroundColor = '#e8f5e8';
    commentBox.style.border = '2px solid #4CAF50';
    
    // Add a small indicator
    const indicator = document.createElement('div');
    indicator.textContent = '🤖 AI Generated Comment';
    indicator.style.cssText = `
        position: absolute;
        top: -25px;
        left: 0;
        background: #4CAF50;
        color: white;
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 11px;
        z-index: 1000;
    `;
    
    const container = commentBox.closest('.comments-comment-box__form') || commentBox.parentElement;
    if (container) {
        container.style.position = 'relative';
        container.appendChild(indicator);
        
        // Remove indicator after 5 seconds
        setTimeout(() => {
            if (indicator.parentElement) {
                indicator.remove();
            }
            commentBox.style.backgroundColor = '';
            commentBox.style.border = '';
        }, 5000);
    }
} 