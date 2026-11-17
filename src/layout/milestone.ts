import type { Box, Rotation } from '../format/types';

/** Rotasjonen milepælsteksten har uten valg i appen: boksens egen, ellers −90 (leses nedenfra) når Project har bedt om rotert tekst. */
export function baseMilestoneRotation(box: Pick<Box, 'rotation' | 'milestone'>): Rotation {
  if (box.rotation) return box.rotation;
  return box.milestone?.rotateText ? -90 : 0;
}

/** Rotasjonen milepælsteksten tegnes med. Valget i appen går foran. */
export function milestoneRotation(box: Pick<Box, 'rotation' | 'milestone' | 'milestoneStyle'>): Rotation {
  return box.milestoneStyle?.rotation ?? baseMilestoneRotation(box);
}
