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
    elements.saveApiKey.addEventListener('click', function() {
        const apiKey = elements.cohereApiKey.value.trim();
        if (!apiKey) {
            showStatus('אנא הזן מפתח API', 'error');
            return;
        }

        chrome.storage.local.set({
            cohereApiKey: apiKey
        }, function() {
            showStatus('מפתח API נשמר בהצלחה', 'success');
            elements.cohereApiKey.value = '';
        });
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