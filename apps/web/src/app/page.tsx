import { HealthStatus } from "@/components/health-status";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-bold">Chat2Order</h1>
        <p className="text-gray-600">Controller</p>
      </div>
      <HealthStatus />
    </main>
  );
}