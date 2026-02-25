import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/lib/language";
import { Card, CardContent } from "@/components/ui/card";
import { Film } from "lucide-react";

type DemoVideo = {
  id: number;
  caption: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
};

export default function DemoVideosPage() {
  const { t } = useLanguage();

  const { data: videos = [], isLoading } = useQuery<DemoVideo[]>({
    queryKey: ["/api/demo-videos"],
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-xl font-bold mb-4">{t("demoVideos.title")}</h1>
        <div className="text-center py-12 text-muted-foreground">{t("app.loading")}</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold mb-1" data-testid="text-demo-videos-title">{t("demoVideos.title")}</h1>
      <p className="text-sm text-muted-foreground mb-4">{t("demoVideos.subtitle")}</p>

      {videos.length === 0 ? (
        <div className="text-center py-16">
          <Film className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">{t("demoVideos.noVideos")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {videos.map((video) => (
            <Card key={video.id} className="max-w-lg" data-testid={`card-demo-video-${video.id}`}>
              <CardContent className="p-0">
                <div className="px-3 py-2 border-b">
                  <span className="text-sm font-medium" data-testid={`text-video-caption-${video.id}`}>{video.caption}</span>
                </div>
                <video
                  controls
                  preload="metadata"
                  className="w-full max-h-[50vh]"
                  data-testid={`video-player-${video.id}`}
                >
                  <source src={`/api/demo-videos/${video.id}/stream`} type={video.mimeType} />
                </video>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
