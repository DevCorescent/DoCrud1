'use client';

/**
 * The account-type switch for the signup page.
 *
 * Both signup forms already existed and are kept exactly as they are — this
 * only decides which of them renders inside the same page shell, under the
 * shared toggle. Nothing about either form is duplicated or rewritten.
 *
 * The forms are passed in as elements rather than imported here so this stays a
 * thin client wrapper: the server page keeps ownership of their props (plan,
 * config, referral) and this component keeps ownership of the selection.
 *
 * Selecting a type is a client state change AND a URL update, so a refresh or a
 * shared link reopens in the same mode. It never sets the account type itself —
 * that is written server-side by whichever signup route the chosen form posts
 * to, so a tampered `?type=` cannot create the wrong kind of account.
 */

import { useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AccountTypeToggle, { type AccountKind } from '@/components/AccountTypeToggle';

export default function SignupAccountSwitch({
  initial,
  individual,
  business,
}: {
  initial: AccountKind;
  individual: ReactNode;
  business: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [kind, setKind] = useState<AccountKind>(initial);

  const select = (next: AccountKind) => {
    setKind(next);
    /* Preserve every other parameter — plan, config and referral links have to
       survive a toggle. */
    const params = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
    if (next === 'business') params.set('type', 'business');
    else params.delete('type');
    const qs = params.toString();
    router.replace(qs ? `/signup?${qs}` : '/signup', { scroll: false });
  };

  return (
    <div className="mx-auto w-full">
      <div className="mx-auto mb-5 w-full max-w-[420px]">
        <AccountTypeToggle value={kind} onChange={select} />
        <p className="pt-2 text-center text-[11.5px] text-white/35">
          {kind === 'business' ? 'Create your business account' : 'Create your account'}
        </p>
      </div>

      {kind === 'business' ? business : individual}
    </div>
  );
}
