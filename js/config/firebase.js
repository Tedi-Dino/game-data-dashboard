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

let app, auth, db, functions;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app);
} catch (e) {
    console.error('Error initializing Firebase:', e);
    document.body.innerHTML =
        '<div class="text-white text-center p-8">Firebase initialization failed. Please check the configuration.</div>';
}

export { app, auth, db, functions };
