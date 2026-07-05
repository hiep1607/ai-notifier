// Bản WEB của useVoiceInput — CHỈ dùng Web Speech API của trình duyệt, TUYỆT ĐỐI
// không import expo-audio/expo-file-system (import expo-audio trên web làm sập màn
// tạo rule: AudioRecorderWeb kế thừa globalThis.expo.SharedObject ngay lúc import —
// "lỗi nội bộ" 2026-07-05). Metro tự chọn file .web.ts cho web; mobile dùng voiceInput.ts.
//
// Trình duyệt có SpeechRecognition (Chrome/Edge/Safari): nhận dạng trực tiếp vi-VN,
// chữ hiện dần khi đang nói, 0 quota AI. Không có (Firefox) → supported=false, ẩn nút mic.

import { useEffect, useRef, useState } from "react";

import type { VoiceInputState } from "./voiceInput.types";
export type { VoiceInputState } from "./voiceInput.types";

// Constructor SpeechRecognition (không có type chuẩn — any có chủ đích cho API trình duyệt).
function webSpeechCtor(): (new () => any) | null {
  const g = globalThis as any;
  return g.SpeechRecognition || g.webkitSpeechRecognition || null;
}

export function useVoiceInput(
  onText: (text: string) => void,
  onError: (message: string) => void,
): VoiceInputState {
  const [recording, setRecording] = useState(false);
  const recogRef = useRef<any>(null); // instance SpeechRecognition đang chạy
  const finalRef = useRef("");        // phần đã chốt (isFinal)

  const Ctor = webSpeechCtor();
  const supported = Boolean(Ctor);

  // Rời màn hình khi đang nghe → dừng cho sạch (không giữ mic).
  useEffect(() => {
    return () => {
      try { recogRef.current?.abort?.(); } catch { /* đã dừng */ }
    };
  }, []);

  const start = async () => {
    if (recording || !Ctor) return;
    const recog = new Ctor();
    recogRef.current = recog;
    finalRef.current = "";
    recog.lang = "vi-VN";
    recog.interimResults = true; // chữ hiện dần khi đang nói
    recog.continuous = true;     // nói nhiều câu, dừng khi bấm stop / im lặng lâu
    recog.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      const t = (finalRef.current + interim).trim();
      if (t) onText(t);
    };
    recog.onerror = (e: any) => {
      setRecording(false);
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        onError("Bạn chưa cho phép dùng micro. Hãy cấp quyền micro cho trang này rồi thử lại.");
      } else if (e?.error && e.error !== "aborted" && e.error !== "no-speech") {
        onError(`Không nhận dạng được giọng nói (${e.error}).`);
      }
    };
    recog.onend = () => setRecording(false); // chữ đã đẩy dần qua onresult rồi
    recog.start();
    setRecording(true);
  };

  const stop = async () => {
    try { recogRef.current?.stop(); } catch { /* đã dừng sẵn */ }
  };

  return { supported, recording, busy: false, start, stop };
}
