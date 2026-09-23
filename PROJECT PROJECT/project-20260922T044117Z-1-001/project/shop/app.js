const STAGES = ['Received', 'Diagnosing', 'Waiting for parts', 'Repairing', 'Ready for pickup'];
const DEADLINES = ['Within 24 hours', 'Within 3 days', 'Within a week', 'Flexible'];
const MAX_SIZE = 220 * 1024;
const MAX_TOTAL = 950 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const qs = (s) => document.querySelector(s);
const stageIndex = (r) => Math.min(Number(r.status) || 0, 4);
const createdTs = (r) => {
  const t = r.createdAt;
  if (t && t.toDate) return t.toDate().getTime();
  if (typeof t === 'number') return t;
  return Date.parse(t || 0) || 0;
};
const isUrgent = (r) => stageIndex(r) < 4 && (String(r.agreedDeadline || r.deadline || '').includes('24') || String(r.agreedDeadline || r.deadline || '').includes('3'));

function badgeFor(index) {
  const label = STAGES[index] || 'Received';
  const cls = index >= 4 ? 'ready' : index === 2 ? 'parts' : '';
  return `<span class="status ${cls}">${label}</span>`;
}

function updateShopUnread(list, uid) {
  const notif = qs('#chatNotification');
  if (!notif) return;
  const unread = list.reduce((n, r) => n + (r.messages || []).filter((m) => m.from === 'user' && !m.readByShop).length, 0);
  notif.hidden = unread === 0;
  notif.textContent = `${unread} new chat${unread === 1 ? '' : 's'}`;
}

function renderWorkspace(list) {
  const rows = qs('#repairRows');
  const myRepairs = list.filter((r) => r.shopUid === RH.currentUser.uid);
  const active = myRepairs.filter((r) => stageIndex(r) < 4);
  const urgent = active.filter(isUrgent);

  qs('#activeCount').textContent = active.length;
  qs('#completedCount').textContent = myRepairs.length - active.length;
  qs('#urgentCount').textContent = urgent.length;
  qs('#ticketCount').textContent = `${myRepairs.length} ticket${myRepairs.length === 1 ? '' : 's'}`;

  const sorted = myRepairs.slice().sort((a, b) => {
    const ua = isUrgent(a) ? 0 : 1;
    const ub = isUrgent(b) ? 0 : 1;
    if (ua !== ub) return ua - ub;
    return createdTs(b) - createdTs(a);
  });

  rows.innerHTML = sorted
    .map(
      (r) => `<tr${isUrgent(r) ? ' class="urgent-row"' : ''}>
        <td><strong>${RH.escapeHTML(r.ticket || '')}</strong>${isUrgent(r) ? '<small class="urgent-tag">● urgent</small>' : ''}<small>${(r.media || []).length} media file${(r.media || []).length === 1 ? '' : 's'}</small></td>
        <td><strong>${RH.escapeHTML(r.device)}</strong><small>${RH.escapeHTML(r.customerName || 'Customer')} · ${RH.escapeHTML(r.description || '')}</small></td>
        <td>${badgeFor(stageIndex(r))}</td>
        <td>${RH.escapeHTML(r.agreedDeadline || r.deadline || 'Flexible')}</td>
        <td><button class="action" data-manage="${RH.escapeHTML(r.id)}">Manage →</button></td>
      </tr>`
    )
    .join('') || '<tr><td colspan="5">No repair requests yet.</td></tr>';

  rows.querySelectorAll('[data-manage]').forEach((b) => {
    b.addEventListener('click', () => showDetail(b.dataset.manage, myRepairs));
  });

  renderCalendar(myRepairs);
}

function renderCalendar(list) {
  const grid = qs('#calendarGrid');
  if (!grid) return;
  const redraw = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const byDay = {};
    list.forEach((r) => {
      const ts = createdTs(r);
      if (!ts) return;
      const d = new Date(ts);
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const key = d.getDate();
      byDay[key] = byDay[key] || { repairs: 0, urgent: 0 };
      byDay[key].repairs += 1;
      if (isUrgent(r)) byDay[key].urgent += 1;
    });

    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div class="day"></div>');
    for (let day = 1; day <= daysInMonth; day++) {
      const info = byDay[day];
      const cls = ['day'];
      if (day === now.getDate()) cls.push('today');
      if (info) {
        cls.push(info.urgent ? 'urgent' : 'booked');
        cells.push(`<div class="${cls.join(' ')}"><strong>${day}</strong>${info ? `<small>${info.repairs} repair${info.repairs === 1 ? '' : 's'}</small>` : ''}</div>`);
      } else {
        cells.push(`<div class="${cls.join(' ')}"><strong>${day}</strong></div>`);
      }
    }
    grid.innerHTML = `<div class="calendar-head">${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => `<span>${d}</span>`).join('')}</div><div class="calendar-body">${cells.join('')}</div>`;
    const caption = qs('#calendarCaption');
    if (caption) caption.textContent = `${Object.keys(byDay).length} day${Object.keys(byDay).length === 1 ? '' : 's'} with scheduled repairs`;
  };
  redraw();
}

function showDetail(id, list) {
  const repair = list.find((r) => r.id === id);
  if (!repair) return;
  const detail = qs('#detail');
  const messages = (repair.messages || [])
    .map((m) => `<div class="msg ${m.from === 'shop' ? 'from-shop' : 'from-customer'}"><span>${RH.escapeHTML(m.text)}</span><small>${RH.escapeHTML(m.from === 'shop' ? 'You' : repair.customerName || 'Customer')} · ${RH.timeAgo(m.at)}${m.from === 'user' ? (m.readByShop ? ' · read' : ' · unread') : ''}</small></div>`)
    .join('') || '<p class="muted">No messages yet. Start the conversation with the customer.</p>';

  const media = RH.mediaHTML(repair.media || []);
  const reviewState = repair.review || {};
  const index = stageIndex(repair);

  detail.classList.remove('hidden');
  detail.innerHTML = `
    <div class="detail-heading" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px">
      <div>
        <p class="kicker">CLIENT INTAKE</p>
        <h3>${RH.escapeHTML(repair.ticket || '')} · ${RH.escapeHTML(repair.device)}</h3>
        <p class="detail-hairline">${RH.escapeHTML(repair.customerName || 'Customer')}${repair.customerEmail ? ' · ' + RH.escapeHTML(repair.customerEmail) : ''}</p>
      </div>
      <button class="action" id="closeDetail" type="button">Close ×</button>
    </div>

    <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:18px" class="review-grid">
      <div>
        <h4 style="margin:4px 0 6px">Issue reported</h4>
        <p class="muted" style="margin:0 0 12px">${RH.escapeHTML(repair.description || 'No additional notes.')}</p>

        <h4 style="margin:4px 0 6px">Uploaded evidence</h4>
        <ul class="media-list">${media}</ul>

        <h4 style="margin:14px 0 9px">Chat with customer</h4>
        <div class="messages" id="shopThread" style="max-height:220px;overflow:auto">${messages}</div>
        <form class="chat-form" id="chatForm"><input id="chatMessage" placeholder="Write a message to the customer..." required autocomplete="off"><button class="btn primary" type="submit">Send</button></form>
      </div>

      <div>
        <h4 style="margin:4px 0 9px">Repair review</h4>
        <p class="muted" style="margin:0 0 9px">Inspect the evidence and tell the customer whether the device is fixable.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <button class="btn" id="markFixable" type="button">✓ Fixable</button>
          <button class="btn" id="markUnfixable" type="button">✗ Not fixable</button>
        </div>
        <textarea id="reviewNote" rows="2" class="input" placeholder="Add a note for the customer...">${reviewState.note ? RH.escapeHTML(reviewState.note) : ''}</textarea>
        <button class="button outline" id="saveReview" type="button" style="margin-top:8px;width:100%">Save review</button>

        <h4 style="margin:16px 0 9px">Status</h4>
        <select class="input" id="statusSelect">${STAGES.map((s, i) => `<option value="${i}" ${i === index ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <button class="button outline" id="saveStatus" type="button" style="margin-top:8px;width:100%">Save update</button>

        <h4 style="margin:16px 0 9px">Deadline negotiation</h4>
        <select class="input" id="agreedDeadline">${DEADLINES.map((d) => `<option ${(repair.agreedDeadline || repair.deadline || '') === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
        <textarea id="deadlineNote" rows="2" class="input" placeholder="Explain the timeline to the customer...">${repair.deadlineNote ? RH.escapeHTML(repair.deadlineNote) : ''}</textarea>
        <button class="button outline" id="sendDeadline" type="button" style="margin-top:8px;width:100%">Send timeline</button>
      </div>
    </div>`;

  qs('#closeDetail').addEventListener('click', () => detail.classList.add('hidden'));

  qs('#chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = qs('#chatMessage').value.trim();
    if (!text) return;
    qs('#chatMessage').value = '';
    try {
      await RH.db.collection('repairs').doc(id).update({
        messages: firebase.firestore.FieldValue.arrayUnion({
          from: 'shop',
          text,
          at: new Date().toISOString(),
          readByUser: false,
          readByShop: true
        })
      });
    } catch (err) {
      console.error(err);
      qs('#chatMessage').value = text;
    }
  });

  const patch = async (partial) => {
    try {
      await RH.db.collection('repairs').doc(id).update(partial);
    } catch (err) {
      console.error(err);
      return false;
    }
    return true;
  };

  qs('#saveReview').addEventListener('click', async () => {
    const note = qs('#reviewNote').value.trim();
    const applied = await patch({
      review: { fixable: reviewState.fixable, note, reviewedAt: firebase.firestore.FieldValue.serverTimestamp() }
    });
    if (applied) {
      const text = reviewState.fixable === false ? 'I have reviewed your device — it cannot be repaired as-is.' : 'I have reviewed your device and confirmed it is fixable.';
      await patch({ messages: firebase.firestore.FieldValue.arrayUnion({ from: 'shop', text: note ? `${text}\n${note}` : text, at: new Date().toISOString(), readByUser: false, readByShop: true }) });
      qs('#saveReview').textContent = 'Review saved';
    }
  });

  function styleReviewButtons() {
    const fixable = qs('#markFixable');
    const unfixable = qs('#markUnfixable');
    fixable.className = 'btn';
    unfixable.className = 'btn';
    fixable.style.cssText = 'background:#fff;border:1px solid var(--line);color:var(--ink)';
    unfixable.style.cssText = 'background:#fff;border:1px solid var(--line);color:var(--ink)';
    if (reviewState.fixable === true) {
      fixable.style.cssText = '';
      fixable.textContent = '✓ Fixable (selected)';
    } else if (reviewState.fixable === false) {
      unfixable.style.cssText = '';
      unfixable.textContent = '✗ Not fixable (selected)';
    }
  }
  styleReviewButtons();

  qs('#markFixable').addEventListener('click', () => {
    repair.review = repair.review || {};
    repair.review.fixable = true;
    reviewState.fixable = true;
    styleReviewButtons();
  });

  qs('#markUnfixable').addEventListener('click', () => {
    repair.review = repair.review || {};
    repair.review.fixable = false;
    reviewState.fixable = false;
    styleReviewButtons();
  });

  qs('#saveStatus').addEventListener('click', async () => {
    const value = Number(qs('#statusSelect').value);
    const applied = await patch({ status: value });
    if (applied) {
      const text = `Your repair is now: ${STAGES[value]}.`;
      await patch({ messages: firebase.firestore.FieldValue.arrayUnion({ from: 'shop', text, at: new Date().toISOString(), readByUser: false, readByShop: true }) });
      showDetail(id, list);
    }
  });

  qs('#sendDeadline').addEventListener('click', async () => {
    const agreedDeadline = qs('#agreedDeadline').value;
    const deadlineNote = qs('#deadlineNote').value.trim();
    const applied = await patch({ agreedDeadline, deadlineNote });
    if (applied) {
      const text = `Updated repair timeline: ${agreedDeadline}${deadlineNote ? ' — ' + deadlineNote : ''}.`;
      await patch({ messages: firebase.firestore.FieldValue.arrayUnion({ from: 'shop', text, at: new Date().toISOString(), readByUser: false, readByShop: true }) });
    }
  });

  // mark shop messages as read
  const changed = (repair.messages || []).map((m) => (m.from === 'user' ? { ...m, readByShop: true } : m));
  if (JSON.stringify(changed) !== JSON.stringify(repair.messages || [])) {
    patch({ messages: changed });
  }
}

/* ---------------- verification / status gate ---------------- */
function setGate(status, verification) {
  const gate = qs('#verificationGate');
  const workspace = qs('#workspace');
  const formWrap = qs('#verificationFormWrap');
  const statusBox = qs('#gateStatus');
  const trust = verification ? RH.trustScore(verification) : 0;

  if (status === 'approved') {
    gate.hidden = true;
    workspace.hidden = false;
    return;
  }

  gate.hidden = false;
  workspace.hidden = true;

  if (status === 'pending') {
    formWrap.hidden = true;
    qs('#gateTitle').textContent = 'Your verification is under review';
    qs('#gateBody').textContent = `You submitted ${verification && verification.idType ? verification.idType : 'a government ID'}, currently at ${trust}% trust factor. An admin will review it shortly — you can return to this page to check.`;
    statusBox.innerHTML = '<span class="status-note pending">◷ Under review</span>';
  } else if (status === 'rejected') {
    formWrap.hidden = true;
    qs('#gateTitle').textContent = 'Your verification was not approved';
    qs('#gateBody').textContent = 'One of your documents could not be verified. Upload clearer, unexpired documents to be reviewed again.';
    statusBox.innerHTML = '<span class="status-note rejected">✗ Rejected — resubmit below</span>';
    formWrap.hidden = false;
  } else {
    formWrap.hidden = false;
    qs('#gateTitle').textContent = 'Complete verification to activate your shop';
    qs('#gateBody').textContent = 'Bigger trust factor = more visible to customers. 60% with a primary ID + contact number, 100% once you add a second ID and your Municipal Registration Certificate.';
  }
}

function updateTrustPanel(verification) {
  const score = RH.trustScore(verification);
  const details = RH.trustDetails(verification);
  const scoreEl = qs('#trustScore');
  const meterEl = qs('#trustMeter');
  const captionEl = qs('#verificationCaption');
  const docsEl = qs('#trustDocs');
  if (scoreEl) scoreEl.textContent = `${score}%`;
  if (meterEl) meterEl.style.width = `${score}%`;
  if (captionEl) {
    const missing = details.filter((d) => !d.ok);
    captionEl.textContent =
      score >= 100
        ? 'Full trust. Your shop is approved and listed on RepairHub.'
        : missing.length
          ? `Approved. Add the missing item${missing.length === 1 ? '' : 's'} to raise your trust factor: ${missing.map((m) => m.label).join(', ')}.`
          : 'Your shop is approved and listed on RepairHub.';
  }
  if (docsEl) {
    docsEl.innerHTML = details
      .map((d) => `<span class="doc-check ${d.ok ? 'ok' : 'miss'}">${d.ok ? '✓' : '·'} ${RH.escapeHTML(d.label)}</span>`)
      .join('');
  }
}

function readVerificationFiles(profile) {
  const id1 = qs('#idFile').files[0];
  const id2 = qs('#id2File').files[0];
  const mun = qs('#munFile').files[0];
  return async () => {
    const out = {};
    if (id1) Object.assign(out, { fileName: id1.name, fileType: id1.type, fileData: await RH.fileToDataURL(id1) });
    if (id2) Object.assign(out, { id2Name: id2.name, id2Data: await RH.fileToDataURL(id2), id2Type: qs('#idType2').value });
    if (mun) Object.assign(out, { munName: mun.name, munData: await RH.fileToDataURL(mun) });
    return out;
  };
}

function bindVerificationForm() {
  const form = qs('#verificationForm');
  const idTypeSelect = qs('#idType');
  const errorBox = qs('#uploadError');

  const bindFile = (inputId, labelId, acceptAll) => {
    const input = qs(inputId);
    const label = qs(labelId);
    input.addEventListener('change', () => {
      errorBox.textContent = '';
      const selected = input.files[0];
      if (!selected) {
        label.textContent = acceptAll ? 'Choose a document' : 'Choose ID document';
        return;
      }
      if (!ALLOWED.includes(selected.type)) {
        input.value = '';
        label.textContent = 'Choose a file';
        errorBox.textContent = 'Upload a valid image or PDF only.';
        return;
      }
      if (selected.size > MAX_SIZE) {
        input.value = '';
        label.textContent = 'Choose a file';
        errorBox.textContent = `Each file must be ${Math.round(MAX_SIZE / 1024)} KB or smaller.`;
        return;
      }
      label.textContent = selected.name;
    });
  };
  bindFile('#idFile', '#fileName', false);
  bindFile('#id2File', '#fileName2', true);
  bindFile('#munFile', '#munFileName', true);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const idType = idTypeSelect.value;
    const phone = qs('#phone').value.trim();
    const files = await readVerificationFiles()();
    errorBox.textContent = '';
    if (!idType || !files.fileData) {
      errorBox.textContent = 'Choose an accepted ID type and attach the document.';
      return;
    }
    if (!/^[0-9 +-]{7,15}$/.test(phone)) {
      errorBox.textContent = 'Enter a valid contact number (7-15 digits).';
      return;
    }
    if (qs('#id2File').files[0] && !qs('#idType2').value) {
      errorBox.textContent = 'Pick the type for your second ID, or remove the file.';
      return;
    }
    const total = (files.fileData ? files.fileData.length : 0) + (files.id2Data ? files.id2Data.length : 0) + (files.munData ? files.munData.length : 0);
    if (total > MAX_TOTAL) {
      errorBox.textContent = 'Combined documents are too large. Keep each file under 220 KB.';
      return;
    }
    const button = qs('#submitId');
    button.disabled = true;
    button.textContent = 'Submitting…';
    try {
      const uid = RH.currentUser.uid;

      const verification = {
        idType,
        phone,
        id2Type: qs('#idType2').value || '',
        ...files,
        title: RH.currentUser.username || 'Shop',
        ownerEmail: RH.currentUser.email || '',
        status: 'pending',
        trust: RH.trustScore({ ...files, idType, phone, id2Type: qs('#idType2').value || '' }),
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      await RH.db.collection('verifications').doc(uid).set(verification);
      await RH.db.collection('users').doc(uid).set({ status: 'pending' }, { merge: true });
      await RH.db.collection('shops').doc(uid).set({ status: 'pending', verified: false }, { merge: true });
      setGate('pending', verification);
    } catch (err) {
      console.error(err);
      button.disabled = false;
      button.textContent = 'Submit for review';
      errorBox.textContent = 'Could not submit: ' + (err.message || 'check your Firestore rules.');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  RH.renderHeader({
    brandHref: '../shop/shop.html',
    brandSub: 'for shops',
    links: [
      { label: 'Workspace', href: '../shop/shop.html', active: true },
      { label: 'Verification', href: '../shop/shop.html#verification' }
    ],
    chatHref: '../shop/shop.html'
  });
  RH.requireAuth(['shop'], (profile) => {
    RH.showProfile(profile);
    const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
    qs('#shopGreeting').textContent = `${greeting}, ${profile.username || 'shop owner'}`;

    bindVerificationForm();

    let unsubscribeRepairs = null;

    const applyStatus = (status) => {
      const verification = RH.currentUser.verification || {};
      setGate(status, verification);
      if (status === 'approved') {
        if (!unsubscribeRepairs) {
          unsubscribeRepairs = RH.db.collection('repairs')
            .where('shopUid', '==', profile.uid)
            .onSnapshot(
              (snap) => {
                const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => createdTs(b) - createdTs(a));
                renderWorkspace(list);
                updateShopUnread(list);
              },
              (err) => {
                console.error(err);
                qs('#repairRows').innerHTML = '<tr><td colspan="5">Could not load repairs.</td></tr>';
              }
            );
        }
      }
    };

    let initialStatus = profile.status || 'unverified';
    applyStatus(initialStatus);

    RH.db.collection('users').doc(profile.uid).onSnapshot((snap) => {
      const data = snap.data() || {};
      RH.currentUser = { ...profile, ...data };
      applyStatus(data.status || initialStatus);
    });

    RH.db.collection('verifications').doc(profile.uid).onSnapshot((snap) => {
      if (snap.exists) {
        const verification = snap.data();
        RH.currentUser.verification = verification;
        setGate(verification.status || 'pending', verification);
        updateTrustPanel(verification);
      }
    });
  });
});