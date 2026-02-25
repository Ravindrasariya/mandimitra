import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/lib/language";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayCircle, X, Film } from "lucide-react";
import { format } from "date-fns";

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
  const [activeVideoId, setActiveVideoId] = useState<number | null>(null);

  const { data: videos = [], isLoading } = useQuery<DemoVideo[]>({
    queryKey: ["/api/demo-videos"],
  });

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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
        <div className="space-y-4">
          {videos.map((video) => (
            <Card key={video.id} data-testid={`card-demo-video-${video.id}`}>
              <CardContent className="p-0">
                {activeVideoId === video.id ? (
                  <div>
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                      <span className="text-sm font-medium truncate">{video.caption}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => setActiveVideoId(null)}
                        data-testid={`button-close-video-${video.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <video
                      controls
                      autoPlay
                      className="w-full max-h-[70vh]"
                      data-testid={`video-player-${video.id}`}
                    >
                      <source src={`/api/demo-videos/${video.id}/stream`} type={video.mimeType} />
                    </video>
                  </div>
                ) : (
                  <button
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => setActiveVideoId(video.id)}
                    data-testid={`button-play-video-${video.id}`}
                  >
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <PlayCircle className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{video.caption}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{formatFileSize(video.fileSize)}</span>
                        <span>{format(new Date(video.uploadedAt), "dd/MM/yyyy")}</span>
                      </div>
                    </div>
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
