"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Music2, UploadCloud, X } from "lucide-react";

export const MAX_UPLOAD_BYTES = Math.floor(4.2 * 1024 * 1024);

type AudioDropzoneProps = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function AudioDropzone({
  file,
  onFileChange,
  disabled = false,
}: AudioDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const audioUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  const validateAndSelect = (candidate: File | null) => {
    if (!candidate) return;
    const isMp3 =
      candidate.name.toLowerCase().endsWith(".mp3") ||
      candidate.type === "audio/mpeg" ||
      candidate.type === "audio/mp3";

    if (!isMp3) {
      setValidationError("Please upload an .mp3 audio file.");
      return;
    }

    if (candidate.size === 0) {
      setValidationError("Selected audio file is empty.");
      return;
    }

    if (candidate.size > MAX_UPLOAD_BYTES) {
      setValidationError(
        `File is ${formatFileSize(candidate.size)} — maximum web upload size is 4.2 MB (Vercel serverless limit). Re-encode to 128–192 kbps MP3 or push larger files directly to input/.`
      );
      return;
    }

    setValidationError(null);
    onFileChange(candidate);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0] ?? null;
    validateAndSelect(dropped);
  };

  const handleRemove = () => {
    setValidationError(null);
    onFileChange(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-[0.14em] text-[#B8A9CC]"
        >
          Audio Track (.mp3)
        </label>
        <span className="font-mono text-[11px] text-[#8E7EA3]">
          Max 4.2 MB
        </span>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".mp3,audio/mpeg"
        disabled={disabled}
        className="sr-only"
        onChange={(e) => validateAndSelect(e.target.files?.[0] ?? null)}
      />

      {!file ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Upload MP3 audio track"
          onClick={() => !disabled && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-5 py-8 text-center transition-all duration-150 ${
            disabled
              ? "cursor-not-allowed border-white/10 bg-[#140F1E]/50 opacity-60"
              : isDragging
                ? "border-[#D29BFF] bg-[#2B084A]/45"
                : "border-[#D29BFF]/25 bg-[#120D1B] hover:border-[#D29BFF]/55 hover:bg-[#191127]"
          }`}
        >
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#2B084A]/80 text-[#D29BFF] transition-transform duration-150 group-hover:scale-105">
            <UploadCloud className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-[#F6F1FC]">
            Drop your <span className="font-mono text-[#D29BFF]">.mp3</span>{" "}
            here, or click to browse
          </p>
          <p className="mt-1 text-xs text-[#8E7EA3]">
            Processed on GitHub Actions CPU with WhisperX + Remotion v4
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#D29BFF]/25 bg-[#171124] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2B084A] text-[#D29BFF]">
                <Music2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#F6F1FC]">
                  {file.name}
                </p>
                <p className="mt-0.5 font-mono text-xs text-[#A698B8]">
                  {formatFileSize(file.size)} · Ready to align &amp; render
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-[#D6C9E6] transition hover:border-[#D29BFF]/40 hover:bg-white/5 disabled:opacity-40"
              >
                Replace
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={handleRemove}
                aria-label="Remove audio file"
                className="rounded-lg p-1.5 text-[#A698B8] transition hover:bg-white/5 hover:text-[#F6F1FC] disabled:opacity-40"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {audioUrl && (
            <div className="mt-3.5">
              <audio
                controls
                preload="metadata"
                src={audioUrl}
                className="h-10 w-full rounded-lg opacity-95"
              />
            </div>
          )}
        </div>
      )}

      {validationError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
          <span>{validationError}</span>
        </div>
      )}
    </div>
  );
}
