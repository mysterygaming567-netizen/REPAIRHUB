const STAGES = ['Received', 'Diagnosing', 'Waiting for parts', 'Repairing', 'Ready for pickup'];
const qs = (s) => document.querySelector(s);

const createdTs = (repair) => {
  const t = repair.createdAt;
  if (t && t.toDate) return t.toDate().getTime();
  if (typeof t === 'number') return t;
  return Date.parse(t || 0) || 0;
};

const stageIndex = (repair) => Math.min(Number(repair.status) || 0, 4);

function repairCard(repair) {
  const index = stageIndex(repair);
  const messages = (repair.messages || []).slice(-3).map((m) =>
    `<div class="msg ${m.from === 'user' ? 'from-user' : 'from-shop'}"><span>${RH.escapeHTML(m.text)}</span><small>${RH.escapeHTML(m.from === 'user' ? 'You' : repair.shopName || 'Technician')}</small></div>`).join('');
  const review = repair.review
    ? `<p class="small" style="margin:8px 0 0">Review: <strong>${repair.review.fixable ? 'Fixable' : 'Cannot be fixed'}</strong>${repair.review.note ? ' — ' + RH.escapeHTML(repair.review.note) : ''}</p>`
    : '';
  return `<div class="repair-card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <h3>${RH.escapeHTML(repair.device)}</h3>
      <div class="badge ${index >= 4 ? 'ready' : ''}">${STAGES[index]}</div>
    </div>
    <div class="small muted">${RH.escapeHTML(repair.ticket || eventId(repair))} · ${RH.escapeHTML(repair.shopName || 'Assigned shop')}</div>
    <div class="progress">${STAGES.map((step, i) => `<div class="step ${i < index ? 'done' : i === index ? 'active' : ''}"><span>${i < index ? '✓' : i + 1}</span><div class="label">${step}</div></div>`).join('')}</div>
    <div class="meta-row">
      <div>Technician<br><strong>${RH.escapeHTML(repair.shopName || 'Assigning…')}</strong></div>
      <div>Est. completion<br><strong>${RH.escapeHTML(repair.agreedDeadline || repair.deadline || 'To be agreed')}</strong></div>
      <div>Warranty<br><strong>${repair.warrantyDays || 60} days</strong></div>
    </div>
    ${review}
    ${messages ? `<div class="messages">${messages}</div>` : ''}
    <a class="chat-toggle" href="../myrepairs/myrepairs.html" style="margin-top:12px">Open chat →</a>
  </div>`;
}

const eventId = (repair) => 'RH-' + String(repair.id || repair.ticket || '').slice(-5);

document.addEventListener('DOMContentLoaded', () => {
  RH.renderHeader({
    brandHref: '../dashboard/dashboard.html',
    links: [
      { label: 'Dashboard', href: '../dashboard/dashboard.html', active: true },
      { label: 'Find repairman', href: '../find/find.html' },
      { label: 'Submit repair', href: '../submit/submit.html' },
      { label: 'My repairs', href: '../myrepairs/myrepairs.html' }
    ],
    chatHref: '../myrepairs/myrepairs.html'
  });
  RH.requireAuth(['customer'], (profile) => {
    RH.showProfile(profile);
    RH.bindLogout();

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    qs('#greeting').textContent = `${greeting}, ${profile.username || 'there'} 👋`;

    RH.db.collection('repairs')
      .where('customerUid', '==', profile.uid)
      .onSnapshot(
        (snap) => {
          const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          render(list);
        },
        (err) => {
          console.error(err);
          qs('#activeRepair').innerHTML = '<div class="empty"><strong>Could not load repairs.</strong><p>' + RH.escapeHTML(err.message) + '</p></div>';
        }
      );

    function render(list) {
      const active = list.filter((r) => stageIndex(r) < 4);
      const completed = list.filter((r) => stageIndex(r) >= 4);
      qs('#activeCount').textContent = active.length;
      qs('#completedCount').textContent = completed.length;
      qs('#warrantiesCount').textContent = completed.length;

      const current = active.sort((a, b) => createdTs(b) - createdTs(a))[0];
      qs('#activeRepair').innerHTML = current
        ? repairCard(current)
        : '<div class="empty"><strong>No active repairs</strong><p>Submit a request to start tracking your device.</p></div>';

      const unread = list.reduce((n, r) => n + (r.messages || []).filter((m) => m.from === 'shop' && !m.readByUser).length, 0);
      const notif = qs('#chatNotification');
      if (notif) {
        notif.hidden = unread === 0;
        notif.textContent = `${unread} new chat${unread === 1 ? '' : 's'}`;
      }
    }
  });
});