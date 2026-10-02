import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Đang xây dựng</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">
          Trang này sẽ được hoàn thiện ở các giai đoạn sau.
        </CardContent>
      </Card>
    </div>
  );
}
