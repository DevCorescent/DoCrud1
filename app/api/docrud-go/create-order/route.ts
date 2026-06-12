import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getRazorpayConfig } from '@/lib/server/billing';
import { getProfileData } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

const DOCRUD_GO_PRICE_INR = 99;
const DOCRUD_GO_PRICE_PAISE = DOCRUD_GO_PRICE_INR * 100;

export async function POST() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const normalizedEmail = session.user.email.trim().toLowerCase();
    const user = users.find(u => u.email.trim().toLowerCase() === normalizedEmail);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const profile = await getProfileData(user.id);
    if (profile.docrudGo) {
      return NextResponse.json({ error: 'You already have Docrud Infinity.' }, { status: 409 });
    }

    const { keyId, keySecret, publishableKeyAvailable } = getRazorpayConfig();
    if (!publishableKeyAvailable || !keySecret) {
      return NextResponse.json({ error: 'Payment gateway not configured.' }, { status: 503 });
    }

    const receipt = `dgo_${user.id.slice(0, 8)}_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`.slice(0, 40);

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: DOCRUD_GO_PRICE_PAISE,
        currency: 'INR',
        receipt,
        notes: {
          product: 'Docrud Infinity',
          userId: user.id,
          userEmail: user.email,
          userName: user.name || '',
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return NextResponse.json({ error: (err as { error?: { description?: string } })?.error?.description || 'Failed to create payment order.' }, { status: 502 });
    }

    const order = await response.json() as { id: string; amount: number; currency: string };

    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      userName: user.name || '',
      userEmail: user.email,
    });
  } catch (err) {
    console.error('[docrud-go/create-order]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
