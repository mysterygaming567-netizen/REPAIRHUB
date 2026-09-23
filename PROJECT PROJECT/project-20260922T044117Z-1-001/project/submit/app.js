const qs = (s) => document.querySelector(s);
const MAX_ATTACH = 250 * 1024;
const MAX_TOTAL = 500 * 1024;
const MAX_FILES = 3;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

document.addEventListener('DOMContentLoaded', () => {
  RH.renderHeader({
    brandHref: '../dashboard/dashboard.html',
    links: [
      { label: 'Dashboard', href: '../dashboard/dashboard.html' },
      { label: 'Find repairman', href: '../find/find.html' },
      { label: 'Submit repair', href: '../submit/submit.html', active: true },
      { label: 'My repairs', href: '../myrepairs/myrepairs.html' }
    ],
    chatHref: '../myrepairs/myrepairs.html'
  });
  RH.requireAuth(['customer'], (profile) => {
    RH.showProfile(profile);
    RH.bindLogout();

    const shopSelect = qs('#shop');
    let shops = {};

    RH.db.collection('shops')
      .where('status', '==', 'approved')
      .get()
      .then((snap) => {
        const ids = [];
        snap.forEach((doc) => {
          const data = doc.data();
          shops[doc.id] = { uid: doc.id, ...data };
          ids.push(doc.id);
        });
        const prefill = localStorage.getItem('prefillShop');
        localStorage.removeItem('prefillShop');

        shopSelect.innerHTML =
          '<option value="">Choose where to send this repair…</option>' +
          snap.docs.map((doc) => `<option value="${doc.id}">${RH.escapeHTML(doc.data().name)}</option>`).join('');

        if (prefill && shops[prefill]) {
          shopSelect.value = prefill;
          qs('#submitResult').textContent = `Sending to ${shops[prefill].name}.`;
          qs('#submitResult').className = 'result ok';
        }
      })
      .catch((err) => {
        console.error(err);
        shopSelect.innerHTML = '<option value="">No verified shops available yet.</option>';
      });

    qs('#media').addEventListener('change', (event) => {
      const files = [...event.target.files];
      const label = qs('#upload').firstChild;
      if (!files.length) {
        label.textContent = 'Add photos or a PDF of the issue';
        return;
      }
      const tooBig = files.filter((f) => f.size > MAX_ATTACH).map((f) => f.name);
      const overTotal = files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL;
      const invalid = files.filter((f) => !ALLOWED.includes(f.type)).map((f) => f.name);
      if (tooBig.length || invalid.length || overTotal) {
        label.textContent = `Some files were not added (up to 3 files, under 250 KB each and 500 KB total — free plan)`;
      } else {
        label.textContent = `${files.length} file${files.length > 1 ? 's' : ''} selected`;
      }
    });

    qs('#submitForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const device = qs('#device').value.trim();
      const description = qs('#description').value.trim();
      const shopUid = shopSelect.value;
      qs('#deviceError').textContent = '';
      qs('#descriptionError').textContent = '';
      qs('#submitResult').textContent = '';
      qs('#submitResult').className = 'result';

      if (!shopUid) {
        qs('#submitResult').textContent = 'Please choose a repair shop first.';
        qs('#submitResult').className = 'result err';
        return;
      }
      if (!device) {
        qs('#deviceError').textContent = 'Device is required.';
        return;
      }
      if (!description) {
        qs('#descriptionError').textContent = 'Please describe the issue.';
        return;
      }

      const files = [...qs('#media').files];
      if (files.length > MAX_FILES) {
        qs('#submitResult').textContent = `Please attach at most ${MAX_FILES} files.`;
        qs('#submitResult').className = 'result err';
        return;
      }
      if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) {
        qs('#submitResult').textContent = 'Total attachment size is over 500 KB. Compress and try again.';
        qs('#submitResult').className = 'result err';
        return;
      }
      for (const file of files) {
        if (file.size > MAX_ATTACH) {
          qs('#submitResult').textContent = `${file.name} is larger than 250 KB. Compress it and try again.`;
          qs('#submitResult').className = 'result err';
          return;
        }
        if (!ALLOWED.includes(file.type)) {
          qs('#submitResult').textContent = `${file.name} is not a supported file type. Use JPG, PNG, WEBP, or PDF.`;
          qs('#submitResult').className = 'result err';
          return;
        }
      }

      const submitButton = qs('#submitBtn');
      submitButton.disabled = true;
      qs('#submitResult').textContent = 'Submitting your request…';
      qs('#submitResult').className = 'result ok';

      try {
        const repairId = RH.db.collection('repairs').doc().id;
        const media = [];

        for (const file of files) {
          media.push({
            name: file.name,
            type: file.type,
            size: file.size,
            data: await RH.fileToDataURL(file)
          });
        }

        const shop = shops[shopUid] || {};
        const ticket = `RH-${String(repairId).slice(-6).toUpperCase()}`;
        await RH.db.collection('repairs').doc(repairId).set({
          ticket,
          device,
          description,
          deadline: qs('#deadline').value,
          customerUid: profile.uid,
          customerName: profile.username || profile.email,
          customerEmail: profile.email,
          shopUid,
          shopName: shop.name || 'Shop',
          status: 0,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          warrantyDays: 60,
          media,
          messages: [],
          review: null
        });

        qs('#submitResult').textContent = 'Request submitted — your technician will review it shortly.';
        qs('#submitResult').className = 'result ok';
        setTimeout(() => {
          window.location.href = '../myrepairs/myrepairs.html';
        }, 700);
      } catch (err) {
        console.error(err);
        submitButton.disabled = false;
        qs('#submitResult').textContent = 'Could not submit. ' + (err.message || 'Try again.');
        qs('#submitResult').className = 'result err';
      }
    });
  });
});