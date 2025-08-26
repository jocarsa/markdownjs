/*!
 * jocarsamarkdown.js — zero-deps Markdown WYSIWYG
 * Namespace global: window.jocarsamarkdownjs
 */
(function(){
  const NS = {
    editors: [],
    options: { selector: 'textarea', autoInit: true },

    init(opts={}){
      this.options = Object.assign({}, this.options, opts);
      document.querySelectorAll(this.options.selector).forEach(ta=> this._upgradeTextarea(ta));
    },

    _upgradeTextarea(textarea){
      if (textarea.dataset.jocarsaMdInit === '1') return;

      const container = document.createElement('div');
      container.className = 'jocarsa-md-container wysiwyg-mode';

      const toolbar = document.createElement('div');
      toolbar.className = 'jocarsa-md-toolbar';

      const editor = document.createElement('div');
      editor.className = 'jocarsa-md-editor';
      editor.setAttribute('contenteditable', 'true');

      textarea.classList.add('jocarsa-md-textarea-hidden');

      const btns = [
        {label:'B',  title:'Negrita (**)',               action:()=>wrapInline(editor,'strong')},
        {label:'I',  title:'Cursiva (*)',                action:()=>wrapInline(editor,'em')},
        {label:'H1', title:'Título 1 (#)',               action:()=>formatBlock(editor,'h1')},
        {label:'H2', title:'Título 2 (##)',              action:()=>formatBlock(editor,'h2')},
        {label:'“”', title:'Cita (>)',                   action:()=>formatBlock(editor,'blockquote')},
        {label:'•',  title:'Lista viñetas (-)',          action:()=>cmd(editor,'insertUnorderedList')},
        {label:'1.', title:'Lista numerada (1.)',        action:()=>cmd(editor,'insertOrderedList')},
        {label:'<>', title:'Código en línea (`)',        action:()=>wrapInline(editor,'code')},
        {label:'{ }',title:'Bloque de código (```)',     action:()=>insertCodeBlock(editor)},
        {label:'—',  title:'Regla horizontal (---)',     action:()=>insertHR(editor)},
        {label:'🔗', title:'Enlace [texto](url)',         action:()=>insertLink(editor)},
        {label:'🖼️', title:'Imagen ![alt](src)',         action:()=>insertImage(editor)},
      ];
      btns.forEach(b=>{
        const btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = b.label; btn.title = b.title;
        btn.addEventListener('click', (e)=>{
          e.preventDefault();
          if (isSelectionInsideCode(editor)) return; // ignora acciones en código
          b.action(); syncToTextarea();
        });
        toolbar.appendChild(btn);
      });

      // Spacer
      const spacer = document.createElement('div'); spacer.className = 'jocarsa-md-spacer';
      toolbar.appendChild(spacer);

      // ===== Toggle: Sliding switch Markdown/WYSIWYG =====
      const toggleWrap = document.createElement('div'); toggleWrap.className = 'jocarsa-md-toggle';

      const switchLabel = document.createElement('label'); switchLabel.className = 'jocarsa-md-switch';
      const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.title='Alternar WYSIWYG/Markdown';
      const slider = document.createElement('span'); slider.className = 'jocarsa-md-slider';
      switchLabel.appendChild(toggle); switchLabel.appendChild(slider);

      const toggleText = document.createElement('span'); toggleText.className='jocarsa-md-toggle-text'; toggleText.textContent = 'Markdown';

      toggleWrap.appendChild(switchLabel);
      toggleWrap.appendChild(toggleText);
      toolbar.appendChild(toggleWrap);

      toggle.addEventListener('change', ()=>{
        if (toggle.checked){
          // A Markdown
          container.classList.remove('wysiwyg-mode');
          container.classList.add('md-mode');
          syncToTextarea(); // HTML -> MD
        } else {
          // A WYSIWYG
          container.classList.remove('md-mode');
          container.classList.add('wysiwyg-mode');
          editor.innerHTML = mdToHtml(textarea.value || '');
          placeCaretAtEnd(editor);
        }
      });

      // Mount
      const parent = textarea.parentNode;
      parent.insertBefore(container, textarea);
      container.appendChild(toolbar);
      container.appendChild(editor);
      container.appendChild(textarea);

      // Inicializa desde el Markdown existente (si lo hay)
      editor.innerHTML = mdToHtml(textarea.value || '');

      // Sync WYSIWYG -> textarea (Markdown) con normalización
      const syncToTextarea = debounce(()=>{
        const html = sanitizeEditorHTML(editor);
        const md = htmlToMd(html);
        textarea.value = md;
      }, 120);

      editor.addEventListener('input', syncToTextarea);
      editor.addEventListener('keyup', syncToTextarea);
      editor.addEventListener('blur', syncToTextarea);

      const form = textarea.closest('form');
      if (form){
        form.addEventListener('submit', ()=>{
          const html = sanitizeEditorHTML(editor);
          textarea.value = htmlToMd(html);
        });
      }

      textarea.dataset.jocarsaMdInit = '1';
      this.editors.push({ container, toolbar, editor, textarea, toggle });
    }
  };

  /* ===== Helpers edición ===== */
  function cmd(editor, command, value=null){ focusEditor(editor); document.execCommand(command, false, value); }
  function formatBlock(editor, blockTag){ focusEditor(editor); document.execCommand('formatBlock', false, blockTag.toUpperCase()); }
  function wrapInline(editor, tag){
    const sel = saveSelection(editor);
    if (!sel) { focusEditor(editor); return; }
    const range = sel.range;
    const content = range.extractContents();
    const el = document.createElement(tag);
    el.appendChild(content);
    range.insertNode(el);
    restoreSelection(editor, range);
  }
  function insertHR(editor){
    focusEditor(editor);
    const hr = document.createElement('hr');
    insertNodeAtCaret(editor, hr);
    insertNodeAtCaret(editor, document.createElement('p'));
  }
  function insertCodeBlock(editor){
    focusEditor(editor);
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = '// código';
    pre.appendChild(code);
    insertNodeAtCaret(editor, pre);
  }
  function insertLink(editor){
    const url = prompt('URL:','https://'); if (!url) return;
    const text = document.getSelection()?.toString() || 'enlace';
    const a = document.createElement('a'); a.href=url; a.textContent=text; a.target='_blank'; a.rel='noopener';
    focusEditor(editor); insertNodeOrWrapSelection(editor, a);
  }
  function insertImage(editor){
    const src = prompt('URL de imagen:','https://'); if (!src) return;
    const alt = prompt('Alt (opcional):','');
    const img = document.createElement('img'); img.src=src; if (alt) img.alt = alt;
    focusEditor(editor); insertNodeAtCaret(editor, img);
  }

  function isSelectionInsideCode(editor){
    const sel = window.getSelection();
    if (!sel || sel.rangeCount===0) return false;
    const node = sel.anchorNode;
    if (!node) return false;
    const el = (node.nodeType===1 ? node : node.parentElement);
    return !!(el && (el.closest('code') || el.closest('pre')));
  }

  function focusEditor(editor){ if (document.activeElement !== editor) editor.focus(); }
  function insertNodeOrWrapSelection(editor, node){
    const sel = saveSelection(editor);
    if (sel && !sel.range.collapsed){
      const content = sel.range.extractContents();
      node.appendChild(content);
      sel.range.insertNode(node);
      restoreSelection(editor, sel.range);
    } else { insertNodeAtCaret(editor, node); }
  }
  function insertNodeAtCaret(editor, node){
    const sel = saveSelection(editor);
    if (!sel){ editor.appendChild(node); placeCaretAtEnd(editor); return; }
    const range = sel.range;
    range.insertNode(node);
    range.setStartAfter(node); range.setEndAfter(node);
    restoreSelection(editor, range);
  }
  function saveSelection(editor){
    const sel = window.getSelection(); if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    return { range };
  }
  function restoreSelection(editor, range){ const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
  function placeCaretAtEnd(el){
    el.focus(); const range=document.createRange(); range.selectNodeContents(el); range.collapse(false);
    const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }
  const debounce = (fn, wait=120)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };

  /* ===== Sanitizado / Normalización =====
     - Convierte B/I -> STRONG/EM
     - Quita atributos no permitidos
     - Convierte DIV/SPAN con texto a P
     - Aplana énfasis anidado
     - Limpia cualquier formateo dentro de <pre> y <code> (solo texto) */
  function sanitizeEditorHTML(editor){
    const clone = editor.cloneNode(true);

    // Elimina estilos dentro de código
    clone.querySelectorAll('pre, code').forEach(block=>{
      if (block.tagName === 'PRE'){
        const code = block.querySelector('code');
        if (code){ code.textContent = code.textContent; } // strip tags
        else { block.textContent = block.textContent; }
      } else {
        block.textContent = block.textContent;
      }
    });

    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT, null);
    const allowed = new Set(['P','BR','STRONG','B','EM','I','CODE','PRE','H1','H2','H3','H4','H5','H6','A','IMG','UL','OL','LI','BLOCKQUOTE','HR','SPAN','DIV']);
    const keepAttrs = { 'A':['href'], 'IMG':['src','alt'] };
    while(walker.nextNode()){
      const el = walker.currentNode;
      if (!allowed.has(el.tagName)){
        const span = document.createElement('span'); span.textContent = el.textContent;
        el.parentNode.replaceChild(span, el); continue;
      }
      if (el.tagName==='B') replaceTag(el,'STRONG');
      if (el.tagName==='I') replaceTag(el,'EM');
      [...el.attributes].forEach(a=>{
        const ok = keepAttrs[el.tagName]?.includes(a.name.toLowerCase());
        if (!ok) el.removeAttribute(a.name);
      });
      if ((el.tagName==='DIV' || el.tagName==='SPAN') && el.textContent.trim().length){
        replaceTag(el,'P');
      }
    }

    // Aplana <strong><strong>…</strong></strong> y <em><em>…</em></em>
    flattenEmphasis(clone,'STRONG');
    flattenEmphasis(clone,'EM');

    return clone.innerHTML;
  }
  function flattenEmphasis(root, tagName){
    let found = true;
    while (found){
      found = false;
      root.querySelectorAll(tagName+' '+tagName).forEach(inner=>{
        found = true;
        while(inner.firstChild) inner.parentNode.insertBefore(inner.firstChild, inner);
        inner.remove();
      });
    }
  }
  function replaceTag(el, newTag){
    const n = document.createElement(newTag);
    while(el.firstChild) n.appendChild(el.firstChild);
    el.parentNode.replaceChild(n, el);
  }

  /* ===== HTML -> Markdown ===== */
  function htmlToMd(html){
    const tmp = document.createElement('div'); tmp.innerHTML = html;

    const blockToMd = (node, indent=0)=>{
      if (node.nodeType === 3) return node.nodeValue;
      if (node.nodeType !== 1) return '';

      const tag = node.tagName.toLowerCase();
      const children = ()=> [...node.childNodes].map(n=>blockToMd(n, indent)).join('');
      const nl = '\n';

      switch(tag){
        case 'strong': return ensureWrapped(children().trim(), '**');
        case 'em':     return ensureWrapped(children().trim(), '*');
        case 'code': {
          if (node.parentElement && node.parentElement.tagName.toLowerCase()==='pre') return children();
          return '`' + children().trim() + '`';
        }
        case 'a': {
          const href = node.getAttribute('href') || '';
          const text = (children().trim() || href);
          return `[${text}](${href})`;
        }
        case 'img': {
          const src = node.getAttribute('src') || '';
          const alt = node.getAttribute('alt') || '';
          return `![${alt}](${src})`;
        }
        case 'br': return '\n';
        case 'h1': return nl + '# ' + children().trim() + nl;
        case 'h2': return nl + '## ' + children().trim() + nl;
        case 'h3': return nl + '### ' + children().trim() + nl;
        case 'h4': return nl + '#### ' + children().trim() + nl;
        case 'h5': return nl + '##### ' + children().trim() + nl;
        case 'h6': return nl + '###### ' + children().trim() + nl;
        case 'pre':{
          let code = node.textContent.replace(/\n$/,'');
          // Preserva indentación tal cual
          return nl + '```' + nl + code + nl + '```' + nl;
        }
        case 'blockquote':{
          const inner = children().trim().split('\n').map(l=> l ? '> ' + l : '>').join('\n');
          return nl + inner + nl;
        }
        case 'ul':{
          const items = [...node.children].filter(ch=>ch.tagName?.toLowerCase()==='li').map(li=>{
            const inner = [...li.childNodes].map(n=>blockToMd(n, indent+1)).join('').trim();
            return ' '.repeat(indent*2) + '- ' + inner;
          }).join('\n');
          return nl + items + nl;
        }
        case 'ol':{
          let i = 1;
          const items = [...node.children].filter(ch=>ch.tagName?.toLowerCase()==='li').map(li=>{
            const inner = [...li.childNodes].map(n=>blockToMd(n, indent+1)).join('').trim();
            return ' '.repeat(indent*2) + (i++) + '. ' + inner;
          }).join('\n');
          return nl + items + nl;
        }
        case 'li': return nl + '- ' + children().trim() + nl;
        case 'hr': return nl + '---' + nl;
        case 'p':  return nl + children().trim() + nl;
        default:   return children();
      }
    };

    let md = [...tmp.childNodes].map(n=>blockToMd(n)).join('');
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return md;
  }
  function ensureWrapped(text, mark){
    const t = text.trim();
    return (t.startsWith(mark) && t.endsWith(mark)) ? t : (mark + t + mark);
  }

  /* ===== Markdown -> HTML =====
     - Soporta ```lang opcional
     - Evita envolver placeholders de code blocks en <p>
  */
  function mdToHtml(md){
    const codeBlocks = [];
    md = md.replace(/```([a-z0-9_-]+)?\s*\n([\s\S]*?)\n?```/gi, (_,lang,code)=>{
      codeBlocks.push({ lang: (lang||'').trim(), code });
      return `§§CODEBLOCK${codeBlocks.length-1}§§`;
    });

    // Escapa HTML
    md = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    // Headings
    md = md.replace(/^######\s+(.*)$/gm, (_,t)=> `<h6>${inline(t)}</h6>`)
           .replace(/^#####\s+(.*)$/gm,  (_,t)=> `<h5>${inline(t)}</h5>`)
           .replace(/^####\s+(.*)$/gm,   (_,t)=> `<h4>${inline(t)}</h4>`)
           .replace(/^###\s+(.*)$/gm,    (_,t)=> `<h3>${inline(t)}</h3>`)
           .replace(/^##\s+(.*)$/gm,     (_,t)=> `<h2>${inline(t)}</h2>`)
           .replace(/^#\s+(.*)$/gm,      (_,t)=> `<h1>${inline(t)}</h1>`);

    // HR
    md = md.replace(/^\s*(?:---|\*\*\*|___)\s*$/gm, '<hr>');

    // Blockquotes
    md = md.replace(/(^>.*(\n>.*)*)/gm, m=>{
      const inner = m.replace(/^>\s?/gm,'').trim();
      const html = inner.split(/\n{2,}/).map(b=> `<p>${b.split('\n').map(inline).join('<br>')}</p>`).join('');
      return `<blockquote>${html}</blockquote>`;
    });

    // Lists
    md = md.replace(/(^(\s*[-*+]\s+.+(\n|$))+)/gm, list=>{
      const items = list.trim().split(/\n/).map(l=>l.replace(/^\s*[-*+]\s+/, '')).map(i=>`<li>${inline(i)}</li>`).join('');
      return `<ul>${items}</ul>`;
    });
    md = md.replace(/(^(\s*\d+\.\s+.+(\n|$))+)/gm, list=>{
      const items = list.trim().split(/\n/).map(l=>l.replace(/^\s*\d+\.\s+/, '')).map(i=>`<li>${inline(i)}</li>`).join('');
      return `<ol>${items}</ol>`;
    });

    // Párrafos (no envolver placeholders de code blocks)
    md = md.split(/\n{2,}/).map(block=>{
      if (/^\s*</.test(block)) return block;                 // ya es HTML
      if (/§§CODEBLOCK\d+§§/.test(block)) return block;      // placeholder de código
      const lines = block.split('\n').map(inline).join('<br>');
      return `<p>${lines}</p>`;
    }).join('');

    // Restaurar code blocks
    md = md.replace(/§§CODEBLOCK(\d+)§§/g, (_,i)=>{
      const {lang, code} = codeBlocks[+i];
      const esc = String(code).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const cls = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${cls}>${esc}</code></pre>`;
    });

    return md;

    // Inline (se ejecuta fuera de los code blocks)
    function inline(s){
      // Imágenes
      s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
      // Enlaces
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      // Negrita y cursiva
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      // Código inline
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      return s;
    }
  }

  // Expose
  window.jocarsamarkdownjs = NS;
  if (NS.options.autoInit){
    document.addEventListener('DOMContentLoaded', ()=> NS.init());
  }
})();

