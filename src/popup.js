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
                    model: 'command-a-03-2025',
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

    // Persona management event listeners
    document.getElementById('managePersonas').addEventListener('click', openPersonaModal);
    document.getElementById('addPersona').addEventListener('click', showPersonaEditor);
    document.getElementById('savePersona').addEventListener('click', savePersona);
    document.getElementById('cancelEdit').addEventListener('click', hidePersonaEditor);
    document.getElementById('deletePersona').addEventListener('click', deletePersona);
    document.getElementById('addExample').addEventListener('click', addExample);
    
    // Modal close handlers
    document.querySelector('.close').addEventListener('click', closePersonaModal);
    document.getElementById('personaModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closePersonaModal();
        }
    });
    
    // Load personas on startup
    loadPersonas();
});

let currentEditingPersona = null;

// Persona Management Functions
function loadPersonas() {
    chrome.storage.sync.get(['personas', 'activePersona'], function(result) {
        const personas = result.personas || {};
        const activePersona = result.activePersona || '';
        
        // Update active persona dropdown
        const activePersonaSelect = document.getElementById('activePersona');
        activePersonaSelect.innerHTML = '<option value="">ללא פרסונה</option>';
        
        Object.keys(personas).forEach(id => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = personas[id].name;
            if (id === activePersona) {
                option.selected = true;
            }
            activePersonaSelect.appendChild(option);
        });
        
        // Update personas list in modal
        updatePersonasList(personas);
    });
}

function updatePersonasList(personas) {
    const personasList = document.getElementById('personasList');
    personasList.innerHTML = '';
    
    if (Object.keys(personas).length === 0) {
        personasList.innerHTML = '<p style="color: #666; font-style: italic;">אין פרסונות שמורות</p>';
        return;
    }
    
    Object.keys(personas).forEach(id => {
        const persona = personas[id];
        const personaItem = document.createElement('div');
        personaItem.className = 'persona-item';
        personaItem.innerHTML = `
            <div class="persona-info">
                <h5>${persona.name}</h5>
                <p>${persona.description || 'ללא תיאור'}</p>
                <small>${persona.examples ? persona.examples.length : 0} דוגמאות</small>
            </div>
            <div class="persona-actions">
                <button class="btn-edit" data-id="${id}">ערוך</button>
                <button class="btn-delete" data-id="${id}">מחק</button>
            </div>
        `;
        
        // Add event listeners
        personaItem.querySelector('.btn-edit').addEventListener('click', () => editPersona(id, persona));
        personaItem.querySelector('.btn-delete').addEventListener('click', () => confirmDeletePersona(id));
        
        personasList.appendChild(personaItem);
    });
}

function openPersonaModal() {
    document.getElementById('personaModal').style.display = 'block';
    loadPersonas(); // Refresh the list
}

function closePersonaModal() {
    document.getElementById('personaModal').style.display = 'none';
    hidePersonaEditor();
}

function showPersonaEditor(personaData = null) {
    const editor = document.getElementById('personaEditor');
    const title = document.getElementById('editorTitle');
    
    if (personaData) {
        title.textContent = 'עריכת פרסונה';
        document.getElementById('personaName').value = personaData.name || '';
        document.getElementById('personaDescription').value = personaData.description || '';
        document.getElementById('deletePersona').style.display = 'inline-block';
        updateExamplesList(personaData.examples || []);
    } else {
        title.textContent = 'פרסונה חדשה';
        document.getElementById('personaName').value = '';
        document.getElementById('personaDescription').value = '';
        document.getElementById('deletePersona').style.display = 'none';
        updateExamplesList([]);
        currentEditingPersona = null;
    }
    
    document.getElementById('newExample').value = '';
    editor.style.display = 'block';
}

function hidePersonaEditor() {
    document.getElementById('personaEditor').style.display = 'none';
    currentEditingPersona = null;
}

function editPersona(id, persona) {
    currentEditingPersona = id;
    showPersonaEditor(persona);
}

function savePersona() {
    const name = document.getElementById('personaName').value.trim();
    const description = document.getElementById('personaDescription').value.trim();
    
    if (!name) {
        alert('יש להזין שם לפרסונה');
        return;
    }
    
    const examples = [];
    document.querySelectorAll('.example-text').forEach(el => {
        examples.push(el.textContent);
    });
    
    const personaData = {
        name: name,
        description: description,
        examples: examples,
        createdAt: currentEditingPersona ? undefined : new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    chrome.storage.sync.get(['personas'], function(result) {
        const personas = result.personas || {};
        const personaId = currentEditingPersona || 'persona_' + Date.now();
        
        if (currentEditingPersona) {
            // Keep the original createdAt date
            personaData.createdAt = personas[currentEditingPersona].createdAt;
        }
        
        personas[personaId] = personaData;
        
        chrome.storage.sync.set({ personas: personas }, function() {
            console.log('פרסונה נשמרה בהצלחה');
            loadPersonas();
            hidePersonaEditor();
        });
    });
}

function deletePersona() {
    if (!currentEditingPersona) return;
    
    if (confirm('האם אתה בטוח שברצונך למחוק את הפרסונה?')) {
        chrome.storage.sync.get(['personas', 'activePersona'], function(result) {
            const personas = result.personas || {};
            const activePersona = result.activePersona;
            
            delete personas[currentEditingPersona];
            
            const updateData = { personas: personas };
            
            // If this was the active persona, clear it
            if (activePersona === currentEditingPersona) {
                updateData.activePersona = '';
            }
            
            chrome.storage.sync.set(updateData, function() {
                console.log('פרסונה נמחקה בהצלחה');
                loadPersonas();
                hidePersonaEditor();
            });
        });
    }
}

function confirmDeletePersona(id) {
    chrome.storage.sync.get(['personas'], function(result) {
        const personas = result.personas || {};
        const persona = personas[id];
        
        if (confirm(`האם אתה בטוח שברצונך למחוק את הפרסונה "${persona.name}"?`)) {
            chrome.storage.sync.get(['activePersona'], function(activeResult) {
                delete personas[id];
                
                const updateData = { personas: personas };
                
                // If this was the active persona, clear it
                if (activeResult.activePersona === id) {
                    updateData.activePersona = '';
                }
                
                chrome.storage.sync.set(updateData, function() {
                    console.log('פרסונה נמחקה בהצלחה');
                    loadPersonas();
                });
            });
        }
    });
}

function addExample() {
    const newExampleText = document.getElementById('newExample').value.trim();
    if (!newExampleText) {
        alert('יש להזין דוגמה');
        return;
    }
    
    const examplesList = document.getElementById('examplesList');
    const examples = [];
    
    // Get existing examples
    document.querySelectorAll('.example-text').forEach(el => {
        examples.push(el.textContent);
    });
    
    // Add new example
    examples.push(newExampleText);
    
    // Update the list
    updateExamplesList(examples);
    
    // Clear the input
    document.getElementById('newExample').value = '';
}

function updateExamplesList(examples) {
    const examplesList = document.getElementById('examplesList');
    examplesList.innerHTML = '';
    
    examples.forEach((example, index) => {
        const exampleItem = document.createElement('div');
        exampleItem.className = 'example-item';
        exampleItem.innerHTML = `
            <p class="example-text">${example}</p>
            <button class="example-remove" data-index="${index}">×</button>
        `;
        
        exampleItem.querySelector('.example-remove').addEventListener('click', () => {
            removeExample(index);
        });
        
        examplesList.appendChild(exampleItem);
    });
}

function removeExample(index) {
    const examples = [];
    document.querySelectorAll('.example-text').forEach(el => {
        examples.push(el.textContent);
    });
    
    examples.splice(index, 1);
    updateExamplesList(examples);
}

function loadSettings() {
    chrome.storage.sync.get([
        'autoLike', 'autoComment', 'commentStyle', 'cohereApiKey', 
        'linkedinEnabled', 'facebookEnabled', 'activePersona'
    ], function(result) {
        document.getElementById('autoLike').checked = result.autoLike || false;
        document.getElementById('autoComment').checked = result.autoComment || false;
        document.getElementById('commentStyle').value = result.commentStyle || 'professional';
        document.getElementById('cohereApiKey').value = result.cohereApiKey || '';
        document.getElementById('linkedinEnabled').checked = result.linkedinEnabled !== false;
        document.getElementById('facebookEnabled').checked = result.facebookEnabled !== false;
        
        // Load active persona
        if (result.activePersona) {
            document.getElementById('activePersona').value = result.activePersona;
        }
    });
}

function saveSettings() {
    const settings = {
        autoLike: document.getElementById('autoLike').checked,
        autoComment: document.getElementById('autoComment').checked,
        commentStyle: document.getElementById('commentStyle').value,
        cohereApiKey: document.getElementById('cohereApiKey').value,
        linkedinEnabled: document.getElementById('linkedinEnabled').checked,
        facebookEnabled: document.getElementById('facebookEnabled').checked,
        activePersona: document.getElementById('activePersona').value
    };

    chrome.storage.sync.set(settings, function() {
        console.log('הגדרות נשמרו');
        
        // Send message to background script to update settings
        chrome.runtime.sendMessage({
            action: 'settingsUpdated',
            settings: settings
        });
        
        // Show confirmation
        const saveBtn = document.getElementById('saveSettings');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'נשמר!';
        setTimeout(() => {
            saveBtn.textContent = originalText;
        }, 2000);
    });
}

// ... existing testApiConnection function ... 