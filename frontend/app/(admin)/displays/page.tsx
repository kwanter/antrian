"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { updateVideo, updateVideoWithFile } from "@/lib/api";
import type { Display, Video } from "@/lib/types";
import { toast } from "sonner";
import { VideoUploadCard } from "@/components/admin/video-upload-card";
import { VolumeSlider } from "@/components/admin/volume-slider";
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
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Pencil, Plus, Volume2, Video as VideoIcon } from "lucide-react";

export default function DisplaysPage() {
  const queryClient = useQueryClient();
  const [addDisplayOpen, setAddDisplayOpen] = useState(false);
  const [addVideoOpen, setAddVideoOpen] = useState(false);
  const [selectedDisplayId, setSelectedDisplayId] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [displayLocation, setDisplayLocation] = useState("");
  const [editDisplayOpen, setEditDisplayOpen] = useState(false);
  const [editingDisplay, setEditingDisplay] = useState<Display | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editDisplayLocation, setEditDisplayLocation] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [announcerFiles, setAnnouncerFiles] = useState<Record<number, File | null>>({});
  const [announcerVolumeDrafts, setAnnouncerVolumeDrafts] = useState<Record<number, number>>({});
  const [volumeDrafts, setVolumeDrafts] = useState<Record<number, number>>({});
  const [volumePending, setVolumePending] = useState<Record<number, number>>({});
  const [volumeSaved, setVolumeSaved] = useState<Record<number, number>>({});
  const latestVolumeRequests = useRef<Record<number, { volume: number; version: number }>>({});
  const volumeVersions = useRef<Record<number, number>>({});
  const volumeSaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const { data: displays = [], isLoading: loadingDisplays } = useQuery({
    queryKey: ["displays"],
    queryFn: () => api.get("/displays").then((res) => res.data.data as Display[]),
  });

  const { data: videos = [] } = useQuery({
    queryKey: ["videos"],
    queryFn: () => api.get("/videos").then((res) => res.data.data as Video[]),
  });

  const createDisplay = useMutation({
    mutationFn: (data: { name: string; location: string }) =>
      api.post("/displays", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displays"] });
      toast.success("Display berhasil ditambahkan");
      setAddDisplayOpen(false);
      setDisplayName("");
      setDisplayLocation("");
    },
    onError: () => {
      toast.error("Gagal menambahkan display");
    },
  });

  const deleteDisplay = useMutation({
    mutationFn: (id: number) => api.delete(`/displays/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["displays"] });
      toast.success("Display berhasil dihapus");
    },
    onError: () => {
      toast.error("Gagal menghapus display");
    },
  });

  const updateDisplay = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; location: string } }) =>
      api.put(`/displays/${id}`, data),
    onSuccess: (response) => {
      const updatedDisplay = response.data.data as Display;
      queryClient.setQueryData<Display[]>(["displays"], (current) =>
        current?.map((display) =>
          display.id === updatedDisplay.id ? updatedDisplay : display
        ) ?? []
      );
      toast.success("Display berhasil diperbarui");
      setEditDisplayOpen(false);
      setEditingDisplay(null);
      setEditDisplayName("");
      setEditDisplayLocation("");
    },
    onError: () => {
      toast.error("Gagal memperbarui display");
    },
  });

  const createVideo = useMutation({
    mutationFn: (data: FormData) =>
      api.post("/videos", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Video berhasil ditambahkan");
      setAddVideoOpen(false);
      setVideoTitle("");
      setVideoFile(null);
      setSelectedDisplayId(null);
    },
    onError: () => {
      toast.error("Gagal menambahkan video");
    },
  });

  const deleteVideo = useMutation({
    mutationFn: (id: number) => api.delete(`/videos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Video berhasil dihapus");
    },
    onError: () => {
      toast.error("Gagal menghapus video");
    },
  });

  const updateVideoMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { title: string; is_active: boolean; playlist_order: number } }) =>
      updateVideo(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      toast.success("Video berhasil diperbarui");
    },
    onError: () => {
      toast.error("Gagal memperbarui video");
    },
  });

  const replaceVideoFile = useMutation({
    mutationFn: ({ id, formData }: { id: number; formData: FormData }) =>
      updateVideoWithFile(id, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      toast.success("File video berhasil diganti");
    },
    onError: () => {
      toast.error("Gagal mengganti file video");
    },
  });

  const updateAnnouncerMutation = useMutation({
    mutationFn: ({ displayId, formData }: { displayId: number; formData: FormData }) =>
      api.post(`/displays/${displayId}/announcer`, formData),
    onSuccess: (response, variables) => {
      const updatedDisplay = response.data.data as Display | undefined;
      queryClient.setQueryData<Display[]>(["displays"], (current) =>
        current?.map((display) =>
          updatedDisplay && display.id === updatedDisplay.id ? updatedDisplay : display
        ) ?? []
      );
      setAnnouncerFiles((current) => ({ ...current, [variables.displayId]: null }));
      setAnnouncerVolumeDrafts((current) => {
        const remaining = { ...current };
        delete remaining[variables.displayId];
        return remaining;
      });
      toast.success("Pengaturan announcer berhasil disimpan");
    },
    onError: () => {
      toast.error("Gagal menyimpan pengaturan announcer");
    },
  });

  const updateVolumeMutation = useMutation({
    mutationFn: ({ displayId, volume }: { displayId: number; volume: number; version: number }) =>
      api.post(`/displays/${displayId}/volume`, { volume }),
    onMutate: ({ displayId, volume, version }) => {
      latestVolumeRequests.current[displayId] = { volume, version };
      setVolumePending((current) => ({ ...current, [displayId]: volume }));
      setVolumeSaved((current) => {
        const remaining = { ...current };
        delete remaining[displayId];
        return remaining;
      });
    },
    onSuccess: (response, variables) => {
      const latestRequest = latestVolumeRequests.current[variables.displayId];
      if (
        latestRequest?.volume !== variables.volume ||
        latestRequest.version !== variables.version ||
        volumeVersions.current[variables.displayId] !== variables.version
      ) return;

      const updatedDisplay = response.data.data as Display | undefined;
      if (!updatedDisplay) return;

      setVolumeDrafts((current) => {
        const remaining = { ...current };
        delete remaining[variables.displayId];
        return remaining;
      });
      delete latestVolumeRequests.current[variables.displayId];
      setVolumePending((current) => {
        const remaining = { ...current };
        delete remaining[variables.displayId];
        return remaining;
      });
      setVolumeSaved((current) => ({ ...current, [variables.displayId]: variables.volume }));

      queryClient.setQueryData<Display[]>(["displays"], (current) =>
        current?.map((display) =>
          display.id === updatedDisplay.id ? updatedDisplay : display
        ) ?? []
      );
    },
    onError: (_error, variables) => {
      const latestRequest = latestVolumeRequests.current[variables.displayId];
      if (
        latestRequest?.volume === variables.volume &&
        latestRequest.version === variables.version &&
        volumeVersions.current[variables.displayId] === variables.version
      ) {
        delete latestVolumeRequests.current[variables.displayId];
        setVolumePending((current) => {
          const remaining = { ...current };
          delete remaining[variables.displayId];
          return remaining;
        });
        toast.error("Gagal mengubah volume");
      }
    },
  });

  useEffect(() => {
    const timers = volumeSaveTimers.current;

    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const saveVolume = (displayId: number, value: number, version: number) => {
    const volume = value / 100;
    const latestRequest = latestVolumeRequests.current[displayId];
    if (latestRequest?.volume === volume && latestRequest.version === version) return;

    updateVolumeMutation.mutate({ displayId, volume, version });
  };

  const scheduleVolumeSave = (displayId: number, value: number) => {
    const version = (volumeVersions.current[displayId] ?? 0) + 1;
    volumeVersions.current[displayId] = version;
    setVolumeDrafts((current) => ({ ...current, [displayId]: value }));

    const existingTimer = volumeSaveTimers.current[displayId];
    if (existingTimer) clearTimeout(existingTimer);

    volumeSaveTimers.current[displayId] = setTimeout(() => {
      delete volumeSaveTimers.current[displayId];
      saveVolume(displayId, value, version);
    }, 500);
  };

  const commitVolumeSave = (displayId: number, value: number) => {
    const existingTimer = volumeSaveTimers.current[displayId];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete volumeSaveTimers.current[displayId];
    }

    const version = volumeVersions.current[displayId] ?? 0;
    saveVolume(displayId, value, version);
  };

  const handleAddDisplay = (e: React.FormEvent) => {
    e.preventDefault();
    createDisplay.mutate({ name: displayName, location: displayLocation });
  };

  const openEditDisplayDialog = (display: Display) => {
    setEditingDisplay(display);
    setEditDisplayName(display.name);
    setEditDisplayLocation(display.location);
    setEditDisplayOpen(true);
  };

  const handleEditDisplay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDisplay) return;
    updateDisplay.mutate({
      id: editingDisplay.id,
      data: { name: editDisplayName, location: editDisplayLocation },
    });
  };

  const handleAddVideo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDisplayId || !videoFile) return;
    const formData = new FormData();
    formData.append("title", videoTitle);
    formData.append("display_id", String(selectedDisplayId));
    formData.append("video", videoFile);
    createVideo.mutate(formData);
  };

  const openAddVideoDialog = (displayId: number) => {
    setSelectedDisplayId(displayId);
    setVideoFile(null);
    setAddVideoOpen(true);
  };

  const getDisplayVideos = (displayId: number) =>
    videos.filter((v) => v.display_id === displayId);

  const saveAnnouncer = (display: Display, overrides: { enabled?: boolean; clearSound?: boolean } = {}) => {
    const formData = new FormData();
    const enabled = overrides.enabled ?? display.settings?.announcer_enabled ?? true;
    const volume = announcerVolumeDrafts[display.id] ?? Math.round((display.settings?.announcer_volume ?? 1) * 100);
    const file = announcerFiles[display.id];

    formData.append("announcer_enabled", enabled ? "1" : "0");
    formData.append("announcer_volume", String(volume / 100));

    if (file) formData.append("announcer_sound", file);
    if (overrides.clearSound) formData.append("clear_sound", "1");

    updateAnnouncerMutation.mutate({ displayId: display.id, formData });
  };

  const testAnnouncer = (display: Display) => {
    const volume = (announcerVolumeDrafts[display.id] ?? Math.round((display.settings?.announcer_volume ?? 1) * 100)) / 100;
    const soundUrl = display.settings?.announcer_sound_url;

    if (soundUrl?.startsWith("/storage/announcers/")) {
      const audio = new Audio(soundUrl);
      audio.volume = Math.min(1, Math.max(0, volume));
      void audio.play().catch(() => toast.error("Browser memblokir suara. Klik lagi untuk tes."));
      return;
    }

    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance("Nomor antrian A001, silakan menuju loket satu");
    utterance.lang = "id-ID";
    utterance.volume = Math.min(1, Math.max(0, volume));
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Manajemen Display</h1>
        <div className="flex gap-2">
          <Dialog open={addDisplayOpen} onOpenChange={setAddDisplayOpen}>
            <DialogTrigger render={<Button><Plus className="mr-2 h-4 w-4" /> Tambah Display</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Display Baru</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddDisplay} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="display-name">Nama Display</Label>
                  <Input
                    id="display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Contoh: Display Utama"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display-location">Lokasi</Label>
                  <Input
                    id="display-location"
                    value={displayLocation}
                    onChange={(e) => setDisplayLocation(e.target.value)}
                    placeholder="Contoh: Lobby Utama"
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  Simpan
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={() => setAddVideoOpen(true)}>
            <VideoIcon className="mr-2 h-4 w-4" />
            Tambah Video
          </Button>
        </div>
      </div>

      {loadingDisplays ? (
        <div className="text-center py-12 text-muted-foreground">
          Memuat displays...
        </div>
      ) : displays.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Belum ada display. Tambahkan display pertama Anda.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {displays.map((display) => {
            const displayVideos = getDisplayVideos(display.id);
            return (
              <Card key={display.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl">{display.name}</CardTitle>
                    <Badge variant={display.is_active ? "default" : "secondary"}>
                      {display.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {display.location}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Volume</Label>
                    <VolumeSlider
                      value={
                        volumeDrafts[display.id] ??
                        Math.round((display.settings?.volume ?? 0.75) * 100)
                      }
                      status={
                        volumePending[display.id] != null
                          ? "Menyimpan..."
                          : volumeSaved[display.id] != null
                            ? "Tersimpan"
                            : undefined
                      }
                      onChange={(v) => scheduleVolumeSave(display.id, v)}
                      onCommit={(v) => commitVolumeSave(display.id, v)}
                    />
                  </div>

                  <div className="rounded-lg border p-4 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <Label className="text-sm font-medium">Announcer Antrian</Label>
                        <p className="text-xs text-muted-foreground">
                          Putar suara saat nomor antrian dipanggil
                        </p>
                      </div>
                      <Switch
                        checked={display.settings?.announcer_enabled ?? true}
                        onCheckedChange={(enabled) => saveAnnouncer(display, { enabled })}
                      />
                    </div>

                    <VolumeSlider
                      value={
                        announcerVolumeDrafts[display.id] ??
                        Math.round((display.settings?.announcer_volume ?? 1) * 100)
                      }
                      onChange={(value) => setAnnouncerVolumeDrafts((current) => ({ ...current, [display.id]: value }))}
                      onCommit={() => saveAnnouncer(display)}
                    />

                    <div className="space-y-2">
                      <Label htmlFor={`announcer-${display.id}`}>File suara custom</Label>
                      <Input
                        id={`announcer-${display.id}`}
                        type="file"
                        accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac"
                        onChange={(event) =>
                          setAnnouncerFiles((current) => ({
                            ...current,
                            [display.id]: event.target.files?.[0] ?? null,
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        {announcerFiles[display.id]?.name ?? display.settings?.announcer_sound_title ?? "Tanpa file custom, gunakan suara sistem"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveAnnouncer(display)}
                        disabled={updateAnnouncerMutation.isPending}
                      >
                        Simpan Announcer
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => testAnnouncer(display)}
                      >
                        <Volume2 className="mr-2 h-4 w-4" />
                        Tes Suara
                      </Button>
                      {display.settings?.announcer_sound_url && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => saveAnnouncer(display, { clearSound: true })}
                        >
                          Hapus File
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        Video ({displayVideos.length})
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAddVideoDialog(display.id)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Tambah
                      </Button>
                    </div>

                    {displayVideos.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        Belum ada video untuk display ini
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {displayVideos.map((video) => (
                          <VideoUploadCard
                            key={video.id}
                            video={video}
                            onDelete={deleteVideo.mutate}
                            onUpdate={(id, payload) => updateVideoMutation.mutate({ id, payload })}
                            onReplaceFile={(id, formData) => replaceVideoFile.mutate({ id, formData })}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDisplayDialog(display)}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit Display
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteDisplay.mutate(display.id)}
                    >
                      Hapus Display
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={addVideoOpen} onOpenChange={setAddVideoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Video Baru</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddVideo} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="video-display">Display</Label>
              <select
                id="video-display"
                value={selectedDisplayId ?? ""}
                onChange={(e) =>
                  setSelectedDisplayId(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
              >
                <option value="">Pilih Display</option>
                {displays.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} - {d.location}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-title">Judul Video</Label>
              <Input
                id="video-title"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="Contoh: Promo Diskon 20%"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="video-file">File Video</Label>
              <Input
                id="video-file"
                type="file"
                accept="video/*"
                className="cursor-pointer"
                required
                onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={!videoFile || !videoTitle || !selectedDisplayId || createVideo.isPending}>
              {createVideo.isPending ? "Mengupload..." : "Simpan"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editDisplayOpen} onOpenChange={setEditDisplayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Display</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditDisplay} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-display-name">Nama Display</Label>
              <Input
                id="edit-display-name"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Contoh: Display Utama"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-display-location">Deskripsi / Lokasi</Label>
              <Input
                id="edit-display-location"
                value={editDisplayLocation}
                onChange={(e) => setEditDisplayLocation(e.target.value)}
                placeholder="Contoh: Lobby Utama"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={!editDisplayName || !editDisplayLocation || updateDisplay.isPending}
            >
              {updateDisplay.isPending ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
