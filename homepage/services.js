'use strict';
(() => {
  const root = document.querySelector('[data-service-tabs]');
  if (!root) return;
  document.documentElement.classList.add('service-tabs-document');
  const bar = root.querySelector('.service-tabs');
  const tabs = [...bar.querySelectorAll('a')];
  const panels = [...root.querySelectorAll('[data-service-panel]')];
  const header = document.querySelector('.header');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const targetFor = hash => {
    let id;
    try { id = decodeURIComponent(hash.replace(/^#/, '')); } catch { return null; }
    const target = document.getElementById(id);
    const panel = target?.closest('[data-service-panel]');
    return panel && panels.includes(panel) ? {target, panel} : null;
  };
  function measure() {
    root.style.setProperty('--service-header-height', `${header.offsetHeight}px`);
    root.style.setProperty('--service-tabs-height', `${bar.offsetHeight}px`);
  }
  bar.setAttribute('role', 'tablist');
  tabs.forEach((tab, index) => {
    tab.id = `tab-${panels[index].id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[index].id);
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].setAttribute('aria-labelledby', tab.id);
    panels[index].tabIndex = 0;
  });
  function select(result, {scroll = false, focus = false} = {}) {
    const activeIndex = panels.indexOf(result.panel);
    const focusedPanel = document.activeElement?.closest('[data-service-panel]');
    panels.forEach((panel, index) => {
      const active = index === activeIndex;
      panel.hidden = !active;
      tabs[index].setAttribute('aria-selected', String(active));
      tabs[index].tabIndex = active ? 0 : -1;
    });
    if (focus || (focusedPanel && focusedPanel !== result.panel)) tabs[activeIndex].focus({preventScroll:true});
    const tab = tabs[activeIndex];
    if (tab.offsetLeft < bar.scrollLeft || tab.offsetLeft + tab.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollTo({left: tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2, behavior: 'auto'});
    }
    if (scroll) requestAnimationFrame(() => {
      const behavior = reduced.matches ? 'auto' : 'smooth';
      if (result.target === result.panel) {
        // Use the shell's normal position; the sticky bar may already be pinned.
        window.scrollTo({top:Math.max(0, window.scrollY + root.getBoundingClientRect().top - header.offsetHeight), behavior});
      } else {
        result.target.scrollIntoView({block:'start', behavior});
      }
    });
  }
  function navigate(hash, options) {
    const result = targetFor(hash);
    if (!result) return;
    if (location.hash !== hash) history.pushState(null, '', hash);
    select(result, options);
  }
  root.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (!targetFor(link.hash)) return;
    event.preventDefault();
    navigate(link.hash, {scroll:true});
  });
  bar.addEventListener('keydown', event => {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else if (event.key === ' ') next = index;
    else return;
    event.preventDefault();
    navigate(tabs[next].hash, {scroll:true, focus:true});
  });
  function followHash() {
    const result = targetFor(location.hash);
    if (result) select(result, {scroll:true});
    else if (!location.hash) select({target:panels[0], panel:panels[0]});
  }
  measure();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(bar);
  }
  const initial = targetFor(location.hash);
  select(initial || {target:panels[0], panel:panels[0]}, {scroll:Boolean(initial)});
  root.classList.add('services-enhanced');
  window.addEventListener('hashchange', followHash);
})();
