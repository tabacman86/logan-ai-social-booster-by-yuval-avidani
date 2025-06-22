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
        generateComment(request.postText, request.commentStyle)
            .then(comment => sendResponse({ success: true, comment }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
    
    if (request.action === 'testApiConnection') {
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
async function generateComment(postText, commentStyle) {
    const result = await chrome.storage.sync.get(['cohereApiKey', 'activePersona', 'personas']);
    const apiKey = result.cohereApiKey;
    const activePersona = result.activePersona;
    const personas = result.personas || {};
    
    if (!apiKey) {
        throw new Error('לא נמצא מפתח API');
    }

    // Detect language
    const isHebrew = /[\u0590-\u05FF]/.test(postText);
    const language = isHebrew ? 'עברית' : 'English';
    
    // Build persona context
    let personaContext = '';
    if (activePersona && personas[activePersona]) {
        const persona = personas[activePersona];
        personaContext = `
דפוס כתיבה: ${persona.description}

דוגמאות מהסגנון שלך:
${persona.examples.map(example => `- ${example}`).join('\n')}

כתב תגובה באותו סגנון ורוח כמו הדוגמאות שלמעלה.`;
    }

    // Style descriptions
    const styleDescriptions = {
        professional: isHebrew ? 'מקצועי ועניינית' : 'professional and to the point',
        friendly: isHebrew ? 'ידידותי וחם' : 'friendly and warm',
        encouraging: isHebrew ? 'מעודד ותומך' : 'encouraging and supportive',
        thoughtful: isHebrew ? 'מחשבתי ומעמיק' : 'thoughtful and insightful'
    };

    const styleDescription = styleDescriptions[commentStyle] || 
                            (isHebrew ? 'מקצועי' : 'professional');

    const prompt = `אתה ${activePersona && personas[activePersona] ? personas[activePersona].name : 'יובל אבידני'}, כותב תגובה ל${postText ? 'פוסט' : 'תוכן'} ברשת חברתית.

${personaContext}

הפוסט:
"${postText}"

כתב תגובה קצרה ב${language} בסגנון ${styleDescription}${personaContext ? ' ובהתאם לדוגמאות שלך' : ''}. 
התגובה צריכה להיות:
- טבעית ואישית
- עד 200 תווים
- מעוררת עניין
- ללא סמלים מוזרים או פורמט מיוחד
- מתחילה מיד בתוכן (לא "תגובה:" או דומה)

תגובה:`;

    const response = await fetch('https://api.cohere.ai/v1/generate', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'command-a-03-2025',
            prompt: prompt,
            max_tokens: 100,
            temperature: 0.8,
            stop_sequences: ['\n\n', 'תגובה נוספת:', 'תגובה אחרת:', 'Another comment:', 'Comment:'],
            return_likelihoods: 'NONE'
        })
    });

    if (!response.ok) {
        throw new Error(`Cohere API error: ${response.status}`);
    }

    const data = await response.json();
    let comment = data.generations[0].text.trim();
    
    // Clean up the comment
    comment = comment.replace(/^(תגובה|Comment|Response|תשובה):\s*/i, '').trim();
    comment = comment.replace(/^["']|["']$/g, '').trim();
    comment = comment.split('\n')[0].trim();
    
    if (comment.length > 200) {
        comment = comment.substring(0, 200).trim();
        if (comment.lastIndexOf(' ') > 150) {
            comment = comment.substring(0, comment.lastIndexOf(' ')) + '...';
        }
    }
    
    return comment;
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