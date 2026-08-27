let activeFilter = 'all';

export function setFilter(group) {
  activeFilter = group;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.group === group);
  });
  applyFilters();
}

export function applyFilters() {
  const input = document.getElementById('searchInput');
  const s = ((input && input.value) || '').toLowerCase();
  document.querySelectorAll('.card').forEach(c => {
    const mg = activeFilter === 'all' || c.dataset.group === activeFilter || c.dataset.group === '';
    const ms = !s || (c.dataset.search || '').toLowerCase().includes(s);
    c.classList.toggle('hidden', !(mg && ms));
  });
  document.querySelectorAll('.subgroup').forEach(sg => {
    sg.classList.toggle('hidden', sg.querySelectorAll('.card:not(.hidden)').length === 0);
  });
}

export function resetFilters() {
  activeFilter = 'all';
}
