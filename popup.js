// popup.js

const scanBtn = document.getElementById('scan-btn');
const unfollowAllBtn = document.getElementById('unfollow-all-btn');
const cancelUnfollowBtn = document.getElementById('cancel-unfollow-btn');
const exportBtn = document.getElementById('export-btn');
const bulkActions = document.getElementById('bulk-actions');
const statusText = document.getElementById('status');
const lastScanInfo = document.getElementById('last-scan-info');
const clearDataBtn = document.getElementById('clear-data-btn');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const resultsContainer = document.getElementById('results-container');
const userList = document.getElementById('user-list');
const countSpan = document.getElementById('count');
const whitelistCountSpan = document.getElementById('whitelist-count');
const noSearchResults = document.getElementById('no-search-results');
const loginMsg = document.getElementById('login-msg');
const searchInput = document.getElementById('search-input');

// Pills de filtro
const filterPills = document.querySelectorAll('.filter-pills .pill');

let nonFollowers = [];
let whitelist = new Set();
let currentFilter = 'all'; // 'all' | 'unprotected' | 'whitelist'
let followersCount = 0;
let progressInterval = null;
let isBulkRunning = false;
let isCancellingBulk = false;

// SVG local fallback avatar
const DEFAULT_AVATAR = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;

// Inicialização: carregar scan anterior e whitelist do storage
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const stored = await chrome.storage.local.get(['lastScan', 'whitelist']);
        
        if (stored && Array.isArray(stored.whitelist)) {
            whitelist = new Set(stored.whitelist);
            updateWhitelistBadge();
        }

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
            if (clearDataBtn) clearDataBtn.classList.remove('hidden');
            
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

// Limpar dados salvos
if (clearDataBtn) {
    clearDataBtn.addEventListener('click', async () => {
        if (!confirm('Deseja limpar os dados do último escaneamento salvo?')) return;
        await chrome.storage.local.remove('lastScan');
        nonFollowers = [];
        lastScanInfo.textContent = '';
        lastScanInfo.classList.add('hidden');
        clearDataBtn.classList.add('hidden');
        resultsContainer.classList.add('hidden');
        bulkActions.classList.add('hidden');
        userList.innerHTML = '';
        statusText.innerText = 'Pronto para escanear';
    });
}

// Filtro por abas / pills
filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
        filterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentFilter = pill.dataset.filter;
        applyFilterAndSearch();
    });
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
    if (isBulkRunning) return;

    scanBtn.disabled = true;
    scanBtn.innerText = 'Escaneando...';
    statusText.innerText = 'Escaneando sua lista...';
    lastScanInfo.classList.add('hidden');
    if (clearDataBtn) clearDataBtn.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    loginMsg.classList.add('hidden');
    bulkActions.classList.add('hidden');
    userList.innerHTML = '';
    nonFollowers = [];
    followersCount = 0;
    if (searchInput) searchInput.value = '';
    
    updateProgress(5, 'Conectando ao Instagram...');

    if (progressInterval) clearInterval(progressInterval);

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
            if (clearDataBtn) clearDataBtn.classList.remove('hidden');
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

function updateWhitelistBadge() {
    if (whitelistCountSpan) {
        whitelistCountSpan.innerText = whitelist.size;
    }
}

function renderUserList(users) {
    userList.innerHTML = '';
    countSpan.innerText = users.length;
    updateWhitelistBadge();

    users.forEach(user => {
        const li = createUserElement(user);
        userList.appendChild(li);
    });

    applyFilterAndSearch();
}

function appendUsers(users) {
    users.forEach(user => {
        if (nonFollowers.some(u => u.id === user.id)) return;
        
        nonFollowers.push(user);
        const li = createUserElement(user);
        userList.appendChild(li);
    });

    countSpan.innerText = nonFollowers.length;
    updateWhitelistBadge();
    applyFilterAndSearch();
}

function createUserElement(user) {
    const isProtected = whitelist.has(user.id);

    const li = document.createElement('li');
    li.className = `user-item ${isProtected ? 'protected' : ''}`;
    li.dataset.id = user.id;
    li.dataset.username = (user.username || '').toLowerCase();
    li.dataset.fullname = (user.full_name || '').toLowerCase();
    li.dataset.protected = isProtected ? 'true' : 'false';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'user-info';

    const img = document.createElement('img');
    img.className = 'user-avatar';
    img.referrerPolicy = 'no-referrer'; // Evita bloqueio de imagem do Instagram por Referer
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

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'user-actions';

    // Botão estrela de proteção
    const starBtn = document.createElement('button');
    starBtn.className = `star-btn ${isProtected ? 'active' : ''}`;
    starBtn.setAttribute('aria-label', isProtected ? 'Remover proteção' : 'Proteger conta');
    starBtn.title = isProtected ? 'Conta protegida (não será removida)' : 'Proteger conta de remoção';
    starBtn.textContent = '⭐';
    
    starBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleWhitelistUser(user.id, starBtn, li);
    });

    const unfollowBtn = document.createElement('button');
    unfollowBtn.className = 'unfollow-btn';
    unfollowBtn.textContent = 'Remover';
    unfollowBtn.dataset.id = user.id;
    unfollowBtn.dataset.username = user.username;
    
    unfollowBtn.addEventListener('click', async () => {
        await unfollow(user.id, unfollowBtn, li);
    });

    actionsDiv.appendChild(starBtn);
    actionsDiv.appendChild(unfollowBtn);

    li.appendChild(infoDiv);
    li.appendChild(actionsDiv);
    return li;
}

// Alternar status de whitelist do usuário
async function toggleWhitelistUser(userId, starBtn, li) {
    if (whitelist.has(userId)) {
        whitelist.delete(userId);
        starBtn.classList.remove('active');
        starBtn.title = 'Proteger conta de remoção';
        li.classList.remove('protected');
        li.dataset.protected = 'false';
    } else {
        whitelist.add(userId);
        starBtn.classList.add('active');
        starBtn.title = 'Conta protegida (não será removida)';
        li.classList.add('protected');
        li.dataset.protected = 'true';
    }

    await chrome.storage.local.set({ whitelist: Array.from(whitelist) });
    updateWhitelistBadge();
    applyFilterAndSearch();
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
                chrome.storage.local.set({
                    lastScan: {
                        date: new Date().toISOString(),
                        nonFollowers: nonFollowers
                    }
                }).catch(() => {});
                
                applyFilterAndSearch();
                resolve({ success: true, userId });
            } else {
                btn.disabled = false;
                btn.innerText = 'Erro';
                const errorMsg = response ? response.error : 'unknown';
                setTimeout(() => {
                    btn.innerText = 'Remover';
                }, 2500);
                resolve({ success: false, userId, error: errorMsg });
            }
        });
    });
}

// Botão cancelar remoção em lote
if (cancelUnfollowBtn) {
    cancelUnfollowBtn.addEventListener('click', () => {
        if (!isBulkRunning) return;
        isCancellingBulk = true;
        cancelUnfollowBtn.innerText = 'Parando...';
        cancelUnfollowBtn.disabled = true;
    });
}

// Remover não protegidos em lote com controle sequencial, cancelamento e proteção anti-bloqueio
unfollowAllBtn.addEventListener('click', async () => {
    if (isBulkRunning) return;

    // Apenas botões de contas que NÃO estão protegidas e NÃO foram removidas
    const eligibleItems = Array.from(userList.querySelectorAll('.user-item:not(.unfollowed):not(.protected)'));
    const eligibleButtons = eligibleItems.map(item => item.querySelector('.unfollow-btn')).filter(btn => btn && !btn.disabled);
    
    if (eligibleButtons.length === 0) {
        if (whitelist.size > 0 && nonFollowers.length > 0) {
            alert('Todas as contas restantes estão protegidas com estrela ⭐.');
        } else {
            alert('Nenhum usuário pendente para remoção.');
        }
        return;
    }

    const confirmMsg = `Deseja remover ${eligibleButtons.length} contas não protegidas?\n\n` +
        `O processo é feito em fila com pausas de segurança (4 a 7 segundos) para proteger sua conta.\n` +
        `Contas protegidas com estrela ⭐ serão mantidas.`;

    if (!confirm(confirmMsg)) return;

    isBulkRunning = true;
    isCancellingBulk = false;
    unfollowAllBtn.disabled = true;
    scanBtn.disabled = true;
    exportBtn.disabled = true;
    cancelUnfollowBtn.classList.remove('hidden');
    cancelUnfollowBtn.disabled = false;
    cancelUnfollowBtn.innerText = 'Parar';

    const total = eligibleButtons.length;
    let completed = 0;

    for (const btn of eligibleButtons) {
        if (isCancellingBulk) {
            statusText.innerText = 'Remoção em lote cancelada pelo usuário.';
            break;
        }

        const userId = btn.dataset.id;
        const li = btn.closest('.user-item');
        
        // Pular se tiver sido protegido durante o processo
        if (whitelist.has(userId)) continue;

        completed++;
        unfollowAllBtn.innerText = `Removendo (${completed}/${total})...`;

        const res = await unfollow(userId, btn, li);

        // Se encontrou Rate Limit do Instagram, abortar imediatamente para proteger a conta!
        if (res && res.error && (res.error === 'Rate Limited' || res.error.includes('429'))) {
            alert('⚠️ O Instagram atingiu o limite temporário de requisições. O processo foi interrompido imediatamente para segurança da sua conta.');
            statusText.innerText = 'Pausado por limite de requisições do Instagram.';
            break;
        }

        // Intervalo aleatório de segurança entre unfollows (4s a 7s), testando cancelamento a cada 200ms
        const delay = 4000 + Math.random() * 3000;
        const start = Date.now();
        while (Date.now() - start < delay) {
            if (isCancellingBulk) break;
            await new Promise(r => setTimeout(r, 200));
        }
    }

    isBulkRunning = false;
    isCancellingBulk = false;
    cancelUnfollowBtn.classList.add('hidden');
    unfollowAllBtn.innerText = 'Concluído!';
    
    setTimeout(() => {
        unfollowAllBtn.disabled = false;
        unfollowAllBtn.innerText = 'Remover Pendentes';
        scanBtn.disabled = false;
        exportBtn.disabled = false;
    }, 2500);
});

// Filtro e busca unificados
function applyFilterAndSearch() {
    const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
    const items = userList.querySelectorAll('.user-item');
    
    let visibleCount = 0;
    items.forEach(item => {
        const username = item.dataset.username || '';
        const fullname = item.dataset.fullname || '';
        const isProt = item.dataset.protected === 'true';
        
        // Regra do filtro de abas
        let matchesFilter = true;
        if (currentFilter === 'unprotected' && isProt) matchesFilter = false;
        if (currentFilter === 'whitelist' && !isProt) matchesFilter = false;

        // Regra da busca
        const matchesQuery = !query || username.includes(query) || fullname.includes(query);

        if (matchesFilter && matchesQuery) {
            item.style.display = 'flex';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });

    if (noSearchResults) {
        noSearchResults.classList.toggle('hidden', visibleCount > 0 || nonFollowers.length === 0);
        if (query) {
            noSearchResults.textContent = `Nenhum usuário encontrado para "${query}".`;
        } else if (currentFilter === 'whitelist') {
            noSearchResults.textContent = 'Nenhuma conta protegida ainda. Clique na estrela ⭐ ao lado de qualquer usuário para proteger.';
        } else {
            noSearchResults.textContent = 'Nenhum usuário correspondente.';
        }
    }

    if (countSpan) {
        const total = nonFollowers.length;
        if (query || currentFilter !== 'all') {
            countSpan.innerText = `${visibleCount}/${total}`;
        } else {
            countSpan.innerText = total;
        }
    }
}

// Filtro de busca
if (searchInput) {
    searchInput.addEventListener('input', applyFilterAndSearch);
}

// Exportar CSV
if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        if (nonFollowers.length === 0) {
            alert('Nenhum dado para exportar.');
            return;
        }

        const headers = ['ID', 'Username', 'Nome Completo', 'Perfil', 'Protegido'];
        const rows = nonFollowers.map(u => [
            `"${u.id}"`,
            `"${u.username}"`,
            `"${(u.full_name || '').replace(/"/g, '""')}"`,
            `"https://www.instagram.com/${u.username}/"`,
            `"${whitelist.has(u.id) ? 'Sim' : 'Não'}"`
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
