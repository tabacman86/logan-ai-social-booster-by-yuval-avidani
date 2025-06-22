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
        status: document.getElementById('status'),
        apiTestResult: document.getElementById('apiTestResult')
    };

    // טעינת הגדרות קיימות
    loadSettings();

    // הצגת/הסתרת כפתור שמירת מפתח API
    elements.cohereApiKey.addEventListener('input', function() {
        const hasValue = this.value.trim().length > 0;
        elements.saveApiKey.style.display = hasValue ? 'inline-block' : 'none';
        elements.apiTestResult.innerHTML = ''; // נקה תוצאות קודמות
    });

    // שמירת מפתח API
    elements.saveApiKey.addEventListener('click', async function() {
        const apiKey = elements.cohereApiKey.value.trim();
        if (!apiKey) {
            showApiTestResult('אנא הזן מפתח API', 'error');
            return;
        }

        // Test API connection
        showApiTestResult('🔄 בודק חיבור ל-Cohere...', 'info');
        elements.saveApiKey.disabled = true;
        
        try {
            const testResponse = await fetch('https://api.cohere.com/v2/chat', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'command-a-03-2025',
                    messages: [
                        {
                            role: 'user',
                            content: 'Hello, please respond with "API test successful"'
                        }
                    ],
                    max_tokens: 10,
                    temperature: 0.1
                })
            });

            if (testResponse.ok) {
                const responseData = await testResponse.json();
                chrome.storage.local.set({
                    cohereApiKey: apiKey
                }, function() {
                    showApiTestResult('✅ החיבור ל-Cohere פעיל! משתמש במודל: command-a-03-2025', 'success');
                    elements.cohereApiKey.value = '';
                    elements.saveApiKey.style.display = 'none';
                    showStatus('מפתח API נשמר בהצלחה!', 'success');
                });
            } else {
                const errorData = await testResponse.json();
                showApiTestResult(`❌ שגיאה בחיבור: ${errorData.message || 'מפתח לא תקין'}`, 'error');
            }
        } catch (error) {
            showApiTestResult(`❌ שגיאה בבדיקת החיבור: ${error.message}`, 'error');
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

        // בדיקה אם יש מפתח API שמור
        chrome.storage.local.get(['cohereApiKey'], function(result) {
            if (result.cohereApiKey) {
                showApiTestResult('✅ מפתח API שמור ופעיל (command-a-03-2025)', 'success');
            }
        });
    }

    function showStatus(message, type) {
        elements.status.textContent = message;
        elements.status.className = `status ${type}`;
        
        setTimeout(() => {
            elements.status.className = 'status';
        }, 3000);
    }

    function showApiTestResult(message, type) {
        elements.apiTestResult.innerHTML = `<div class="api-result ${type}">${message}</div>`;
    }

    // Persona management event listeners - בדיקה שהאלמנטים קיימים לפני הוספת listeners
    const managePersonasBtn = document.getElementById('managePersonas');
    const addPersonaBtn = document.getElementById('addPersona');
    const savePersonaBtn = document.getElementById('savePersona');
    const cancelEditBtn = document.getElementById('cancelEdit');
    const deletePersonaBtn = document.getElementById('deletePersona');
    const addExampleBtn = document.getElementById('addExample');
    const closeBtn = document.querySelector('.close');
    const personaModal = document.getElementById('personaModal');

    if (managePersonasBtn) {
        managePersonasBtn.addEventListener('click', openPersonaModal);
    }
    if (addPersonaBtn) {
        addPersonaBtn.addEventListener('click', showPersonaEditor);
    }
    if (savePersonaBtn) {
        savePersonaBtn.addEventListener('click', savePersona);
    }
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', hidePersonaEditor);
    }
    if (deletePersonaBtn) {
        deletePersonaBtn.addEventListener('click', deletePersona);
    }
    if (addExampleBtn) {
        addExampleBtn.addEventListener('click', addExample);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closePersonaModal);
    }
    if (personaModal) {
        personaModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closePersonaModal();
            }
        });
    }
    
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
        if (activePersonaSelect) {
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
        }
        
        // Update personas list in modal
        updatePersonasList(personas);
    });
}

function updatePersonasList(personas) {
    const personasList = document.getElementById('personasList');
    if (!personasList) return;
    
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
    const modal = document.getElementById('personaModal');
    if (modal) {
        modal.style.display = 'block';
        loadPersonas(); // Refresh the list
    }
}

function closePersonaModal() {
    const modal = document.getElementById('personaModal');
    if (modal) {
        modal.style.display = 'none';
        hidePersonaEditor();
    }
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