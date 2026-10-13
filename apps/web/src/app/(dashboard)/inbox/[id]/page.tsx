import { ConversationView } from "@/components/inbox/conversation-view";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // key theo id để mỗi hội thoại có trạng thái cuộn riêng
  return <ConversationView key={id} id={id} />;
}
