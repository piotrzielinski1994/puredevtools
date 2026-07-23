import { useCallback, useEffect, useRef, useState } from "react";
import { eventToHotkey } from "../../shortcuts/record-hotkey";

type RecordHotkeyOptions = {
  onRecord: (hotkey: string) => void;
  onCancel?: () => void;
};

type RecordHotkeyApi = {
  isRecording: boolean;
  startRecording: () => void;
  cancelRecording: () => void;
};

export const useRecordHotkey = (
  options: RecordHotkeyOptions,
): RecordHotkeyApi => {
  const [isRecording, setIsRecording] = useState(false);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const startRecording = useCallback(() => setIsRecording(true), []);
  const cancelRecording = useCallback(() => setIsRecording(false), []);

  useEffect(() => {
    if (!isRecording) return undefined;
    const handler = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setIsRecording(false);
        optionsRef.current.onCancel?.();
        return;
      }
      const hotkey = eventToHotkey(event);
      if (hotkey === null) return;
      setIsRecording(false);
      optionsRef.current.onRecord(hotkey);
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [isRecording]);

  return { isRecording, startRecording, cancelRecording };
};
