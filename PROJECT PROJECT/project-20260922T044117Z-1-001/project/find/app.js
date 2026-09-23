const categories = ['All', 'Phone', 'Laptop', 'TV', 'Tablet', 'Desktop'];
const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=400&q=60';

function renderShopCards(shops, controls) {
  const container = document.querySelector('#shops');
  const query = controls.search.toLowerCase();
  const category = controls.category;
  const sort = controls.sort;
  const openOnly = controls.openOnly;

  let list = shops.filter(
    (shop) =>
      (shop.name.toLowerCase().includes(query) || (shop.city || '').toLowerCase().includes(query)) &&
      (category === 'All' || (shop.tags || []).includes(category)) &&
      (!openOnly || shop.open !== false)
  );

  list = list.slice().sort((a, b) => {
    if (sort === 'rating') return (b.rating || 0) - (a.rating || 0);
    if (sort === 'verified') return (b.score || 0) - (a.score || 0);
    return (a.memberSinceTs || 0) - (b.memberSinceTs || 0);
  });

  container.innerHTML =
    `<p class="results-count">${list.length} shop${list.length === 1 ? '' : 's'} found</p>` +
    (list.length
      ? list.map((shop) => {
          const score = Math.min(Number(shop.score) || 0, 100) || 85;
          return `<article class="shop-card">
            <div class="info">
              <div class="shop-top">
                <div>
                  <h3>${RH.escapeHTML(shop.name)}<span class="verified">✓ Verified</span></h3>
                  <div class="meta">${RH.escapeHTML(shop.city || 'Philippines')}${shop.ownerEmail ? ' · ' + RH.escapeHTML(shop.ownerEmail) : ''}</div>
                </div>
                <div class="rating">${score}<small>trust factor</small></div>
              </div>
              <div class="meter"><div class="meter-fill" style="width:${score}%"></div><span>${score}%</span></div>
              <div class="shop-bottom">
                <div class="tags">${(shop.tags || ['Phone', 'Laptop']).map((t) => `<span>${RH.escapeHTML(t)}</span>`).join('')}</div>
                <div><b class="open">Open</b><small>Member since ${new Date(shop.createdAtTs || Date.now()).getFullYear()}</small></div>
              </div>
              <div class="actions">
                <button class="btn" data-book="${RH.escapeHTML(shop.uid)}">Book a repair</button>
              </div>
            </div>
          </article>`;
        }).join('')
      : '<div class="empty">No shops match your filters.</div>');

  container.querySelectorAll('[data-book]').forEach((button) => {
    button.addEventListener('click', () => {
      localStorage.setItem('prefillShop', button.dataset.book);
      window.location.href = '../submit/submit.html';
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  RH.renderHeader({
    brandHref: '../dashboard/dashboard.html',
    links: [
      { label: 'Dashboard', href: '../dashboard/dashboard.html' },
      { label: 'Find repairman', href: '../find/find.html', active: true },
      { label: 'Submit repair', href: '../submit/submit.html' },
      { label: 'My repairs', href: '../myrepairs/myrepairs.html' }
    ],
    chatHref: '../myrepairs/myrepairs.html'
  });
  RH.requireAuth(['customer'], (profile) => {
    RH.showProfile(profile);
    RH.bindLogout();

    const categoryBox = document.querySelector('#categories');
    categoryBox.innerHTML = categories.map((category) => `<button class="category ${category === 'All' ? 'active' : ''}" data-category="${category}">${category}</button>`).join('');
    let shops = [];
    let controls = { search: '', category: 'All', sort: 'distance', openOnly: false };

    const render = () => renderShopCards(shops, controls);

    categoryBox.addEventListener('click', (event) => {
      if (!event.target.classList.contains('category')) return;
      categoryBox.querySelectorAll('.category').forEach((b) => b.classList.remove('active'));
      event.target.classList.add('active');
      controls.category = event.target.dataset.category;
      render();
    });
    document.querySelector('#search').addEventListener('input', (e) => {
      controls.search = e.target.value;
      render();
    });
    document.querySelector('#sort').addEventListener('change', (e) => {
      controls.sort = e.target.value;
      render();
    });
    document.querySelector('#openOnly').addEventListener('change', (e) => {
      controls.openOnly = e.target.checked;
      render();
    });

    RH.db.collection('shops')
      .where('status', '==', 'approved')
      .onSnapshot(
        (snap) => {
          shops = snap.docs.map((doc) => {
            const data = doc.data();
            return { uid: doc.id, createdAtTs: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate().getTime() : Date.now(), ...data };
          });
          render();
        },
        (err) => {
          console.error(err);
          document.querySelector('#shops').innerHTML = '<div class="empty"><strong>Could not load shops.</strong><p>' + RH.escapeHTML(err.message) + '</p></div>';
        }
      );
  });
});