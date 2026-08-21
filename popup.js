// popup.js

const scanBtn = document.getElementById('scan-btn');
const unfollowAllBtn = document.getElementById('unfollow-all-btn');
const exportBtn = document.getElementById('export-btn');
const bulkActions = document.getElementById('bulk-actions');
const statusText = document.getElementById('status');
const lastScanInfo = document.getElementById('last-scan-info');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const resultsContainer = document.getElementById('results-container');
const userList = document.getElementById('user-list');
const countSpan = document.getElementById('count');
const loginMsg = document.getElementById('login-msg');
const searchInput = document.getElementById('search-input');

let nonFollowers = [];
let followersCount = 0;
let progressInterval = null;

// SVG local fallback avatar
const DEFAULT_AVATAR = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;

// Inicialização: carregar scan anterior do storage
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const stored = await chrome.storage.local.get('lastScan');
        if (stored && stored.lastScan && stored.lastScan.nonFollowers) {
            nonFollowers = stored.lastScan.nonFollowers;
            const date = new Date(stored.lastScan.date);
            const formattedDate = date.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            lastScanInfo.textContent = `Último scan: ${formattedDate} (${nonFollowers.length} não-seguidores)`;
            lastScanInfo.classList.remove('hidden');
            
            if (nonFollowers.length > 0) {
                resultsContainer.classList.remove('hidden');
                bulkActions.classList.remove('hidden');
                renderUserList(nonFollowers);
            }
        }
    } catch (e) {
        console.warn('Erro ao carregar dados salvos:', e);
    }
});

// Mensagens em tempo real vindas do background
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updateProgress') {
        updateProgress(null, message.text);
    }
    if (message.action === 'partialProgress') {
        if (message.type === 'followers') {
            followersCount += message.count;
            updateProgress(null, `Buscando seguidores... (${followersCount} processados)`);
        }
    }
    if (message.action === 'foundNonFollowers') {
        resultsContainer.classList.remove('hidden');
        bulkActions.classList.remove('hidden');
        appendUsers(message.users);
    }
});

// Ação de iniciar scan
scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    scanBtn.innerText = 'Escaneando...';
    statusText.innerText = 'Escaneando sua lista...';
    lastScanInfo.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    loginMsg.classList.add('hidden');
    bulkActions.classList.add('hidden');
    userList.innerHTML = '';
    nonFollowers = [];
    followersCount = 0;
    if (searchInput) searchInput.value = '';
    
    updateProgress(5, 'Conectando ao Instagram...');

    // Limpar qualquer intervalo anterior
    if (progressInterval) clearInterval(progressInterval);

    // Pulso visual simulado para a barra
    let percent = 5;
    progressInterval = setInterval(() => {
        if (percent < 92) {
            percent += 1;
            progressFill.style.width = `${percent}%`;
        }
    }, 800);

    chrome.runtime.sendMessage({ action: 'startScan' }, (response) => {
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }

        scanBtn.disabled = false;
        scanBtn.innerText = 'Escanear Novamente';

        if (response && response.success) {
            progressFill.style.width = '100%';
            progressText.innerText = '100%';
            setTimeout(() => progressContainer.classList.add('hidden'), 500);

            statusText.innerText = 'Escaneamento concluído!';
            if (nonFollowers.length === 0) {
                statusText.innerText = 'Parabéns! Todos que você segue te seguem de volta.';
            } else {
                bulkActions.classList.remove('hidden');
            }
        } else {
            handleError(response ? response.error : 'Erro desconhecido');
        }
    });
});

function updateProgress(percent, text) {
    if (percent !== null) progressFill.style.width = `${percent}%`;
    if (text) progressText.innerText = text;
}

function handleError(error) {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    scanBtn.disabled = false;
    scanBtn.innerText = 'Escanear Seguidores';
    statusText.innerText = 'Falha no escaneamento';
    progressContainer.classList.add('hidden');

    if (error === 'Unauthorized') {
        loginMsg.classList.remove('hidden');
    } else if (error === 'Rate Limited') {
        statusText.innerText = 'Limite temporário atingido. Aguarde alguns minutos.';
    } else {
        statusText.innerText = `Erro: ${error}`;
    }
}

function renderUserList(users) {
    userList.innerHTML = '';
    countSpan.innerText = users.length;

    users.forEach(user => {
        const li = createUserElement(user);
        userList.appendChild(li);
    });
}

function appendUsers(users) {
    users.forEach(user => {
        // Evitar duplicados
        if (nonFollowers.some(u => u.id === user.id)) return;
        
        nonFollowers.push(user);
        countSpan.innerText = nonFollowers.length;

        const li = createUserElement(user);
        userList.appendChild(li);
    });
}

function createUserElement(user) {
    const li = document.createElement('li');
    li.className = 'user-item';
    li.dataset.username = (user.username || '').toLowerCase();
    li.dataset.fullname = (user.full_name || '').toLowerCase();

    const infoDiv = document.createElement('div');
    infoDiv.className = 'user-info';

    const img = document.createElement('img');
    img.className = 'user-avatar';
    img.src = user.profile_pic_url || DEFAULT_AVATAR;
    img.alt = user.username;
    img.loading = 'lazy';
    img.addEventListener('error', () => {
        img.src = DEFAULT_AVATAR;
    });

    const textContainer = document.createElement('div');
    textContainer.className = 'user-text';

    const link = document.createElement('a');
    link.className = 'username-link';
    link.href = `https://www.instagram.com/${user.username}/`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = `@${user.username}`;
    link.title = `Ver perfil de ${user.username}`;

    textContainer.appendChild(link);

    if (user.full_name) {
        const fullNameSpan = document.createElement('span');
        fullNameSpan.className = 'full-name';
        fullNameSpan.textContent = user.full_name;
        textContainer.appendChild(fullNameSpan);
    }

    infoDiv.appendChild(img);
    infoDiv.appendChild(textContainer);

    const btn = document.createElement('button');
    btn.className = 'unfollow-btn';
    btn.textContent = 'Remover';
    btn.dataset.id = user.id;
    btn.dataset.username = user.username;
    
    btn.addEventListener('click', async () => {
        await unfollow(user.id, btn, li);
    });

    li.appendChild(infoDiv);
    li.appendChild(btn);
    return li;
}

// Função unfollow retornando Promise garantida
function unfollow(userId, btn, li) {
    return new Promise((resolve) => {
        btn.disabled = true;
        btn.innerText = '...';

        chrome.runtime.sendMessage({ action: 'unfollowUser', userId }, (response) => {
            if (response && response.success) {
                li.classList.add('unfollowed');
                btn.innerText = 'Removido';
                btn.classList.add('removed');
                
                // Atualizar dados salvos
                nonFollowers = nonFollowers.filter(u => u.id !== userId);
                countSpan.innerText = nonFollowers.length;
                chrome.storage.local.set({
                    lastScan: {
                        date: new Date().toISOString(),
                        nonFollowers: nonFollowers
                    }
                }).catch(() => {});
                
                resolve({ success: true, userId });
            } else {
                btn.disabled = false;
                btn.innerText = 'Erro';
                setTimeout(() => {
                    btn.innerText = 'Remover';
                }, 2500);
                resolve({ success: false, userId, error: response ? response.error : 'unknown' });
            }
        });
    });
}

// Remover todos em lote com controle sequencial e feedback em tempo real
unfollowAllBtn.addEventListener('click', async () => {
    const activeButtons = Array.from(userList.querySelectorAll('.unfollow-btn:not([disabled])'));
    
    if (activeButtons.length === 0) {
        alert('Nenhum usuário pendente para remoção.');
        return;
    }

    const confirmMsg = `Tem certeza que deseja remover ${activeButtons.length} contas? ` +
        `O processo é feito com pausas graduais (4 a 8 segundos) para segurança da sua conta.`;

    if (!confirm(confirmMsg)) return;

    unfollowAllBtn.disabled = true;
    scanBtn.disabled = true;
    const total = activeButtons.length;
    let completed = 0;

    for (const btn of activeButtons) {
        const userId = btn.dataset.id;
        const li = btn.closest('.user-item');
        
        completed++;
        unfollowAllBtn.innerText = `Removendo (${completed}/${total})...`;

        // Executa e aguarda resposta
        await unfollow(userId, btn, li);

        // Intervalo aleatório de segurança entre unfollows (4s a 7s)
        const delay = 4000 + Math.random() * 3000;
        await new Promise(r => setTimeout(r, delay));
    }

    unfollowAllBtn.innerText = 'Concluído!';
    setTimeout(() => {
        unfollowAllBtn.disabled = false;
        unfollowAllBtn.innerText = 'Remover Todos';
        scanBtn.disabled = false;
    }, 3000);
});

// Filtro de busca
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        const items = userList.querySelectorAll('.user-item');
        
        let visibleCount = 0;
        items.forEach(item => {
            const username = item.dataset.username || '';
            const fullname = item.dataset.fullname || '';
            const matches = username.includes(query) || fullname.includes(query);
            
            if (matches) {
                item.style.display = 'flex';
                visibleCount++;
            } else {
                item.style.display = 'none';
            }
        });

        countSpan.innerText = query ? `${visibleCount}/${nonFollowers.length}` : nonFollowers.length;
    });
}

// Exportar CSV
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        if (nonFollowers.length === 0) {
            alert('Nenhum dado para exportar.');
            return;
        }

        const headers = ['ID', 'Username', 'Nome Completo', 'Perfil'];
        const rows = nonFollowers.map(u => [
            `"${u.id}"`,
            `"${u.username}"`,
            `"${(u.full_name || '').replace(/"/g, '""')}"`,
            `"https://www.instagram.com/${u.username}/"`
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `instagram-nao-seguidores-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}
