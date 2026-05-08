"use client";

import { useState } from "react";
import { Video } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2, Pencil } from "lucide-react";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "-";
  if (seconds < 60) return `${seconds} detik`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m} menit ${s} detik` : `${m} menit`;
}

function formatVolume(level: number): string {
  return `${Math.round(Number(level) * 100)}%`;
}

interface VideoUploadCardProps {
  video: Video;
  onDelete: (id: number) => void;
  onUpdate: (id: number, payload: { title: string; is_active: boolean; playlist_order: number }) => void;
  onReplaceFile: (id: number, formData: FormData) => void;
}

export function VideoUploadCard({ video, onDelete, onUpdate, onReplaceFile }: VideoUploadCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState(video.title);
  const [isActive, setIsActive] = useState(video.is_active);
  const [playlistOrder, setPlaylistOrder] = useState(video.playlist_order);
  const [newFile, setNewFile] = useState<File | null>(null);

  const handleSave = () => {
    onUpdate(video.id, {
      title,
      is_active: isActive,
      playlist_order: playlistOrder,
    });

    if (newFile) {
      const formData = new FormData();
      formData.append("video", newFile);
      formData.append("title", title);
      formData.append("is_active", String(isActive));
      formData.append("playlist_order", String(playlistOrder));
      onReplaceFile(video.id, formData);
    }

    setEditOpen(false);
    setNewFile(null);
  };

  const openEdit = () => {
    setTitle(video.title);
    setIsActive(video.is_active);
    setPlaylistOrder(video.playlist_order);
    setNewFile(null);
    setEditOpen(true);
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium line-clamp-1">
            {video.title}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogTrigger render={<Button variant="ghost" size="icon" onClick={openEdit} />}>
                <Pencil className="h-4 w-4" />
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit Video</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`edit-title-${video.id}`}>Judul Video</Label>
                    <Input
                      id={`edit-title-${video.id}`}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Judul video"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`edit-order-${video.id}`}>Urutan Playlist</Label>
                    <Input
                      id={`edit-order-${video.id}`}
                      type="number"
                      min={0}
                      value={playlistOrder}
                      onChange={(e) => setPlaylistOrder(Number(e.target.value))}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id={`edit-active-${video.id}`}
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <Label htmlFor={`edit-active-${video.id}`}>Aktif</Label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`edit-file-${video.id}`}>Ganti File Video</Label>
                    <Input
                      id={`edit-file-${video.id}`}
                      type="file"
                      accept="video/*"
                      className="cursor-pointer"
                      onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Kosongkan jika tidak ingin mengganti video
                    </p>
                  </div>
                  <Button className="w-full" onClick={handleSave}>
                    Simpan Perubahan
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(video.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Durasi: {formatDuration(video.duration)}</span>
          <span>-</span>
          <span>Volume: {formatVolume(video.volume_level)}</span>
          <span>-</span>
          <span>Urutan: {video.playlist_order}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={video.is_active ? "default" : "secondary"}>
            {video.is_active ? "Aktif" : "Nonaktif"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
