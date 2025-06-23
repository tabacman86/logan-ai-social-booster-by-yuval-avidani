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
        setupScrollDetection();
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
                        
                        if (newPosts.length > 0) {
                            console.log(`🔍 Found ${newPosts.length} new posts added to feed`);
                        }
                        
                        newPosts.forEach(post => {
                            if (intersectionObserver) {
                                intersectionObserver.observe(post);
                                console.log('👀 Now observing new post:', getPostId(post));
                            }
                        });
                        
                        // Also check if the node itself is a post
                        if (node.matches && node.matches('[data-id^="urn:li:activity"], .feed-shared-update-v2')) {
                            if (intersectionObserver) {
                                intersectionObserver.observe(node);
                                console.log('👀 Now observing new post (direct):', getPostId(node));
                            }
                        }
                    }
                });
            }
        });
    });

    // Start observing with enhanced options
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    console.log('🚀 Started observing for new posts in LinkedIn feed');
}

// Add scroll detection to catch posts that might be missed
function setupScrollDetection() {
    let scrollTimeout;
    
    window.addEventListener('scroll', () => {
        // Clear previous timeout
        clearTimeout(scrollTimeout);
        
        // Wait for scrolling to stop, then check for new posts
        scrollTimeout = setTimeout(() => {
            console.log('📜 Scroll stopped - checking for new posts');
            observeCurrentPosts();
        }, 1000); // Wait 1 second after scroll stops
    });
    
    console.log('📜 Scroll detection setup complete');
}

function checkForNewPosts() {
    // Just observe new posts, don't process them automatically
    observeCurrentPosts();
}

function getPostId(postElement) {
    // Try to get a unique identifier for the post
    const dataId = postElement.getAttribute('data-id');
    if (dataId) return dataId;
    
    // Fallback: use post content hash (safe for Hebrew characters)
    const textContent = postElement.textContent?.trim();
    if (textContent) {
        try {
            // Use encodeURIComponent instead of btoa to handle Hebrew characters
            return encodeURIComponent(textContent.substring(0, 100)).substring(0, 20);
        } catch (error) {
            // If that fails, create a simple hash
            let hash = 0;
            for (let i = 0; i < Math.min(textContent.length, 100); i++) {
                const char = textContent.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }
            return Math.abs(hash).toString();
        }
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

        if (likeButton) {
            // Check if already liked (multiple ways to detect)
            const isActive = likeButton.classList.contains('react-button__trigger--active') ||
                           likeButton.classList.contains('artdeco-button--selected') ||
                           likeButton.getAttribute('aria-pressed') === 'true' ||
                           likeButton.querySelector('[data-test-icon="thumbs-up-filled-icon"]') ||
                           likeButton.querySelector('.like-icon--liked');

            if (!isActive) {
                likeButton.click();
                console.log('✅ Liked LinkedIn post');
                
                // Wait after action
                await delay(1000 + Math.random() * 2000);
            } else {
                console.log('⏭️ Post already liked, skipping');
            }
        }
    } catch (error) {
        console.error('Error auto-liking post:', error);
    }
}

async function autoComment(postElement) {
    try {
        const postId = getPostId(postElement);
        console.log('💬 Starting to generate comment for post:', postId);
        
        // Get post content for generating comment
        const postContent = extractPostContent(postElement);
        if (!postContent) {
            console.log('❌ No post content found, skipping comment');
            return;
        }

        console.log('📝 Post content (first 100 chars):', postContent.substring(0, 100));

        // Generate comment using background script
        const response = await chrome.runtime.sendMessage({
            action: 'generateComment',
            postText: postContent,
            commentStyle: settings.commentStyle || 'professional'
        });

        if (!response.success) {
            console.error('❌ Failed to generate comment:', response.error);
            return;
        }

        console.log('✅ Generated comment:', response.comment);

        // Find or open comment box
        let commentBox = await findOrOpenCommentBox(postElement);
        
        if (commentBox) {
            console.log('📝 Found comment box, typing comment (WITHOUT auto-submit)');
            // Fill the comment box with human-like typing BUT DON'T SUBMIT
            await followLinkedInInteractionSequence(commentBox, response.comment);
            console.log('✅ Comment ready - user must click submit button');
        } else {
            console.log('❌ Could not find or open comment box');
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
    // Create intersection observer to detect when user is viewing posts
    intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // User started viewing this post
                handlePostInView(entry.target);
            } else {
                // User stopped viewing this post
                if (currentlyViewingPost === entry.target) {
                    clearTimeout(viewingTimer);
                    currentlyViewingPost = null;
                    viewingTimer = null;
                }
            }
        });
    }, {
        threshold: 0.5, // Post needs to be 50% visible (less strict)
        rootMargin: '50px' // Start observing 50px before entering viewport
    });

    // Observe existing posts
    observeCurrentPosts();
    
    // Add periodic refresh to catch new posts that might be missed
    setInterval(() => {
        console.log('🔄 Refreshing post observation...');
        observeCurrentPosts();
    }, 5000); // Check every 5 seconds for new posts
}

function observeCurrentPosts() {
    if (!intersectionObserver) return;
    
    const posts = document.querySelectorAll('[data-id^="urn:li:activity"], .feed-shared-update-v2');
    console.log(`📋 Found ${posts.length} posts in feed`);
    
    let newPostsCount = 0;
    
    posts.forEach((post, index) => {
        // Check if this post is already being observed
        const postId = getPostId(post);
        const isAlreadyObserved = post.hasAttribute('data-yuv-ai-observed');
        
        if (!isAlreadyObserved) {
            intersectionObserver.observe(post);
            post.setAttribute('data-yuv-ai-observed', 'true');
            newPostsCount++;
            console.log(`👀 NEW post observed ${newPostsCount}:`, postId);
        }
    });
    
    if (newPostsCount > 0) {
        console.log(`✅ Added ${newPostsCount} new posts to observation`);
    } else {
        console.log('ℹ️ No new posts found');
    }
}

function handlePostInView(postElement) {
    // Clear any existing timer
    if (viewingTimer) {
        clearTimeout(viewingTimer);
        console.log('⏹️ Cleared previous post viewing timer');
    }
    
    currentlyViewingPost = postElement;
    const postId = getPostId(postElement);
    console.log('👁️ User is viewing post:', postId);
    console.log('⏱️ Starting 3-second countdown for post processing...');
    
    // Wait 3 seconds before taking action
    viewingTimer = setTimeout(() => {
        if (currentlyViewingPost === postElement) {
            console.log('⏰ 3 seconds elapsed, processing post:', postId);
            console.log('📊 Current settings - Auto Like:', settings.autoLike, 'Auto Comment:', settings.autoComment);
            processPostWithFocus(postElement);
        } else {
            console.log('⚠️ User moved away from post before processing:', postId);
        }
    }, 3000); // 3 seconds delay
}

async function processPostWithFocus(postElement) {
    try {
        const postId = getPostId(postElement);
        if (!postId) {
            return;
        }

        // Allow processing the same post multiple times if user scrolls back to it
        console.log('Processing focused post:', postId);

        // Auto-like if enabled (only when user focused on post)
        if (settings.autoLike) {
            await autoLike(postElement);
            await delay(1000 + Math.random() * 2000); // Wait between actions
        }

        // Auto-comment if enabled (only when user focused on post)
        if (settings.autoComment) {
            await autoComment(postElement);
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
    // Enhanced selectors for finding comment boxes
    const commentBoxSelectors = [
        'div[contenteditable="true"]',
        '.comments-comment-texteditor',
        '.comments-comment-box__comment-text-editor',
        '.ql-editor',
        'textarea',
        '.comments-comment-box__form textarea',
        'div[role="textbox"]',
        '[data-placeholder*="comment"]',
        '[placeholder*="comment"]',
        '[placeholder*="תגובה"]',
        '.mentions-texteditor',
        '.feed-shared-text-editor'
    ];
    
    // First, try to find existing comment box with multiple selectors
    let commentBox = null;
    for (const selector of commentBoxSelectors) {
        commentBox = postElement.querySelector(selector);
        if (commentBox && commentBox.offsetParent) { // Check if visible
            console.log(`Found existing comment box using selector: ${selector}`);
            return commentBox;
        }
    }
    
    // If no comment box, try to open it by clicking the comment button
    const commentButtonSelectors = [
        'button[aria-label*="Comment"]',
        'button[data-control-name*="comment"]',
        '.react-button__trigger[aria-label*="Comment"]',
        '.social-actions-button[aria-label*="Comment"]',
        'button[aria-label*="תגובה"]',
        '.comments-comment-box__comment-button',
        'button:has(.comment-icon)',
        '.social-action[aria-label*="Comment"]'
    ];
    
    let commentButton = null;
    for (const selector of commentButtonSelectors) {
        commentButton = postElement.querySelector(selector);
        if (commentButton && commentButton.offsetParent) {
            console.log(`Found comment button using selector: ${selector}`);
            break;
        }
    }
    
    if (commentButton) {
        console.log('Clicking comment button to open comment box');
        commentButton.click();
        await delay(1500);
        
        // Try again to find the comment box with all selectors
        for (const selector of commentBoxSelectors) {
            commentBox = postElement.querySelector(selector);
            if (commentBox && commentBox.offsetParent) {
                console.log(`Found comment box after clicking, using selector: ${selector}`);
                return commentBox;
            }
        }
        
        // Also try searching in the whole document as fallback
        for (const selector of commentBoxSelectors) {
            commentBox = document.querySelector(selector + ':focus, ' + selector + '[data-placeholder*="comment"]');
            if (commentBox && commentBox.offsetParent) {
                console.log(`Found comment box globally after clicking, using selector: ${selector}`);
                return commentBox;
            }
        }
    }
    
    console.log('Could not find or open comment box');
    return null;
}

async function followLinkedInInteractionSequence(commentBox, comment) {
    console.log('Following LinkedIn interaction sequence...');
    
    try {
        // Step 1: Focus on the comment box (simulate user click)
        console.log('Step 1: Focusing on comment box');
        commentBox.focus();
        commentBox.click();
        
        // Wait for LinkedIn to register the focus
        await delay(500);
        
        // Step 2: Clear any existing content
        console.log('Step 2: Clearing existing content');
        commentBox.innerHTML = '';
        commentBox.value = '';
        commentBox.textContent = '';
        
        // Step 3: Simulate faster, human-like typing with word-by-word approach
        console.log('Step 3: Simulating human-like typing sequence');
        
        // Split comment into words for faster typing
        const words = comment.split(' ');
        let currentText = '';
        
        // Type first few words slowly to trigger LinkedIn validation
        const slowWordsCount = Math.min(3, words.length);
        
        for (let i = 0; i < slowWordsCount; i++) {
            const word = words[i];
            currentText += (i > 0 ? ' ' : '') + word;
            
            // Update the comment box
            if (commentBox.tagName === 'TEXTAREA' || commentBox.tagName === 'INPUT') {
                commentBox.value = currentText;
            } else {
                commentBox.textContent = currentText;
                commentBox.innerHTML = currentText.replace(/\n/g, '<br>');
            }
            
            // Trigger input event
            try {
                const inputEvent = new InputEvent('input', {
                    data: word,
                    inputType: 'insertText',
                    bubbles: true
                });
                commentBox.dispatchEvent(inputEvent);
            } catch (e) {
                const inputEvent = new Event('input', { bubbles: true });
                commentBox.dispatchEvent(inputEvent);
            }
            
            // Wait between words (300-500ms)
            await delay(300 + Math.random() * 200);
            console.log(`Typed word ${i+1}/${slowWordsCount}: "${word}"`);
        }
        
        // Now type the rest of the comment all at once for speed
        if (words.length > slowWordsCount) {
            const remainingWords = words.slice(slowWordsCount).join(' ');
            currentText += ' ' + remainingWords;
            
            // Update the comment box with full text
            if (commentBox.tagName === 'TEXTAREA' || commentBox.tagName === 'INPUT') {
                commentBox.value = currentText;
            } else {
                commentBox.textContent = currentText;
                commentBox.innerHTML = currentText.replace(/\n/g, '<br>');
            }
            
            // Final input event with complete text
            try {
                const inputEvent = new InputEvent('input', {
                    data: remainingWords,
                    inputType: 'insertText',
                    bubbles: true
                });
                commentBox.dispatchEvent(inputEvent);
            } catch (e) {
                const inputEvent = new Event('input', { bubbles: true });
                commentBox.dispatchEvent(inputEvent);
            }
            
            console.log('Completed typing remaining text quickly');
        }
        
        console.log('Finished typing complete comment');
        
        // Additional events that LinkedIn might listen for
        ['change', 'keyup', 'blur', 'focus'].forEach(eventType => {
            try {
                const event = new Event(eventType, { bubbles: true });
                commentBox.dispatchEvent(event);
            } catch (e) {
                console.log(`Failed to dispatch ${eventType} event`);
            }
        });
        
        // Step 4: Wait for LinkedIn to validate and show submit button
        console.log('Step 4: Waiting for LinkedIn validation and submit button...');
        
        // Try to trigger submit button appearance with additional events
        try {
            commentBox.focus();
            await delay(300);
            
            // Trigger blur and focus to potentially activate submit button
            commentBox.blur();
            await delay(200);
            commentBox.focus();
            await delay(300);
            
            // Dispatch additional events that might trigger button appearance
            ['focusin', 'focusout', 'input', 'change', 'keydown', 'keyup'].forEach(eventType => {
                try {
                    const event = new Event(eventType, { bubbles: true });
                    commentBox.dispatchEvent(event);
                } catch (e) {
                    console.log(`Failed to dispatch ${eventType} event`);
                }
            });
            
            await delay(1000);
            
        } catch (e) {
            console.log('Error triggering submit button appearance:', e);
        }
        
        // Step 5: Look for and activate submit button with improved detection
        console.log('Step 5: Looking for submit button');
        
        // Try multiple strategies to find the right container
        let parentContainer = null;
        const containerSelectors = [
            '.comments-comment-box__form',
            '.comments-comment-box',
            '.feed-shared-comment-box',
            '.artdeco-card',
            '.comments-comment-box-comment',
            '.comments-comment-box__content'
        ];
        
        for (const selector of containerSelectors) {
            parentContainer = commentBox.closest(selector);
            if (parentContainer) {
                console.log(`Found parent container using selector: ${selector}`);
                break;
            }
        }
        
        // Fallback to parent elements
        if (!parentContainer) {
            parentContainer = commentBox.parentElement?.closest('.comments-comment-box, .comments-comment-box__form') ||
                             commentBox.parentElement?.parentElement?.closest('.comments-comment-box, .comments-comment-box__form') ||
                             commentBox.parentElement?.parentElement?.parentElement || 
                             commentBox.parentElement;
            console.log('Using fallback parent container');
        }
        
        if (parentContainer) {
            console.log('Parent container found:', parentContainer.className);
            
            // IMMEDIATELY create a backup submit button that the user can see and click
            createLinkedInSubmitButton(parentContainer, commentBox);
            console.log('Created backup submit button for user visibility');
            
            // DON'T auto-click LinkedIn's submit button - let user decide when to post
            console.log('✅ Comment typed and YUV.AI button ready - waiting for user to submit');
            console.log('🚫 NO AUTO-SUBMIT: User must manually click to post comment');
            
            // Don't even look for LinkedIn submit button to avoid any auto-clicking temptation
            console.log('ℹ️ YUV.AI backup button available for manual submission');
        } else {
            console.log('No parent container found for comment box');
            // Still show manual interface as fallback
            showManualSubmitInterface(commentBox, comment);
        }
        
        return true;
        
    } catch (error) {
        console.error('Error in LinkedIn interaction sequence:', error);
        throw error;
    }
}

// New function to wait for submit button to appear
async function waitForSubmitButton(container, maxWaitTime = 5000) {
    const startTime = Date.now();
    const checkInterval = 300; // Check every 300ms
    
    console.log('Starting to wait for submit button in container:', container);
    
    // Create a promise that resolves when submit button is found via MutationObserver
    const mutationPromise = new Promise((resolve) => {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    // Check for added submit buttons
                    for (const addedNode of mutation.addedNodes) {
                        if (addedNode.nodeType === Node.ELEMENT_NODE) {
                            const submitButton = checkElementForSubmitButton(addedNode);
                            if (submitButton) {
                                console.log('Submit button detected via MutationObserver!');
                                observer.disconnect();
                                resolve(submitButton);
                                return;
                            }
                        }
                    }
                }
                if (mutation.type === 'attributes' && mutation.target.tagName === 'BUTTON') {
                    // Check if a button's attributes changed to make it a submit button
                    const submitButton = checkElementForSubmitButton(mutation.target);
                    if (submitButton) {
                        console.log('Submit button detected via attribute change!');
                        observer.disconnect();
                        resolve(submitButton);
                        return;
                    }
                }
            }
        });
        
        // Observe changes in the container and document
        observer.observe(container, { 
            childList: true, 
            subtree: true, 
            attributes: true,
            attributeFilter: ['type', 'data-control-name', 'aria-label', 'class', 'disabled']
        });
        
        // Also observe the entire document as LinkedIn might add buttons elsewhere
        observer.observe(document.body, { 
            childList: true, 
            subtree: true, 
            attributes: true,
            attributeFilter: ['type', 'data-control-name', 'aria-label', 'class', 'disabled']
        });
        
        // Cleanup after maxWaitTime
        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, maxWaitTime);
    });
    
    // Helper function to check if an element is a submit button
    function checkElementForSubmitButton(element) {
        if (element.tagName !== 'BUTTON') return null;
        if (!element.offsetParent) return null; // Skip hidden buttons
        
        const buttonText = element.textContent?.trim().toLowerCase();
        const spanText = element.querySelector('span.artdeco-button__text')?.textContent?.trim().toLowerCase();
        const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
        const dataControl = element.getAttribute('data-control-name') || '';
        
        const isSubmitButton = 
            buttonText === 'post' || 
            buttonText === 'comment' ||
            buttonText === 'send' ||
            buttonText === 'פרסם' ||
            buttonText === 'תגובה' ||
            buttonText === 'שלח' ||
            spanText === 'post' ||
            spanText === 'comment' ||
            spanText === 'send' ||
            spanText === 'פרסם' ||
            spanText === 'תגובה' ||
            spanText === 'שלח' ||
            ariaLabel.includes('post') ||
            ariaLabel.includes('comment') ||
            ariaLabel.includes('submit') ||
            ariaLabel.includes('send') ||
            dataControl.includes('submit') ||
            dataControl.includes('comment') ||
            element.type === 'submit' ||
            element.className.includes('submit');
        
        return isSubmitButton && !element.disabled ? element : null;
    }
    
    while (Date.now() - startTime < maxWaitTime) {
        // First, try to find buttons in multiple possible containers
        const searchContainers = [
            container,
            container.querySelector('.comments-comment-box'),
            container.querySelector('.comments-comment-box__form'),
            container.closest('.comments-comment-box'),
            container.closest('.comments-comment-box__form'),
            container.closest('.feed-shared-comment-box'),
            document.querySelector('.comments-comment-box__form:last-child'),
            document.querySelector('.comments-comment-box:last-child')
        ].filter(Boolean);
        
        console.log(`Checking ${searchContainers.length} possible containers for submit buttons`);
        
        for (const searchContainer of searchContainers) {
            if (!searchContainer) continue;
            
            // Look for submit button with comprehensive selectors
            const submitButtonSelectors = [
                'button[type="submit"]',
                'button[data-control-name="comment_submit"]',
                'button span.artdeco-button__text',
                'button.comments-comment-box__submit-button',
                'button[aria-label*="Post"]',
                'button[aria-label*="Comment"]',
                'button[aria-label*="פרסם"]',
                'button[aria-label*="תגובה"]',
                '.comments-comment-box__submit-button',
                'button:has(span.artdeco-button__text)'
            ];
            
            // Debug: Log all buttons in current container
            const allButtons = searchContainer.querySelectorAll('button');
            if (allButtons.length > 0) {
                console.log(`Found ${allButtons.length} buttons in container ${searchContainer.className}`);
            }
            
            for (const selector of submitButtonSelectors) {
                try {
                    const buttons = searchContainer.querySelectorAll(selector);
                    if (buttons.length > 0) {
                        console.log(`Selector "${selector}" found ${buttons.length} buttons`);
                    }
                    
                    for (const button of buttons) {
                        if (!button.offsetParent) continue; // Skip hidden buttons
                        
                        const buttonText = button.textContent?.trim().toLowerCase();
                        const spanText = button.querySelector('span.artdeco-button__text')?.textContent?.trim().toLowerCase();
                        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                        
                        // More flexible text matching
                        const isSubmitButton = 
                            buttonText === 'post' || 
                            buttonText === 'comment' ||
                            buttonText === 'send' ||
                            buttonText === 'פרסם' ||
                            buttonText === 'תגובה' ||
                            buttonText === 'שלח' ||
                            spanText === 'post' ||
                            spanText === 'comment' ||
                            spanText === 'send' ||
                            spanText === 'פרסם' ||
                            spanText === 'תגובה' ||
                            spanText === 'שלח' ||
                            ariaLabel.includes('post') ||
                            ariaLabel.includes('comment') ||
                            ariaLabel.includes('submit') ||
                            ariaLabel.includes('send') ||
                            button.type === 'submit' ||
                            button.getAttribute('data-control-name') === 'comment_submit' ||
                            button.className.includes('submit');
                        
                        if (isSubmitButton && !button.disabled) {
                            console.log(`Found submit button: "${button.textContent?.trim()}" via selector: ${selector} in container: ${searchContainer.className}`);
                            return button;
                        }
                    }
                } catch (selectorError) {
                    console.log(`Selector "${selector}" failed:`, selectorError.message);
                }
            }
            
            // Manual search through all visible buttons in this container
            for (const button of allButtons) {
                if (!button.offsetParent) continue; // Skip hidden buttons
                
                const buttonText = button.textContent?.trim().toLowerCase();
                const spanText = button.querySelector('span.artdeco-button__text')?.textContent?.trim().toLowerCase();
                const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                const dataControl = button.getAttribute('data-control-name') || '';
                
                const isLikelySubmitButton = 
                    buttonText === 'post' || 
                    buttonText === 'comment' ||
                    buttonText === 'send' ||
                    buttonText === 'פרסם' ||
                    buttonText === 'תגובה' ||
                    buttonText === 'שלח' ||
                    spanText === 'post' ||
                    spanText === 'comment' ||
                    spanText === 'send' ||
                    spanText === 'פרסם' ||
                    spanText === 'תגובה' ||
                    spanText === 'שלח' ||
                    ariaLabel.includes('post') ||
                    ariaLabel.includes('comment') ||
                    ariaLabel.includes('submit') ||
                    ariaLabel.includes('send') ||
                    dataControl.includes('submit') ||
                    dataControl.includes('comment') ||
                    button.type === 'submit' ||
                    button.className.includes('submit');
                
                if (isLikelySubmitButton && !button.disabled) {
                    console.log(`Found submit button manually: "${button.textContent?.trim()}" in container: ${searchContainer.className}`);
                    return button;
                }
            }
        }
        
        // Also search in the entire document as fallback
        const globalButtons = document.querySelectorAll('button[type="submit"], button[data-control-name="comment_submit"], .comments-comment-box__submit-button');
        for (const button of globalButtons) {
            if (!button.offsetParent) continue; // Skip hidden buttons
            
            const buttonText = button.textContent?.trim().toLowerCase();
            const spanText = button.querySelector('span.artdeco-button__text')?.textContent?.trim().toLowerCase();
            
            if ((buttonText === 'post' || buttonText === 'comment' || buttonText === 'פרסם' || buttonText === 'תגובה' ||
                 spanText === 'post' || spanText === 'comment' || spanText === 'פרסם' || spanText === 'תגובה') && 
                 !button.disabled) {
                console.log(`Found submit button globally: "${button.textContent?.trim()}"`);
                return button;
            }
        }
        
        // Check the MutationObserver promise
        const mutationResult = await Promise.race([
            mutationPromise,
            new Promise(resolve => setTimeout(() => resolve(null), checkInterval))
        ]);
        
        if (mutationResult) {
            console.log('Submit button found via MutationObserver!');
            return mutationResult;
        }
        
        await delay(checkInterval);
    }
    
    // If we get here, button wasn't found - let's debug what we have
    console.log('Submit button not found within timeout');
    console.log('Final button inventory:');
    
    // Try one more time to find any submit buttons
    const finalButtons = document.querySelectorAll('button');
    let foundButtons = [];
    finalButtons.forEach((btn, index) => {
        if (!btn.offsetParent) return; // Skip hidden buttons
        
        const buttonText = btn.textContent?.trim();
        const spanText = btn.querySelector('span.artdeco-button__text')?.textContent?.trim();
        const ariaLabel = btn.getAttribute('aria-label');
        const dataControl = btn.getAttribute('data-control-name');
        const type = btn.type;
        const disabled = btn.disabled;
        
        foundButtons.push({
            index: index + 1,
            text: buttonText,
            spanText: spanText,
            ariaLabel: ariaLabel,
            dataControl: dataControl,
            type: type,
            disabled: disabled,
            className: btn.className
        });
        
        // Last ditch effort - if any button contains submit-related text
        if (buttonText?.toLowerCase().includes('post') || 
            buttonText?.toLowerCase().includes('comment') ||
            spanText?.toLowerCase().includes('post') ||
            spanText?.toLowerCase().includes('comment') ||
            type === 'submit') {
            console.log(`Found potential submit button in final search: "${buttonText}" at index ${index + 1}`);
            return btn;
        }
    });
    
    console.log('Found buttons:', foundButtons.slice(0, 10)); // Log first 10 buttons
    
    return null;
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
    const existingBtn = container.querySelector('.yuv-ai-submit-btn');
    if (existingBtn) {
        existingBtn.remove();
    }
    
    // Create a highly visible submit button
    const submitBtn = document.createElement('button');
    submitBtn.className = 'yuv-ai-submit-btn';
    submitBtn.innerHTML = '🤖 <strong>YUV.AI</strong> פרסם תגובה';
    submitBtn.type = 'button';
    
    submitBtn.style.cssText = `
        background: linear-gradient(135deg, #0a66c2, #1f7ce8);
        color: white;
        border: 2px solid #ffffff;
        padding: 12px 24px;
        border-radius: 25px;
        margin: 10px;
        cursor: pointer;
        font-weight: 700;
        font-size: 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        transition: all 0.3s ease;
        min-height: 45px;
        box-shadow: 0 4px 15px rgba(10, 102, 194, 0.4);
        display: inline-flex;
        align-items: center;
        gap: 8px;
        position: relative;
        z-index: 1000;
        animation: pulseYuvAI 2s infinite;
    `;
    
    // Add pulsing animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulseYuvAI {
            0% { box-shadow: 0 4px 15px rgba(10, 102, 194, 0.4); }
            50% { box-shadow: 0 4px 25px rgba(10, 102, 194, 0.7); }
            100% { box-shadow: 0 4px 15px rgba(10, 102, 194, 0.4); }
        }
    `;
    if (!document.head.querySelector('#yuv-ai-button-style')) {
        style.id = 'yuv-ai-button-style';
        document.head.appendChild(style);
    }
    
    // Add hover effect
    submitBtn.addEventListener('mouseenter', () => {
        submitBtn.style.background = 'linear-gradient(135deg, #004182, #0052a3)';
        submitBtn.style.transform = 'scale(1.05)';
    });
    
    submitBtn.addEventListener('mouseleave', () => {
        submitBtn.style.background = 'linear-gradient(135deg, #0a66c2, #1f7ce8)';
        submitBtn.style.transform = 'scale(1)';
    });
    
    submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('🚫 YUV.AI button clicked - NO AUTO-SUBMIT! User must manually click LinkedIn Post button');
        
        // Show clear message that user needs to manually submit
        const alertMsg = `
🤖 YUV.AI: תגובה מוכנה!

אתה צריך ללחוץ בעצמך על כפתור "פרסם" או "Post" של LinkedIn כדי לפרסם את התגובה.

התוסף לא יפרסם אוטומטית - אתה שולט מתי לפרסם!
        `;
        
        alert(alertMsg);
        
        // Highlight the comment box to help user find it
        if (commentBox) {
            commentBox.style.border = '3px solid #0a66c2';
            commentBox.style.boxShadow = '0 0 15px rgba(10, 102, 194, 0.5)';
            
            setTimeout(() => {
                commentBox.style.border = '';
                commentBox.style.boxShadow = '';
            }, 5000);
        }
    });
    
    // Find the best place to add the button - make it very visible
    const buttonContainer = container.querySelector('.comments-comment-box__submit-button') || 
                           container.querySelector('.comments-comment-box-comment__cta-container') ||
                           container.querySelector('.comments-comment-box__form-controls') ||
                           commentBox.parentElement;
    
    // Create a wrapper for better positioning
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 15px 0;
        padding: 10px;
        background: rgba(10, 102, 194, 0.05);
        border-radius: 15px;
        border: 1px dashed #0a66c2;
    `;
    wrapper.appendChild(submitBtn);
    
    if (buttonContainer) {
        buttonContainer.appendChild(wrapper);
        console.log('YUV.AI submit button added in wrapper to:', buttonContainer);
    } else {
        // Fallback: add after the comment box with absolute positioning for visibility
        commentBox.parentElement.appendChild(wrapper);
        wrapper.style.position = 'relative';
        wrapper.style.top = '10px';
        console.log('YUV.AI submit button added as fallback with wrapper');
    }
}

// Show manual submit interface when submit button is not found
function showManualSubmitInterface(commentBox, comment) {
    // Remove any existing manual interface
    const existingInterface = document.querySelector('.manual-submit-interface');
    if (existingInterface) {
        existingInterface.remove();
    }
    
    // Create manual submit interface
    const manualInterface = document.createElement('div');
    manualInterface.className = 'manual-submit-interface';
    manualInterface.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #fff;
        border: 3px solid #0073b1;
        border-radius: 8px;
        padding: 20px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        text-align: center;
    `;
    
    manualInterface.innerHTML = `
        <div style="margin-bottom: 15px;">
            <h3 style="color: #0073b1; margin: 0 0 10px 0;">🤖 YUV.AI Comment Ready!</h3>
            <p style="margin: 0; color: #666; font-size: 14px;">
                Your AI comment has been typed in the comment box.<br>
                Please click the <strong>Post</strong> or <strong>Comment</strong> button to submit it.
            </p>
        </div>
        <div style="display: flex; gap: 10px; justify-content: center;">
            <button id="highlightCommentBtn" style="
                background: #0073b1; 
                color: white; 
                border: none; 
                padding: 8px 16px; 
                border-radius: 4px; 
                cursor: pointer;
                font-size: 14px;
            ">✨ Highlight Comment Box</button>
            <button id="dismissManualBtn" style="
                background: #666; 
                color: white; 
                border: none; 
                padding: 8px 16px; 
                border-radius: 4px; 
                cursor: pointer;
                font-size: 14px;
            ">✕ Dismiss</button>
        </div>
    `;
    
    document.body.appendChild(manualInterface);
    
    // Add event listeners
    document.getElementById('highlightCommentBtn').addEventListener('click', () => {
        highlightCommentBox(commentBox);
        manualInterface.remove();
    });
    
    document.getElementById('dismissManualBtn').addEventListener('click', () => {
        manualInterface.remove();
    });
    
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
        if (document.body.contains(manualInterface)) {
            manualInterface.remove();
        }
    }, 10000);
} 