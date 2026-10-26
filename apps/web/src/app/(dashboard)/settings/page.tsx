import { WebChatSettingsCard } from "@/components/settings/web-chat-settings";

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Cài đặt</h1>
      <WebChatSettingsCard />
    </div>
  );
}
