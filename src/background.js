// Service Worker for the extension
chrome.runtime.onInstalled.addListener(() => {
    console.log('Social Media Auto Engager installed');
    
    // Set default settings
    chrome.storage.sync.set({
        autoLike: false,
        autoComment: false,
        commentStyle: 'professional',
        enableLinkedIn: true,
        enableFacebook: true
    });
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'generateComment') {
        generateComment(request.postContent, request.commentStyle)
            .then(comment => sendResponse({ success: true, comment }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep the message channel open for async response
    }
    
    if (request.action === 'getSettings') {
        chrome.storage.sync.get([
            'autoLike',
            'autoComment',
            'commentStyle',
            'enableLinkedIn',
            'enableFacebook'
        ], (result) => {
            sendResponse(result);
        });
        return true;
    }
});

// Function to generate comment using Cohere API
async function generateComment(postContent, commentStyle = 'professional') {
    try {
        // Get API key from secure storage
        const result = await chrome.storage.local.get(['cohereApiKey']);
        const apiKey = result.cohereApiKey;
        
        if (!apiKey) {
            throw new Error('Cohere API key not found. Please set it in the extension popup.');
        }

        const stylePrompts = {
            professional: 'Write a professional and insightful comment',
            friendly: 'Write a friendly and warm comment',
            encouraging: 'Write an encouraging and supportive comment', 
            thoughtful: 'Write a thoughtful and meaningful comment'
        };

        const prompt = `${stylePrompts[commentStyle]} in response to this social media post. Keep it concise (1-2 sentences), authentic, and engaging. The comment should be in Hebrew if the post is in Hebrew, otherwise in English. Post content: "${postContent}"`;

        const response = await fetch('https://api.cohere.ai/v1/generate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'command',
                prompt: prompt,
                max_tokens: 100,
                temperature: 0.7,
                truncate: 'END'
            })
        });

        if (!response.ok) {
            throw new Error(`Cohere API error: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.generations && data.generations.length > 0) {
            let comment = data.generations[0].text.trim();
            
            // Clean up the comment
            comment = comment.replace(/^["']|["']$/g, ''); // Remove quotes
            comment = comment.replace(/\n/g, ' '); // Replace newlines with spaces
            comment = comment.trim();
            
            return comment;
        } else {
            throw new Error('No comment generated');
        }
    } catch (error) {
        console.error('Error generating comment:', error);
        throw error;
    }
}

// Background task to check for new posts periodically
setInterval(async () => {
    const settings = await chrome.storage.sync.get(['autoLike', 'autoComment', 'enableLinkedIn', 'enableFacebook']);
    
    if (!settings.autoLike && !settings.autoComment) {
        return; // No auto-actions enabled
    }

    // Query active tabs
    const tabs = await chrome.tabs.query({ active: true });
    
    for (const tab of tabs) {
        if (!tab.url) continue;
        
        const isLinkedIn = tab.url.includes('linkedin.com') && settings.enableLinkedIn;
        const isFacebook = tab.url.includes('facebook.com') && settings.enableFacebook;
        
        if (isLinkedIn || isFacebook) {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'checkForNewPosts',
                    settings: settings
                });
            } catch (error) {
                // Tab might not have content script loaded
                console.log('Could not send message to tab:', tab.id);
            }
        }
    }
}, 10000); // Check every 10 seconds 