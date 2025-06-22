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

async function followLinkedInInteractionSequence(commentBox, comment) {
    console.log('Following LinkedIn interaction sequence...');
    
    try {
        // Step 1: Focus on the comment box (simulate user click)
        console.log('Step 1: Focusing on comment box');
        commentBox.focus();
        commentBox.click();
        
        // Wait for LinkedIn to register the focus
        await delay(300);
        
        // Step 2: Clear any existing content
        console.log('Step 2: Clearing existing content');
        commentBox.innerHTML = '';
        commentBox.value = '';
        commentBox.textContent = '';
        
        // Step 3: Simulate typing the comment character by character (key sequence)
        console.log('Step 3: Simulating typing sequence');
        
        // First, simulate a single character to trigger LinkedIn's validation
        const firstChar = comment.charAt(0) || 'a';
        
        // Create safe keyboard events
        try {
            // Simulate keydown for first character
            const keydownEvent = new KeyboardEvent('keydown', {
                key: firstChar,
                bubbles: true,
                cancelable: true
            });
            commentBox.dispatchEvent(keydownEvent);
        } catch (e) {
            console.log('KeyboardEvent creation failed, using fallback');
        }
        
        // Add the first character
        if (commentBox.tagName === 'TEXTAREA' || commentBox.tagName === 'INPUT') {
            commentBox.value = firstChar;
        } else {
            commentBox.textContent = firstChar;
            commentBox.innerHTML = firstChar;
        }
        
        // Trigger input event for first character
        try {
            const inputEvent1 = new InputEvent('input', {
                data: firstChar,
                inputType: 'insertText',
                bubbles: true
            });
            commentBox.dispatchEvent(inputEvent1);
        } catch (e) {
            // Fallback to basic Event
            const inputEvent = new Event('input', { bubbles: true });
            commentBox.dispatchEvent(inputEvent);
        }
        
        // Simulate keyup for first character
        try {
            const keyupEvent = new KeyboardEvent('keyup', {
                key: firstChar,
                bubbles: true,
                cancelable: true
            });
            commentBox.dispatchEvent(keyupEvent);
        } catch (e) {
            console.log('KeyboardEvent keyup creation failed');
        }
        
        // Wait for LinkedIn to process the first character
        await delay(200);
        
        // Step 4: Add the rest of the comment
        console.log('Step 4: Adding full comment');
        if (commentBox.tagName === 'TEXTAREA' || commentBox.tagName === 'INPUT') {
            commentBox.value = comment;
        } else {
            commentBox.textContent = comment;
            commentBox.innerHTML = comment.replace(/\n/g, '<br>');
        }
        
        // Trigger comprehensive input events
        try {
            const inputEvent2 = new InputEvent('input', {
                data: comment,
                inputType: 'insertText',
                bubbles: true
            });
            commentBox.dispatchEvent(inputEvent2);
        } catch (e) {
            // Fallback to basic Event
            const inputEvent = new Event('input', { bubbles: true });
            commentBox.dispatchEvent(inputEvent);
        }
        
        // Additional events that LinkedIn might listen for
        ['input', 'change', 'blur', 'focus'].forEach(eventType => {
            try {
                const event = new Event(eventType, { bubbles: true });
                commentBox.dispatchEvent(event);
            } catch (e) {
                console.log(`Failed to dispatch ${eventType} event`);
            }
        });
        
        // Step 5: Wait for LinkedIn to validate and show submit button
        console.log('Step 5: Waiting for LinkedIn validation');
        await delay(500);
        
        // Step 6: Look for and activate submit button
        console.log('Step 6: Looking for submit button');
        const parentContainer = commentBox.closest('.comments-comment-box, .comments-comment-box__form, .artdeco-card') || 
                               commentBox.parentElement.closest('.comments-comment-box, .comments-comment-box__form');
        
        if (parentContainer) {
            const submitButtonSelectors = [
                'button[data-control-name="comment_submit"]',
                'button[type="submit"]',
                'button[aria-label*="Post"]',
                'button[aria-label*="פרסם"]',
                '.comments-comment-box__submit-button button:not([disabled])',
                '.comments-comment-box-comment__cta-container button:not([disabled])'
            ];
            
            let submitButton = null;
            
            // Try to find an enabled submit button
            for (const selector of submitButtonSelectors) {
                const buttons = parentContainer.querySelectorAll(selector);
                for (const btn of buttons) {
                    if (!btn.disabled && (btn.textContent.includes('Post') || btn.textContent.includes('פרסם') || btn.getAttribute('aria-label')?.includes('Post'))) {
                        submitButton = btn;
                        break;
                    }
                }
                if (submitButton) break;
            }
            
            if (submitButton) {
                console.log('Found active submit button:', submitButton);
                // Make sure it's visible and enabled
                submitButton.disabled = false;
                submitButton.style.opacity = '1';
                submitButton.style.pointerEvents = 'auto';
                submitButton.style.display = 'block';
                submitButton.style.visibility = 'visible';
            } else {
                console.log('No active submit button found, creating custom one...');
                createLinkedInSubmitButton(parentContainer, commentBox);
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('Error in LinkedIn interaction sequence:', error);
        throw error;
    }
}

function fillCommentBox(commentBox, comment) {
    console.log('Filling comment box with:', comment.substring(0, 50));
    
    // Show editable comment interface first
    showEditableCommentInterface(commentBox, comment);
    
    // Follow the proper LinkedIn interaction sequence
    followLinkedInInteractionSequence(commentBox, comment).catch(error => {
        console.error('Error in LinkedIn interaction sequence:', error);
        
        // Fallback to old method if sequence fails
        if (commentBox.tagName === 'TEXTAREA' || commentBox.tagName === 'INPUT') {
            commentBox.value = comment;
        } else {
            commentBox.innerHTML = comment.replace(/\n/g, '<br>');
            commentBox.textContent = comment;
        }
        
        ['input', 'keydown', 'keyup'].forEach(eventType => {
            commentBox.dispatchEvent(new Event(eventType, { bubbles: true }));
        });
        
        commentBox.focus();
    });
}

function showEditableCommentInterface(commentBox, originalComment) {
    // Remove any existing interface
    const existingInterface = commentBox.parentElement.querySelector('.ai-comment-interface');
    if (existingInterface) {
        existingInterface.remove();
    }
    
    // Create editable interface
    const interfaceContainer = document.createElement('div');
    interfaceContainer.className = 'ai-comment-interface';
    interfaceContainer.style.cssText = `
        position: absolute;
        top: -120px;
        left: 0;
        right: 0;
        background: white;
        border: 2px solid #4CAF50;
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    interfaceContainer.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 14px; font-weight: bold; color: #4CAF50;">🤖 AI Generated Comment</span>
            <button id="regenerateBtn" style="margin-left: auto; background: #2196F3; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">🔄 Generate New</button>
        </div>
        <textarea id="editableComment" style="width: 100%; height: 60px; border: 1px solid #ddd; border-radius: 4px; padding: 8px; font-size: 14px; resize: vertical;" placeholder="Edit your comment...">${originalComment}</textarea>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button id="useCommentBtn" style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">✓ Use Comment</button>
            <button id="cancelCommentBtn" style="background: #f44336; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">✗ Cancel</button>
        </div>
    `;
    
    // Position the interface
    const container = commentBox.closest('.comments-comment-box__form') || commentBox.parentElement;
    container.style.position = 'relative';
    container.appendChild(interfaceContainer);
    
    // Add event listeners
    const editableTextarea = interfaceContainer.querySelector('#editableComment');
    const useBtn = interfaceContainer.querySelector('#useCommentBtn');
    const cancelBtn = interfaceContainer.querySelector('#cancelCommentBtn');
    const regenerateBtn = interfaceContainer.querySelector('#regenerateBtn');
    
    useBtn.addEventListener('click', () => {
        const editedComment = editableTextarea.value.trim();
        if (editedComment) {
            // Update the comment box with edited content
            if (commentBox.tagName === 'TEXTAREA' || commentBox.tagName === 'INPUT') {
                commentBox.value = editedComment;
            } else {
                commentBox.innerHTML = editedComment.replace(/\n/g, '<br>');
                commentBox.textContent = editedComment;
            }
            
            // Trigger events
            ['input', 'keydown', 'keyup'].forEach(eventType => {
                commentBox.dispatchEvent(new Event(eventType, { bubbles: true }));
            });
            
            // Remove interface and highlight
            interfaceContainer.remove();
            highlightCommentBox(commentBox);
        }
    });
    
    cancelBtn.addEventListener('click', () => {
        // Clear comment box
        commentBox.value = '';
        commentBox.innerHTML = '';
        commentBox.textContent = '';
        interfaceContainer.remove();
    });
    
    regenerateBtn.addEventListener('click', async () => {
        regenerateBtn.disabled = true;
        regenerateBtn.textContent = '🔄 Generating...';
        
        try {
            // Get context for regeneration
            const postElement = commentBox.closest('[data-id^="urn:li:activity"], .feed-shared-update-v2');
            const postContent = postElement ? extractPostContent(postElement) : '';
            
            const response = await chrome.runtime.sendMessage({
                action: 'generateComment',
                postContent: postContent,
                commentStyle: settings.commentStyle || 'professional'
            });
            
            if (response.success) {
                editableTextarea.value = response.comment;
            }
        } catch (error) {
            console.error('Error regenerating comment:', error);
        }
        
        regenerateBtn.disabled = false;
        regenerateBtn.textContent = '🔄 Generate New';
    });
    
    // Auto-focus the editable textarea
    editableTextarea.focus();
    editableTextarea.select();
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
        
        // More comprehensive reply button detection
        const isReplyButton = target.matches(
            'button[aria-label*="Reply"], button[aria-label*="reply"], ' +
            'button[aria-label*="תשובה"], button[aria-label*="הגב"], ' +
            '.reply-button, button.comments-comment-item__reply-button, ' +
            'button[data-control-name="reply"], button[data-control-name="comment_reply"], ' +
            'span[aria-label*="Reply"], span[aria-label*="reply"], ' +
            '.comments-comment-item__inline-show-replies-text, ' +
            '.comments-comment-item__reply-text'
        ) || target.closest(
            'button[aria-label*="Reply"], button[aria-label*="reply"], ' +
            'button[aria-label*="תשובה"], button[aria-label*="הגב"], ' +
            '.reply-button, button.comments-comment-item__reply-button, ' +
            'button[data-control-name="reply"], button[data-control-name="comment_reply"], ' +
            'span[aria-label*="Reply"], span[aria-label*="reply"], ' +
            '.comments-comment-item__inline-show-replies-text, ' +
            '.comments-comment-item__reply-text'
        );

        // Also check if the target text content indicates it's a reply action
        const targetText = target.textContent?.toLowerCase() || '';
        const isReplyText = targetText.includes('reply') || targetText.includes('תשובה') || targetText.includes('הגב');
        
        if ((isReplyButton || isReplyText) && settings.autoComment) {
            console.log('Reply action detected, finding comment element...');
            
            // Find the comment element we're replying to
            const commentElement = target.closest(
                '.comments-comment-item, .comment, [data-test-id="comment"], ' +
                '.comments-comment-item-content-body, .comments-comment-item__main-content, ' +
                '.feed-shared-comment, .comments-comment-item__content, ' +
                '.comments-comment-item__content-body-wrapper'
            );
            
            if (commentElement) {
                console.log('Found comment element for reply:', commentElement);
                event.preventDefault();
                event.stopPropagation();
                
                // Wait for the reply box to appear
                setTimeout(async () => {
                    await generateReplyToComment(commentElement);
                }, 800); // Increased delay
            } else {
                console.log('No comment element found for reply');
            }
        }
    }, true); // Use capture phase to catch events early
}

async function generateReplyToComment(commentElement) {
    try {
        // Extract the comment text we're replying to
        const commentText = extractCommentContent(commentElement);
        if (!commentText) {
            console.log('No comment text found to reply to');
            return;
        }
        
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
        
        // Wait longer for LinkedIn to open the reply box
        await delay(1500);
        
        // Find the reply comment box that appeared
        const replyBox = await findReplyCommentBox(commentElement);
        
        if (replyBox) {
            console.log('Found reply box, filling with AI comment');
            fillCommentBox(replyBox, response.comment);
        } else {
            console.log('Could not find reply comment box');
            // Try one more time with a different approach
            setTimeout(async () => {
                const retryReplyBox = await findReplyCommentBox(commentElement);
                if (retryReplyBox) {
                    console.log('Found reply box on retry');
                    fillCommentBox(retryReplyBox, response.comment);
                } else {
                    console.log('Still could not find reply box - showing manual interface');
                    showManualReplyInterface(commentElement, response.comment);
                }
            }, 1000);
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

function showManualReplyInterface(commentElement, replyText) {
    // Create a floating interface for manual reply insertion
    const manualInterface = document.createElement('div');
    manualInterface.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border: 2px solid #4CAF50;
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        z-index: 99999;
        max-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;
    
    manualInterface.innerHTML = `
        <div style="text-align: center; margin-bottom: 16px;">
            <h3 style="color: #4CAF50; margin: 0 0 8px 0;">🤖 AI Reply Generated</h3>
            <p style="color: #666; margin: 0; font-size: 14px;">Click in the reply box, then click "Insert Reply"</p>
        </div>
        <textarea readonly style="width: 100%; height: 80px; border: 1px solid #ddd; border-radius: 4px; padding: 8px; font-size: 14px; background: #f9f9f9;">${replyText}</textarea>
        <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: center;">
            <button id="insertReplyBtn" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold;">📝 Insert Reply</button>
            <button id="copyReplyBtn" style="background: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">📋 Copy</button>
            <button id="closeManualBtn" style="background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer;">✗ Close</button>
        </div>
    `;
    
    document.body.appendChild(manualInterface);
    
    // Add event listeners
    manualInterface.querySelector('#insertReplyBtn').addEventListener('click', () => {
        // Try to find any active text input
        const activeElement = document.activeElement;
        if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT' || activeElement.contentEditable === 'true')) {
            if (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT') {
                activeElement.value = replyText;
            } else {
                activeElement.textContent = replyText;
                activeElement.innerHTML = replyText.replace(/\n/g, '<br>');
            }
            
            // Trigger events
            ['input', 'keydown', 'keyup'].forEach(eventType => {
                activeElement.dispatchEvent(new Event(eventType, { bubbles: true }));
            });
            
            manualInterface.remove();
        } else {
            alert('Please click in the reply text box first, then try again.');
        }
    });
    
    manualInterface.querySelector('#copyReplyBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(replyText).then(() => {
            const btn = manualInterface.querySelector('#copyReplyBtn');
            btn.textContent = '✓ Copied!';
            setTimeout(() => btn.textContent = '📋 Copy', 2000);
        });
    });
    
    manualInterface.querySelector('#closeManualBtn').addEventListener('click', () => {
        manualInterface.remove();
    });
}

function createLinkedInSubmitButton(container, commentBox) {
    // Remove any existing custom submit button
    const existingBtn = container.querySelector('.ai-custom-submit-btn');
    if (existingBtn) {
        existingBtn.remove();
    }
    
    // Create a submit button that looks like LinkedIn's
    const submitBtn = document.createElement('button');
    submitBtn.className = 'ai-custom-submit-btn';
    submitBtn.textContent = 'Post';
    submitBtn.type = 'button'; // Don't use submit to avoid form conflicts
    
    submitBtn.style.cssText = `
        background: #0a66c2;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 16px;
        margin-left: 8px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        transition: background-color 0.15s ease-in-out;
        min-height: 32px;
    `;
    
    // Add hover effect
    submitBtn.addEventListener('mouseenter', () => {
        submitBtn.style.background = '#004182';
    });
    
    submitBtn.addEventListener('mouseleave', () => {
        submitBtn.style.background = '#0a66c2';
    });
    
    submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('Custom submit button clicked, attempting to post comment...');
        
        try {
            // Try multiple approaches to submit the comment
            
            // 1. Look for LinkedIn's real submit button that might have appeared
            const realSubmitBtn = container.querySelector('button[data-control-name="comment_submit"]');
            if (realSubmitBtn) {
                console.log('Found real LinkedIn submit button, clicking it...');
                realSubmitBtn.click();
                return;
            }
            
            // 2. Try to trigger form submission
            const form = commentBox.closest('form');
            if (form) {
                console.log('Triggering form submission...');
                try {
                    form.dispatchEvent(new Event('submit', { bubbles: true }));
                    return;
                } catch (error) {
                    console.log('Form submission failed:', error);
                }
            }
            
            // 3. Try to find and click any button that might submit
            const allButtons = container.querySelectorAll('button');
            for (const btn of allButtons) {
                if (btn !== submitBtn && (
                    btn.textContent.includes('Post') || 
                    btn.textContent.includes('פרסם') ||
                    btn.getAttribute('aria-label')?.includes('Post') ||
                    btn.getAttribute('data-control-name')?.includes('submit')
                )) {
                    console.log('Found potential submit button, clicking:', btn);
                    try {
                        btn.click();
                        return;
                    } catch (error) {
                        console.log('Button click failed:', error);
                    }
                }
            }
            
            // 4. Try keyboard shortcut (Ctrl+Enter)
            console.log('Trying keyboard shortcut Ctrl+Enter...');
            try {
                const ctrlEnterEvent = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    ctrlKey: true,
                    bubbles: true
                });
                commentBox.dispatchEvent(ctrlEnterEvent);
            } catch (error) {
                console.log('Keyboard event failed:', error);
                
                // Fallback: basic Enter key
                try {
                    const enterEvent = new Event('keydown', { bubbles: true });
                    Object.defineProperty(enterEvent, 'key', { value: 'Enter' });
                    Object.defineProperty(enterEvent, 'ctrlKey', { value: true });
                    commentBox.dispatchEvent(enterEvent);
                } catch (fallbackError) {
                    console.log('Fallback keyboard event also failed:', fallbackError);
                }
            }
            
            // 5. Show manual instruction if nothing worked
            setTimeout(() => {
                if (commentBox.value || commentBox.textContent) {
                    alert('Comment is ready! Please click the LinkedIn "Post" button to publish, or press Ctrl+Enter');
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error in submit button click handler:', error);
            alert('Comment is ready! Please click the LinkedIn "Post" button manually to publish.');
        }
    });
    
    // Find the best place to add the button
    const buttonContainer = container.querySelector('.comments-comment-box__submit-button') || 
                           container.querySelector('.comments-comment-box-comment__cta-container') ||
                           container.querySelector('.comments-comment-box__form-controls') ||
                           commentBox.parentElement;
    
    if (buttonContainer) {
        buttonContainer.appendChild(submitBtn);
        console.log('Custom submit button added to:', buttonContainer);
    } else {
        // Fallback: add after the comment box
        commentBox.parentElement.appendChild(submitBtn);
        console.log('Custom submit button added as fallback after comment box');
    }
} 