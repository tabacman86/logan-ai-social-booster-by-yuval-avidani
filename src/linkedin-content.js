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
        setupReplyToCommentListeners();
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
            await delay(1500);
            
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
    console.log('Filling comment box with:', comment);
    
    // Focus the comment box first
    commentBox.focus();
    commentBox.click();
    
    // Clear existing content
    if (commentBox.tagName === 'TEXTAREA') {
        commentBox.value = '';
        commentBox.value = comment;
    } else {
        commentBox.textContent = '';
        commentBox.innerHTML = '';
        commentBox.textContent = comment;
        commentBox.innerHTML = comment;
    }
    
    // Trigger multiple events to ensure LinkedIn recognizes the input
    const events = [
        new Event('input', { bubbles: true }),
        new Event('change', { bubbles: true }),
        new KeyboardEvent('keydown', { bubbles: true, key: 'a' }),
        new KeyboardEvent('keyup', { bubbles: true, key: 'a' }),
        new Event('paste', { bubbles: true }),
        new InputEvent('input', { bubbles: true, inputType: 'insertText', data: comment })
    ];
    
    events.forEach(event => commentBox.dispatchEvent(event));
    
    // Force LinkedIn to recognize content and show submit button
    setTimeout(() => {
        // Trigger more events
        commentBox.dispatchEvent(new Event('focus', { bubbles: true }));
        commentBox.dispatchEvent(new Event('blur', { bubbles: true }));
        commentBox.dispatchEvent(new Event('focus', { bubbles: true }));
        
        // Look for submit buttons with updated selectors
        const submitButtonSelectors = [
            'button[data-control-name="comment_submit"]',
            'button[type="submit"]',
            '.comments-comment-box__submit-button',
            '.comments-comment-box-comment__cta-container button',
            'button[aria-label*="Post"], button[aria-label*="פרסם"]',
            'button.comments-comment-box__submit-button--cr',
            'button.comments-comment-box-comment__form-controls button[type="submit"]'
        ];
        
        const parentContainer = commentBox.closest('.comments-comment-box, .comments-comment-box__form, .artdeco-card') || 
                               commentBox.parentElement.closest('.comments-comment-box, .comments-comment-box__form');
        
        if (parentContainer) {
            console.log('Looking for submit buttons in:', parentContainer);
            
            submitButtonSelectors.forEach(selector => {
                const buttons = parentContainer.querySelectorAll(selector);
                buttons.forEach(btn => {
                    console.log('Found potential submit button:', btn);
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.pointerEvents = 'auto';
                    btn.style.display = 'block';
                    btn.style.visibility = 'visible';
                    
                    // Try to trigger the button to appear
                    btn.click();
                    setTimeout(() => btn.focus(), 100);
                });
            });
            
            // Force create submit button if not found
            const existingSubmitBtn = parentContainer.querySelector('button[data-control-name="comment_submit"], button[type="submit"]');
            if (!existingSubmitBtn) {
                console.log('Creating submit button manually');
                createSubmitButton(parentContainer, commentBox);
            }
        }
        
        // Try to trigger LinkedIn's internal validation
        if (commentBox.tagName !== 'TEXTAREA') {
            commentBox.setAttribute('data-artdeco-is-focused', 'true');
        }
        
    }, 300);
    
    // Additional attempt after longer delay
    setTimeout(() => {
        const submitButton = commentBox.closest('.comments-comment-box, .comments-comment-box__form')
                           ?.querySelector('button[data-control-name="comment_submit"], button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.style.opacity = '1';
            submitButton.style.display = 'block';
            console.log('Submit button enabled:', submitButton);
        }
    }, 1000);
}

function createSubmitButton(container, commentBox) {
    // Create a submit button if LinkedIn doesn't show one
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Post';
    submitBtn.type = 'submit';
    submitBtn.style.cssText = `
        background: #0073b1;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        margin-left: 8px;
        cursor: pointer;
        font-weight: bold;
    `;
    
    submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Try to find and trigger LinkedIn's real submit mechanism
        const realSubmitBtn = container.querySelector('button[data-control-name="comment_submit"]');
        if (realSubmitBtn) {
            realSubmitBtn.click();
        } else {
            // Fallback: trigger form submission
            const form = commentBox.closest('form');
            if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true }));
            }
        }
    });
    
    // Add the button near the comment box
    const buttonContainer = container.querySelector('.comments-comment-box__submit-button') || 
                           container.querySelector('.comments-comment-box-comment__cta-container') ||
                           commentBox.parentElement;
    
    if (buttonContainer) {
        buttonContainer.appendChild(submitBtn);
    }
}

function highlightCommentBox(commentBox) {
    // Add visual indication that comment is AI-generated
    commentBox.style.backgroundColor = '#e8f5e8';
    commentBox.style.border = '2px solid #4CAF50';
    
    // Add a small indicator
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
    
    const container = commentBox.closest('.comments-comment-box__form') || commentBox.parentElement;
    if (container) {
        container.style.position = 'relative';
        container.appendChild(indicator);
        
        // Remove indicator after 8 seconds
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
    console.log('Setting up reply to comment listeners');
    
    // Listen for clicks on existing comments to generate replies
    document.addEventListener('click', async (event) => {
        const target = event.target;
        console.log('Click detected on:', target);
        
        // Check if clicked element is within a comment
        const commentElement = target.closest(
            '.comments-comment-item, .comment, [data-test-id="comment"], ' +
            '.comments-comment-item-content-body, .comments-comment-item__main-content, ' +
            '.feed-shared-comment, .comments-comment-item__content'
        );
        
        if (!commentElement) {
            console.log('Not within a comment element');
            return;
        }
        
        console.log('Found comment element:', commentElement);
        
        // Check if it's a reply button click - with more specific selectors
        const isReplyButton = target.matches(
            'button[aria-label*="Reply"], button[aria-label*="תשובה"], .reply-button, ' +
            'button.comments-comment-item__reply-button, ' +
            'button[data-control-name="reply"], ' +
            'button[data-control-name="comment_reply"]'
        ) || target.closest(
            'button[aria-label*="Reply"], button[aria-label*="תשובה"], .reply-button, ' +
            'button.comments-comment-item__reply-button, ' +
            'button[data-control-name="reply"], ' +
            'button[data-control-name="comment_reply"]'
        );
        
        if (isReplyButton && settings.autoComment) {
            console.log('Reply button clicked, generating AI reply...');
            event.preventDefault();
            event.stopPropagation();
            
            // Wait a moment for the reply box to appear
            setTimeout(async () => {
                await generateReplyToComment(commentElement);
            }, 500);
        } else {
            console.log('Not a reply button click');
        }
    }, true); // Use capture phase to catch events early
}

async function generateReplyToComment(commentElement) {
    try {
        // Extract the comment text we're replying to
        const commentText = extractCommentContent(commentElement);
        if (!commentText) return;
        
        // Find the main post content for context
        const mainPost = commentElement.closest('[data-id^="urn:li:activity"], .feed-shared-update-v2');
        const postContent = mainPost ? extractPostContent(mainPost) : '';
        
        console.log('Generating reply to comment:', commentText.substring(0, 100));
        
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

        console.log('Generated reply:', response.comment);
        
        // Wait a moment for LinkedIn to open the reply box
        await delay(1000);
        
        // Find the reply comment box that appeared
        const replyBox = await findReplyCommentBox(commentElement);
        
        if (replyBox) {
            fillCommentBox(replyBox, response.comment);
            highlightCommentBox(replyBox);
        }

    } catch (error) {
        console.error('Error generating reply to comment:', error);
    }
}

function extractCommentContent(commentElement) {
    try {
        console.log('Extracting content from comment element:', commentElement);
        
        // Try different selectors for comment text with updated LinkedIn structure
        const textSelectors = [
            '.comments-comment-item__main-content',
            '.comments-comment-item-content-body',
            '.comments-comment-item__content .feed-shared-text',
            '.feed-shared-text',
            '.comment-text',
            '.comment-content',
            '.comments-comment-item__content',
            '[data-test-id="comment-text"]'
        ];
        
        for (const selector of textSelectors) {
            const textElement = commentElement.querySelector(selector);
            if (textElement && textElement.textContent.trim()) {
                const content = textElement.textContent.trim();
                console.log('Found comment content with selector', selector, ':', content);
                return content;
            }
        }
        
        // Fallback: get all text content but filter out UI elements
        const allText = commentElement.textContent || '';
        const filtered = allText.replace(/\b(Like|Reply|Delete|Edit|Share|לייק|תשובה|מחק|ערוך|שתף|Show translation|פשוט מעולה)\b/gi, '').trim();
        console.log('Fallback comment content:', filtered);
        return filtered;
        
    } catch (error) {
        console.error('Error extracting comment content:', error);
        return '';
    }
}

async function findReplyCommentBox(commentElement) {
    console.log('Looking for reply comment box in:', commentElement);
    
    // Look for reply comment box that appears after clicking reply
    const replyBoxSelectors = [
        '.comments-comment-box__form textarea',
        '.comments-comment-texteditor',
        'div[role="textbox"]',
        '.ql-editor',
        'textarea[placeholder*="Add a comment"]',
        'textarea[placeholder*="הוסף תגובה"]',
        '.comments-comment-box-comment__form-controls textarea',
        '[data-test-id="comment-texteditor"]'
    ];
    
    // First check within the comment element itself
    for (const selector of replyBoxSelectors) {
        const replyBox = commentElement.querySelector(selector);
        if (replyBox) {
            console.log('Found reply box within comment:', replyBox);
            return replyBox;
        }
    }
    
    // Then check in the parent container and siblings
    const parentContainer = commentElement.closest('.comments-comment-item, .comment-thread, .feed-shared-update-v2');
    if (parentContainer) {
        console.log('Searching in parent container:', parentContainer);
        
        for (const selector of replyBoxSelectors) {
            const replyBox = parentContainer.querySelector(selector);
            if (replyBox) {
                console.log('Found reply box in parent container:', replyBox);
                return replyBox;
            }
        }
        
        // Check next sibling elements (reply box might appear after the comment)
        let nextElement = commentElement.nextElementSibling;
        while (nextElement) {
            for (const selector of replyBoxSelectors) {
                const replyBox = nextElement.querySelector(selector);
                if (replyBox) {
                    console.log('Found reply box in sibling element:', replyBox);
                    return replyBox;
                }
            }
            nextElement = nextElement.nextElementSibling;
        }
    }
    
    // Last resort: check the entire document for recently appeared comment boxes
    const recentBoxes = document.querySelectorAll('.comments-comment-box__form textarea, div[role="textbox"]');
    if (recentBoxes.length > 0) {
        const lastBox = recentBoxes[recentBoxes.length - 1];
        console.log('Using most recent comment box as fallback:', lastBox);
        return lastBox;
    }
    
    console.log('No reply comment box found');
    return null;
} 