'use client';

import { useEffect, useState } from 'react';

type Props = {
  value: string;
  variant?: 'date' | 'datetime';
  className?: string;
};

function isoDateFallback(value: string) {
  try {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toISOString().slice(0, 10);
  } catch {
    return value;
  }
}

export default function ClientDate(props: Props) {
  const [text, setText] = useState(() => isoDateFallback(props.value));

  useEffect(() => {
    try {
      const dt = new Date(props.value);
      if (Number.isNaN(dt.getTime())) return;
      const fmt = new Intl.DateTimeFormat(undefined, props.variant === 'datetime'
        ? { dateStyle: 'medium', timeStyle: 'short' }
        : { dateStyle: 'medium' });
      setText(fmt.format(dt));
    } catch {
      // Ignore
    }
  }, [props.value, props.variant]);

  return (
    <span className={props.className}>
      {text}
    </span>
  );
}

