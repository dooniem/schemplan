// Forskyvning (dy) for hver linje i en SVG-tekst.
// Nettleseren hopper over dy på en tom tspan, så en tom linje ville ikke gitt noen luft på skjermen.
// Derfor flyttes forskyvningen til de tomme linjene over til neste linje med tekst.

/** dy per linje (null = ingen dy, tomme linjer får 0), med de tomme linjenes forskyvning lagt på neste linje som har tekst. */
export function carryEmptyDy(lines: string[], dy: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = [];
  let carry = 0;
  lines.forEach((line, i) => {
    const d = (dy[i] ?? 0) + carry;
    // Bare mellomrom tegner heller ingenting
    if (!line.trim()) {
      carry = d;
      // dy 0 og ikke tom: PDF-en legger ellers på en linjehøyde for en tspan uten dy
      out.push(0);
      return;
    }
    carry = 0;
    out.push(dy[i] === null && d === 0 ? null : d);
  });
  return out;
}
