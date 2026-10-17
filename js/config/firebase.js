import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { getFunctions } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app-check.js';

const firebaseConfig = {
    apiKey: 'AIzaSyC57KPIwin06LKK3YMYQFtPhLp_mHkynvg',
    authDomain: 'game-data-dashboard.firebaseapp.com',
    projectId: 'game-data-dashboard',
    storageBucket: 'game-data-dashboard.firebasestorage.app',
    messagingSenderId: '84289557335',
    appId: '1:84289557335:web:f31479532875af0558a412',
    measurementId: 'G-P9L1V42JK6'
};

let auth, db, functions;

const showInitFailure = () => {
    // Insert error overlay instead of destroying the entire body
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-stone-100';
    overlay.innerHTML = '<div class="text-stone-900 text-center p-8 bg-white rounded-xl shadow-lg max-w-md"><h2 class="text-xl font-bold mb-2">初始化失败</h2><p class="text-stone-600">Firebase 初始化失败，请检查网络连接和配置后刷新页面。</p></div>';
    document.body.appendChild(overlay);
};

let app = null;
try {
    app = initializeApp(firebaseConfig);
} catch (e) {
    console.error('Error initializing Firebase app:', e);
    showInitFailure();
}

if (app) {
    // App Check is an optional hardening layer, not a prerequisite. On the Spark
    // plan the reCAPTCHA Enterprise API can be unavailable; keeping this in the
    // same try-block as getAuth/getFirestore used to leave `db` undefined and
    // blank the whole dashboard behind the "初始化失败" overlay.
    try {
        initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider('6LfMY1YtAAAAABgEaJfHAA5dnQAX-5lThSZT-Bf3'),
            isTokenAutoRefreshEnabled: true
        });
    } catch (e) {
        console.warn('App Check unavailable — continuing without it:', e);
    }

    try {
        auth = getAuth(app);
        db = getFirestore(app);
        functions = getFunctions(app);
    } catch (e) {
        console.error('Error initializing Firebase services:', e);
        showInitFailure();
    }
}

export { auth, db, functions };
