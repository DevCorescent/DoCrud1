import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { buildInvoiceHtml, getBillingTransactions } from '@/lib/server/billing';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { transactionId: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [users, transactions] = await Promise.all([getStoredUsers(), getBillingTransactions()]);
    const user = users.find((entry) => entry.email === session.user.email);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const transaction = transactions.find((entry) => entry.id === params.transactionId && entry.userId === user.id);
    if (!transaction) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const html = buildInvoiceHtml(transaction);
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${transaction.invoiceNumber || transaction.id}.html"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to generate invoice' }, { status: 500 });
  }
}
