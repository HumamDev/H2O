import { StyleSheet } from 'react-native';
import type { ColorScheme } from '@/constants/theme';
import { chatSpacing, chatTypography } from '@/theme';

type ChatRendererTheme = {
  scheme: ColorScheme;
  text: string;
};

type HeadingLevel = 1 | 2 | 3;

function headingTypography(level: HeadingLevel) {
  if (level === 1) return chatTypography.h1;
  if (level === 2) return chatTypography.h2;
  return chatTypography.h3;
}

export function createChatRendererSkin(theme: ChatRendererTheme) {
  const isDark = theme.scheme !== 'light';
  const bodyColor = theme.text;

  return {
    bodyFontSize: chatTypography.body.fontSize,
    root: { gap: chatSpacing.paragraphGap },
    paragraphText: [chatTypography.body, { color: bodyColor }],
    headingFontSize(level: HeadingLevel) {
      return headingTypography(level).fontSize;
    },
    headingText(level: HeadingLevel, index: number) {
      return [
        headingTypography(level),
        {
          color: bodyColor,
          marginTop: index > 0 ? chatSpacing.headingTopMargin : 0,
          marginBottom: chatSpacing.headingBottomMargin,
        },
      ];
    },
    inlineCode(baseFontSize: number) {
      return {
        fontFamily: chatTypography.code.fontFamily,
        fontSize: baseFontSize - 2,
        lineHeight: baseFontSize + 3,
        backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.075)',
        color: isDark ? '#f0a8b3' : '#b4234a',
        borderRadius: chatSpacing.inlineCodeRadius,
        overflow: 'hidden' as const,
        paddingHorizontal: chatSpacing.inlineCodePaddingHorizontal,
        paddingVertical: chatSpacing.inlineCodePaddingVertical,
      };
    },
    hr: [
      chatRendererSkinStyles.hr,
      { backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' },
    ],
    codeBlock: [
      chatRendererSkinStyles.codeBlock,
      {
        backgroundColor: isDark ? '#151618' : '#f4f4f5',
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
      },
    ],
    codeText: [chatTypography.code, { color: isDark ? '#d7dde5' : '#24292f' }],
    codeScrollContent: chatRendererSkinStyles.codeScrollContent,
    list: { gap: chatSpacing.listItemGap },
    listRow: chatRendererSkinStyles.listRow,
    listMarker: [chatTypography.body, chatRendererSkinStyles.listMarker, { color: bodyColor }],
    listText: [chatTypography.body, { color: bodyColor, flex: 1 }],
  };
}

export const chatRendererSkinStyles = StyleSheet.create({
  codeBlock: {
    borderRadius: chatSpacing.codeBlockRadius,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: 2,
    padding: chatSpacing.codeBlockPadding,
  },
  codeScrollContent: {
    paddingRight: 2,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: chatSpacing.listIndent,
  },
  listMarker: {
    width: chatSpacing.listMarkerWidth,
    marginRight: chatSpacing.listMarkerGap,
    textAlign: 'right',
  },
  hr: {
    height: 1,
    marginVertical: 4,
  },
});
