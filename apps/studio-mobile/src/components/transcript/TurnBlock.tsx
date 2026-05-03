import React, { useRef, useState } from 'react';
import {
  Alert,
  Clipboard,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { editArchiveChatMessage } from '@/features/library/mutations';
import { useTheme } from '@/hooks/use-theme';
import { ChatMarkdownRenderer } from '@/renderer';
import { spacing } from '@/theme';
import { isKnownTranscriptArtifact } from '@/utils/transcript-artifacts';

export type TurnBlockProps = {
  role: string;
  text: string;
  chatId?: string;
  snapshotId?: string;
  order?: number;
};

type MenuState = {
  kind: 'question' | 'answer';
  left: number;
  top: number;
  currentText: string;
} | null;

const SCREEN_GUTTER = 12;
const MENU_WIDTH = 248;
const MENU_ROW_HEIGHT = 48;
const MENU_HEIGHT = MENU_ROW_HEIGHT * 3;
const SELECTABLE_SUPPRESS_DELAY_MS = 180;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function TurnBlock({ role, text, chatId, snapshotId, order }: TurnBlockProps) {
  const th = useTheme();
  const targetRef = useRef<View>(null);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [selectionSuppressed, setSelectionSuppressed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  if (isKnownTranscriptArtifact(text)) return null;

  function clearSuppressTimer() {
    if (suppressTimerRef.current) {
      clearTimeout(suppressTimerRef.current);
      suppressTimerRef.current = null;
    }
  }

  function armCustomLongPress() {
    clearSuppressTimer();
    suppressTimerRef.current = setTimeout(() => {
      setSelectionSuppressed(true);
    }, SELECTABLE_SUPPRESS_DELAY_MS);
  }

  function releaseCustomLongPress() {
    clearSuppressTimer();
    if (!menu) setSelectionSuppressed(false);
  }

  function closeMenu() {
    setMenu(null);
    setSelectionSuppressed(false);
  }

  function copyText(value: string) {
    const next = value.trim();
    if (!next) return;
    try {
      Clipboard.setString(next);
      closeMenu();
    } catch {
      Alert.alert('Copy failed', 'Use native text selection and Copy instead.');
    }
  }

  function showMenu(kind: 'question' | 'answer', currentText: string) {
    clearSuppressTimer();
    setSelectionSuppressed(true);
    const current = currentText.trim() || text;

    targetRef.current?.measureInWindow((x, y, width, height) => {
      const screen = Dimensions.get('window');
      const leftAnchor = kind === 'question' ? x + width - MENU_WIDTH : x + Math.min(32, width * 0.15);
      const left = clamp(leftAnchor, SCREEN_GUTTER, screen.width - MENU_WIDTH - SCREEN_GUTTER);
      const below = y + Math.min(height, 96) + 8;
      const top = below + MENU_HEIGHT < screen.height - SCREEN_GUTTER
        ? below
        : clamp(y - MENU_HEIGHT - 8, SCREEN_GUTTER, screen.height - MENU_HEIGHT - SCREEN_GUTTER);
      setMenu({ kind, left, top, currentText: current });
    });
  }

  function handleEdit() {
    closeMenu();
    if (!chatId || !snapshotId || order === undefined) {
      Alert.alert('Edit unavailable', 'This message cannot be edited from the current snapshot.');
      return;
    }
    setEditText(text);
    setEditing(true);
  }

  function handleSaveEdit() {
    const trimmed = editText.trim();
    if (!trimmed) {
      Alert.alert('Edit message', 'Message text cannot be empty.');
      return;
    }
    if (chatId && snapshotId && order !== undefined) {
      editArchiveChatMessage(chatId, snapshotId, order, trimmed);
    }
    setEditing(false);
  }

  const menuOverlay = (
    <Modal
      visible={!!menu}
      transparent
      animationType="fade"
      onRequestClose={closeMenu}
    >
      <View style={styles.menuLayer} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} />
        {menu && (
          <View
            style={[
              styles.contextMenu,
              {
                left: menu.left,
                top: menu.top,
              },
            ]}
          >
            <MenuRow label="Copy all" onPress={() => copyText(text)} />
            <View style={styles.menuDivider} />
            <MenuRow label="Copy current" onPress={() => copyText(menu.currentText)} />
            <View style={styles.menuDivider} />
            <MenuRow label="Edit" onPress={handleEdit} />
          </View>
        )}
      </View>
    </Modal>
  );

  const editModal = (
    <Modal
      visible={editing}
      transparent
      animationType="fade"
      onRequestClose={() => setEditing(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.editLayer}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditing(false)} />
        <View style={[styles.editCard, { backgroundColor: th.backgroundElement }]}>
          <Text style={[styles.editTitle, { color: th.text }]}>Edit message</Text>
          <TextInput
            value={editText}
            onChangeText={setEditText}
            multiline
            autoFocus
            scrollEnabled
            style={[
              styles.editInput,
              {
                color: th.text,
                borderColor: th.scheme === 'light' ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.18)',
              },
            ]}
          />
          <View style={styles.editActions}>
            <Pressable onPress={() => setEditing(false)} style={styles.editButton}>
              <Text style={[styles.editButtonText, { color: th.textSecondary }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSaveEdit} style={styles.editButton}>
              <Text style={[styles.editButtonText, styles.saveText]}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  const overlays = (
    <>
      {menuOverlay}
      {editModal}
    </>
  );

  if (role === 'user') {
    const bubbleBg = th.scheme === 'dark' ? '#1e3a5f' : '#208AEF';
    return (
      <View style={{ alignItems: 'flex-end', marginBottom: spacing.sm }}>
        {overlays}
        <View ref={targetRef} style={styles.userTextArea}>
          <View style={[styles.bubble, { backgroundColor: bubbleBg }]}>
            <Text
              selectable={!selectionSuppressed}
              onPressIn={armCustomLongPress}
              onPressOut={releaseCustomLongPress}
              onLongPress={() => showMenu('question', text)}
              suppressHighlighting
              style={styles.bubbleText}
            >
              {text}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (role === 'assistant') {
    return (
      <View ref={targetRef} style={{ marginBottom: spacing.lg }}>
        {overlays}
        <ChatMarkdownRenderer
          text={text}
          selectable={!selectionSuppressed}
          onTextPressIn={armCustomLongPress}
          onTextPressOut={releaseCustomLongPress}
          onTextLongPress={(currentText) => showMenu('answer', currentText)}
        />
      </View>
    );
  }

  return (
    <View
      ref={targetRef}
      style={[
        styles.systemBlock,
        {
          backgroundColor: th.backgroundElement,
          borderLeftColor: th.textSecondary,
        },
      ]}
    >
      {overlays}
      <View>
        <Text style={[styles.systemRole, { color: th.textSecondary }]}>
          {role || 'unknown'}
        </Text>
        <ChatMarkdownRenderer
          text={text}
          selectable={!selectionSuppressed}
          onTextPressIn={armCustomLongPress}
          onTextPressOut={releaseCustomLongPress}
          onTextLongPress={(currentText) => showMenu('answer', currentText)}
        />
      </View>
    </View>
  );
}

function MenuRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.pressedAction]}
    >
      <Text style={styles.menuRowText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  userTextArea: {
    maxWidth: '80%',
  },
  bubble: {
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  systemBlock: {
    borderRadius: 8,
    padding: spacing.md,
    borderLeftWidth: 2,
    marginBottom: spacing.sm,
  },
  systemRole: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  menuLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  contextMenu: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(24,24,27,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  menuRow: {
    minHeight: MENU_ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  menuRowText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  pressedAction: {
    opacity: 0.55,
  },
  editLayer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.38)',
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  editCard: {
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  editTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 120,
    maxHeight: 320,
    padding: 12,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
    marginTop: 14,
  },
  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveText: {
    color: '#208AEF',
  },
});
