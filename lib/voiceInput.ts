// Nhập liệu bằng GIỌNG NÓI cho ô chat tạo rule (và nơi khác cần sau này).
//
// 2 đường, tự chọn theo môi trường:
//  - WEB (Chrome/Edge/Safari): Web Speech API của trình duyệt — nhận dạng TRỰC TIẾP,
//    chữ hiện dần khi đang nói, 0 quota AI. Trình duyệt không có API này (Firefox) →
//    ẩn nút mic (supported=false).
//  - MOBILE (Expo Go / app): ghi âm bằng expo-audio → gửi Edge Function "transcribe"
//    (Gemini flash-lite chép lời) → nhận văn bản. Cần mạng + đăng nhập.
//
// Dùng: const voice = useVoiceInput(setInput, (msg) => alertMessage("Giọng nói", msg));
//       nút mic gọi voice.start() / voice.stop(); voice.recording & voice.busy để vẽ UI.

import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "./supabase";

// Trần thời lượng 1 lượt nói — tự dừng để payload gọn + không ghi âm quên tắt.
const MAX_RECORD_MS = 60000;

// Constructor SpeechRecognition của trình duyệt (không có type chuẩn trong RN → any).
// deno-lint-ignore-file không áp ở đây; eslint: any có chủ đích cho API trình duyệt.
function webSpeechCtor(): (new () => any) | null {
  if (Platform.OS !== "web") return null;
  const g = globalThis as any;
  return g.SpeechRecognition || g.webkitSpeechRecognition || null;
}

export interface VoiceInputState {
  supported: boolean; // môi trường này có đường nhập giọng nói không (false → ẩn nút mic)
  recording: boolean; // đang nghe/ghi âm
  busy: boolean;      // đang chuyển giọng nói thành chữ (đường mobile, sau khi dừng)
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function useVoiceInput(
  onText: (text: string) => void,
  onError: (message: string) => void,
): VoiceInputState {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  // Hook expo-audio phải gọi vô điều kiện (luật hooks); trên web nó không được đụng tới.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recogRef = useRef<any>(null);       // instance SpeechRecognition đang chạy (web)
  const finalRef = useRef("");              // phần đã chốt (isFinal) của web speech
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppingRef = useRef(false);        // chống bấm dừng 2 lần (mobile)

  const Ctor = webSpeechCtor();
  const supported = Platform.OS !== "web" || Boolean(Ctor);

  // Rời màn hình khi đang ghi → dọn cho sạch (không giữ mic).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      try { recogRef.current?.abort?.(); } catch { /* đã dừng */ }
    };
  }, []);

  // ---------- ĐƯỜNG WEB: Web Speech API ----------
  const startWeb = async () => {
    const recog = new (Ctor as new () => any)();
    recogRef.current = recog;
    finalRef.current = "";
    recog.lang = "vi-VN";
    recog.interimResults = true; // chữ hiện dần khi đang nói
    recog.continuous = true;     // nói nhiều câu, tự dừng khi bấm stop / im lặng lâu
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

  const stopWeb = async () => {
    try { recogRef.current?.stop(); } catch { /* đã dừng sẵn */ }
  };

  // ---------- ĐƯỜNG MOBILE: ghi âm → Edge Function transcribe (Gemini chép lời) ----------
  const startNative = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      onError("Bạn chưa cho phép dùng micro. Vào cài đặt hệ thống cấp quyền micro cho app rồi thử lại.");
      return;
    }
    // iOS: không bật allowsRecording thì record() im lặng không thu gì.
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    stoppingRef.current = false;
    setRecording(true);
    timerRef.current = setTimeout(() => { void stopNative(); }, MAX_RECORD_MS);
  };

  const stopNative = async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setRecording(false);
    setBusy(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }); // trả loa về chế độ thường
      const uri = recorder.uri;
      if (!uri) throw new Error("Không ghi âm được — thử lại nhé.");
      const audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // Preset HIGH_QUALITY ra .m4a (AAC) trên iOS/Android — Gemini nhận audio/aac.
      const mime = uri.endsWith(".wav") ? "audio/wav" : "audio/aac";
      const res = await supabase.functions.invoke("transcribe", { body: { audio, mime } });
      const errMsg = res.data?.error ?? (res.error ? "Không chuyển được giọng nói thành chữ. Thử lại nhé." : null);
      if (errMsg) throw new Error(errMsg);
      const text = String(res.data?.text ?? "").trim();
      if (!text) onError("Không nghe rõ lời nói — bạn thử nói lại gần micro hơn nhé.");
      else onText(text);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isWebPath = Platform.OS === "web";
  return {
    supported,
    recording,
    busy,
    start: async () => {
      if (recording || busy) return;
      try {
        if (isWebPath) await startWeb();
        else await startNative();
      } catch (e) {
        setRecording(false);
        onError((e as Error).message);
      }
    },
    stop: async () => {
      if (!recording) return;
      if (isWebPath) await stopWeb();
      else await stopNative();
    },
  };
}
