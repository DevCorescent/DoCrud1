'use client';

/**
 * The published half of a member's matching preferences, for the About section.
 *
 * It renders what it is given and nothing else. The decision about WHAT may be
 * shown is made on the server by `publicMatchPreferences`, which builds its
 * answer from an allow-list — so this component never receives a private answer
 * and therefore cannot leak one by rendering the wrong field.
 *
 * The labels come from the same registry the editor uses, so a preference
 * cannot read one way where it is set and another way where it is shown.
 */

const WORK_MODE_LABEL: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'Onsite' };
const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract',
  internship: 'Internship', freelance: 'Freelance', temporary: 'Temporary',
};
const AVAILABILITY_LABEL: Record<string, string> = {
  immediately: 'Available immediately', within_30_days: 'Available within 30 days',
  within_90_days: 'Available within 90 days', not_looking: 'Not looking right now',
};
const RELOCATION_LABEL: Record<string, string> = {
  yes: 'Open to relocating', no: 'Not relocating', for_the_right_role: 'Would relocate for the right role',
};

export interface PublicPreferences {
  preferredLocations?: string[];
  relocation?: string;
  workAuthorization?: string[];
  workModes?: string[];
  employmentTypes?: string[];
  preferredDomains?: string[];
  desiredTitles?: string[];
  experienceYears?: number;
  availability?: string;
  willingToTravel?: boolean;
  languages?: string[];
  companySizes?: string[];
}

/** Only the answers this person chose to publish, in a stable order. */
function lines(p: PublicPreferences): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string | undefined) => { if (value) out.push({ label, value }); };
  const list = (v?: string[]) => (v && v.length ? v.join(' · ') : undefined);

  add('Looking for roles like', list(p.desiredTitles));
  add('Open to work in', list(p.preferredLocations));
  add('Relocation', p.relocation ? RELOCATION_LABEL[p.relocation] ?? p.relocation : undefined);
  add('Work mode', list(p.workModes?.map((m) => WORK_MODE_LABEL[m] ?? m)));
  add('Looking for', list(p.employmentTypes?.map((t) => EMPLOYMENT_LABEL[t] ?? t)));
  add('Fields', list(p.preferredDomains));
  add('Experience', typeof p.experienceYears === 'number'
    ? `${p.experienceYears} year${p.experienceYears === 1 ? '' : 's'}` : undefined);
  add('Availability', p.availability ? AVAILABILITY_LABEL[p.availability] ?? p.availability : undefined);
  add('Work authorisation', list(p.workAuthorization));
  add('Languages', list(p.languages));
  add('Company size', list(p.companySizes));
  add('Travel', typeof p.willingToTravel === 'boolean'
    ? (p.willingToTravel ? 'Open to travel' : 'No travel') : undefined);
  return out;
}

export default function PublicMatchPreferences({ preferences }: { preferences?: PublicPreferences | null }) {
  const rows = preferences ? lines(preferences) : [];
  /* Nothing published means no section at all — an empty "Work preferences"
     heading tells a visitor something was withheld, which is itself a
     disclosure the owner did not agree to. */
  if (rows.length === 0) return null;

  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">{row.label}</dt>
          <dd className="mt-1 break-words text-[14px] text-white/75">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
