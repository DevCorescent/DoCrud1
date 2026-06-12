import PublicBoardRoomJoinPage from '@/components/PublicBoardRoomJoinPage';

export const dynamic = 'force-dynamic';

export default function BoardRoomInvitePage({ params }: { params: { token: string } }) {
  return <PublicBoardRoomJoinPage token={params.token} />;
}
