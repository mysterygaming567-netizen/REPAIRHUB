(function () {
  const firebaseConfig = window.REPAIRHUB_FIREBASE_CONFIG;
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    console.error('RepairHub: Firebase config missing. Check login/firebase-config.js');
    return;
  }

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();

  let storage = null;
  try {
    storage = firebase.storage();
  } catch (e) {
    storage = null;
  }

  const RH = {
    auth: auth,
    db: db,
    storage: storage,
    currentUser: null,

    redirect(page) {
      window.location.replace(page);
    },

    homeFor(role) {
      if (role === 'shop') return '../shop/shop.html';
      if (role === 'admin') return '../admin/admin.html';
      return '../dashboard/dashboard.html';
    },

    /**
     * One shared header for every authenticated page. Every page renders the
     * exact same bar (brand, nav, chat badge, avatar, name, log out) so the
     * HTML never visibly changes between dashboards.
     * cfg = { brandHref, brandSub, links:[{label,href,active}], chatHref }
     */
    renderHeader(cfg) {
      const mount = document.getElementById('siteHeader');
      if (!mount) return;
      cfg = cfg || {};
      const links = (cfg.links || [])
        .map((l) => `<a href="${RH.escapeHTML(l.href)}"${l.active ? ' class="active"' : ''}>${RH.escapeHTML(l.label)}</a>`)
        .join('');
      const chat = cfg.chatHref
        ? `<a class="notification" id="chatNotification" href="${RH.escapeHTML(cfg.chatHref)}" hidden>0 new chat</a>`
        : '';
      mount.innerHTML =
        '<div class="container nav">' +
        `<a class="brand-lockup" href="${RH.escapeHTML(cfg.brandHref || '../index/index.html')}"><div class="brand">R</div><span>RepairHub${cfg.brandSub ? '<small>' + RH.escapeHTML(cfg.brandSub) + '</small>' : ''}</span></a>` +
        (links ? `<div class="nav-links">${links}</div>` : '') +
        '<div class="spacer"></div>' +
        chat +
        '<div class="profile" id="profileAvatar">R</div>' +
        '<span class="user-label" id="userName">Guest</span>' +
        '<a href="#" id="logoutLink" class="logout">Log out</a>' +
        '</div>';
      RH.bindLogout();
    },

    showProfile(profile) {
      const initials = (profile.username || profile.email || 'U')
        .split(/\s+/)
        .map((w) => w[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase();
      const avatar =
        document.getElementById('profileAvatar') ||
        document.getElementById('shopAvatar') ||
        document.getElementById('profileName');
      if (avatar) avatar.textContent = initials || 'U';
      const label = document.getElementById('userName') || document.getElementById('shopProfileName') || document.getElementById('adminName');
      if (label) label.textContent = profile.username || 'Guest';
    },

    bindLogout() {
      if (RH._logoutBound) return;
      RH._logoutBound = true;
      document.addEventListener('click', async (e) => {
        const link = e.target.closest && e.target.closest('#logoutLink, #logout');
        if (!link) return;
        e.preventDefault();
        try {
          await auth.signOut();
        } catch (err) {
          /* ignore */
        }
        window.location.replace('../index/index.html');
      });
    },

    escapeHTML(str) {
      return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[c]);
    },

    /**
     * Trust Factor (0-100) per the project proposal.
     * Base 60% = primary ID + contact number.
     * +20% = second valid ID, +20% = Municipal Registration Certificate -> 100%.
     */
    trustScore(v) {
      v = v || {};
      const hasPhone = !!(v.phone || v.contactPhone);
      const hasId1 = !!(v.idType && (v.fileData || v.fileName));
      if (!hasPhone || !hasId1) return 0;
      let score = 60;
      if (v.id2Type && (v.id2Data || v.id2Name)) score += 20;
      if (v.munData || v.munName) score += 20;
      return Math.min(score, 100);
    },

    trustDetails(v) {
      v = v || {};
      return [
        { label: 'ID document', ok: !!(v.idType && (v.fileData || v.fileName)) },
        { label: 'Contact number', ok: !!(v.phone || v.contactPhone) },
        { label: 'Second ID', ok: !!(v.id2Type && (v.id2Data || v.id2Name)) },
        { label: 'Municipal registration', ok: !!(v.munData || v.munName) }
      ];
    },

    timeAgo(ts) {
      if (!ts) return '';
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      const diff = Date.now() - date.getTime();
      const mins = Math.round(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      const hours = Math.round(mins / 60);
      if (hours < 24) return hours + 'h ago';
      const days = Math.round(hours / 24);
      return days + 'd ago';
    },

    isImage(type) {
      return type && String(type).startsWith('image/');
    },

    isVideo(type) {
      return type && String(type).startsWith('video/');
    },

    mediaHTML(items) {
      items = items || [];
      if (!items.length) return '<li class="muted">No files attached.</li>';
      return items
        .map((file, i) => {
          const src = RH.escapeHTML(file.data || file.url || '');
          let inner;
          if (String(file.type).startsWith('image/')) {
            inner = `<img src="${src}" alt="${RH.escapeHTML(file.name)}"><strong>${RH.escapeHTML(file.name)}</strong>`;
          } else if (String(file.type).startsWith('video/')) {
            inner = `<video controls src="${src}"></video><strong>${RH.escapeHTML(file.name)}</strong>`;
          } else {
            inner = `<a href="${src}" download="${RH.escapeHTML(file.name)}">Open ${RH.escapeHTML(file.name)}</a>`;
          }
          return `<li key="${i}">${inner}</li>`;
        })
        .join('');
    },

    /**
     * Free-plan storage: files are embedded directly in Firestore as base64
     * data URLs (no Firebase Storage / billing). Returns {name, type, size, data}.
     */
    fileToDataURL(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
    },

    /**
     * Guard the current page. Roles array = which roles may view it.
     * callback(profile) fires once authorized with { uid, email, role, username, status, ... }.
     */
    requireAuth(roles, callback) {
      auth.onAuthStateChanged(async (firebaseUser) => {
        let profile = RH.currentUser;
        if (!firebaseUser) {
          RH.redirect('../login/login.html');
          return;
        }
        try {
          if (!profile) {
            const snap = await db.collection('users').doc(firebaseUser.uid).get();
            if (snap.exists) {
              profile = { uid: firebaseUser.uid, email: firebaseUser.email, ...snap.data() };
            } else {
              profile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                username: (firebaseUser.email || 'User').split('@')[0],
                role: 'customer',
                status: 'active',
                createdAt: new Date().toISOString()
              };
              try {
                await db.collection('users').doc(firebaseUser.uid).set({
                  email: profile.email,
                  username: profile.username,
                  role: profile.role,
                  status: profile.status,
                  createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
              } catch (e) {
                console.error('RepairHub: could not self-heal user profile', e);
              }
            }
            RH.currentUser = profile;
          }
          if (roles && roles.indexOf(profile.role) === -1) {
            RH.redirect(RH.homeFor(profile.role));
            return;
          }
          callback(profile);
        } catch (err) {
          console.error('RepairHub: auth guard error', err);
          RH.redirect('../login/login.html');
        }
      });
    }
  };

  window.RH = RH;
})();