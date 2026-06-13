import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
    createClient,
} from "@supabase/supabase-js";

const supabaseUrl =
  "https://idtibfiyfywcugdvlqal.supabase.co";

const supabaseAnonKey =
  "sb_publishable_H14ZI3zgAk7F2FX-IM9J8Q_Uy6Qjgvl";

export const supabase =
  createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        storage:
          AsyncStorage,

        autoRefreshToken: true,

        persistSession: true,

        detectSessionInUrl: false,
      },
    }
  );