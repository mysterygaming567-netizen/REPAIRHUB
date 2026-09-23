const STAGES = ['Received', 'Diagnosing', 'Waiting for parts', 'Repairing', 'Ready for pickup'];
const qs = (s) => document.querySelector(s);
const stageIndex = (r) => Math.min(Number(r.status) || 0, 4);
const messagesOf = (r) => r.messages || [];
const createdTs = (r) => {
  const t = r.createdAt;
  if (t && t.toDate) return t.toDate().getTime();
  if (typeof t === 'number') return t;
  return Date.parse(t || 0) || 0;
};

function updateCustomerUnread(list, currentUser) {
  const notif = qs('#chatNotification');
  if (!notif) return;
  const unread = list.reduce((n, r) => n + messagesOf(r).filter((m) => m.from === 'shop' && !m.readByUser).length, 0);
  notif.hidden = unread === 0;
  notif.textContent = `${unread} new chat${unread === 1 ? '' : 's'}`;
  notif.hidden = unread === 0 || !currentUser;
}

function renderRepairs(list, uid) {
  const container = qs('#repairsList');
  updateCustomerUnread(list, uid);

  if (!list.length) {
    container.innerHTML = '<div class="empty"><strong>Your repair workspace is ready.</strong><p>Submit a request to start tracking your device.</p><a class="btn primary" href="../find/find.html" style="margin-top:12px">Find a verified shop</a></div>';
    return;
  }

  container.innerHTML = list
    .map((repair) => {
      const index = stageIndex(repair);
      const shop = repair.shopName || 'Assigned shop';
      const media = RH.mediaHTML(repair.media || []);
      const review = repair.review
        ? `<p class="warranty">${repair.review.fixable ? '✓ Technician confirmed this is fixable.' : 'Technician determined this cannot be repaired as-is.'}${repair.review.note ? ' ' + RH.escapeHTML(repair.review.note) : ''}</p>`
        : '';
      const messages = messagesOf(repair)
        .map((m) => `<div class="msg ${m.from === 'user' ? 'from-user' : 'from-shop'}"><span>${RH.escapeHTML(m.text)}</span><small>${RH.escapeHTML(m.from === 'user' ? 'You' : shop)} · ${RH.timeAgo(m.at)}${m.from === 'shop' && m.readByUser ? ' · read' : ''}</small></div>`)
        .join('');

      return `<div class="repair-card">
        <div class="repair-summary">
          <div style="min-width:0">
            <span class="small">${RH.escapeHTML(repair.ticket || '')}</span>
            <h3>${RH.escapeHTML(repair.device)}</h3>
            <p class="small muted">${RH.escapeHTML(shop)} · ${RH.escapeHTML(repair.description || '')}</p>
          </div>
          <div class="badge ${index >= 4 ? 'ready' : index === 2 ? 'parts' : ''}">${STAGES[index]}</div>
        </div>
        <div class="progress">${STAGES.map((step, i) => `<div class="step ${i < index ? 'done' : i === index ? 'active' : ''}"><span>${i < index ? '✓' : i + 1}</span><div class="label">${step}</div></div>`).join('')}</div>
        <div class="meta-row">
          <div>Technician<br><strong>${RH.escapeHTML(shop)}</strong></div>
          <div>Est. completion<br><strong>${RH.escapeHTML(repair.agreedDeadline || repair.deadline || 'To be agreed')}</strong></div>
          <div>Warranty<br><strong>${repair.warrantyDays || 60} days after pickup</strong></div>
        </div>
        ${media ? `<p class="media-note">Attached files:</p><ul class="media-list">${media}</ul>` : ''}
        ${review}
        <button class="chat-toggle" type="button" data-chat="${RH.escapeHTML(repair.id)}" aria-expanded="false">Show chat</button>
        <div class="messages chat-collapsed" data-thread="${RH.escapeHTML(repair.id)}">
          ${messages || '<p class="muted">No messages yet. Your technician can update you here.</p>'}
          <form class="message-form" data-send="${RH.escapeHTML(repair.id)}"><input name="message" placeholder="Message your technician..." required autocomplete="off"><button class="btn" type="submit">Send</button></form>
        </div>
        ${index >= 4 ? '<p class="warranty">✓ Warranty record issued · ' + (repair.warrantyDays || 60) + '-day coverage after pickup.</p>' : ''}
      </div>`;
    })
    .join('');

  container.querySelectorAll('[data-chat]').forEach((button) => {
    button.addEventListener('click', () => {
      const thread = container.querySelector(`[data-thread="${button.dataset.chat}"]`);
      const collapsed = thread.classList.toggle('chat-collapsed');
      button.textContent = collapsed ? 'Show chat' : 'Hide chat';
      button.setAttribute('aria-expanded', String(!collapsed));
      if (!collapsed) markRead(button.dataset.chat);
    });
  });

  container.querySelectorAll('[data-send]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = form.dataset.send;
      const text = form.querySelector('input').value.trim();
      const input = form.querySelector('input');
      if (!text) return;
      input.value = '';
      try {
        await RH.db.collection('repairs').doc(id).update({
          messages: firebase.firestore.FieldValue.arrayUnion({
            from: 'user',
            text,
            at: new Date().toISOString(),
            readByShop: false,
            readByUser: true
          })
        });
      } catch (err) {
        console.error(err);
        input.value = text;
      }
    });
  });
}

function markRead(id) {
  RH.db
    .collection('repairs')
    .doc(id)
    .get()
    .then((snap) => {
      if (!snap.exists) return;
      const data = snap.data();
      const changed = (data.messages || []).map((m) => (m.from === 'shop' ? { ...m, readByUser: true } : m));
      if (JSON.stringify(changed) !== JSON.stringify(data.messages)) {
        return RH.db.collection('repairs').doc(id).update({ messages: changed });
      }
    })
    .catch((err) => console.error(err));
}

document.addEventListener('DOMContentLoaded', () => {
  RH.renderHeader({
    brandHref: '../dashboard/dashboard.html',
    links: [
      { label: 'Dashboard', href: '../dashboard/dashboard.html' },
      { label: 'Find repairman', href: '../find/find.html' },
      { label: 'Submit repair', href: '../submit/submit.html' },
      { label: 'My repairs', href: '../myrepairs/myrepairs.html', active: true }
    ],
    chatHref: '../myrepairs/myrepairs.html'
  });
  RH.requireAuth(['customer'], (profile) => {
    RH.showProfile(profile);
    RH.bindLogout();

    RH.db.collection('repairs')
      .where('customerUid', '==', profile.uid)
      .onSnapshot(
        (snap) => {
          const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => createdTs(b) - createdTs(a));
          renderRepairs(list, profile.uid);
        },
        (err) => {
          console.error(err);
          qs('#repairsList').innerHTML = '<div class="empty"><strong>Could not load repairs.</strong><p>' + RH.escapeHTML(err.message) + '</p></div>';
        }
      );
  });
});