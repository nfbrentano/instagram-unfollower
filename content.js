// content.js

// Listen for messages from the popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getInstagramData') {
        const data = extractData();
        sendResponse(data);
    }
});

function extractData() {
    try {
        // Method 1: Check for ds_user_id cookie via document.cookie
        const userIdMatch = document.cookie.match(/ds_user_id=([^;]+)/);
        const userId = userIdMatch ? userIdMatch[1] : null;

        // Method 2: Try to find config in window (though restricted in content scripts, sometimes available in page context)
        // We can inject a small script to read window._sharedData if needed, 
        // but often the cookie is enough.

        return {
            userId: userId,
            url: window.location.href,
            loggedIn: !!userId
        };
    } catch (e) {
        return { error: e.message };
    }
}
