document.addEventListener('DOMContentLoaded', () => {
  const roleToggle = document.querySelector('#roleToggle');
  const roles = [...document.querySelectorAll('.role')];
  const form = document.querySelector('#loginForm');
  const result = document.querySelector('#result');
  let role = 'customer';
  const destinations = {
    customer: '../dashboard/dashboard.html',
    shop: '../shop/shop.html',
    admin: '../admin/admin.html'
  };
  const firebaseConfig = window.REPAIRHUB_FIREBASE_CONFIG;
  let auth;
  let db;

  const showResult = (message, type = 'err') => {
    result.textContent = message;
    result.className = `result ${type}`;
  };

  if (!firebaseConfig || !firebaseConfig.apiKey) {
    showResult('Firebase settings are missing from firebase-config.js.', 'err');
    return;
  }

  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();

  roleToggle && roleToggle.addEventListener('click', (event) => {
    const button = event.target.closest('.role');
    if (!button) return;
    roles.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    role = button.dataset.role;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.querySelector('#email').value.trim();
    const password = document.querySelector('#password').value;
    if (!email || !password) return;
    showResult('Signing in...', 'ok');

    try {
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      const user = userCredential.user;

      let userDoc = await db.collection('users').doc(user.uid).get();
      let storedRole = userDoc.exists ? userDoc.data().role : null;

      if (!storedRole) {
        storedRole = await createProfile(user.uid, email, role);
      }

      if (!storedRole) {
        await auth.signOut();
        showResult('This account has no profile yet. Please sign up first.', 'err');
        return;
      }

      if (storedRole !== role) {
        await auth.signOut();
        const label = storedRole === 'shop' ? 'Shop owner' : storedRole === 'admin' ? 'Admin' : 'Customer';
        showResult(`This account is registered as ${label}. Select the ${label} tab above to sign in.`, 'err');
        return;
      }

      const profile = userDoc.exists ? userDoc.data() : {};
      localStorage.setItem('user', JSON.stringify({ name: profile.username || email.split('@')[0], email, role: storedRole }));
      showResult('Signed in successfully!', 'ok');
      setTimeout(() => {
        window.location.href = destinations[storedRole];
      }, 400);
    } catch (err) {
      console.error(err);
      const messages = {
        'auth/invalid-credential': 'Email or password is incorrect.',
        'auth/user-not-found': 'Email or password is incorrect.',
        'auth/wrong-password': 'Email or password is incorrect.',
        'auth/too-many-requests': 'Too many attempts. Try again later.'
      };
      showResult(messages[err.code] || 'Unable to sign in. Check your connection and try again.', 'err');
    }
  });

  async function createProfile(uid, email, selectedRole) {
    try {
      const username = (email || 'User').split('@')[0];
      await db.collection('users').doc(uid).set({
        email: email || '',
        username,
        role: selectedRole,
        status: selectedRole === 'shop' ? 'unverified' : 'active',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      if (selectedRole === 'shop') {
        await db.collection('shops').doc(uid).set({
          name: username, username, email: email || '', city: 'Quezon City',
          tags: ['Phone', 'Laptop'], status: 'unverified', verified: false, open: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
      return selectedRole;
    } catch (e) {
      console.error('Could not create profile on login', e);
      return null;
    }
  }
});