// Wires a panel's sticky tab bar: clicking a .tab-btn shows its matching
// .tab-panel (data-tab-group === button's data-tab) and hides the others.
// Called on the inspector (#right-panel) from renderer.js.
// Purely reactive to clicks — the initial active/hidden state is set in the
// HTML itself (src/index.html), not forced here.
export function initPanelTabs(root) {
  const tabBtns   = root.querySelectorAll('.tab-btn')
  const tabPanels = root.querySelectorAll('.tab-panel')

  root.querySelector('.tab-bar')?.setAttribute('role', 'tablist')

  tabBtns.forEach(btn => {
    btn.setAttribute('role', 'tab')
    btn.setAttribute('aria-selected', btn.classList.contains('active') ? 'true' : 'false')
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        const on = b === btn
        b.classList.toggle('active', on)
        b.setAttribute('aria-selected', on ? 'true' : 'false')
      })
      tabPanels.forEach(panel => {
        panel.classList.toggle('hidden', panel.dataset.tabGroup !== btn.dataset.tab)
      })
    })
  })
}
