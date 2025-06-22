document.addEventListener('DOMContentLoaded', function() {
    const elements = {
        cohereApiKey: document.getElementById('cohereApiKey'),
        saveApiKey: document.getElementById('saveApiKey'),
        autoLike: document.getElementById('autoLike'),
        autoComment: document.getElementById('autoComment'),
        commentStyle: document.getElementById('commentStyle'),
        enableLinkedIn: document.getElementById('enableLinkedIn'),
        enableFacebook: document.getElementById('enableFacebook'),
        saveSettings: document.getElementById('saveSettings'),
        status: document.getElementById('status')
    };

    // טעינת הגדרות קיימות
    loadSettings();

    // שמירת מפתח API
    elements.saveApiKey.addEventListener('click', async function() {
        const apiKey = elements.cohereApiKey.value.trim();
        if (!apiKey) {
            showStatus('אנא הזן מפתח API', 'error');
            return;
        }

        // Test API connection
        showStatus('בודק חיבור ל-Cohere...', 'success');
        elements.saveApiKey.disabled = true;
        
        try {
            const testResponse = await fetch('https://api.cohere.ai/v1/generate', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'command',
                    prompt: 'Test connection',
                    max_tokens: 5,
                    temperature: 0.7
                })
            });

            if (testResponse.ok) {
                chrome.storage.local.set({
                    cohereApiKey: apiKey
                }, function() {
                    showStatus('מפתח API נשמר בהצלחה! החיבור ל-Cohere פעיל.', 'success');
                    elements.cohereApiKey.value = '';
                });
            } else {
                const errorData = await testResponse.json();
                showStatus(`שגיאה בחיבור ל-Cohere: ${errorData.message || 'מפתח לא תקין'}`, 'error');
            }
        } catch (error) {
            showStatus(`שגיאה בבדיקת החיבור: ${error.message}`, 'error');
        }
        
        elements.saveApiKey.disabled = false;
    });

    // שמירת הגדרות
    elements.saveSettings.addEventListener('click', function() {
        const settings = {
            autoLike: elements.autoLike.checked,
            autoComment: elements.autoComment.checked,
            commentStyle: elements.commentStyle.value,
            enableLinkedIn: elements.enableLinkedIn.checked,
            enableFacebook: elements.enableFacebook.checked
        };

        chrome.storage.sync.set(settings, function() {
            showStatus('הגדרות נשמרו בהצלחה', 'success');
            
            // שליחת הודעה לכל הכרטיסיות הפעילות
            chrome.tabs.query({}, function(tabs) {
                tabs.forEach(tab => {
                    if (tab.url && (tab.url.includes('linkedin.com') || tab.url.includes('facebook.com'))) {
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'updateSettings',
                            settings: settings
                        }).catch(() => {
                            // Ignore errors for inactive tabs
                        });
                    }
                });
            });
        });
    });

    function loadSettings() {
        chrome.storage.sync.get([
            'autoLike',
            'autoComment', 
            'commentStyle',
            'enableLinkedIn',
            'enableFacebook'
        ], function(result) {
            elements.autoLike.checked = result.autoLike || false;
            elements.autoComment.checked = result.autoComment || false;
            elements.commentStyle.value = result.commentStyle || 'professional';
            elements.enableLinkedIn.checked = result.enableLinkedIn !== false;
            elements.enableFacebook.checked = result.enableFacebook !== false;
        });
    }

    function showStatus(message, type) {
        elements.status.textContent = message;
        elements.status.className = `status ${type}`;
        
        setTimeout(() => {
            elements.status.className = 'status';
        }, 3000);
    }
}); 