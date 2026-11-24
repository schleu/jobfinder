import { Fragment } from 'react';
import todoRaw from '../../TODO.md?raw';

interface TodoItem { text: string; done: boolean; children: TodoItem[] }
interface Section { title: string; items: TodoItem[] }

// Lê o TODO.md (headings + checkboxes) para a aba Futuro refletir o arquivo.
function parseTodo(md: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  let inCode = false;

  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();

    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode || line.trim().startsWith('<!--')) continue;

    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      current = { title: heading[1].trim(), items: [] };
      sections.push(current);
      continue;
    }
    if (!current || /^#\s+/.test(line)) continue;

    const bullet = line.match(/^(\s*)-\s+(?:\[( |x|X)\]\s+)?(.*)$/);
    if (!bullet) continue;

    const item: TodoItem = {
      text: bullet[3].trim(),
      done: (bullet[2] ?? '').toLowerCase() === 'x',
      children: [],
    };

    if (bullet[1].length >= 2 && current.items.length) {
      current.items[current.items.length - 1].children.push(item);
    } else {
      current.items.push(item);
    }
  }

  return sections.filter((s) => s.items.length > 0);
}

const countItems = (items: TodoItem[]): number =>
  items.reduce((n, item) => n + 1 + countItems(item.children), 0);

const countDone = (items: TodoItem[]): number =>
  items.reduce((n, item) => n + (item.done ? 1 : 0) + countDone(item.children), 0);

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : p.startsWith('`') && p.endsWith('`') ? (
          <code key={i}>{p.slice(1, -1)}</code>
        ) : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? (
          <em key={i}>{p.slice(1, -1)}</em>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function ItemList({ items }: { items: TodoItem[] }) {
  return (
    <ul className="todo-list">
      {items.map((item) => (
        <li key={item.text} className={item.done ? 'todo done' : 'todo'}>
          <div className="todo-line">
            <span className="todo-box" aria-hidden="true">{item.done ? '✓' : ''}</span>
            <span className="todo-text"><Inline text={item.text} /></span>
          </div>
          {item.children.length > 0 && <ItemList items={item.children} />}
        </li>
      ))}
    </ul>
  );
}

export default function RoadmapPanel() {
  const sections = parseTodo(todoRaw);
  const total = sections.reduce((n, s) => n + countItems(s.items), 0);
  const done = sections.reduce((n, s) => n + countDone(s.items), 0);
  const percent = total ? Math.round((done / total) * 100) : 0;

  return (
    <section className="roadmap">
      <div className="card">
        <div className="roadmap-head">
          <div>
            <h2>Features futuras</h2>
            <p className="muted">Ideias do TODO.md, organizadas por tema.</p>
          </div>
          <span className="roadmap-count">{done} de {total} concluídas</span>
        </div>
        <div className="roadmap-progress"><span style={{ width: `${percent}%` }} /></div>
      </div>

      {sections.map((section) => (
        <div className="card" key={section.title}>
          <h2>{section.title}</h2>
          <ItemList items={section.items} />
        </div>
      ))}
    </section>
  );
}
