import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useDeleteMemory, useMemories, useUploadMemory } from '../../hooks/useMemories';
import { Skeleton } from '../../components/Skeleton';
import { ErrorState } from '../../components/ErrorState';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../components/ui/sheet';
import { formatDayLabel } from '../../utils/time';
import type { Memory } from '../../types';

const UPLOAD_ERROR = "Couldn't add this photo. Try again.";

/** Groups photos under the day they were added, newest first. */
function byDay(memories: Memory[]): Array<[string, Memory[]]> {
    const groups = new Map<string, Memory[]>();

    for (const memory of memories) {
        const label = formatDayLabel(memory.createdAt);
        groups.set(label, [...(groups.get(label) ?? []), memory]);
    }
    return Array.from(groups.entries());
}

function Photo({
    memory,
    onOpen,
    onDelete,
}: {
    memory: Memory;
    onOpen: (url: string) => void;
    onDelete: (id: string) => void;
}) {
    const [failed, setFailed] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="group relative aspect-square overflow-hidden rounded-xl bg-velvet"
        >
            {failed ? (
                // A photo that will not load shows a quiet placeholder rather
                // than a broken image icon.
                <div className="flex h-full items-center justify-center px-2 text-center text-[0.68rem] text-dust">
                    Couldn&apos;t load
                </div>
            ) : (
                <button type="button" onClick={() => onOpen(memory.url)} className="h-full w-full">
                    <img
                        src={memory.url}
                        alt={memory.caption || ''}
                        loading="lazy"
                        onError={() => setFailed(true)}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                </button>
            )}

            <button
                type="button"
                aria-label="Remove this photo"
                onClick={() => onDelete(memory._id)}
                className="absolute top-2 right-2 rounded-full bg-ink/70 p-1.5 text-dust opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
                <Trash2 size={14} />
            </button>

            {memory.caption && (
                <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent px-3 pt-6 pb-2 text-xs text-chalk">
                    {memory.caption}
                </p>
            )}
        </motion.div>
    );
}

export function MemoryGrid({
    onOpenImage,
    sheetContainer,
}: {
    onOpenImage: (url: string) => void;
    sheetContainer: HTMLElement | null;
}) {
    const { data, isLoading, isError, refetch } = useMemories();
    const upload = useUploadMemory();
    const remove = useDeleteMemory();
    const fileInput = useRef<HTMLInputElement>(null);

    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [caption, setCaption] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // The preview follows whichever file is currently chosen, and its object
    // URL is revoked whenever that changes — covering a different file being
    // chosen, the sheet closing (which clears the file), and unmount.
    useEffect(() => {
        if (!selectedFile) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(selectedFile);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [selectedFile]);

    /** Closes the sheet and clears whatever was chosen or typed. */
    function resetSelection() {
        setDialogOpen(false);
        setSelectedFile(null);
        setCaption('');
        setError(null);
    }

    function handleAddPhoto() {
        if (!selectedFile) return;
        setError(null);
        upload.mutate(
            { file: selectedFile, caption },
            {
                onSuccess: () => {
                    resetSelection();
                    toast('Photo added');
                },
                onError: () => setError(UPLOAD_ERROR),
            }
        );
    }

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="aspect-square" />
                ))}
            </div>
        );
    }

    if (isError) {
        return <ErrorState title="Couldn't load your photos right now." onRetry={() => refetch()} />;
    }

    const memories = data ?? [];

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="chamber-scroll mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto px-3 pb-24">
                {memories.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                        <p className="font-display text-lg text-chalk">Nothing kept here yet</p>
                        <p className="mt-1 text-sm text-dust">Add the first photo.</p>
                    </div>
                ) : (
                    byDay(memories).map(([label, group]) => (
                        <section key={label} className="mb-6">
                            <h3 className="mb-2 px-1 font-display text-sm text-dust italic">{label}</h3>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {group.map((memory) => (
                                    <Photo
                                        key={memory._id}
                                        memory={memory}
                                        onOpen={onOpenImage}
                                        onDelete={(id) => remove.mutate(id)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))
                )}

                <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            setSelectedFile(file);
                            setCaption('');
                            setError(null);
                            setDialogOpen(true);
                        }
                        e.target.value = '';
                    }}
                />
            </div>

            <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => fileInput.current?.click()}
                disabled={upload.isPending}
                className="absolute right-4 bottom-4 flex items-center gap-2 rounded-full bg-lamp px-5 py-3 text-sm font-medium text-ink shadow-lg shadow-ink/50 disabled:opacity-60"
            >
                <Plus size={17} />
                Add photo
            </motion.button>

            <Sheet
                open={dialogOpen}
                onOpenChange={(open) => {
                    if (open) {
                        setDialogOpen(true);
                        return;
                    }
                    // Escape, an overlay click and the sheet's own X button all
                    // arrive here too. While the upload is in flight, closing
                    // would lose the result: a failure would set an error on an
                    // already-closed sheet, and a success would happen where she
                    // can no longer see it. The sheet stays open until it settles.
                    if (upload.isPending) return;
                    resetSelection();
                }}
            >
                <SheetContent container={sheetContainer}>
                    <SheetTitle>Add a photo</SheetTitle>
                    <SheetDescription className="sr-only">
                        Add a few words about this moment if you like.
                    </SheetDescription>

                    {previewUrl && (
                        <img
                            src={previewUrl}
                            alt="Selected photo"
                            className="mx-auto max-h-[45vh] w-full rounded-2xl object-contain"
                        />
                    )}

                    <div>
                        <textarea
                            aria-label="Description"
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            placeholder="Write something about this moment (optional)"
                            maxLength={300}
                            rows={3}
                            autoFocus
                            className="w-full resize-none rounded-2xl border border-border bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                        />
                        <p className="mt-1 text-right text-xs text-muted-foreground">{caption.length}/300</p>
                    </div>

                    {error && (
                        <p role="alert" className="text-sm text-rose">
                            {error}
                        </p>
                    )}

                    <div className="mt-1 flex gap-2">
                        <button
                            type="button"
                            onClick={resetSelection}
                            disabled={upload.isPending}
                            className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleAddPhoto}
                            disabled={upload.isPending}
                            className="flex-1 rounded-full bg-lamp px-4 py-2.5 text-sm font-medium text-ink shadow-lg shadow-ink/40 disabled:opacity-60"
                        >
                            {upload.isPending ? 'Adding…' : 'Add photo'}
                        </button>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
