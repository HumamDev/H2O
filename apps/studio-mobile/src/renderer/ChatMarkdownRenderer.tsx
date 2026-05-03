import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { parseMarkdown, type BlockToken, type InlineToken } from './parse';
import { createChatRendererSkin } from './skin';

type ChatMarkdownRendererProps = {
  text: string;
  selectable?: boolean;
  onTextPressIn?: () => void;
  onTextPressOut?: () => void;
  onTextLongPress?: (currentText: string) => void;
};

function inlineToText(tokens: InlineToken[]): string {
  return tokens.map((tok) => {
    if (tok.t === 'bold' || tok.t === 'italic') return inlineToText(tok.children);
    if (tok.t === 'code' || tok.t === 'text') return tok.v;
    return '';
  }).join('');
}

export function ChatMarkdownRenderer({
  text,
  selectable = true,
  onTextPressIn,
  onTextPressOut,
  onTextLongPress,
}: ChatMarkdownRendererProps) {
  const th = useTheme();
  const blocks = parseMarkdown(text);
  const skin = createChatRendererSkin(th);

  function commonTextProps(currentText: string) {
    return {
      selectable,
      onPressIn: onTextPressIn,
      onPressOut: onTextPressOut,
      onLongPress: onTextLongPress ? () => onTextLongPress(currentText) : undefined,
      suppressHighlighting: true,
    };
  }

  function renderInline(tokens: InlineToken[], fontSize?: number): React.ReactNode[] {
    const base = fontSize ?? skin.bodyFontSize;
    return tokens.map((tok, i) => {
      if (tok.t === 'bold') return <Text key={i} style={{ fontWeight: '700' }}>{renderInline(tok.children, fontSize)}</Text>;
      if (tok.t === 'italic') return <Text key={i} style={{ fontStyle: 'italic' }}>{renderInline(tok.children, fontSize)}</Text>;
      if (tok.t === 'code') {
        return (
          <Text key={i} style={skin.inlineCode(base)}>
            {tok.v}
          </Text>
        );
      }
      return tok.v;
    });
  }

  function renderBlock(block: BlockToken, index: number): React.ReactNode {
    switch (block.t) {
      case 'heading': {
        const currentText = inlineToText(block.inline);
        return (
          <Text
            key={index}
            {...commonTextProps(currentText)}
            style={skin.headingText(block.level, index)}
          >
            {renderInline(block.inline, skin.headingFontSize(block.level))}
          </Text>
        );
      }

      case 'paragraph': {
        const currentText = inlineToText(block.inline);
        return (
          <Text
            key={index}
            {...commonTextProps(currentText)}
            style={skin.paragraphText}
          >
            {renderInline(block.inline)}
          </Text>
        );
      }

      case 'hr': {
        return <View key={index} style={skin.hr} />;
      }

      case 'code_block': {
        return (
          <View key={index} style={skin.codeBlock}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              bounces
              contentContainerStyle={skin.codeScrollContent}
            >
              <Text
                {...commonTextProps(block.code)}
                style={skin.codeText}
              >
                {block.code}
              </Text>
            </ScrollView>
          </View>
        );
      }

      case 'ul': {
        return (
          <View key={index} style={skin.list}>
            {block.items.map((item, j) => {
              const currentText = inlineToText(item);
              return (
                <View key={j} style={skin.listRow}>
                  <Text style={skin.listMarker}>{'•'}</Text>
                  <Text
                    {...commonTextProps(currentText)}
                    style={skin.listText}
                  >
                    {renderInline(item)}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      }

      case 'ol': {
        return (
          <View key={index} style={skin.list}>
            {block.items.map((item, j) => {
              const currentText = inlineToText(item);
              return (
                <View key={j} style={skin.listRow}>
                  <Text style={skin.listMarker}>
                    {`${j + 1}.`}
                  </Text>
                  <Text
                    {...commonTextProps(currentText)}
                    style={skin.listText}
                  >
                    {renderInline(item)}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      }
    }
  }

  if (blocks.length === 0) return null;

  return (
    <View style={skin.root}>
      {blocks.map((block, i) => renderBlock(block, i))}
    </View>
  );
}
