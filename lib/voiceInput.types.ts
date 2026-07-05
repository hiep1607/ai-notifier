// Interface chung của hook nhập giọng nói — 2 bản cài đặt theo platform:
//  - voiceInput.ts     : MOBILE (expo-audio ghi âm → Edge Function transcribe)
//  - voiceInput.web.ts : WEB (Web Speech API; KHÔNG import expo-audio — sập bundle web)
export interface VoiceInputState {
  supported: boolean; // môi trường này có đường nhập giọng nói không (false → ẩn nút mic)
  recording: boolean; // đang nghe/ghi âm
  busy: boolean;      // đang chuyển giọng nói thành chữ (đường mobile, sau khi dừng)
  start: () => Promise<void>;
  stop: () => Promise<void>;
}
