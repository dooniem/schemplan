// Viser tvungne linjeskift i et tekstfelt, så de skilles fra vanlig ordbryting.
// Et speilbilde av teksten ligger bak feltet med samme skrift og bredde. Teksten i speilet er usynlig;
// bare merkene vises: ↵ der det er trykket Enter, og en svak markering bak "|" (som også er linjeskift).

/** Deler teksten i biter: vanlig tekst, Enter-linjeskift og "|" som linjeskift ("/|" er en strek, ikke linjeskift). */
export type BreakPart = { kind: 'text' | 'enter' | 'pipe'; text: string };

export function breakParts(value: string): BreakPart[] {
  const out: BreakPart[] = [];
  const re = /\r\n|\n|\/\||\|/g;
  let last = 0;
  const pushText = (s: string) => {
    if (!s) return;
    const prev = out[out.length - 1];
    if (prev?.kind === 'text') prev.text += s;
    else out.push({ kind: 'text', text: s });
  };
  for (const m of value.matchAll(re)) {
    pushText(value.slice(last, m.index));
    if (m[0] === '/|') pushText(m[0]);
    else out.push({ kind: m[0] === '|' ? 'pipe' : 'enter', text: m[0] });
    last = m.index + m[0].length;
  }
  pushText(value.slice(last));
  return out;
}

/** Legger tekstfeltet i en ramme med speilet bak. Returnerer rammen, som settes inn der feltet skulle stått. */
export function withBreakMarks(ta: HTMLTextAreaElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ta-marks';
  const mirror = document.createElement('div');
  mirror.className = 'ta-mirror';
  mirror.setAttribute('aria-hidden', 'true');
  const draw = () => {
    const nodes: Node[] = [];
    for (const p of breakParts(ta.value)) {
      if (p.kind === 'text') nodes.push(document.createTextNode(p.text));
      else if (p.kind === 'pipe') {
        const s = document.createElement('span');
        s.className = 'br-pipe';
        s.textContent = '|';
        nodes.push(s);
      } else {
        const s = document.createElement('span');
        s.className = 'br-enter';
        s.textContent = '↵';
        nodes.push(s, document.createTextNode('\n'));
      }
    }
    // Et tegn til slutt, så en avsluttende tom linje får høyde som i feltet
    nodes.push(document.createTextNode('​'));
    mirror.replaceChildren(...nodes);
    mirror.scrollTop = ta.scrollTop;
  };
  ta.addEventListener('input', draw);
  ta.addEventListener('scroll', () => (mirror.scrollTop = ta.scrollTop));
  wrap.append(mirror, ta);
  draw();
  return wrap;
}
