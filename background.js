// background.js

const IG_APP_ID = '936619743392459';
const ASBD_ID = '129477';

const DEFAULT_HEADERS = {
    'X-Requested-With': 'XMLHttpRequest',
    'X-IG-App-ID': IG_APP_ID,
    'X-Instagram-AJAX': '1',
    'X-ASBD-ID': ASBD_ID,
};

let popupWindowId = null;

chrome.action.onClicked.addListener(async () => {
    if (popupWindowId !== null) {
        try {
            const win = await chrome.windows.get(popupWindowId);
            if (win) {
                await chrome.windows.update(popupWindowId, { focused: true });
                return;
            }
        } catch (e) {
            popupWindowId = null;
        }
    }

    const newWin = await chrome.windows.create({
        url: chrome.runtime.getURL("popup.html"),
        type: "popup",
        width: 440,
        height: 640
    });
    popupWindowId = newWin ? newWin.id : null;
});

chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === popupWindowId) {
        popupWindowId = null;
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startScan') {
        runScan().then(sendResponse);
        return true; 
    }
    if (request.action === 'unfollowUser') {
        unfollowUser(request.userId).then(sendResponse);
        return true;
    }
});

async function getCSRF() {
    const cookies = await chrome.cookies.getAll({ domain: 'instagram.com' });
    const csrftoken = cookies.find(c => c.name === 'csrftoken');
    return csrftoken ? csrftoken.value : null;
}

async function getLoggedInUser() {
    // Try to get dynamic data from an active Instagram tab
    const tabs = await chrome.tabs.query({ url: '*://*.instagram.com/*' });
    
    if (tabs.length > 0) {
        try {
            const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getInstagramData' });
            if (response && response.userId) {
                return response.userId;
            }
        } catch (e) {
            console.warn('Could not get data from tab:', e);
        }
    }

    // Fallback 1: API check
    try {
        const response = await fetch('https://www.instagram.com/api/v1/web/get_current_user/', {
            headers: {
                ...DEFAULT_HEADERS
            }
        });
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            if (data.user && data.user.pk) return String(data.user.pk);
        }
    } catch (e) {
        console.warn('API user check failed:', e);
    }

    // Fallback 2: Cookies
    const cookies = await chrome.cookies.getAll({ domain: 'instagram.com' });
    const ds_user_id = cookies.find(c => c.name === 'ds_user_id');
    if (ds_user_id) return ds_user_id.value;

    throw new Error('Unauthorized');
}

async function fetchAll(endpoint, userId, onProgress) {
    let allItems = [];
    let hasNextPage = true;
    let maxId = '';
    const limit = 50;

    while (hasNextPage) {
        const url = `https://www.instagram.com/api/v1/friendships/${userId}/${endpoint}/?count=${limit}${maxId ? `&max_id=${maxId}` : ''}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    ...DEFAULT_HEADERS
                }
            });

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('text/html')) {
                throw new Error('Unauthorized');
            }

            if (response.status === 401) throw new Error('Unauthorized');
            if (response.status === 429) throw new Error('Rate Limited');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            const users = data.users || [];

            const processedUsers = users.map(u => ({
                id: String(u.pk || u.id_ || u.id),
                username: u.username,
                full_name: u.full_name || '',
                profile_pic_url: u.profile_pic_url || ''
            }));

            allItems = allItems.concat(processedUsers);
            
            if (onProgress) {
                onProgress(processedUsers, endpoint);
            }

            maxId = data.next_max_id;
            hasNextPage = !!maxId;
            
            // Intervalo de segurança entre requisições de paginação
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 1500));
        } catch (err) {
            console.error(`Error fetching ${endpoint}:`, err);
            throw err;
        }
    }

    return allItems;
}

async function runScan() {
    try {
        const userId = await getLoggedInUser();
        
        chrome.runtime.sendMessage({ action: 'updateProgress', text: 'Buscando seguidores...' }).catch(() => {});
        const followers = await fetchAll('followers', userId, (users) => {
            chrome.runtime.sendMessage({ action: 'partialProgress', type: 'followers', count: users.length }).catch(() => {});
        });
        const followerIds = new Set(followers.map(f => f.id));

        chrome.runtime.sendMessage({ action: 'updateProgress', text: 'Buscando quem você segue...' }).catch(() => {});
        const following = await fetchAll('following', userId, (users) => {
            const newNonFollowers = users.filter(u => !followerIds.has(u.id));
            if (newNonFollowers.length > 0) {
                chrome.runtime.sendMessage({ action: 'foundNonFollowers', users: newNonFollowers }).catch(() => {});
            }
        });

        const finalNonFollowers = following.filter(f => !followerIds.has(f.id));
        
        // Salvar no storage local para persistência
        await chrome.storage.local.set({
            lastScan: {
                date: new Date().toISOString(),
                nonFollowers: finalNonFollowers,
                followersTotal: followers.length,
                followingTotal: following.length
            }
        });

        return { 
            success: true, 
            nonFollowers: finalNonFollowers, 
            followersTotal: followers.length, 
            followingTotal: following.length 
        };
    } catch (error) {
        console.error('Scan error:', error);
        return { success: false, error: error.message };
    }
}

async function unfollowUser(userId) {
    try {
        const csrftoken = await getCSRF();
        if (!csrftoken) throw new Error('CSRF token not found');

        const response = await fetch(`https://www.instagram.com/api/v1/friendships/destroy/${userId}/`, {
            method: 'POST',
            headers: {
                ...DEFAULT_HEADERS,
                'X-CSRFToken': csrftoken,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            throw new Error('Sessão expirada ou página de login retornada');
        }
        if (response.status === 429) {
            throw new Error('Rate Limited');
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return { success: data.status === 'ok' };
    } catch (error) {
        console.error('Unfollow error:', error);
        return { success: false, error: error.message };
    }
}
