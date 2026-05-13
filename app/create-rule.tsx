/*
  File: create-rule.tsx

  Chức năng:
  - AI Chat tạo Rule mới
  - Chat UI
  - Keyboard handling
*/

import React, { useState } from "react";

import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "@/constants/colors";

import { SPACING } from "@/constants/spacing";

import { THEME } from "@/constants/theme";

export default function CreateRuleScreen() {
  /*
    Message Input
  */
  const [message, setMessage] =
    useState("");

  /*
    Chat Messages
  */
  const [messages, setMessages] =
    useState([
      {
        id: 1,

        text:
          "Xin chào 👋\n\nHãy mô tả điều bạn muốn AI theo dõi.",

        sender: "ai",
      },
    ]);

return (
  <View style={styles.container}>
        {/* HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              AI Rule Creator
            </Text>

            <Text style={styles.subtitle}>
              Mô tả điều bạn muốn theo dõi
            </Text>
          </View>

          <View style={styles.aiAvatar}>
            <Ionicons
              name="sparkles"
              size={24}
              color={COLORS.white}
            />
          </View>
        </View>

        {/* CHAT AREA */}
        <KeyboardAwareScrollView
          style={styles.chatContainer}
          contentContainerStyle={{
            paddingBottom: 20,
          }}
          showsVerticalScrollIndicator={
            false
          }
          enableOnAndroid
          extraHeight={140}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((item) => (
            <View
              key={item.id}
              style={[
                styles.messageBubble,

                item.sender === "ai"
                  ? styles.aiMessage
                  : styles.userMessage,
              ]}
            >
              <Text
                style={styles.messageText}
              >
                {item.text}
              </Text>
            </View>
          ))}
        </KeyboardAwareScrollView>

        {/* INPUT */}
        <View
          style={{
            paddingBottom: 20,
          }}
        >
          <View style={styles.inputContainer}>
            <TextInput
              placeholder="Nhập rule mới..."
              placeholderTextColor={
                COLORS.gray
              }
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={styles.sendButton}
              onPress={() => {
                if (!message.trim())
                  return;

                setMessages((prev) => [
                  ...prev,

                  {
                    id: Date.now(),

                    text: message,

                    sender: "user",
                  },

                  {
                    id: Date.now() + 1,

                    text:
                      "AI đang xử lý yêu cầu của bạn 🤖",

                    sender: "ai",
                  },
                ]);

                setMessage("");
              }}
            >
              <Ionicons
                name="send"
                size={22}
                color={COLORS.white}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

  );
}

const styles = StyleSheet.create({
  /*
    Container
  */
  container: {
    flex: 1,

    backgroundColor:
      COLORS.background,

    paddingHorizontal:
      SPACING.lg,

    paddingTop: 70,

    paddingBottom: 8,
  },

  /*
    Header
  */
  header: {
    flexDirection: "row",

    justifyContent:
      "space-between",

    alignItems: "center",

    marginBottom: SPACING.xl,
  },

  title: {
    color: COLORS.white,

    fontSize: 30,

    fontWeight: "bold",
  },

  subtitle: {
    color: COLORS.gray,

    marginTop: 6,
  },

  /*
    AI Avatar
  */
  aiAvatar: {
    width: 54,

    height: 54,

    borderRadius: 27,

    backgroundColor:
      COLORS.primary,

    justifyContent: "center",

    alignItems: "center",

    ...THEME.shadow,
  },

  /*
    Chat Area
  */
  chatContainer: {
    flex: 1,
  },

  /*
    Message Bubble
  */
  messageBubble: {
    padding: SPACING.lg,

    borderRadius: 24,

    marginBottom: SPACING.md,

    maxWidth: "85%",
  },

  /*
    AI Message
  */
  aiMessage: {
    backgroundColor:
      COLORS.card,

    alignSelf: "flex-start",

    borderTopLeftRadius: 8,

    borderWidth: 1,

    borderColor: COLORS.border,
  },

  /*
    User Message
  */
  userMessage: {
    backgroundColor:
      COLORS.primary,

    alignSelf: "flex-end",

    borderTopRightRadius: 8,
  },

  /*
    Message Text
  */
  messageText: {
    color: COLORS.white,

    fontSize: 16,

    lineHeight: 26,
  },

  /*
    Input
  */
  inputContainer: {
    flexDirection: "row",

    alignItems: "flex-end",

    paddingTop: 12,

    borderTopWidth: 1,

    borderTopColor:
      COLORS.border,

    backgroundColor:
      COLORS.background,
  },

  input: {
    flex: 1,

    backgroundColor:
      COLORS.card,

    borderRadius: 24,

    paddingHorizontal: 20,

    minHeight: 58,

    maxHeight: 140,

    paddingTop: 16,

    paddingBottom: 16,

    color: COLORS.white,

    borderWidth: 1,

    borderColor: COLORS.border,
  },

  /*
    Send Button
  */
  sendButton: {
    width: 58,

    height: 58,

    borderRadius: 29,

    backgroundColor:
      COLORS.primary,

    justifyContent: "center",

    alignItems: "center",

    marginLeft: SPACING.md,

    marginBottom: 2,

    ...THEME.shadow,
  },
});