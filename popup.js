// popup.js

const scanBtn = document.getElementById('scan-btn');
const unfollowAllBtn = document.getElementById('unfollow-all-btn');
const statusText = document.getElementById('status');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const resultsContainer = document.getElementById('results-container');
const userList = document.getElementById('user-list');
const countSpan = document.getElementById('count');
const loginMsg = document.getElementById('login-msg');

let nonFollowers = [];
let followersCount = 0;

// Listen for real-time updates from background
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'updateProgress') {
        updateProgress(null, message.text);
    }
    if (message.action === 'partialProgress') {
        if (message.type === 'followers') {
            followersCount += message.count;
            updateProgress(null, `Buscando seguidores... (${followersCount} encontrados)`);
        }
    }
    if (message.action === 'foundNonFollowers') {
        resultsContainer.classList.remove('hidden');
        appendUsers(message.users);
    }
});

scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    statusText.innerText = 'Escaneando...';
    progressContainer.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    loginMsg.classList.add('hidden');
    unfollowAllBtn.classList.add('hidden');
    userList.innerHTML = '';
    nonFollowers = [];
    followersCount = 0;
    
    updateProgress(5, 'Iniciando...');

    chrome.runtime.sendMessage({ action: 'startScan' }, (response) => {
        if (response && response.success) {
            statusText.innerText = 'Escaneamento concluído';
            progressContainer.classList.add('hidden');
            if (nonFollowers.length === 0) {
                statusText.innerText = 'Nenhum não-seguidor encontrado.';
            }
        } else {
            handleError(response ? response.error : 'Unknown error');
        }
    });

    // Visual pulse for progress bar
    let percent = 5;
    let int = setInterval(() => {
        if (percent < 95) {
            percent += 1;
            progressFill.style.width = `${percent}%`;
        } else {
            clearInterval(int);
        }
    }, 1000);
});

function updateProgress(percent, text) {
    if (percent !== null) progressFill.style.width = `${percent}%`;
    if (text) progressText.innerText = text;
}

function handleError(error) {
    scanBtn.disabled = false;
    statusText.innerText = 'Erro no escaneamento';
    progressContainer.classList.add('hidden');
    if (error === 'Unauthorized') {
        loginMsg.classList.remove('hidden');
    } else {
        alert('Erro: ' + error);
    }
}

function appendUsers(users) {
    users.forEach(user => {
        // Prevent duplicates
        if (nonFollowers.some(u => u.id === user.id)) return;
        
        nonFollowers.push(user);
        countSpan.innerText = nonFollowers.length;
        unfollowAllBtn.classList.remove('hidden');

        const li = document.createElement('li');
        li.className = 'user-item';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'user-info';

        const img = document.createElement('img');
        img.className = 'user-avatar';
        img.src = user.profile_pic_url;
        img.alt = user.username;
        img.addEventListener('error', () => {
            img.src = 'https://www.instagram.com/static/images/web/mobile_portals/badge-iphone.png/22cd9271e4c5.png';
        });

        const span = document.createElement('span');
        span.className = 'username';
        span.textContent = user.username;

        infoDiv.appendChild(img);
        infoDiv.appendChild(span);

        const btn = document.createElement('button');
        btn.className = 'unfollow-btn';
        btn.textContent = 'Remover';
        btn.dataset.id = user.id;
        btn.addEventListener('click', () => {
            unfollow(user.id, btn, li);
        });

        li.appendChild(infoDiv);
        li.appendChild(btn);
        userList.appendChild(li);
    });
}

async function unfollow(userId, btn, li) {
    btn.disabled = true;
    btn.innerText = '...';

    chrome.runtime.sendMessage({ action: 'unfollowUser', userId }, (response) => {
        if (response && response.success) {
            li.style.opacity = '0.5';
            btn.innerText = 'Removido';
            btn.style.backgroundColor = 'transparent';
        } else {
            btn.disabled = false;
            btn.innerText = 'Erro';
            setTimeout(() => btn.innerText = 'Remover', 2000);
        }
    });
}

unfollowAllBtn.addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja remover TODOS que não te seguem? Isso pode levar tempo devido aos limites do Instagram.')) return;
    
    unfollowAllBtn.disabled = true;
    const buttons = Array.from(userList.querySelectorAll('.unfollow-btn:not([disabled])'));
    
    for (const btn of buttons) {
        const userId = btn.dataset.id;
        const li = btn.closest('.user-item');
        await new Promise(resolve => {
            unfollow(userId, btn, li);
            setTimeout(resolve, 5000 + Math.random() * 5000);
        });
    }
});
