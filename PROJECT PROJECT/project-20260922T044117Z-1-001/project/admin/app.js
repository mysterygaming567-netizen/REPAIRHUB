const qs = (s) => document.querySelector(s);
const STAGES = ['Received', 'Diagnosing', 'Waiting for parts', 'Repairing', 'Ready for pickup'];
const stageIndex = (r) => Math.min(Number(r.status) || 0, 4);
const submittedTs = (v) => {
  const t = v.submittedAt;
  if (t && t.toDate) return t.toDate().getTime();
  if (typeof t === 'number') return t;
  return Date.parse(t || 0) || 0;
};

function setStatus(docId, status, actor, trust) {
  const batch = RH.db.batch();
  batch.update(RH.db.collection('verifications').doc(docId), {
    status,
    reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
    reviewedBy: actor
  });
  batch.set(
    RH.db.collection('users').doc(docId),
    { status },
    { merge: true }
  );
  batch.set(
    RH.db.collection('shops').doc(docId),
    {
      status,
      verified: status === 'approved',
      score: status === 'approved' ? Math.min(Number(trust) || 60, 100) : firebase.firestore.FieldValue.delete()
    },
    { merge: true }
  );
  return batch.commit();
}

const mimeOf = (d) => (d || '').match(/^data:([^;]+);/)?.[1] || '';
const isImg = (d) => mimeOf(d).startsWith('image/');

function previewHTML(verif) {
  const docs = [
    { label: 'Primary ID', name: verif.fileName, data: verif.fileData },
    { label: 'Second ID', name: verif.id2Name, data: verif.id2Data },
    { label: 'Municipal Reg.', name: verif.munName, data: verif.munData }
  ].filter((d) => d.data);
  return docs
    .map(
      (d) => `
        <div class="verify-doc-block" style="display:inline-flex;flex-direction:column;gap:4px;max-width:120px;text-align:center">
          <span class="doc-badge">${RH.escapeHTML(d.label)}</span>
          ${isImg(d.data) ? `<img class="verify-doc" src="${RH.escapeHTML(d.data)}" alt="${RH.escapeHTML(d.name)}">` : ''}
          <a style="color:var(--accent);font-size:10px;font-weight:600;word-break:break-all" href="${RH.escapeHTML(d.data)}" download="${RH.escapeHTML(d.name || 'document')}">Open ↓</a>
        </div>`
    )
    .join('');
}

function renderQueue(list, adminName) {
  const container = qs('#verificationList');
  if (!list.length) {
    container.innerHTML = '<p class="muted">No pending applications.</p>';
    return;
  }
  container.innerHTML = list
    .map((v) => {
      const trust = RH.trustScore(v);
      return `
      <div class="verify-row" data-queue="${RH.escapeHTML(v.id)}" style="display:grid;grid-template-columns:1.2fr 1fr 1.4fr auto;gap:16px;align-items:center;border-top:1px solid #f0ece7;padding:16px 0">
        <div>
          <b>${RH.escapeHTML(v.title || 'Shop')}</b>
          <small style="display:block;color:var(--muted);font-size:11px;margin-top:3px">${RH.escapeHTML(v.ownerEmail || '')}</small>
          <span class="doc-badge" style="margin-top:6px;display:inline-block;background:${trust >= 100 ? 'rgba(110,148,130,0.2)' : trust >= 80 ? 'rgba(238,214,38,0.25)' : 'rgba(255,240,235,0.9)'}">Trust: ${trust}%</span>
        </div>
        <div>
          <span class="doc-badge">${RH.escapeHTML(v.idType || 'Government ID')}</span>
          <small style="display:block;color:var(--muted);font-size:11px;margin-top:4px">${RH.escapeHTML(v.phone || 'no contact number')} · ${RH.escapeHTML(v.fileName || '')}</small>
          <small style="display:block;color:var(--muted);font-size:11px;margin-top:2px">submitted ${RH.timeAgo(v.submittedAt)}</small>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap">
          ${previewHTML(v)}
        </div>
        <div class="actions" style="display:flex;gap:7px">
          <button class="btn approve" data-approve="${RH.escapeHTML(v.id)}" data-trust="${trust}" style="background:var(--sage)">Approve</button>
          <button class="btn reject" data-reject="${RH.escapeHTML(v.id)}" style="background:#fff;border:1px solid #f1d7ce;color:var(--accent)">Reject</button>
        </div>
      </div>`;
    })
    .join('');

  container.querySelectorAll('[data-approve]').forEach((b) => {
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await setStatus(b.dataset.approve, 'approved', adminName, b.dataset.trust);
        const row = container.querySelector(`[data-queue="${b.dataset.approve}"]`);
        if (row) row.innerHTML = '<strong style="color:var(--sage);font-size:12px">✓ Approved and added to the marketplace</strong>';
      } catch (err) {
        console.error(err);
        b.disabled = false;
      }
    });
  });

  container.querySelectorAll('[data-reject]').forEach((b) => {
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await setStatus(b.dataset.reject, 'rejected', adminName);
        const row = container.querySelector(`[data-queue="${b.dataset.reject}"]`);
        if (row) row.innerHTML = '<strong style="color:var(--accent);font-size:12px">Returned to shop for resubmission</strong>';
      } catch (err) {
        console.error(err);
        b.disabled = false;
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  RH.renderHeader({
    brandHref: '../index/index.html',
    brandSub: 'trust console',
    links: [
      { label: 'Overview', href: '#overview', active: true },
      { label: 'Shop verification', href: '#verification' },
      { label: 'Repairs', href: '#repairs' }
    ]
  });
  RH.requireAuth(['admin'], (profile) => {
    RH.showProfile(profile);

    RH.db.collection('shops').onSnapshot((snap) => {
      const all = snap.docs.map((d) => d.data());
      qs('#shopCount').textContent = all.filter((s) => s.status === 'approved').length;
      qs('#pendingCount').textContent = all.filter((s) => s.status === 'pending').length;
    });

    RH.db.collection('repairs').orderBy('createdAt', 'desc').limit(60).onSnapshot((snap) => {
      const list = snap.docs.map((d) => d.data());
      qs('#repairsCount').textContent = list.filter((r) => stageIndex(r) < 4).length;
      qs('#completedCount').textContent = list.filter((r) => stageIndex(r) >= 4).length;
      qs('#repairCountLabel').textContent = `${list.length} latest`;

      qs('#repairsTable').innerHTML = list
        .map((r) => `<tr>
          <td><strong>${RH.escapeHTML(r.ticket || '')}</strong></td>
          <td><strong>${RH.escapeHTML(r.device)}</strong></td>
          <td>${RH.escapeHTML(r.customerName || '')}</td>
          <td>${RH.escapeHTML(r.shopName || '')}</td>
          <td><span class="status ${stageIndex(r) >= 4 ? 'ready' : ''}">${STAGES[stageIndex(r)]}</span></td>
          <td><small>${RH.timeAgo(r.createdAt)}</small></td>
        </tr>`).join('') || '<tr><td colspan="6">No repairs yet.</td></tr>';
    });

    RH.db.collection('verifications')
      .where('status', '==', 'pending')
      .onSnapshot(
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => submittedTs(b) - submittedTs(a));
          renderQueue(list, profile.username || 'Admin');
        },
        (err) => {
          console.error(err);
          qs('#verificationList').innerHTML = '<p class="muted">Could not load the verification queue.</p>';
        }
      );
  });
});