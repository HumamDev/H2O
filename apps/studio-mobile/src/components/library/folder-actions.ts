import { ActionSheetIOS, Platform } from 'react-native';

import { setArchiveFolderIconColor } from '@/features/library/mutations';
import { projectColorOptions } from '@/theme';
import type { Folder } from '@/types/library';

function openFolderColorPicker(folder: Folder) {
  if (Platform.OS !== 'ios') return;

  const options = [
    'Default',
    ...projectColorOptions.map(option => option.label),
    'Cancel',
  ];
  const cancelButtonIndex = options.length - 1;

  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: 'Folder Icon Color',
      message: folder.name,
      options,
      cancelButtonIndex,
    },
    (buttonIndex) => {
      if (buttonIndex === cancelButtonIndex) return;
      if (buttonIndex === 0) {
        setArchiveFolderIconColor(folder.id, folder.name);
        return;
      }
      const color = projectColorOptions[buttonIndex - 1]?.color;
      if (color) setArchiveFolderIconColor(folder.id, folder.name, color);
    },
  );
}

export function openFolderActions(folder: Folder | null) {
  if (!folder || Platform.OS !== 'ios') return;

  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: folder.name,
      options: ['Change icon color', 'Cancel'],
      cancelButtonIndex: 1,
    },
    (buttonIndex) => {
      if (buttonIndex === 0) openFolderColorPicker(folder);
    },
  );
}
