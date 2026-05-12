/*
  File: mockRules.ts

  Chức năng:
  - Chứa danh sách Rule giả
*/

import { Rule } from "@/types/Rule";

export const mockRules: Rule[] = [
  {
    id: "1",
    title: "🛒 Shopee - iPhone",
    description: "Theo dõi giảm giá iPhone",
    active: true,
  },

  {
    id: "2",
    title: "🤖 Tin tức AI",
    description: "Theo dõi OpenAI và Gemini",
    active: true,
  },

  {
    id: "3",
    title: "📚 HaUI Deadline",
    description: "Theo dõi deadline học tập",
    active: false,
  },
];