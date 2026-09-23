document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#signupForm');
  const result = document.querySelector('#result');
  const roleButtons = [...document.querySelectorAll('.role')];
  const firebaseConfig = window.REPAIRHUB_FIREBASE_CONFIG;
  let selectedRole = 'customer';

  const showResult = (message, type = 'err') => {
    result.textContent = message;
    result.className = `result ${type}`;
  };

  const setError = (id, message) => {
    const el = document.querySelector(`#${id}`);
    if (el) el.textContent = message;
  };

  roleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      roleButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      selectedRole = button.dataset.role;
    });
  });

  if (!firebaseConfig || !firebaseConfig.apiKey) {
    showResult('Firebase config is missing. Add it in login/firebase-config.js.', 'err');
    form.querySelector('button[type="submit"]').disabled = true;
    return;
  }

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = document.querySelector('#username').value.trim();
    const email = document.querySelector('#email').value.trim();
    const password = document.querySelector('#password').value;
    const confirmPassword = document.querySelector('#confirmPassword').value;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    document.querySelectorAll('.error').forEach((error) => {
      error.textContent = '';
    });
    result.textContent = '';
    result.className = 'result';

    let valid = true;
    if (!username) {
      setError('usernameError', 'Username is required.');
      valid = false;
    }
    if (!email) {
      setError('emailError', 'Email is required.');
      valid = false;
    } else if (!emailPattern.test(email)) {
      setError('emailError', 'Invalid email format.');
      valid = false;
    }
    if (!password) {
      setError('passwordError', 'Password is required.');
      valid = false;
    } else if (password.length < 8) {
      setError('passwordError', 'Password must be at least 8 characters.');
      valid = false;
    }
    if (!confirmPassword) {
      setError('confirmPasswordError', 'Please confirm your password.');
      valid = false;
    } else if (password !== confirmPassword) {
      setError('confirmPasswordError', 'Passwords do not match.');
      valid = false;
    }
    if (!valid) return;

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showResult('Creating your account...', 'ok');

    const roleStatus = selectedRole === 'shop' ? 'unverified' : 'active';

    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      await db.collection('users').doc(user.uid).set({
        email,
        username,
        role: selectedRole,
        status: roleStatus,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      if (selectedRole === 'shop') {
        await db.collection('shops').doc(user.uid).set({
          name: username,
          username,
          email,
          city: 'Quezon City',
          tags: ['Phone', 'Laptop'],
          status: 'unverified',
          verified: false,
          open: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      localStorage.setItem('user', JSON.stringify({ name: username, email, role: selectedRole }));

      showResult('Account created successfully!', 'ok');
      setTimeout(() => {
        window.location.href = selectedRole === 'shop'
          ? '../shop/shop.html'
          : selectedRole === 'admin'
          ? '../admin/admin.html'
          : '../dashboard/dashboard.html';
      }, 600);
    } catch (error) {
      console.error(error);
      submitButton.disabled = false;
      if (error.code === 'auth/email-already-in-use') {
        setError('emailError', 'This email is already registered.');
      } else if (error.code === 'auth/invalid-email') {
        setError('emailError', 'Invalid email address.');
      } else if (error.code === 'auth/weak-password') {
        setError('passwordError', 'Password is too weak.');
      } else {
        showResult('Registration failed. Please try again.', 'err');
      }
    }
  });
});