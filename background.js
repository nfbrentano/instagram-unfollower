// background.js

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
                'X-Requested-With': 'XMLHttpRequest',
                'X-IG-App-ID': '936619743392459',
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
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-IG-App-ID': '936619743392459',
                    'X-Instagram-AJAX': '1', // Often required
                    'X-ASBD-ID': '129477',    // Common header in web requests
                }
            });

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('text/html')) {
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
                full_name: u.full_name,
                profile_pic_url: u.profile_pic_url
            }));

            allItems = allItems.concat(processedUsers);
            
            if (onProgress) {
                onProgress(processedUsers, endpoint);
            }

            maxId = data.next_max_id;
            hasNextPage = !!maxId;
            
            await new Promise(r => setTimeout(r, 2500 + Math.random() * 2000));
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
        
        chrome.runtime.sendMessage({ action: 'updateProgress', text: 'Buscando seguidores...' });
        const followers = await fetchAll('followers', userId, (users) => {
            chrome.runtime.sendMessage({ action: 'partialProgress', type: 'followers', count: users.length });
        });
        const followerIds = new Set(followers.map(f => f.id));

        chrome.runtime.sendMessage({ action: 'updateProgress', text: 'Buscando quem você segue...' });
        const following = await fetchAll('following', userId, (users) => {
            const newNonFollowers = users.filter(u => !followerIds.has(u.id));
            if (newNonFollowers.length > 0) {
                chrome.runtime.sendMessage({ action: 'foundNonFollowers', users: newNonFollowers });
            }
        });

        const finalNonFollowers = following.filter(f => !followerIds.has(f.id));
        return { success: true, nonFollowers: finalNonFollowers };
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
                'X-CSRFToken': csrftoken,
                'X-Requested-With': 'XMLHttpRequest',
                'X-IG-App-ID': '936619743392459',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const data = await response.json();
        return { success: data.status === 'ok' };
    } catch (error) {
        console.error('Unfollow error:', error);
        return { success: false, error: error.message };
    }
}
