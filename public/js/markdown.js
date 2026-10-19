/**
 * markdown.js — tiny, safe Markdown → DOM renderer for AI itinerary text.
 * Builds elements with textContent only (never innerHTML), so model output cannot inject markup.
 * Supports: headings, bold, italic, inline code, bullet and numbered lists, horizontal rules, paragraphs.
 * Exposes window.renderMarkdown(text) -> HTMLElement.
 */
(function () {
  'use strict';

  const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|`[^`]+`)/g;

  function appendInline(parent, text) {
    text.split(INLINE).forEach((part) => {
      if (!part) return;
      let node;
      if (/^(\*\*|__)[\s\S]+\1$/.test(part)) {
        node = document.createElement('strong');
        appendInline(node, part.slice(2, -2));
      } else if (/^\*[^*]+\*$/.test(part)) {
        node = document.createElement('em');
        node.textContent = part.slice(1, -1);
      } else if (/^`[^`]+`$/.test(part)) {
        node = document.createElement('code');
        node.textContent = part.slice(1, -1);
      } else {
        node = document.createTextNode(part);
      }
      parent.appendChild(node);
    });
  }

  function renderMarkdown(text) {
    const root = document.createElement('div');
    root.className = 'md';
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    let list = null;
    let para = null;

    const flush = () => { list = null; para = null; };
    const addList = (tag, content) => {
      if (!list || list.tagName.toLowerCase() !== tag) {
        flush();
        list = document.createElement(tag);
        list.className = 'md-list';
        root.appendChild(list);
      }
      const li = document.createElement('li');
      appendInline(li, content);
      list.appendChild(li);
    };

    lines.forEach((raw) => {
      const line = raw.trim();
      let m;
      if (!line) { flush(); return; }
      if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*$/))) {
        flush();
        const h = document.createElement(m[1].length <= 2 ? 'h3' : 'h4');
        h.className = `md-h${Math.min(m[1].length, 4)}`;
        appendInline(h, m[2]);
        root.appendChild(h);
      } else if (/^([-*_])(\s*\1){2,}$/.test(line)) {
        flush();
        root.appendChild(document.createElement('hr'));
      } else if ((m = line.match(/^[-*•+]\s+(.*)$/))) {
        addList('ul', m[1]);
      } else if ((m = line.match(/^\d+[.)]\s+(.*)$/))) {
        addList('ol', m[1]);
      } else {
        if (!para) {
          flush();
          para = document.createElement('p');
          root.appendChild(para);
        } else {
          para.appendChild(document.createTextNode(' '));
        }
        appendInline(para, line);
      }
    });
    return root;
  }

  window.renderMarkdown = renderMarkdown;
})();
