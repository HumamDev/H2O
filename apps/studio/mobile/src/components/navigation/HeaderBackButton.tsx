import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

export function HeaderBackButton() {
  const router = useRouter();

  const handlePress = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <Pressable onPress={handlePress} style={styles.button} hitSlop={8}>
      <Text style={styles.label}>‹ H2O Studio</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 8,
  },
  label: {
    fontSize: 17,
    color: '#208AEF',
  },
});
