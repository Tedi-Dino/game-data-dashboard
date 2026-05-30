import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js';

const firebaseConfig = {
    apiKey: 'AIzaSyAE7weH2hOhhswg8x51Uz0TMxn-jO_Ap0k',
    authDomain: 'game-data-dashboard.firebaseapp.com',
    projectId: 'game-data-dashboard',
    storageBucket: 'game-data-dashboard.firebasestorage.app',
    messagingSenderId: '84289557335',
    appId: '1:84289557335:web:f31479532875af0558a412',
    measurementId: 'G-P9L1V42JK6'
};

let auth, db, functions;

try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app);
} catch (e) {
    console.error('Error initializing Firebase:', e);
    // Insert error overlay instead of destroying the entire body
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-stone-100';
    overlay.innerHTML = '<div class="text-stone-900 text-center p-8 bg-white rounded-xl shadow-lg max-w-md"><h2 class="text-xl font-bold mb-2">初始化失败</h2><p class="text-stone-600">Firebase 初始化失败，请检查网络连接和配置后刷新页面。</p></div>';
    document.body.appendChild(overlay);
}

export { auth, db, functions };
