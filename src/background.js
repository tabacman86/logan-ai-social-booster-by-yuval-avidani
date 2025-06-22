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
    console.log('Background received message:', request.action);
    
    if (request.action === 'generateComment') {
        handleGenerateComment(request, sendResponse);
        return true; // Keep the message channel open for async response
    } else if (request.action === 'generateReply') {
        handleGenerateReply(request, sendResponse);
        return true; // Keep the message channel open for async response
    } else if (request.action === 'testApiConnection') {
        testApiConnection(request.apiKey)
            .then(result => sendResponse(result))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (request.action === 'settingsUpdated') {
        console.log('Settings updated:', request.settings);
    }
    
    if (request.action === 'getSettings') {
        chrome.storage.sync.get([
            'autoLike', 'autoComment', 'commentStyle', 'cohereApiKey', 
            'enableLinkedIn', 'enableFacebook', 'activePersona', 'personas'
        ], (result) => {
            sendResponse(result);
        });
        return true;
    }
});

async function handleGenerateComment(request, sendResponse) {
    try {
        const result = await chrome.storage.sync.get(['activePersona', 'personas']);
        const activePersona = result.activePersona;
        const personas = result.personas || {};
        const personaData = activePersona && personas[activePersona] ? personas[activePersona] : null;
        
        const comment = await generateComment(
            request.postText || request.postContent, 
            request.commentStyle,
            personaData
        );
        
        sendResponse({ 
            success: true, 
            comment: comment 
        });
    } catch (error) {
        console.error('Error in handleGenerateComment:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

async function handleGenerateReply(request, sendResponse) {
    try {
        const result = await chrome.storage.sync.get(['activePersona', 'personas']);
        const activePersona = result.activePersona;
        const personas = result.personas || {};
        const personaData = activePersona && personas[activePersona] ? personas[activePersona] : null;
        
        const reply = await generateReply(
            request.commentText,
            request.postContent,
            request.commentStyle,
            personaData
        );
        
        sendResponse({ 
            success: true, 
            comment: reply 
        });
    } catch (error) {
        console.error('Error in handleGenerateReply:', error);
        sendResponse({ 
            success: false, 
            error: error.message 
        });
    }
}

// Function to generate comment using Cohere API
async function generateComment(post, style, personaData) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['cohereApiKey'], async function(result) {
            if (!result.cohereApiKey) {
                reject(new Error('מפתח API לא קיים'));
                return;
            }

            try {
                // בדיקת שפה של הפוסט
                const isHebrew = /[\u0590-\u05FF]/.test(post);
                const language = isHebrew ? 'עברית' : 'אנגלית';

                // בנייה של ההודעה עם פרסונה
                let systemMessage = `אתה מגיב על פוסטים ברשתות חברתיות בסגנון ${style}. תגיב ב${language} בהתאם לשפת הפוסט. התגובה צריכה להיות קצרה, אותנטית ורלוונטית לתוכן.`;
                
                if (personaData && personaData.name) {
                    systemMessage += `\n\nאתה כותב בסגנון של "${personaData.name}". ${personaData.description || ''}`;
                    
                    if (personaData.examples && personaData.examples.length > 0) {
                        systemMessage += `\n\nדוגמאות לסגנון הכתיבה שלך:\n`;
                        personaData.examples.forEach((example, index) => {
                            systemMessage += `${index + 1}. ${example}\n`;
                        });
                        systemMessage += `\nכתוב תגובה דומה בסגנון זה.`;
                    }
                }

                const userMessage = `פוסט: "${post}"\n\nכתוב תגובה קצרה ומעניינת (עד 50 מילים):`;

                const response = await fetch('https://api.cohere.com/v2/chat', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${result.cohereApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'command-a-03-2025',
                        messages: [
                            {
                                role: 'system',
                                content: systemMessage
                            },
                            {
                                role: 'user',
                                content: userMessage
                            }
                        ],
                        max_tokens: 150,
                        temperature: 0.7,
                        frequency_penalty: 0.1,
                        presence_penalty: 0.1
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Cohere API שגיאה: ${errorData.message || response.statusText}`);
                }

                const data = await response.json();
                
                // גישה נכונה לטקסט בתגובה החדשה של Chat API
                if (data.message && data.message.content && data.message.content[0] && data.message.content[0].text) {
                    const comment = data.message.content[0].text.trim();
                    resolve(comment);
                } else {
                    throw new Error('תגובה ריקה מ-Cohere API');
                }
            } catch (error) {
                console.error('שגיאה ביצירת תגובה:', error);
                reject(error);
            }
        });
    });
}

async function generateReply(commentText, postContent, style, personaData) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['cohereApiKey'], async function(result) {
            if (!result.cohereApiKey) {
                reject(new Error('מפתח API לא קיים'));
                return;
            }

            try {
                // בדיקת שפה של התגובה
                const isHebrew = /[\u0590-\u05FF]/.test(commentText);
                const language = isHebrew ? 'עברית' : 'אנגלית';

                // בנייה של ההודעה עם פרסונה עבור תגובה לתגובה
                let systemMessage = `אתה מגיב על תגובה ברשתות חברתיות בסגנון ${style}. תגיב ב${language} בהתאם לשפת התגובה המקורית. התגובה צריכה להיות קצרה, אותנטית ורלוונטית לתוכן התגובה המקורית.`;
                
                if (personaData && personaData.name) {
                    systemMessage += `\n\nאתה כותב בסגנון של "${personaData.name}". ${personaData.description || ''}`;
                    
                    if (personaData.examples && personaData.examples.length > 0) {
                        systemMessage += `\n\nדוגמאות לסגנון הכתיבה שלך:\n`;
                        personaData.examples.forEach((example, index) => {
                            systemMessage += `${index + 1}. ${example}\n`;
                        });
                        systemMessage += `\nכתוב תגובה דומה בסגנון זה.`;
                    }
                }

                let userMessage = `תגובה מקורית: "${commentText}"\n\n`;
                if (postContent) {
                    userMessage += `הקשר מהפוסט: "${postContent.substring(0, 200)}"\n\n`;
                }
                userMessage += `כתוב תגובה קצרה ומעניינת (עד 30 מילים) שמגיבה על התגובה המקורית:`;

                const response = await fetch('https://api.cohere.com/v2/chat', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${result.cohereApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'command-a-03-2025',
                        messages: [
                            {
                                role: 'system',
                                content: systemMessage
                            },
                            {
                                role: 'user',
                                content: userMessage
                            }
                        ],
                        max_tokens: 100,
                        temperature: 0.8,
                        frequency_penalty: 0.1,
                        presence_penalty: 0.1
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Cohere API שגיאה: ${errorData.message || response.statusText}`);
                }

                const data = await response.json();
                
                // גישה נכונה לטקסט בתגובה החדשה של Chat API
                if (data.message && data.message.content && data.message.content[0] && data.message.content[0].text) {
                    const reply = data.message.content[0].text.trim();
                    resolve(reply);
                } else {
                    throw new Error('תגובה ריקה מ-Cohere API');
                }
            } catch (error) {
                console.error('שגיאה ביצירת תגובה לתגובה:', error);
                reject(error);
            }
        });
    });
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